# Mark "SC Settled / Credited from College"

Lets you record that a student's service charge has been received from the college as an income credit into one of your accounts.
Covers the common case where a student pays their fees straight to the college and the SC is paid back to you a day or more later.

## Who it's for
Super admins and office admins who track each student's service charge and the money actually collected from colleges in FinFlow.

## Core features and experience
- A **"Mark SC Settled"** action on the student detail page, shown for any student that still has service charge pending to collect from the college.
- When clicked, a small form opens pre-filled with:
  - the **SC amount** already recorded for that student (editable),
  - the **account** that received the money (you choose from your accounts),
  - the **date** (defaults to today),
  - the **payment mode** (Cash, Bank Transfer, UPI, Cheque, Card, Other).
- On save:
  - A **credit (income) transaction** is created in the chosen account, e.g. `SC received from college — <student name>`.
  - The account balance goes up by the SC amount.
  - The transaction appears on the **Transactions page** as a credit.
  - The student is marked **SC Settled**, with a clear ₹/settled indicator on the student card and detail page (matching the existing "SC cleared/collected" styling).
- **Reversible:** the student shows an **"Unmark / Undo SC Settled"** option. Undoing removes the linked credit transaction and reverts the balance, with no duplicates left behind.
- **Editing stays in sync:** changing the amount, account, date or mode re-points the single linked credit transaction instead of creating a second one.
- This credit is independent of the existing "SC to Client" payout (which is a debit to a sub-agent); a student can have both without them interfering.

## User flow
1. Open a student whose SC is still pending from the college.
2. Tap **Mark SC Settled**.
3. Review the pre-filled SC amount, pick the receiving account, confirm the date and mode.
4. Save → the student shows **SC Settled**, and a matching credit appears on the Transactions page and in that account.
5. If something was wrong, tap **Undo SC Settled** to remove the credit and mark it pending again.

## UI/UX feel
Consistent with the current FinFlow crimson / near-black system: the same compact dialog pattern already used for payments and SC payouts, the same ₹ status chip used for SC-cleared students, and a green "credit" treatment on the resulting transaction to distinguish it from debits.

## Implementation phases
**Phase 1 (built now — MVP):** Mark SC Settled action + dialog (pre-filled editable amount, account picker, date, mode), creation of the linked credit transaction, account balance update, SC Settled status + indicator on student card/detail, Transactions visibility, and reversible unmark that removes the credit. Edits re-sync the single linked transaction (no duplicates).

**Phase 2 (later):** Bulk settle — select several college-paid students the college settled together and credit them to one account in a single action; show settled SC totals on the SC Report.

**Phase 3 (later):** Reconciliation view that lists all students with SC still pending from each college, with aging (how many days outstanding) and a per-college expected-vs-received summary.

## Assumptions
- "SC pending to collect from the college" means the student's recorded SC-from-college amount has not yet been marked settled; the action is hidden once settled (replaced by the undo option).
- The pre-filled amount comes from the student's recorded service charge (the super-admin SC-from-college value when present, otherwise the student's standard SC figure). It remains editable at settlement time.
- One SC settlement per student (a single credit), not partial/split settlements — partial collection can be handled later if needed.
- The credit is recorded as income in the selected account with a recognisable description tying it to the student; it does not create or touch any sub-agent ledger.
- Marking/unmarking and edits keep exactly one linked credit transaction per student, mirroring how existing payment-linked transactions behave.
- Existing SC-to-Client payout (debit) behaviour is unchanged.
