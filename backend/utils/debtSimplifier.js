const EPSILON = 1e-9;

/**
 * Given a list of expense documents and an optional list of payment documents,
 * returns a map of userId (string) -> net balance (number).
 *
 * A positive balance means the group owes that user money.
 * A negative balance means that user owes the group money.
 *
 * ── How expenses affect balances ────────────────────────────────────────────
 * For each expense the payer is credited the full amount (they fronted the
 * cash), and each split member is debited their share. If the payer is also
 * in the splits their credit and debit naturally net out to their actual share.
 *
 * ── How payments affect balances ────────────────────────────────────────────
 * A payment means user `from` handed real money to user `to` to settle a
 * debt. Therefore:
 *   • `from`'s balance goes UP   (they owe less / are owed more)
 *   • `to`'s  balance goes DOWN  (they are owed less / owe more)
 *
 * @param {Array} expenses - Expense documents (populated or unpopulated).
 * @param {Array} [payments=[]] - Payment documents (populated or unpopulated).
 * @returns {Object} balanceMap - { userId: netBalance }
 */
export const calculateBalances = (expenses, payments = []) => {
  const balances = {};

  const adjust = (userId, delta) => {
    const key = userId.toString();
    balances[key] = (balances[key] || 0) + delta;
  };

  // ── Process expenses ───────────────────────────────────────────────────────
  for (const expense of expenses) {
    // Supports both populated (paidBy is a doc) and unpopulated (paidBy is an id)
    const payerId =
      expense.paidBy && expense.paidBy._id ? expense.paidBy._id : expense.paidBy;
    adjust(payerId, expense.amount);

    for (const split of expense.splits) {
      const splitUserId =
        split.user && split.user._id ? split.user._id : split.user;
      adjust(splitUserId, -split.amount);
    }
  }

  // ── Process payments ───────────────────────────────────────────────────────
  for (const payment of payments) {
    // Supports both populated (from/to are docs) and unpopulated (ids)
    const fromId = payment.from && payment.from._id ? payment.from._id : payment.from;
    const toId   = payment.to   && payment.to._id   ? payment.to._id   : payment.to;

    // The payer (`from`) has reduced their debt → their balance improves
    adjust(fromId, payment.amount);
    // The recipient (`to`) has received money → what the group owes them shrinks
    adjust(toId, -payment.amount);
  }

  return balances;
};

/**
 * Given a balance map (userId -> net balance), returns the minimum set of
 * transactions needed to settle all remaining debts:
 * an array of { from, to, amount } where `from` owes `to` the given amount.
 *
 * Greedy algorithm: split users into creditors (balance > 0) and debtors
 * (balance < 0), sort each descending by magnitude, then repeatedly match
 * the largest debtor against the largest creditor, settling whichever
 * amount is smaller. Whichever side hits zero first advances its pointer.
 *
 * @param {Object} balances - { userId: netBalance }
 * @returns {Array} - [{ from, to, amount }]
 */
export const simplifyDebts = (balances) => {
  const creditors = [];
  const debtors = [];

  for (const [userId, balance] of Object.entries(balances)) {
    if (balance > EPSILON) {
      creditors.push({ userId, amount: balance });
    } else if (balance < -EPSILON) {
      debtors.push({ userId, amount: -balance });
    }
    // Balances within EPSILON of zero are fully settled — skip them
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let i = 0; // pointer into debtors
  let j = 0; // pointer into creditors

  while (i < debtors.length && j < creditors.length) {
    const debtor   = debtors[i];
    const creditor = creditors[j];

    const settledAmount = Math.min(debtor.amount, creditor.amount);

    if (settledAmount > EPSILON) {
      transactions.push({
        from:   debtor.userId,
        to:     creditor.userId,
        amount: Math.round(settledAmount * 100) / 100,
      });
    }

    debtor.amount   -= settledAmount;
    creditor.amount -= settledAmount;

    if (debtor.amount   < EPSILON) i++;
    if (creditor.amount < EPSILON) j++;
  }

  return transactions;
};
