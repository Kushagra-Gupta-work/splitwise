import mongoose from "mongoose";
import Group from "../models/Group.js";
import User from "../models/User.js";
import Expense from "../models/Expense.js";
import Payment from "../models/Payment.js";

const MEMBER_SELECT = "name email";

/**
 * @desc    Create a new group. The creator is always included as a member,
 *          in addition to any users found via memberEmails.
 * @route   POST /api/groups
 * @access  Private
 */
export const createGroup = async (req, res) => {
  try {
    const { name, memberEmails } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Group name is required" });
    }

    const emails = Array.isArray(memberEmails) ? memberEmails : [];
    const normalizedEmails = emails
      .filter((email) => typeof email === "string" && email.trim())
      .map((email) => email.toLowerCase().trim());

    // Look up any users matching the provided emails
    const foundUsers = normalizedEmails.length
      ? await User.find({ email: { $in: normalizedEmails } })
      : [];

    // Track which of the provided emails didn't match a user, so the
    // caller can be informed (e.g. to invite them another way).
    const foundEmails = foundUsers.map((u) => u.email);
    const notFoundEmails = normalizedEmails.filter((email) => !foundEmails.includes(email));

    // Always include the requester, de-duplicated against found members
    const memberIdSet = new Set(foundUsers.map((u) => u._id.toString()));
    memberIdSet.add(req.userId.toString());

    const group = await Group.create({
      name: name.trim(),
      members: Array.from(memberIdSet),
      createdBy: req.userId,
    });

    const populatedGroup = await Group.findById(group._id)
      .populate("members", MEMBER_SELECT)
      .populate("createdBy", MEMBER_SELECT);

    return res.status(201).json({
      group: populatedGroup,
      ...(notFoundEmails.length && { emailsNotFound: notFoundEmails }),
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error creating group", error: error.message });
  }
};

/**
 * @desc    Get all groups the current user belongs to
 * @route   GET /api/groups
 * @access  Private
 */
export const getMyGroups = async (req, res) => {
  try {
    const groups = await Group.find({ members: req.userId })
      .populate("members", MEMBER_SELECT)
      .populate("createdBy", MEMBER_SELECT)
      .sort({ createdAt: -1 });

    return res.status(200).json({ groups });
  } catch (error) {
    return res.status(500).json({ message: "Server error fetching groups", error: error.message });
  }
};

/**
 * @desc    Get a single group by id. Only members of the group may view it.
 * @route   GET /api/groups/:groupId
 * @access  Private
 */
export const getGroupById = async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "Invalid group id" });
    }

    const group = await Group.findById(groupId)
      .populate("members", MEMBER_SELECT)
      .populate("createdBy", MEMBER_SELECT);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const isMember = group.members.some((member) => member._id.toString() === req.userId.toString());
    if (!isMember) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    return res.status(200).json({ group });
  } catch (error) {
    return res.status(500).json({ message: "Server error fetching group", error: error.message });
  }
};

/**
 * @desc    Add a member to an existing group by email. Only existing
 *          members of the group may add new members.
 * @route   POST /api/groups/:groupId/members
 * @access  Private
 */
export const addMember = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { email } = req.body;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "Invalid group id" });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({ message: "Email is required" });
    }

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const isMember = group.members.some((memberId) => memberId.toString() === req.userId.toString());
    if (!isMember) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    const userToAdd = await User.findOne({ email: email.toLowerCase().trim() });
    if (!userToAdd) {
      return res.status(404).json({ message: "No user found with that email" });
    }

    const alreadyMember = group.members.some((memberId) => memberId.toString() === userToAdd._id.toString());
    if (alreadyMember) {
      return res.status(409).json({ message: "User is already a member of this group" });
    }

    group.members.push(userToAdd._id);
    await group.save();

    const populatedGroup = await Group.findById(group._id)
      .populate("members", MEMBER_SELECT)
      .populate("createdBy", MEMBER_SELECT);

    return res.status(200).json({ group: populatedGroup });
  } catch (error) {
    return res.status(500).json({ message: "Server error adding member", error: error.message });
  }
};

/**
 * @desc    Permanently delete a group along with ALL of its expenses and
 *          payments. Only the user who originally created the group may do
 *          this — no other member can.
 *
 *          Cascade order:
 *            1. Delete all Expense documents for this group
 *            2. Delete all Payment documents for this group
 *            3. Delete the Group document itself
 *
 * @route   DELETE /api/groups/:groupId
 * @access  Private (creator only)
 */
export const deleteGroup = async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "Invalid group id" });
    }

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // First gate: must be a group member at all (avoids leaking whether
    // the group exists to completely unrelated users).
    const isMember = group.members.some((m) => m.toString() === req.userId.toString());
    if (!isMember) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    // Second gate: only the creator may delete the whole group.
    if (group.createdBy.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: "Only the group creator can delete this group" });
    }

    // Cascade delete — sub-documents first, then the group itself.
    await Expense.deleteMany({ group: groupId });
    await Payment.deleteMany({ group: groupId });
    await group.deleteOne();

    return res.status(200).json({ message: "Group deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Server error deleting group", error: error.message });
  }
};
