import mongoose from "mongoose";

/**
 * A Payment records that one group member has paid another outside of
 * an expense (i.e. a settlement / repayment). Payments are factored into
 * the group's balance calculations so that the net "who owes whom" picture
 * stays accurate after real-world money is exchanged.
 *
 * Invariants enforced at the controller level (not here):
 *  - `from` and `to` must both be members of `group`
 *  - `from` and `to` must be different users
 */
const paymentSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: [true, "Group is required"],
    },
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Payer (from) is required"],
    },
    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Recipient (to) is required"],
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0.01, "Amount must be greater than zero"],
    },
    /**
     * The date on which the real-world payment was made. Defaults to
     * "now" but can be set in the past (e.g. when logging a payment
     * that happened a few days ago).
     */
    date: {
      type: Date,
      required: [true, "Payment date is required"],
      default: Date.now,
    },
    /** Optional memo / note for context (e.g. "via UPI", "cash"). */
    note: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;
