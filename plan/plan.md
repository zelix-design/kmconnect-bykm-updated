# Academic Year Rollover

## Goal
Add an "academic year" (e.g. 2025-26) to the system so that student and money records
belong to a specific year, and provide a "Year Rollover" action that closes the current
year and opens a fresh one — without losing or hiding the old year.

## What an academic year means here
- Years are written as 2025-26, 2026-27, and so on.
- One year is the "active" year at any time. Anything newly created (a new student, a new
  income/expense entry) is automatically filed under the active year.
- Every existing student and every existing money entry will be filed under 2025-26 as the
  starting point. Nothing is deleted or hidden during this one-time setup.

## Filtering by year (everywhere)
- The Students page and the Accounts/Transactions (Ledger) pages get a year selector at the
  top. It defaults to the active year.
- Switching the selector shows that year's students and that year's money entries. All years
  stay fully viewable and editable — old years are not locked.
- Reports/exports on these pages follow the selected year.

## The rollover action (Super Admin only)
Triggered from a clear "Start New Year" control. When run, it:

1. Opens the next academic year (e.g. from 2025-26 it creates 2026-27) and makes it the new
   active year.
2. Shows a checklist of the current year's still-studying students (enrolled/inquiry, with
   fees pending). The admin ticks which ones carry forward into the new year. Completed and
   cancelled students are not offered and stay behind in the old year.
   - Ticked students appear in the new year with their remaining/pending fees continuing
     there. Their old year still shows what was collected in that year.
3. For every account, takes its closing balance at year-end and sets that as the account's
   opening balance for the new year. Past transactions stay filed under their own year.
4. After rollover, new entries land in the new active year automatically.

A short confirmation screen summarises what will happen (how many students carried forward,
that balances roll into openings, that the active year changes) before anything is committed.

## Decisions already made
- Records cover both Students and Accounts/Ledger.
- Year format: academic year, e.g. 2025-26.
- Existing data is filed under 2025-26 to begin with.
- Account closing balance carries forward as the new year's opening balance.
- Student carry-forward is a manual tick-list chosen at rollover time.
- Only Super Admin can trigger a rollover.
- All years remain viewable and editable side by side (no read-only lock on old years).

## Open assumptions (flag if wrong)
- The active year applies system-wide (one active year for the whole organisation, not per
  office). Offices still filter by year as usual.
- A carried-forward student keeps the same fee plan; only the pending (uncollected) portion
  continues into the new year, while collected amounts remain recorded in the year received.
- Rollover moves forward one year at a time and is not automatically reversible. Old-year data
  can still be edited manually afterwards if a correction is needed.
- Students in "inquiry" status are treated as still-studying and offered in the carry-forward
  tick-list.
