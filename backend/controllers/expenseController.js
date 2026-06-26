import mongoose from "mongoose";
import Expense from "../models/Expense.js";
import Group from "../models/Group.js";
import Payment from "../models/Payment.js";
import { calculateBalances, simplifyDebts } from "../utils/debtSimplifier.js";

const PERSON_SELECT = "name email";

/**
 * @desc    Add an expense to a group. Supports two split types:
 *          - "equal": amount is divided evenly across the given participants
 *            (or the whole group if none are specified), with any leftover
 *            cent(s) from rounding assigned to the last participant.
 *          - "custom": caller supplies the exact splits, which must sum to
 *            the total amount.
 * @route   POST /api/groups/:groupId/expenses
 * @access  Private (group members only)
 */
export const addExpense = async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "Invalid group id" });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const memberIds = group.members.map((m) => m.toString());
    if (!memberIds.includes(req.userId.toString())) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    const { description, amount, paidBy, splitType = "equal", splitBetween, splits } = req.body;

    if (!description || !description.trim()) {
      return res.status(400).json({ message: "Description is required" });
    }

    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Amount must be a positive number" });
    }

    if (!paidBy || !mongoose.Types.ObjectId.isValid(paidBy)) {
      return res.status(400).json({ message: "A valid paidBy user id is required" });
    }

    if (!memberIds.includes(paidBy.toString())) {
      return res.status(400).json({ message: "paidBy must be a member of the group" });
    }

    if (!["equal", "custom"].includes(splitType)) {
      return res.status(400).json({ message: "splitType must be 'equal' or 'custom'" });
    }

    let finalSplits;

    if (splitType === "equal") {
      // Defaults to splitting across the whole group if splitBetween isn't provided
      const participantIds =
        Array.isArray(splitBetween) && splitBetween.length ? splitBetween : memberIds;
      const uniqueParticipants = [...new Set(participantIds.map(String))];

      const invalidParticipant = uniqueParticipants.find((id) => !memberIds.includes(id));
      if (invalidParticipant) {
        return res
          .status(400)
          .json({ message: "All split participants must be members of the group" });
      }

      const n = uniqueParticipants.length;
      if (n === 0) {
        return res.status(400).json({ message: "At least one participant is required" });
      }

      // Work in integer cents to avoid floating point drift, then give any
      // leftover cent(s) from the division to the last participant.
      const totalCents     = Math.round(amount * 100);
      const baseCents      = Math.floor(totalCents / n);
      const remainderCents = totalCents - baseCents * n;

      finalSplits = uniqueParticipants.map((userId, idx) => ({
        user:   userId,
        amount: (baseCents + (idx === n - 1 ? remainderCents : 0)) / 100,
      }));
    } else {
      // custom split
      if (!Array.isArray(splits) || splits.length === 0) {
        return res
          .status(400)
          .json({ message: "splits array is required for a custom split" });
      }

      for (const split of splits) {
        if (!split || !split.user || !mongoose.Types.ObjectId.isValid(split.user)) {
          return res
            .status(400)
            .json({ message: "Each split must reference a valid user id" });
        }
        if (
          typeof split.amount !== "number" ||
          !Number.isFinite(split.amount) ||
          split.amount < 0
        ) {
          return res
            .status(400)
            .json({ message: "Each split amount must be a non-negative number" });
        }
        if (!memberIds.includes(split.user.toString())) {
          return res
            .status(400)
            .json({ message: "All split participants must be members of the group" });
        }
      }

      const splitTotal = splits.reduce((sum, split) => sum + split.amount, 0);
      if (Math.abs(splitTotal - amount) > 0.01) {
        return res.status(400).json({
          message: `Splits must sum to the total amount (splits sum to ${splitTotal.toFixed(
            2
          )}, expected ${amount.toFixed(2)})`,
        });
      }

      finalSplits = splits.map((split) => ({
        user:   split.user,
        amount: Math.round(split.amount * 100) / 100,
      }));
    }

    const expense = await Expense.create({
      group:       groupId,
      description: description.trim(),
      amount,
      paidBy,
      addedBy:     req.userId,   // always the currently authenticated user
      splits:      finalSplits,
      splitType,
    });

    const populatedExpense = await Expense.findById(expense._id)
      .populate("paidBy",       PERSON_SELECT)
      .populate("addedBy",      PERSON_SELECT)
      .populate("splits.user",  PERSON_SELECT);

    return res.status(201).json({ expense: populatedExpense });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error adding expense", error: error.message });
  }
};

/**
 * @desc    Get all expenses for a group, newest first
 * @route   GET /api/groups/:groupId/expenses
 * @access  Private (group members only)
 */
export const getGroupExpenses = async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "Invalid group id" });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const isMember = group.members.some((m) => m.toString() === req.userId.toString());
    if (!isMember) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    const expenses = await Expense.find({ group: groupId })
      .sort({ createdAt: -1 })
      .populate("paidBy",      PERSON_SELECT)
      .populate("addedBy",     PERSON_SELECT)
      .populate("splits.user", PERSON_SELECT);

    return res.status(200).json({ expenses });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error fetching expenses", error: error.message });
  }
};

/**
 * @desc    Delete a single expense. Only the group member who originally
 *          logged the expense (addedBy) may delete it. Balances are
 *          recalculated automatically on the next balance fetch since they
 *          are derived — no extra work needed here.
 * @route   DELETE /api/groups/:groupId/expenses/:expenseId
 * @access  Private (addedBy only)
 */
export const deleteExpense = async (req, res) => {
  try {
    const { groupId, expenseId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "Invalid group id" });
    }
    if (!mongoose.Types.ObjectId.isValid(expenseId)) {
      return res.status(400).json({ message: "Invalid expense id" });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // First gate: must be a group member at all
    const isMember = group.members.some((m) => m.toString() === req.userId.toString());
    if (!isMember) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    const expense = await Expense.findOne({ _id: expenseId, group: groupId });
    if (!expense) {
      return res.status(404).json({ message: "Expense not found in this group" });
    }

    // Second gate: only the person who logged this expense may delete it
    if (expense.addedBy.toString() !== req.userId.toString()) {
      return res.status(403).json({
        message: "Only the person who added this expense can delete it",
      });
    }

    await expense.deleteOne();

    return res.status(200).json({ message: "Expense deleted successfully" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error deleting expense", error: error.message });
  }
};

/**
 * @desc    Get simplified balances for a group: each member's net balance,
 *          plus the minimal set of settlement transactions needed to clear
 *          all remaining debts. Both expenses AND recorded payments are
 *          factored in, so the picture stays accurate after real money moves.
 * @route   GET /api/groups/:groupId/balances
 * @access  Private (group members only)
 */
export const getGroupBalances = async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "Invalid group id" });
    }

    const group = await Group.findById(groupId).populate("members", PERSON_SELECT);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const isMember = group.members.some(
      (m) => m._id.toString() === req.userId.toString()
    );
    if (!isMember) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    // Fetch expenses and payments in parallel for efficiency
    const [expenses, payments] = await Promise.all([
      Expense.find({ group: groupId }),
      Payment.find({ group: groupId }),
    ]);

    const balanceMap = calculateBalances(expenses, payments);

    const nameById = {};
    group.members.forEach((m) => {
      nameById[m._id.toString()] = m.name;
    });

    const balances = group.members.map((m) => {
      const userId = m._id.toString();
      return {
        userId,
        name:    m.name,
        balance: Math.round((balanceMap[userId] || 0) * 100) / 100,
      };
    });

    const settlements = simplifyDebts(balanceMap).map((t) => ({
      from:     t.from,
      to:       t.to,
      fromName: nameById[t.from] || "Unknown",
      toName:   nameById[t.to]   || "Unknown",
      amount:   t.amount,
    }));

    return res.status(200).json({ balances, settlements });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error calculating balances", error: error.message });
  }
};
