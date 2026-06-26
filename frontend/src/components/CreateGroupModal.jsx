import { useEffect, useState } from "react";
import api from "../api/axios";

/**
 * Modal for creating a new group.
 * onCreated is called with the backend's `emailsNotFound` array (or
 * undefined) after a successful create, so the parent can refresh its
 * group list and surface any emails that didn't match a user.
 */
function CreateGroupModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [memberEmailsText, setMemberEmailsText] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Close on Escape.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleSubmit = async () => {
    if (submitting) return;
    setError("");

    if (!name.trim()) {
      setError("Group name is required");
      return;
    }

    const memberEmails = memberEmailsText
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);

    setSubmitting(true);
    try {
      const { data } = await api.post("/groups", { name: name.trim(), memberEmails });
      await onCreated(data.emailsNotFound);
      onClose();
    } catch (err) {
      if (err.response) {
        setError(err.response.data?.message || "Something went wrong. Please try again.");
      } else {
        setError("Could not reach the server. Is the backend running?");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleNameKeyDown = (event) => {
    if (event.key === "Enter") {
      handleSubmit();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-group-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg"
      >
        <h2 id="create-group-title" className="mb-4 text-lg font-semibold text-gray-900">
          Create a group
        </h2>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div className="mb-4">
          <label htmlFor="group-name" className="mb-1 block text-sm font-medium text-gray-700">
            Group name
          </label>
          <input
            id="group-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={handleNameKeyDown}
            placeholder="Goa Trip"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
        </div>

        <div className="mb-6">
          <label htmlFor="member-emails" className="mb-1 block text-sm font-medium text-gray-700">
            Member emails
          </label>
          <textarea
            id="member-emails"
            value={memberEmailsText}
            onChange={(event) => setMemberEmailsText(event.target.value)}
            placeholder="friend1@example.com, friend2@example.com"
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
          <p className="mt-1 text-xs text-gray-500">Comma-separated. You're added automatically.</p>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Creating..." : "Create group"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateGroupModal;
