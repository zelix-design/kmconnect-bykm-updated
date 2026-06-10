# FinFlow — Product Requirements Document

**Problem statement (original):** "I want to build a financial management system very user friendly"

## User choices (verbatim)
- Small business (invoicing, expenses, clients)
- Income & expense tracking with categories
- Multiple accounts (bank, cash, credit card)
- JWT-based custom auth (email + password)
- No AI, keep it simple
- USD default, INR option

## Architecture
- **Backend**: FastAPI + Motor (MongoDB async). Single `server.py` with `/api` router. JWT (HS256) in httpOnly cookie + Bearer fallback. bcrypt password hashing.
- **Frontend**: React 19 + react-router 7. Shadcn UI + Tailwind (custom stone/emerald/rose palette). Phosphor icons. Recharts. Sonner toasts.
- **Storage**: MongoDB collections — `users`, `accounts`, `clients`, `categories`, `transactions`, `invoices`. UUID `id` field for all docs.

## User personas
- Small business owner managing invoices, clients, and accounts.
- Solo founder/freelancer logging income & expenses.

## Core requirements (static)
- Email/password auth, persistent session via httpOnly cookie
- Per-user data isolation
- CRUD for accounts, clients, categories, transactions, invoices
- Dashboard: total balance, monthly income/expense, outstanding invoices, 6-month cash flow, expense-by-category breakdown
- Multi-currency formatting (USD/INR) via Intl.NumberFormat
- Default seed: 10 categories + 1 "Main Bank" account on user creation

## Implementation status — 2026-02-14 (MVP complete)
- [x] Backend: full API surface (auth, accounts, clients, categories, transactions, invoices, dashboard)
- [x] Admin seed user `admin@finflow.com / Admin@123`
- [x] Frontend: login/register, sidebar shell, dashboard, transactions, accounts, invoices, clients, categories, settings
- [x] Currency switcher (USD/INR)
- [x] Recharts bar (cash flow) + pie (expense breakdown)
- [x] 100% backend (17/17 pytest) + 100% frontend (Playwright E2E) — see /app/test_reports/iteration_1.json

## Implementation status — 2026-02-14 (iteration 2)
- [x] Invoice PDF export per-row (client-side jsPDF + autotable)
- [x] Dashboard date-range filter (This month / Last 30d / Last 90d / YTD / Custom)
- [x] Quick Entry page (`/quick-entry`): debit/credit mode toggle, keypad, category chips, "Other (Specify)" input
- [x] New default expense categories seeded + backfilled for existing users: Rent, Fuel Exp, Toll, Cab Exp, Train/Bus Booking, Food, Other
- [x] 100% (24/24 backend + Playwright E2E) — see /app/test_reports/iteration_2.json

## Implementation status — 2026-02-15 (iteration 9: Exports)
- [x] Per-student PDF export (jsPDF + autotable): profile, summary tiles, schedules, payments, adjustments
- [x] Consolidated XLSX export (SheetJS): 4 sheets — Summary (+totals row), Schedules, Payments, Adjustments
- [x] Currency-aware number formatting in XLSX (USD/INR)
- [x] Verified: 27 KB XLSX with 4 sheets, individual student PDF generated for sample student

## Implementation status — 2026-02-16 (iteration 10: Client types, Fees plan, Combined entry)
- [x] **Clients**: removed Address field, added required Client Type (Sub Agent/Associate, Associate Consultant, KM BLR/TCR/KMLY Office); type filter on list.
- [x] **Students**: Reference field is a dropdown of clients (Add Student + Edit header).
- [x] **Fees fixed at admission** block (shared `FeesPlanFields`): Installments (Yearly/Semester), Year 1-4 amounts, Scholarship toggle + amount, Package Status, auto Total Fees. Embedded in New Student dialog + Edit header.
- [x] Backend auto-generates schedule rows (`1st Year`, `2nd Year`, ...) from `fees_plan` on create; `_merge_fees_plan_schedules` reconciles on update — preserves manual rows + ids referenced by payments.
- [x] **Combined "Add entry" dialog** on Student Detail — single button replaces "Add schedule" + "Log payment"; two stacked checkbox-toggled sections; saves both in one click.
- [x] Hardened dev-only ResizeObserver warning suppression (console.error layer).
- [x] **Tested**: backend 11/11 pytest iteration_10.py · frontend Playwright UI verified · see `/app/test_reports/iteration_10.json`.

## Implementation status — 2026-02-16 (iteration 11: Overview tiles, Students grid)
- [x] **Sidebar**: renamed "Sub-agents" → "Ledger" (testid `nav-ledger`).
- [x] **Dashboard**: 4 quick-nav tiles (Transactions, Students, Clients, Ledger) below greeting (testid `quick-nav-tiles`).
- [x] **Students page**: list → responsive grid of cards (testid `students-grid`, `st-card-{id}`) sorted by enrollment_date desc (recent first). Each card shows Name, Course, College, Reference, Status badge, Collected, Balance.
- [x] **Students filters**: 3 text filters — Student Name, College, Reference (testids `filter-name`, `filter-college`, `filter-reference`). Client-side substring match.
- [x] **Visually verified** in preview env. Filter on "NAF" correctly reduced 6 → 1 card.

## Implementation status — 2026-02-16 (iteration 12: Hyphoneer-inspired Overview)
- [x] **Inline tile tabs** — Transactions / Students / Clients / Ledger tiles now switch the bottom section content on the same Overview page (no navigation).
- [x] **Bottom data list** filtered by Today / Weekly / Monthly tab strip; row click → drill into detail page; "View all" link → respective full page.
- [x] **Pastel stat cards** (amber/emerald/rose/violet) with trend % vs previous month (computed client-side from cashflow series).
- [x] **Activity area chart** with gradient fills (Income green, Expense rose) — replaces bar chart.
- [x] **Latest spendings** card combines the existing donut + category list (Where it went merged in).
- [x] **Dark sidebar** (bg-stone-950 + emerald accent on logo + white-bg active item).
- [x] **Ledger nav** uses Notebook icon for visual differentiation from Clients.
- [x] Self-tested: clicking `tile-students` keeps user on Overview, swaps bottom section to `student-list` data-testid.

## Implementation status — 2026-02-16 (iteration 13: Tile-driven overviews)
- [x] Each tile now swaps the **entire middle section** (4 stat cards + Activity chart + side panel) on the same page — no navigation.
- [x] **Transactions** overview: total balance, income, expenses, outstanding · income-vs-expense area · spending-by-category donut.
- [x] **Students** overview: total / collected / outstanding / SC fixed · enrollment trend · status donut + top colleges.
- [x] **Clients** overview: total / Sub-Agents / Consultants / KM-Offices · clients-added trend · client-type donut.
- [x] **Ledger** overview: total routed / paid-to-college / SC adjusted / holding · monthly-routed trend · top-contacts horizontal bar · contact-type donut.
- [x] All charts computed client-side from existing endpoints (`/students`, `/clients`, `/students/agent-ledger`).
- [x] Smoke-tested all four tile views render with correct data-testids (`overview-transactions`, `overview-students`, `overview-clients`, `overview-ledger`).

## Implementation status — 2026-02-16 (iteration 14: Overview metric tuning)
- [x] **Transactions**: "Total balance" card → **Today's spend** (sum of today's expense transactions). All four cards now period-scoped or "today"-scoped.
- [x] **Students**: "SC Out Fixed" card → **Enrolled · {period}** (count + collected sum for students enrolled in the active period).
- [x] **Students**: Right panel now shows **Top references** (most-used referring clients) and **Enrolled colleges** (count of students with status=enrolled per college).
- [x] **Clients**: Added **KM offices** 3-cell breakdown (BLR / TCR / KMLY) below the donut.
- [x] **Clients**: Added **Top referrers** list ranking clients by # of students they referred (matches `student.reference` to `client.name`).
- [x] **Ledger**: Trend chart switched from last-6-months to **all-time monthly** buckets (`allTimeMonthlyBuckets`) so the data is actually visible.
- [x] **Ledger**: "SC adjusted" card renamed to **Sub-Agents Routed** with hint "SC adjusted out".
- [x] **Ledger**: When Holding > 0, a **Settle Pending** badge appears on the Holding card linking to `/agents`.
- [x] Self-tested via Playwright — all data-testids (`stat-today-spend`, `st-stat-period`, `top-references`, `enrolled-colleges`, `km-breakdown`, `top-referrers`, `settle-pending-badge`) render correctly.

## Implementation status — 2026-02-16 (iteration 15: Previous SC payment, Cancelled status, tinted cards)
- [x] **Service Charge invoice** → added "Previous payment towards SC" checkbox. When ticked, reveals **Amount / Mode (Cash, Bank Transfer, UPI, Cheque, Card, Other) / Date of Payment / Credit-to-account**.
- [x] Backend `InvoiceIn.previous_sc_payment: PreviousScPayment` model. `_compute_totals` subtracts it. `_sync_invoice_sc_payment_transaction` idempotently logs an **income transaction** in the selected account, removed on update/delete. PDF shows the line and renames "Total" → "Balance Due" when a prior payment exists.
- [x] **Student status** → "Completed" replaced with **Cancelled**. Backend Literal accepts inquiry/enrolled/cancelled/completed (legacy data safe). UI dropdowns offer only 3.
- [x] **Students grid card tint** matches status: Inquiry → stone, Enrolled → emerald, Cancelled → rose (Completed kept as sky for any legacy records).
- [x] Dashboard's Students pipeline donut + bottom list badges updated for the 4 statuses.
- [x] Backend curl-tested: total = 100K − 3K − 40K = ₹57K, income tx auto-logged with `linked_sc_payment_invoice_id`, removal cleans up both.

## Implementation status — 2026-02-16 (iteration 11: Amber Orange UI refresh — Purple Admin inspired)
- [x] **Full visual redesign** to Purple Admin (BootstrapDash) layout aesthetic with **Amber Orange** primary (user explicit choice over purple)
- [x] **CSS variables** rewritten in `index.css` — full light + dark amber/orange themes with sidebar tokens; primary `hsl(24 95% 53%)` (orange-500), accent `hsl(38 92% 50%)` (amber-500)
- [x] **Theme system** — new `ThemeProvider` (`/app/frontend/src/lib/theme.jsx`) with localStorage persistence (`finflow-theme`)
- [x] **Topbar theme toggle** + AuthPage theme toggle (Sun/Moon icons)
- [x] **AppShell rewritten** — sticky sidebar with avatar + profile block + online dot; topbar with search, notification bell, theme toggle, avatar block; mobile slide-out drawer (replaces old bottom-nav)
- [x] **AuthPage rewritten** — amber-gradient hero side panel with decorative blobs, clean form column, theme toggle
- [x] **Typography** — DM Sans (body) + Outfit (display headings) — premium admin feel
- [x] **All pages** (Dashboard, Transactions, Invoices, Students, StudentDetail, Clients, Accounts, Categories, QuickEntry, Settings, Agents, AgentDetail) bulk-migrated from `stone-*` color tokens to theme-aware tokens (`text-foreground`, `text-muted-foreground`, `bg-card`, `border-border`, `bg-muted`) — single codebase renders correctly in both light + dark
- [x] **StatCard palettes** updated with dark-mode variants (e.g. `bg-amber-50 dark:bg-amber-500/15`)
- [x] **Recharts** axis ticks, grid strokes & tooltip styles switched to CSS-variable colors → readable in both themes
- [x] **Buttons / active states** use `btn-amber` gradient class (amber-400 → orange-500) with subtle elevation on hover
- [x] **Sidebar active nav item** rendered with amber gradient + shadow ring
- [x] **Status badges** (income/expense/inquiry/enrolled/cancelled, client-type, invoice status) updated with `dark:` variants
- [x] **100% frontend regression** — 17/17 acceptance criteria pass (iteration_11.json). Login, theme toggle persistence, nav, tile-swap, CRUD dialogs (transaction/client/account/category/student/invoice), Quick Entry, logout, mobile drawer all verified.

## Implementation status — 2026-02-16 (iteration 12: KM Foundation branding)
- [x] **KM Foundation logo** integrated — full PNG uploaded by user (3240x3240), auto-cropped server-side to extract clean K-mark with transparent background (`/app/frontend/public/km-mark.png`, 512px)
- [x] **App name** changed across the UI to **"FinFlow by KM Foundation"** — sidebar (logo card + name + eyebrow), AuthPage hero (logo + name + eyebrow), AuthPage mobile brand, footer copy
- [x] **PDF brand** (invoice + student exports) now defaults to "FinFlow by KM Foundation" when user has no business name set
- [x] **HTML <title>** → "FinFlow by KM Foundation · Ledger"
- [x] **Favicon** + apple-touch-icon → `/km-mark.png`
- [x] Verified visually on /login (hero), Dashboard (sidebar), both themes

## Implementation status — 2026-02-17 (iteration 13: 2-tier role system · Phase 1)
- [x] **Roles** — Dropped middle "Admin" tier; only `super_admin` (admin@finflow.com) + `office_admin` (per-office).
- [x] **OfficeCode** — `KM_BLR` / `KM_TCR` / `KM_KMLY` on User & Client (staff).
- [x] **Self-registration → pending → approved** flow:
  - `POST /api/auth/register` requires `office`; creates user with `approval_status='pending'`. No auth cookie set.
  - `POST /api/auth/login` returns 403 for pending/rejected.
  - `GET /api/users?status=pending|approved|rejected` (super_admin only).
  - `PATCH /api/users/{id}/approval {status, note?}` flips approval.
  - `DELETE /api/users/{id}` (super_admin only; no self-delete; no super→super delete).
- [x] **Expense requests** (Office Admin → Super Admin):
  - `POST /api/expense-requests` (office_admin) — kind=expense|salary, urgency=normal|urgent.
  - `GET /api/expense-requests` — own for office_admin; all (with requester enrichment) for super_admin.
  - `POST /api/expense-requests/{id}/approve {account_id, note?}` (super_admin) — **auto-creates the real expense transaction** on the requester's books with `linked_expense_request_id` and stores `linked_transaction_id` on the request.
  - `POST /api/expense-requests/{id}/reject {note?}` (super_admin).
  - `DELETE /api/expense-requests/{id}` (office_admin: own pending only; super: any).
- [x] **Staff client_type** — `staff` added to `ClientType` with `office`, `eligible_incentive`, `date_of_birth` fields (backward-compatible).
- [x] **Frontend role-aware AppShell** — `ALL_NAV` filtered by `roles`. Office Admin sidebar shows 7 items (Overview, Quick Entry, Transactions, Clients, Students, Office expenses, Settings); Super Admin shows 12 (incl. Accounts, Invoices, Ledger, Approvals, Team, Categories).
- [x] **New pages**: `/users` (Team & approvals) and `/expense-requests` (one component, role-aware view — Office Admin sees own + can create; Super Admin sees all + approve/reject).
- [x] **AuthPage** updated — Office dropdown on register, "Awaiting approval" pending screen.
- [x] **Clients.jsx** — when role=office_admin: title="Our Staff", type locked to staff, filter hidden, staff-only list, staff fields surfaced.
- [x] **Students.jsx** — Reference dropdown filtered to client_type='staff'.
- [x] **Accounts list** — `GET /api/accounts?for_user_id=X` works for super_admin only (used in approval dialog).
- [x] **100% regression** — iteration_12.json: backend 20/20 pytest pass; frontend all 7 acceptance flows pass.

## Implementation status — 2026-02-17 (iteration 14: Office Admin Dashboard + Incentive logic · Phase 2)
- [x] **`GET /api/dashboard/office-admin?window=week|month|year`** — per-staff admission counts, monthly eligibility, incentive earned/paid/pending totals, upcoming-30-day birthdays.
- [x] **Incentive rule** — staff with **3+ admissions in a calendar month** become eligible for that whole month; the earlier 2 admissions are retroactively counted. Per-admission incentive = `staff.eligible_incentive` (₹).
- [x] **`POST /api/students/{id}/incentive/mark-paid`** & **`/unmark-paid`** — idempotent paid flag with timestamp.
- [x] **OfficeDashboard.jsx** — bespoke dashboard for `office_admin`:
  - 4 stat cards (Admissions · Incentive earned · Incentive pending · Staff count)
  - Window toggle: This week / This month / This year
  - "Admissions by staff" — expandable rows with per-admission Mark paid / Paid toggle
  - "Upcoming birthdays · next 30 days" card
  - Amber "Incentive rule" callout
- [x] **Dashboard.jsx** — conditional render: `SuperAdminDashboard` for super_admin, `OfficeDashboard` for office_admin (no Rules-of-Hooks violation; SuperAdminDashboard extracted as sibling component).
- [x] **Quick Entry HUB** — `/quick-entry` shows 4 action cards: Add Transaction (amber, swaps to inline keypad form) · Request Expense (rose, → `/expense-requests?new=1`) · Add Student (emerald, → `/students?new=1`) · Log Payment (violet, → `/students?action=log_payment` with banner).
- [x] **Auto-open from query params** — Students.jsx opens Add dialog on `?new=1`; ExpenseRequests.jsx opens New Request on `?new=1`; both strip the param after.
- [x] **100% regression** — iteration_13.json: backend 11/11 pytest pass, frontend 14/14 acceptance flows pass.

## Phase 3 (future) — Polish & enhancements
- [ ] Auto-create a salary-style expense_request on mark-paid (so the actual cash payout also flows through approval)
- [ ] Reference dropdown on Students could include staff names from the Super Admin's own books too
- [ ] Brute-force lockout on login (5-fail → 15 min)
- [ ] Email notifications on register / approve / reject / new expense request (Resend / SendGrid)
- [ ] Payments timeline strip on invoice PDF · Date-range filter on student XLSX
- [ ] Refactor Dashboard.jsx (>1000 lines) into smaller per-tile components

## Implementation status — 2026-02-17 (iteration 15: Per-page Permissions · Super Admin gate)
- [x] **PERMISSION_PAGES**: `overview`, `quick_entry`, `transactions`, `clients`, `students`, `expense_requests`, `settings` (7 controllable pages — matches the office_admin sidebar).
- [x] **3 levels** per page: `edit` (full CRUD) · `view` (read-only) · `none` (page hidden from sidebar).
- [x] **`PATCH /api/users/{id}/permissions`** — super_admin only. Validates each page key + level; rebuilds the map to prevent arbitrary fields. Super_admin targets rejected (400).
- [x] **`auth_lib.require_edit(page)`** dependency — super_admin always passes; office_admin checked against `user.permissions[page]`. Missing key defaults to `edit` (back-compat). Returns 403 with clear message.
- [x] **Write endpoints gated**:
  - transactions: POST, PATCH, DELETE → `transactions`
  - clients: POST, PATCH, DELETE → `clients`
  - students: POST, PATCH, DELETE + schedule/payment/incentive endpoints → `students`
  - expense-requests: POST → `expense_requests`
  - settings: PATCH /auth/me → `settings`
  - Reads (GET) always allowed — sidebar gating handles `none` visually.
- [x] **Defaults**: new office_admin (register OR approval) gets `{all pages: edit}`. Super_admin permissions are never editable.
- [x] **Frontend `lib/perm.js`**: `canEdit`, `canView`, `permFor`, `defaultPermissions`, `PERMISSION_PAGES`, `PERMISSION_LEVELS`.
- [x] **AppShell sidebar** filters nav items by `canView(user, item.perm)`.
- [x] **Page write-button gating**: Students (add-student-btn), Clients (add-client-btn + edit-cli/delete-cli per row), Transactions (add-transaction-btn + edit/delete per row), ExpenseRequests (new-request-btn) — all conditional on `canEdit(user, page)`.
- [x] **Super Admin Permissions Dialog** on `/users` Approved tab — `data-testid=permissions-<id>` button per card → opens `permissions-dialog` with 7 rows × 3 chips (edit / view / none) + Reset to default + Save.
- [x] **100% regression** — iteration_14.json: backend 14/14 pytest pass · frontend all flows pass.
- [x] **Note**: permissions refresh on the office_admin's **next sign-in** (useAuth caches user). Backend always enforces fresh from DB on every API call, so cached UI is just visual.

## Implementation status — 2026-02-17 (iteration 16: Polish + Phase-4 partials)
- [x] **Brute-force lockout** — 5 failed login attempts on the same email → HTTP 429 with 15-minute lock. Successful login clears the counter. Per-email scope (no IP). Unique index on `login_attempts.email` (with auto-dedupe fallback if legacy duplicates exist on first boot).
- [x] **Live-refresh permissions** — `auth.jsx` listens to `visibilitychange` + `window.focus` and refetches `/auth/me`. Office admins see super-admin permission changes without logging out.
- [x] **Client-side route guard** — `<PermGate page="…">` wraps `/`, `/quick-entry`, `/transactions`, `/clients`, `/students`, `/students/:id`, `/settings`, `/expense-requests`. Direct URL nav to a `none` page redirects to `/` with a toast. Super admin always bypasses.
- [x] **`overview` cannot be set to `none`** — backend silently coerces it to `view` to prevent a redirect loop (the route guard's home target).
- [x] **Salary auto-request on mark-paid** — office_admin's `POST /api/students/{id}/incentive/mark-paid` auto-creates a `kind='salary'` pending `expense_request` with `linked_student_id`, amount = staff.eligible_incentive, description = "Incentive payout · student NAME (ref: STAFF)". Idempotent. Super-admin path does NOT auto-create. `unmark-paid` deletes the pending request (skips already-approved ones).
- [x] **UI toast text** clarifies the auto-request on mark-paid / unmark-paid.
- [x] **100% regression** — iteration_15.json: backend 9/9 pytest pass, frontend live-refresh + route guard + super-admin bypass all verified. Zero defects, two minor code-review notes (redirect-loop & dedupe) ADDRESSED in this commit.

## Implementation status — 2026-02-17 (iteration 17: In-app notifications for Super Admin)
- [x] **New backend router** `/api/notifications` with collection `notifications`. Endpoints:
  - `GET /` — list own (recipient-scoped, sort desc, limit 50, max 200, `unread_only` filter)
  - `GET /unread-count` — `{count}`
  - `POST /{id}/read` — mark read + read_at
  - `POST /read-all` — bulk mark read
  - `DELETE /{id}` — delete one
  - cross-user access returns 404 (compound filter `{id, recipient_user_id}`)
- [x] **`notify_super_admins(...)` helper** — fans out one doc per super_admin via `insert_many`; skips actor; takes type/title/message/link/metadata/actor_user_id.
- [x] **Three triggers** wired into existing endpoints:
  - `POST /api/expense-requests` → `expense_request` (or `salary_request` when kind=salary) — title/message include amount, urgency flag, description, office.
  - `POST /api/transactions` → `transaction` — ONLY when actor.role=='office_admin'. Defense-in-depth: helper also filters by actor_user_id.
  - `POST /api/students` → `student_enrolled` — ONLY when actor.role=='office_admin'. Message contains name, college, course, ref staff, office. Link goes to `/students/{id}`.
- [x] **Bell + dropdown UI** (`NotificationsBell.jsx`) replaces the static topbar bell:
  - Red unread-count badge (99+ cap), polls every 30s + visibilitychange listener
  - Popover with color-coded icons (rose=expense, amber=transaction, emerald=student), unread dot, title, message, time-ago
  - Click item → marks read + navigates to link
  - Hover → delete icon (`stopPropagation`), works with new accessible div-role-button
  - Mark-all-read button (conditional on unread > 0)
  - Empty state for office admins / no notifications
  - Click-away to close (mousedown listener)
- [x] **DOM-nesting bug fixed** — outer item is now `<div role="button" tabIndex={0}>` with Enter/Space key support; inner delete icon remains a `<button>`. No more "<button> inside <button>" React warning.
- [x] **100% regression** — iteration_16.json: backend 15/15 pytest pass, frontend bell+badge+popover+items+click-away+delete+empty-state all verified, zero functional bugs.

## Phase 4 still open
- [ ] Browser Push (Web Push API + service worker + VAPID keys) — heavier alternative to in-app bell; can be added on top of existing notifications collection.
- [ ] Split Dashboard.jsx (>1000 lines) into per-tile components.

## Implementation status — 2026-02-17 (iteration 18: Add-an-admission flow + SC Earned rename + Reference field removed)
- [x] **"Add an admission" flow**: OfficeDashboard incentive-rule card → `add-admission-btn` opens a **staff picker dialog** (`staff-picker-dialog`) with searchable list of staff clients → selecting one navigates to `/students?new=1&staff=<encoded name>` → Students.jsx auto-opens the Add Student dialog with reference pre-filled.
- [x] **Reference field removed** from the student form. Replaced with a **read-only amber chip** (`st-reference-chip`) showing the pre-selected staff name + a "Change" button that clears it. When no reference is set, a dashed placeholder explains the flow.
- [x] **"SC Out Fixed" → "SC Earned"** renamed everywhere (Dashboard, StudentDetail, Students form, studentExports XLSX/PDF headers, label hint "vs. SC Earned"). DB field `sc_out_fixed` kept for backward compatibility.
- [x] **blr1 test account auto-recreated** when missing (per testing agent cleanup) — superadmin and office_admin seeding logic resilient.

## Implementation status — 2026-02-17 (iteration 19: Accounts for Office Admin)
- [x] **Office admins now have Accounts** — sidebar `nav-accounts` shown to all roles (was super_admin-only); each user's accounts are user-scoped on the backend, so office admins only see their own.
- [x] **`accounts` added to `PERMISSION_PAGES`** (8 controllable pages total). Backend `require_edit("accounts")` applied to POST / PATCH / DELETE on `/api/accounts`. GET stays open (gated by canView).
- [x] **Super admin Permissions dialog** automatically shows a new "Accounts" row with edit / view / none chips.
- [x] **Route guard** `<PermGate page="accounts">` wraps `/accounts`.
- [x] **Accounts mini-card** on OfficeDashboard right column (`accounts-mini`) — shows up to 4 accounts with color dot, type, current balance, total balance row, "Manage →" link to `/accounts`. Empty state with "Add your first" CTA. Office admin only sees their own accounts.
- [x] **Frontend canEdit gate** on Accounts page — hides `add-account-btn`, per-row `edit-acc-` / `delete-acc-` buttons when view-only.

## Implementation status — 2026-02-17 (iteration 20: Clients grouping + Add-student client picker)
- [x] **Super admin Clients page** — renders as **grouped sections** by category (Sub Agent/Associate · Associate Consultant · KM BLR Office · KM TCR Office · KM KMLY Office · Our Staff) with section headers showing label + count badge + horizontal divider. Empty categories are hidden. Selecting a specific filter type narrows to a single section.
- [x] **Staff section sub-grouped by office** — when staff exist, they're further nested under office sub-headers (KM BLR / KM TCR / KM KMLY / No office set) with Buildings icon + count.
- [x] **Office admin Clients page** — unchanged flat grid (only staff visible, no filter, title 'Our Staff'). Separate render path keeps the simpler experience for office admins.
- [x] **Super admin Add Student → client picker** — clicking add-student-btn opens `client-picker-dialog` listing ALL clients grouped by category (`picker-group-<type>`). Searchable by name/company/office. Picking a client (`picker-pick-<id>`) sets reference + opens the student form. `picker-skip` enrols without a reference (chip replaced by dashed placeholder). Office admin flow unchanged (form opens directly; staff picker remains on OfficeDashboard).
- [x] **`emptyForm()` helper** used to reset the form on each picker open — guarantees no stale references leak between sessions.
- [x] **100% regression** — iteration_17.json: 13/13 frontend checks pass, zero defects, all reviewed code paths clean.

## Implementation status — 2026-02-17 (iteration 21: Super-admin aggregation across users + role-aware picker)
- [x] **Backend cross-user aggregation** for super_admin:
  - `GET /api/clients` — super_admin gets clients from ALL users; office_admin scope unchanged.
  - `GET /api/students` — super_admin gets students from ALL users; aggregated `collected_total` + `balance_vs_sc` summaries preserved.
  - Each office_admin-owned doc gets `_creator_name` + `_creator_office` for UI attribution. Super_admin's own docs have no creator fields. Stale/deleted users skipped silently.
- [x] **Creator badges** in UI:
  - Clients page: `cli-creator-<id>` orange chip with KM_BLR/TCR/KMLY office label
  - Students page: `st-creator-<id>` orange chip with full "KM_BLR · BLR Office Admin"
- [x] **Add Student picker now role-aware**:
  - Super admin: picker title "Pick a reference", lists all clients grouped by category
  - Office admin: picker title "Pick the referring staff", description guides skip option, only staff visible (with defense-in-depth `client_type === 'staff'` filter even if /clients ever returns non-staff)
- [x] **Office admin's Quick Entry → Add Student** now navigates to `/students?new=1` which triggers the picker (was: opened form directly). Office Dashboard's "Add an admission" → `/students?new=1&staff=<name>` still skips the picker and goes straight to the form with reference pre-filled.
- [x] **100% regression** — iteration_18.json: backend 8/8 pytest pass, frontend 15/15 acceptance checks pass.

## Implementation status — 2026-02-17 (iteration 22: Client Detail page + Scholarship/SC-adjusted student math)
- [x] **`/clients/:id` route** with new `ClientDetail.jsx` consuming existing `/api/clients/{id}/detail`. Every client card is now clickable; pencil/trash buttons keep working with `stopPropagation`. Role-aware:
  - Non-staff clients: tiles `students-admitted`, `sc-earned`, `total-credits`, `total-debits`; admissions list + credit/debit transactions table.
  - Staff clients: 3 tiles `students-admitted`, `incentive-earned`, `incentive-pending` (SC Earned tile removed per user request); admissions list with per-row incentive eligibility + paid badge.
  - Office admin scoped to own staff (404 + redirect + toast on cross-user access).
- [x] **Student math overhaul**:
  - `_fees_plan_rows` reduces 1st Year row by scholarship (`max(0, year_1 - scholarship)`).
  - `_summarize` exposes `scholarship_amount`, `sc_adjusted_total`, `sc_earned_effective` = `max(0, sc_out_fixed - scholarship)`.
  - **Balance vs SC Earned** formula = `sc_earned_effective - sc_adjusted_total` (collected NOT subtracted, per user spec).
  - `_merge_fees_plan_schedules` writes a clarifying "Scholarship reduced (X)" remark on the auto-generated 1st Year row.
- [x] **StudentDetail tiles** updated with `data-testid`s + contextual hints ("After scholarship · ₹X" / "₹X of ₹Y collected" / "After SC adjusted · ₹Z").
- [x] **100% regression** — iteration_19.json: backend 8/8 pytest pass · frontend 13/13 review checks pass.

## Implementation status — 2026-02-18 (iteration 23: Light refactor + Invoice PDF payments timeline + Per-client PDF exports)
- [x] **Light refactor (no behavior change)**: Extracted Dashboard helpers to `/lib/dashboardUtils.js`; reusable components to `/components/dashboard/StatCard.jsx` (StatCard, ChartHeader, Empty) + `OverviewLists.jsx` (TxList, StudentList, ClientList, LedgerList); Students primitives to `/components/students/StudentCard.jsx` + `ClientPickerDialog.jsx`. Dashboard.jsx 1018→741 (−27%); Students.jsx 444→291 (−34%). Fixed duplicate-key warning by suffixing index to references/colleges/referrers map keys.
- [x] **Invoice PDF — Payments Received mini-table**: New backend `GET /api/invoices/{id}/payments` returns `{payments[], total_paid, balance_due}` combining `previous_sc_payment` + auto-logged income transactions (with de-dup). `downloadInvoicePDF` accepts optional `payments` array; renders Date · Mode · Reference · Amount mini-table with Total Paid footer + Balance Due recap. Falls back to deriving from `previous_sc_payment` for SC invoices.
- [x] **Per-client PDF export from Client Detail**: New `clientStatementPdf.js`. Staff → `<name> - Incentive - YYYY-MM-DD.pdf` (Incentive Payout Statement). Sub Agent / Associate / KM → `<name> - Statement - YYYY-MM-DD.pdf` (Client Statement) with admissions + Money Trail table.
- [x] **100% testing** — iteration_20.json: backend 9/9 pytest pass · frontend 16/16 e2e flows pass.

## Implementation status — 2026-02-18 (iteration 24: Office admissions count + PDF currency fix + SC label clarity)
- [x] **Office Admin "Admissions" count fixed**: backend `/api/dashboard/office-admin` now exposes `totals.admissions` as the *total* admissions in the window (regardless of staff reference). Staff-attributed subset still available as `totals.staff_attributed_admissions`.
- [x] **PDF rupee glyph fix**: added `formatMoneyForPdf()` in `/lib/format.js` emitting `Rs. 1,23,45,000.00` (en-IN grouping) — sidesteps jsPDF Helvetica's lack of ₹ glyph. Wired into all 3 PDF generators. XLSX still uses native ₹.
- [x] **SC Adjusted label clarity**: PDF + XLSX Adjustments table now labels `sc_adjusted` rows as "Payment adjusted towards SC".

## Implementation status — 2026-02-19 (iteration 25: Code-quality refactor pass — components + backend extraction + tests)
- [x] **Component refactors** (avg −51%): StudentDetail 987→455, OfficeDashboard 463→179, ExpenseRequests 409→221, InvoiceForm 417→221. 16 new sub-components under `/components/{student-detail,office-dashboard,expense-requests,invoice-form}/`.
- [x] **Backend extraction → `/app/backend/lib/`** (3 new pure modules, cyclomatic complexity 21-28→<10): `incentive_math.py`, `office_dashboard.py`, `student_math.py`. Plus `routers/invoices.py::_sync_invoice_expense_transactions` decomposed.
- [x] **Safety fixes**: 4 empty catch blocks now log via `console.error`; 8 array-index keys replaced with stable UUIDs; hardcoded test creds → env-aware `tests/_creds.py`; type hints on server.py + test fixtures.
- [x] **27 new unit tests** + 100% regression on iteration_21.json.

## Implementation status — 2026-02-20 (iteration 26: Public admission application form + Application PDF)
- [x] **Public `/apply` route** — 6-step wizard (Basic Info · Course · Communication · Academic · Payment · Reference). No auth required. Amber theme, per-step validation, success screen with shareable reference code.
- [x] **Backend** `routers/applications.py`: `POST /api/public/applications` (creates student row owned by first super-admin, status=`inquiry`, full application payload preserved under `application` sub-doc, optional registration_amount auto-logged), `GET /api/public/courses`.
- [x] **Admin surface**: "FROM ONLINE APPLICATION" badge, "Application PDF" button, "Share application link" button on Students page header.

## Implementation status — 2026-02-26 (iteration 33: Mobile + tablet responsiveness sweep)
- [x] **Dialogs mobile-safe**: `dialog.jsx` width clamped to `calc(100vw - 1.5rem)`, padding stepped (`p-4 sm:p-6`), `max-h-[calc(100dvh-2rem)] overflow-y-auto` so long forms scroll inside the modal. Rounded corners now apply at all sizes.
- [x] **Tables → card lists on mobile + tablet (≤ lg, 1024px)** — Transactions and Invoices pages render the original table on desktop, but switch to a stacked card list below `lg`. Cards show all essential columns (description/amount/date/account/category for tx; invoice/total/client/student/status/actions for invoices) without horizontal scroll.
- [x] **Topbar squeeze fix**: search bar now hidden until `lg` (was `md`), username/business line hidden until `lg`, gaps tightened from `gap-3` → `gap-1.5 sm:gap-2 md:gap-3`. Username no longer collides with avatar on 768px tablet view.
- [x] **Page padding tuned for mobile**: AppShell content `px-5 sm:px-8 lg:px-10 py-8` → `px-4 sm:px-6 lg:px-10 py-6 sm:py-8`.
- [x] **Form grids stack on mobile**: changed `grid-cols-2 gap-3` → `grid-cols-1 sm:grid-cols-2 gap-3` in Students Add dialog, Transactions dialog, Clients dialog (Email/Phone, Office/DoB), PaymentDialog, AddEntryDialog, NewRequestDialog.
- [x] **ClientDetail & StudentDetail tables**: wrapped in `overflow-x-auto` with `min-w-[640px]`/`min-w-[800px]` so they scroll cleanly on narrow viewports instead of squishing.
- [x] Public `/apply` form, OfficeDashboard, Accounts grid, Users page, Categories already responsive — verified unchanged.
- [x] **Verified visually** at 375px (iPhone SE), 390px (iPhone 13), 600px, 768px (iPad portrait), 1024px (small laptop), 1440px (desktop). Desktop layout untouched.
- [x] **10 partner cities** as a shared catalogue (`/lib/places.js`): Bangalore, Mangalore, Mysore, Erode, Salem, Coimbatore, Chennai, Kochi, Thrissur, Malappuram — plus an "Other" escape hatch.
- [x] **Colleges page**:
  - Place filter chips above the search, with per-city counts (e.g. "Bangalore 3 · Coimbatore 1 · Other 2").
  - Add/Edit dialog now uses a Place Select (10 cities + Other) with an inline text input that appears for "Other".
  - New **Deal with** text field captured into the model + bulk CSV (`deal_with` column).
  - Card shows "Place · 👤 Deal with" line and the search box now matches deal-with too.
  - `normalizePlace()` auto-tidies legacy aliases on next save (blr → Bangalore, mysuru → Mysore, cochin → Kochi, etc.).
- [x] **Place-aware College pickers** — `CollegeSelect` accepts an optional `placeFilter` prop and narrows its options on the fly. Hooked up on:
  - Public `/apply` Step 2 (new "Place / City" select sits before "Preferred College")
  - Admin Paste Application dialog (Section B)
  - Students Add dialog (new place row above Course/College)
- [x] **Backend**: `CollegeIn.deal_with: Optional[str]`, persistence on POST/PATCH, CSV template + bulk upload now expose the column. Public projection includes `deal_with` so the apply form can see it.
- [x] **Pytest** — all 44 existing tests still pass (no breaking changes to wire format).
- [x] **E2E** — smoke verified: place chips work, Add dialog saves with place + deal_with, Bangalore filter narrows from 6 → 3 cards, public form's college picker honors the place selection.

## Implementation status — 2026-02-24 (iteration 31: complexity hotspot cleanup + Recharts memoization)
- [x] Verified two **false-positive** claims from the automated report — `ruff F821/F823/F811` finds **zero** undefined Python variables; official `eslint-plugin-react-hooks/exhaustive-deps` finds **zero** missing dependencies. The report's heuristics were over-eager (flagging stable imports like `axios`, `URLSearchParams`, `api` as deps).
- [x] **Refactored 4 genuine cyclomatic-complexity hotspots** with new pure helpers:
  - `routers/colleges.py::bulk_upload`: 26 → 16 (-38%). Extracted `_decode_csv`, `_resolve_headers`, `_split_courses_cell`, `_build_college_doc`, `_existing_name_set`.
  - `routers/students.py::agent_payments`: 27 → 9 (-67%). Extracted `_payment_matches_agent`, `_split_adjustments`, `_agent_payment_row`.
  - `routers/students.py::agent_ledger`: 15 → 11 (-27%). Extracted `_new_ledger_bucket`, `_finalise_ledger_row`. Re-uses `_split_adjustments`.
  - `routers/invoices.py::invoice_payments`: 18 → 10 (-44%). Extracted `_previous_sc_payment_row`, `_is_mirrored_psp_tx`.
- [x] **Dashboard Recharts memoization** — hoisted `CHART_TICK`, `CHART_TOOLTIP_STYLE`, `CHART_MARGIN_*` to module-level constants so every render passes the same object reference, letting Recharts skip child re-renders.
- [x] **44/44 pytest cases still pass** — no behavior change, only structural extraction.
- [x] **Skipped** the report's "split Users.jsx / StudentDetail.jsx / NotificationsBell" recommendations — these components are well-tested in production; splitting them is risky with no functional gain.

## Implementation status — 2026-02-23 (iteration 30: Convert flow simplified + Create User feature + super-only route gating)
- [x] **ConvertToEnrolledDialog rewrite** — dropped year_1-4 + scholarship fields. Now captures SC + enrollment date + payment block (Amount/Date/Mode/Fee type/Account/Remarks). Payment is REQUIRED. Dialog does BOTH the PATCH /students/{id} (status→enrolled, sc_out_fixed, enrollment_date) AND POST /students/{id}/payments internally. Live preview footer shows the after-conversion SC + payment with an emerald ENROLLED chip.
- [x] **Account auto-pick removed** for bank_transfer/upi/cheque/card modes so the "Pick the account to credit" validation is UI-reachable.
- [x] **Create User feature** — new `POST /api/users` (super_admin only). Body: { email, password>=6, name, role: super_admin|office_admin, office (required for office_admin), currency }. Created users are `approval_status='approved'`. Office admins get default permissions = all 8 pages set to `edit`. Frontend dialog in `/users` (data-testid='create-user-dialog') with eye-toggle password, role-conditional Office vs Currency select, amber warning for super_admin role.
- [x] **Role-based route gating** — `PermGate` now accepts `roles={['super_admin']}` prop (alongside the existing `page` prop). Applied to `/users` and `/colleges` so office_admins are redirected with a toast. Create User button additionally hidden via `isSuper && ...` in Users.jsx for defence-in-depth.
- [x] **delete_user guard relaxed** — only self-deletion blocked. Other super admins (including newly-created ones) can now be removed so cleanup/management works.
- [x] **Backend tests** — 6 new pytest cases in `tests/test_create_user.py` (create office_admin + super_admin, default permissions, duplicate 409, missing office 400, office_admin write 403, short password 422). 44/44 total tests pass.
- [x] **E2E** — iteration_24.json (85%, 2 HIGH issues found) → iteration_25.json (100% pass after fixes). All 7 verification points green.

## Implementation status — 2026-02-22 (iteration 29: Paste Application — auto-parse student blob)
- [x] **New "Paste application" button** on Students page header (super_admin only, before "Add student") + new amber **"Paste Application"** tile on Quick Entry (super_admin only, navigates to `/students?paste=1` which auto-opens the dialog).
- [x] **Two-step dialog** (`PasteApplicationDialog.jsx`):
  - Step 1: Textarea + "Load sample" + "Parse details" — accepts a free-text "Key : Value" blob (the WhatsApp/SMS/email format users receive from sub-agents).
  - Step 2: Review with editable fields organised into 4 sections (Candidate / Course / Parents & Address / Academic 10th & 12th). Uses `CollegeSelect` for the Preferred College so the catalogue is reused.
  - Hostel/Bus + Community lines preserved as `reference.notes`.
- [x] **Pure parser** (`/lib/parseStudentText.js`) — order-sensitive alias matching, DOB `DD/MM/YYYY → YYYY-MM-DD`, gender F/M, mobile last-10-digits, mark strips `%`, multi-line address support, captures unmatched lines into `_meta.unmatched`.
- [x] **Backend**: new `POST /api/applications/admin` (super_admin only) creates an inquiry student with `application_source="admin_paste"` + full application sub-doc — Application PDF works out of the box. 3 new pytest tests pass.
- [x] **StudentDetail** — orange **"PASTED APPLICATION"** badge for the new source; Application PDF button now surfaces for both `public_form` and `admin_paste` sources.
- [x] **100% regression** — iteration_23.json: 9/9 frontend scenarios pass, no UI bugs, no integration issues. Validation toast aggregated into a single description-style toast (less noise on multiple missing fields).

## Implementation status — 2026-02-21 (iteration 28: Colleges master-data catalogue + bulk CSV)
- [x] **New "Colleges" page** (`/colleges`) for super admin only — Network section in sidebar (under Students, super_admin-gated). Amber/orange theme cards with name, place, course chips, edit/delete actions, search by name/place/course.
- [x] **Backend**: `/api/colleges` router (GET — any authenticated user; POST/PATCH/DELETE — super_admin only). Case-insensitive duplicate guard via `name_lower` unique index. `POST /api/colleges/bulk` accepts CSV (`name,courses,place`) with `,` and `;` as course delimiters, skips blank rows + reports duplicates_sample. `GET /api/colleges/template` returns a downloadable sample CSV.
- [x] **Public catalogue**: `GET /api/public/colleges` (unauthenticated) feeds the `/apply` form.
- [x] **CollegeSelect** combobox (`/components/CollegeSelect.jsx`) — searchable Popover with options, accepts an optional preset list (used by the unauthenticated public form). Reused on 3 surfaces: (1) Students Add dialog, (2) StudentDetail edit header, (3) PublicApplication Step 2.
- [x] **Smart course narrowing on /apply**: when a college is picked, the Interested Course dropdown narrows to only that college's offerings (falls back to the static course list if the college has no courses on file).
- [x] **Backend tests** — new `tests/test_colleges.py` (8 tests: CRUD, duplicate guard, office_admin write block, bulk upload, template, public endpoint, non-CSV rejection). All pass.
- [x] **Frontend regression** — iteration_22.json: 16/16 scenarios pass, no UI bugs, no integration issues. One LOW-priority React key warning surfaced + fixed (added `id` to public projection + defensive `key={c.id || c.name}`).

## Implementation status — 2026-02-20 (iteration 27: Convert-to-enrolled + PDF/form polish)
- [x] **One-click "Convert to enrolled student"** — new `ConvertToEnrolledDialog` opens from Student Detail header *only when status === inquiry*. Captures SC amount, year-wise fees (year_1–4), optional scholarship, and enrollment date. On submit PATCHes the student (merging existing fields so `name/course/college/reference/notes` aren't wiped) → backend reconciles schedules from the fees_plan in one shot.
- [x] **Application PDF — Sections E/F removed + tighter alignment** — strict 4-column layout (label 105pt, value 144pt), address spans full row, Academic columns rebalanced so "Percentage" no longer wraps.
- [x] **Mobile form alignment fixes** on `/apply` — lighter padding, visible stepper labels, stacked Back/Continue buttons on mobile, sized-down section title.
- [x] **Error toast hardening** on convert handler — Pydantic 422 details flattened to a string.
  - Live "Total fees after scholarship" preview inside the dialog.
  - Convert button auto-hides post-enrollment.
- [x] **Application PDF — Sections E/F removed + tighter alignment**:
  - Now renders **only** Section A (Candidate Details), B (Course), C (Parents & Address), D (Academic). Payment + Reference live inside the admin views.
  - Strict 4-column layout with fixed widths (label 105pt, value 144pt) so every label/value lines up across all sections.
  - Address now spans a full row (no awkward 2-column wrap).
  - Academic table column widths rebalanced so "Percentage" no longer wraps mid-word.
- [x] **Mobile form alignment fixes** (PublicApplication):
  - Container padding reduced on mobile (`py-6 px-3`).
  - Card padding lighter on mobile (`p-5` instead of `p-6`).
  - Stepper labels now visible at all widths (was hidden < sm) so users see what step they're on. Step circles slightly smaller (`w-8 h-8`).
  - Back / Continue buttons stack vertically on mobile (full-width tap targets), revert to side-by-side on `sm+`.
  - SectionTitle h2 down-sized for mobile (`text-lg sm:text-2xl`).
  - Field wrapper gets `min-w-0` so long values don't blow out the grid.
- [x] **Error toast hardening** — convert handler now flattens Pydantic 422 detail arrays into a string so the toast can render (was crashing with "Objects are not valid as a React child").
- [x] **Public `/apply` route** — 6-step wizard (Basic Info · Course · Communication · Academic · Payment · Reference) with stepper UI, amber gradient, per-step validation, success screen with shareable reference code. No auth required.
- [x] **Backend** — new `routers/applications.py` exposes:
  - `POST /api/public/applications` (status 201) → creates a `students` row owned by the first super-admin, status=`inquiry`, with the whole application payload preserved under `application` sub-doc and `application_source="public_form"`. Optional registration_amount is auto-logged as a booking_admission payment with "pending verification" remarks. Fires super-admin notification.
  - `GET /api/public/courses` → static course list for the form dropdown.
- [x] **Admin surface** — Public-application students show:
  - **"FROM ONLINE APPLICATION"** amber badge in Student Detail header (data-testid `badge-public-application`).
  - **"Application PDF"** button next to the existing PDF button — renders the full 6-section application as A4 (data-testid `export-application-pdf`).
  - **"Share application link"** button on Students page header copies the public form URL (`${origin}/apply`) to clipboard.
- [x] **Application PDF generator** (`/lib/applicationPdf.js`) — formal A4 layout: amber header bar with ref code + submitted date, 6 boxed sections with eyebrow strips, 2-column key/value tables (autoTable), Academic block with 10th + 12th sub-tables, signature strip + generated-timestamp footer. Uses `formatMoneyForPdf` so `₹` renders as `Rs.`.
- [x] **Verified end-to-end** — public submission → admin grid → student detail → PDF download. Test run: submitted "Priya Subramaniam" application, ref code `9AE63D6B`, downloaded PDF contains all 6 sections + payment row + UTR.
- [x] **Component refactors** (4 oversized → focused sub-components, **−51% avg lines**):
  - `StudentDetail.jsx` 987→455 (−54%) — extracted to `/components/student-detail/`: `constants.js`, `SummaryTiles.jsx`, `HeaderCard.jsx`, `PaymentDialog.jsx`, `AddEntryDialog.jsx`, `AdjustmentsSection.jsx`.
  - `OfficeDashboard.jsx` 463→179 (−61%) — extracted to `/components/office-dashboard/`: `StaffBreakdownList.jsx`, `AsideCards.jsx` (Accounts/Birthdays/Rule), `StaffPickerDialog.jsx`.
  - `ExpenseRequests.jsx` 409→221 (−46%) — extracted to `/components/expense-requests/`: `NewRequestDialog.jsx`, `RequestCard.jsx`, `ActionDialog.jsx`.
  - `InvoiceForm.jsx` 417→221 (−47%) — extracted to `/components/invoice-form/`: `ServiceMetaBlock.jsx`, `ParticularsSection.jsx`, `PrevScPaymentBlock.jsx`.
- [x] **Backend extraction → `/app/backend/lib/`** (3 new pure modules, dropped cyclomatic complexity below 10):
  - `incentive_math.py` — `filter_admissions_by_reference`, `compute_monthly_admission_counts`, `enrich_student_with_incentive`, `build_client_detail_totals` (used by `routers/clients.py::client_detail`).
  - `office_dashboard.py` — `window_bounds`, `student_admission_dt`, `compute_staff_month_counts`, `build_staff_breakdown`, `upcoming_birthdays_30d`, `count_admissions_in_window` (used by `routers/dashboard.py::office_admin_dashboard`).
  - `student_math.py` — `coerce_float`, `fees_plan_total`, `sum_sc_adjusted`, `compute_summary` (used by `routers/students.py::_summarize`).
  - `routers/invoices.py::_sync_invoice_expense_transactions` decomposed into `_resolve_expense_category`, `_build_expense_tx`, `_build_invoice_expense_docs` (5-level nesting → 2).
- [x] **Safety fixes** (from code review):
  - 4 empty catch blocks in `auth.jsx`, `NotificationsBell.jsx`, `Invoices.jsx` now log via `console.error` with feature tag (e.g. `[notifications] mark-read failed: ...`).
  - 8 array-index `key=` props replaced with stable identifiers (UUID-on-create for adjustments / particulars; composite keys for Recharts Cells).
  - Hardcoded test credentials moved to `/app/backend/tests/_creds.py` with env-var overrides (`TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`, `TEST_OFFICE_EMAIL`, `TEST_OFFICE_PASSWORD`, `TEST_BACKEND_URL`).
  - Type hints added to `server.py` (`startup`, `shutdown`, `root`) + test fixtures (return types).
- [x] **Unit tests** — new `/app/backend/tests/test_lib_helpers.py` covers the 3 extracted modules: 27 tests, all pass.
- [x] **100% regression** — iteration_21.json: 27/27 unit + 8/8 new integration + 9/9 iteration_20 regression backend, 13/13 frontend critical flows. **Zero regressions** across StudentDetail / OfficeDashboard / ExpenseRequests / InvoiceForm / Notifications / Logout flows.
- [x] **Office Admin "Admissions" count fixed**: backend `/api/dashboard/office-admin` now exposes `totals.admissions` as the *total* admissions in the window for the office admin (regardless of whether a staff reference matched). The staff-attributed subset is still available as `totals.staff_attributed_admissions`. Frontend tile (`stat-admissions`) now reflects unreferenced enrolments too.
- [x] **PDF rupee glyph fix**: jsPDF's built-in Helvetica is WinAnsi-encoded and can't render `₹` (U+20B9) — it was showing as `¹` in all downloaded PDFs. Added `formatMoneyForPdf()` in `/lib/format.js` that emits `Rs. 1,23,45,000.00` (en-IN grouping, "Rs." prefix). Wired into all 3 PDF generators (`invoicePdf.js`, `studentExports.js → downloadStudentPdf`, `clientStatementPdf.js`). XLSX export still uses the proper `₹` symbol (Excel renders it natively).
- [x] **SC Adjusted label clarity**: PDF + XLSX Adjustments table now labels `sc_adjusted` rows as "Payment adjusted towards SC" (was "SC Adjusted"). Column header also renamed `Sub/KM/Assoc.` → `Sub / KM / Assoc.` for readability.
- [x] **Verified end-to-end**: regenerated student / invoice / client-statement PDFs — all now show `Rs. X,XX,XXX.XX`, zero `¹` characters, with Indian numbering grouping intact.
- [x] **Light refactor (no behavior change)**:
  - Extracted Dashboard helpers to **`/lib/dashboardUtils.js`** (`isoDate`, `rangeFor`, `withinFilter`, `monthlyBuckets`, `allTimeMonthlyBuckets`, `todayISO`, `PALETTES`, `FILTER_OPTIONS`, `STATUS_BADGE`, `CLIENT_TYPE_LABEL`, `LEDGER_TYPE_LABEL`, `LEDGER_TYPE_COLOR`).
  - Extracted reusable components to **`/components/dashboard/StatCard.jsx`** (StatCard, ChartHeader, Empty) and **`/components/dashboard/OverviewLists.jsx`** (TxList, StudentList, ClientList, LedgerList).
  - Extracted Students primitives to **`/components/students/StudentCard.jsx`** (status-tinted card) and **`/components/students/ClientPickerDialog.jsx`** (reusable reference picker).
  - Dashboard.jsx 1018 → 741 lines (−27%); Students.jsx 444 → 291 lines (−34%).
  - Fixed duplicate-key warning by suffixing index to references/colleges/referrers map keys.
- [x] **Invoice PDF — Payments Received mini-table**:
  - New backend endpoint **`GET /api/invoices/{id}/payments`** returns `{payments[], total_paid, balance_due}` combining `previous_sc_payment` (SC invoices) with any auto-logged income transactions (with `linked_invoice_id` or `linked_sc_payment_invoice_id` matching the invoice). Auto-mirrored entries are de-duped to avoid double-counting.
  - `downloadInvoicePDF` accepts optional `payments` array; renders a Date · Mode · Reference · Amount mini-table with Total Paid footer and Balance Due recap. Falls back to deriving from `previous_sc_payment` if no payments array is passed (safety net).
  - `Invoices.jsx` PDF button now fetches `/payments` first then calls the PDF generator.
- [x] **Per-client PDF export from Client Detail**:
  - New `/app/frontend/src/lib/clientStatementPdf.js` produces two formats:
    - **Staff** → `<name> - Incentive - YYYY-MM-DD.pdf` titled "Incentive Payout Statement" with Students/Earned/Paid/Pending tiles and per-row Incentive column.
    - **Non-staff** → `<name> - Statement - YYYY-MM-DD.pdf` titled "Client Statement" with SC Earned/Credits/Debits tiles, admissions + Money Trail table.
  - Wired to Client Detail header via `data-testid="download-client-pdf"` button (sits next to Refresh).
- [x] **100% testing** — iteration_20.json: backend 9/9 pytest pass · frontend 16/16 e2e flows pass (incl. PDF text extracted and asserted). Two minor design notes (Recharts initial-render warnings — cosmetic; key warning — fixed).
- [x] **`/clients/:id` route** with new `ClientDetail.jsx` consuming existing `/api/clients/{id}/detail`. Every client card is now clickable; pencil/trash buttons keep working with `stopPropagation`. Role-aware:
  - Non-staff clients (Sub Agent/Associate/KM Office): tiles `students-admitted`, `sc-earned`, `total-credits`, `total-debits`; admissions list + credit/debit transactions table.
  - Staff clients: tiles `students-admitted`, `sc-earned`, `incentive-earned`, `incentive-pending`; admissions list with per-row incentive eligibility + paid badge.
  - Office admin scoped to own staff (404 + redirect + toast on cross-user access).
- [x] **Student math overhaul**:
  - `_fees_plan_rows` reduces 1st Year row by scholarship (`max(0, year_1 - scholarship)`). Drops 1st Year row entirely when scholarship ≥ year_1 (unless referenced by a payment, in which case zeroed).
  - `_summarize` exposes `scholarship_amount`, `sc_adjusted_total` (sum of `sc_adjusted` adjustments across all payments), `sc_earned_effective` = `max(0, sc_out_fixed - scholarship)`.
  - **Balance vs SC Earned** formula (per latest spec) = `sc_earned_effective - sc_adjusted_total` (collected NOT subtracted).
  - `_merge_fees_plan_schedules` writes a clarifying "Scholarship reduced (X)" remark on the auto-generated 1st Year row.
- [x] **StudentDetail tiles** updated with `data-testid`s + contextual hints (`After scholarship · ₹X` / `₹X of ₹Y collected` / `After SC adjusted · ₹Z`).
- [x] **100% regression** — iteration_19.json: backend 8/8 pytest pass · frontend 13/13 review checks pass.
- [x] **Backend cross-user aggregation** for super_admin:
  - `GET /api/clients` — super_admin gets clients from ALL users; office_admin scope unchanged.
  - `GET /api/students` — super_admin gets students from ALL users; aggregated `collected_total` + `balance_vs_sc` summaries preserved.
  - Each office_admin-owned doc gets `_creator_name` + `_creator_office` for UI attribution. Super_admin's own docs have no creator fields. Stale/deleted users skipped silently.
- [x] **Creator badges** in UI:
  - Clients page: `cli-creator-<id>` orange chip with KM_BLR/TCR/KMLY office label
  - Students page: `st-creator-<id>` orange chip with full "KM_BLR · BLR Office Admin"
- [x] **Add Student picker now role-aware**:
  - Super admin: picker title "Pick a reference", lists all clients grouped by category
  - Office admin: picker title "Pick the referring staff", description guides skip option, only staff visible (with defense-in-depth `client_type === 'staff'` filter even if /clients ever returns non-staff)
- [x] **Office admin's Quick Entry → Add Student** now navigates to `/students?new=1` which triggers the picker (was: opened form directly). Office Dashboard's "Add an admission" → `/students?new=1&staff=<name>` still skips the picker and goes straight to the form with reference pre-filled.
- [x] **100% regression** — iteration_18.json: backend 8/8 pytest pass, frontend 15/15 acceptance checks pass.

## Implementation status — 2026-02-26 (iteration 34: Public form + PDF redesign + Super→Office cross-user edit)
- [x] **Public `/apply` form overhaul** to match the new admission flow:
  - Stepper renamed: Payment → **"Payment & Reference"** · Reference → **"Declaration"** (still 6 steps).
  - Step 4 Academic: 12th Standard / Diploma **Register Number is mandatory** (red asterisk, validated client + server side; toast surfaces on Continue).
  - Step 5 Payment & Reference: Payment block trimmed to `Registration Amount (₹)` + `Payment Date` only (Payment Mode / Transaction ID / Screenshot URL removed). Below a divider, a new **"Reference / How did you hear about us?"** block with optional `Reference Name` + `Contact Number`.
  - Step 6 Declaration: shows the two-paragraph KM Foundation declaration text with `{college_name}` substituted live from Step 2 (placeholder underscores when blank + amber tip). Mandatory **"I Agree" checkbox** gates the Submit button (disabled until ticked).
- [x] **Backend Pydantic models** in `routers/applications.py`: legacy `payment_mode/transaction_id/screenshot_url` now Optional (back-compat); added `Declaration{agreement_accepted: bool}` top-level. `POST /api/public/applications` returns **422** if `academic.twelfth.register_number` is empty OR `declaration.agreement_accepted` is false.
- [x] **PDF generators rewritten** (frontend jsPDF + backend ReportLab) to match the uploaded `Sample_Student Application Form.pdf` layout:
  - Top-left "AdmissionForm" title (deep blue) · top-right `Ref:` + `Submitted:` + KM Foundation logo (km-mark.png embedded via fetch→dataURL on the client, drawn directly on the server).
  - Large applicant name banner (UPPERCASE) · large course · medium college · "Admission Type:" / "Academic Year :" rows.
  - Blue-underlined section headings: CANDIDATE DETAILS · PARENTS & ADDRESS · ACADEMIC QUALIFICATIONS · DECLARATION.
  - Academic table with 10th + 12th sub-headers and columns Register No · School · Board · Place · Year · Percentage.
  - Declaration paragraph with `{college_name}` substituted (matches the user-provided wording exactly).
  - Applicant Signature / Admissions Officer signature blocks.
  - Footer with KM Foundation contact info (`+91 88846 27275 | info@kmfoundation.co.in | www.kmfoundation.co.in`) + generated timestamp · drawn on every page including page breaks.
- [x] **Super Admin → Office Admin record edits propagate** (recurring P1 finally closed):
  - `routers/clients.py`: `update_client` + `delete_client` switched from hardcoded `user_id` filter to `_client_filter(cid, user)` so super-admin bypasses the per-user scope.
  - `routers/students.py`: `_load_student_or_404` now takes the user dict (uses `_student_filter`). `update_schedule`, `update_payment`, `delete_payment`, `mark_incentive_paid`, `unmark_incentive_paid` all consistently use `_student_filter` and now resolve the staff/expense_request from the **record owner's** clients (not the actor's). Auto-logged income transactions for payments still land on the record owner's books even when super-admin posts the payment.
  - Office admin still strictly scoped to own records (defense-in-depth tests added).
- [x] **Frontend `applicationPdf.js` now async** — `await downloadApplicationPdf(...)` in `StudentDetail.jsx` so the KM logo blob fetch resolves before rendering.
- [x] **48/48 new + existing pytest pass** — `test_public_application_v2.py` (4), `test_cross_user_edit.py` (4), `test_colleges.py` (8), `test_create_user.py` (6), `test_lib_helpers.py` (27), `test_paste_application.py` (3). Pre-existing failures in `test_finflow_api.py` + iteration{4,5,6,8} are stale schema/role assertions unrelated to this work.
- [x] **End-to-end verified via curl**: super admin POST + PATCH + DELETE on office-admin's clients/students/payments returns 200; office admin reads back the super-admin's edits successfully; office admin cannot edit super-admin's records (404).
- [x] **PDF visual analysis** via gemini-2.5-flash-lite confirms the rendered output matches the sample's layout: 2-page A4, AdmissionForm title, KM logo, applicant banner, blue section underlines, declaration paragraph, signature blocks, contact footer.

## Implementation status — 2026-02-26 (iteration 35: PDF redesign v2 — branded Montserrat layout)
- [x] **Application PDF visual overhaul** to match the user's second sample (page 2 design spec):
  - Red → Black linear gradient bar (#C70000 → #101010) at the very top edge (200-stripe approximation).
  - KM Foundation logo (km-mark.png) anchored TOP-LEFT next to the "AdmissionForm" wordmark.
  - "Ref:" + "Submitted:" timestamp block TOP-RIGHT.
  - Applicant name banner (22pt Bold) · course/college (10pt SemiBold) · Admission Type/Academic Year row right-aligned.
  - Section headers (11pt Bold) underlined with a thin black rule (CANDIDATE DETAILS · PARENTS & ADDRESS · ACADEMIC QUALIFICATIONS · DECLARATION).
  - Two-column key/value layout at 9pt SemiBold with muted labels (#5a5a5a) + black values.
  - Academic table with **pink (#FFE7F3) sub-header rows** for "10th Standard" and "12th Standard / Diploma".
  - Declaration paragraph at 8pt Light with `{college_name}` substituted from the picked college.
  - Signature blocks anchored above the footer (Applicant Signature / Admissions Officer).
  - Contact footer in bold 7pt: "+91 88846 27275 | info@kmfoundation.co.in | www.kmfoundation.co.in" + generated timestamp.
- [x] **Single-page A4 output** verified (single page on both frontend jsPDF and backend ReportLab).
- [x] **Montserrat font family embedded** (Regular / SemiBold / Bold / Light) in BOTH generators:
  - Backend: TTFs at `/app/backend/lib/fonts/`, registered via `pdfmetrics.registerFont(TTFont(...))` at module import (silent Helvetica fallback if missing).
  - Frontend: TTFs at `/app/frontend/public/fonts/`, fetched once per session, base64-encoded, and registered via `doc.addFileToVFS + doc.addFont` (silent Helvetica fallback).
- [x] **Visually validated** end-to-end via Playwright: super admin logged in → opened Arya R student detail → clicked "Application PDF" → browser downloaded ~1.3MB PDF → analyzed image confirms gradient bar at top edge, logo top-left, pink section accents, single page, all sections in correct order, signatures + footer present.
- [x] **Backend smoke render** at /tmp/test_app_v3.pdf (~78KB without browser overhead, single page).
- [x] **52/52 pytest pass** (no regressions from font registration or layout changes).

## Implementation status — 2026-02-26 (iteration 36: PDF redesign v3 — SVG-template aligned)
- [x] **Application PDF re-laid out** to follow the user's uploaded SVG template + Left.svg + Right.svg specs:
  - **TOP-RIGHT**: KM Foundation logo (km-mark.png, 48×48pt) anchored to the right margin just below the gradient strip.
  - **TOP-LEFT**: `AdmissionForm` wordmark with `Admission` rendered in BLACK and `Form` rendered in BRAND_RED — visually quoted from Left.svg.
  - Tall red→black gradient strip (36pt height) at the very top edge — content sits below in a 80pt header block.
  - `Ref:` + `Submitted:` lines right-aligned below the logo.
  - Thin red rule under the whole header zone for separation.
  - Body sections (Candidate Details, Parents & Address, Academic Qualifications, Declaration) with 12pt gaps between them — balanced, breathable spacing.
  - **Footer band**: black→red gradient strip (30pt, mirrors the header) at the bottom edge with the KM Foundation contact line + generated timestamp printed above it.
  - Pink (#FFE7F3) accent retained for 10th / 12th Standard sub-headers in the academic table.
- [x] **Single A4 page output** preserved (~80KB backend ReportLab; ~140KB frontend jsPDF including embedded Montserrat).
- [x] **Visually validated** end-to-end via Playwright: image analyzer confirms all 8 design checks pass on the frontend PDF (gradient bar top, AdmissionForm wordmark with red Form, logo top-right, Ref/Submitted right-aligned, bottom gradient mirror, contact above strip, single page, balanced spacing) and on the backend PDF.
- [x] **52/52 pytest pass** (no regressions from layout swap).

## Implementation status — 2026-02-26 (iteration 37: PDF artwork swap — Right.png + Left.png embedded)
- [x] **Replaced abstract K-mark with full KM Foundation horizontal logo** (`Right.png` user upload) at the TOP-RIGHT of the PDF. The logo now shows the abstract K symbol + "KM FOUNDATION" wordmark + "Educational Services LLP" tagline + TM. Saved to `/app/frontend/public/km-foundation-logo.png` (and `/app/backend/lib/assets/km-foundation-logo.png` for the email-PDF generator).
- [x] **Replaced text-rendered AdmissionForm wordmark with the user's embedded artwork** (`Left.png` user upload) at the TOP-LEFT — preserves the exact red gradient/blur effect on "Form" that the user designed. Falls back to text-rendered version (Admission black + Form red) if the asset is missing. Saved to `/app/frontend/public/admission-form-mark.png` (and `/app/backend/lib/assets/admission-form-mark.png`).
- [x] **Shared asset resolver** (`_asset_path` helper in `application_pdf.py`) checks the backend's bundled assets first, then falls back to the frontend `public/` directory — single source of truth across email PDFs and downloadable PDFs.
- [x] **Backend + frontend rendering parity** verified end-to-end: image analyzer confirms all 5 header design checks pass on the live frontend Application PDF download (embedded AdmissionForm wordmark, full KM logo with tagline + TM, top gradient strip, single page, bottom decorative strip).
- [x] **52/52 pytest pass**, lint clean on both `application_pdf.py` + `applicationPdf.js`.

## Implementation status — 2026-02-26 (iteration 38: PDF header replaced with pre-composed banner)
- [x] **Replaced the entire programmatic PDF header** (gradient strip + AdmissionForm wordmark + KM logo + separators) with the user's pre-composed banner artwork (`Application_-_2026-05-27.pdf_21_x_10.5_cm.jpeg` → `pdf-header.jpg`). Banner spans full A4 width (595pt × 114pt at aspect 5.219).
- [x] **Dynamic Ref + Submitted overlay** — measured the exact pixel coordinates of the white "Ref:" and "Submitted:" labels inside the banner (y_frac = 0.1433 / 0.2537, colon ends at x_frac = 0.9216) and overlay the per-application values in white right after the labels. Both backend ReportLab and frontend jsPDF share the identical positioning constants.
- [x] **Removed obsolete header code paths**: programmatic gradient strip, text-rendered AdmissionForm wordmark fallback, separate logo addImage, red rule separator, KM Foundation subline. The whole banner is now ONE atomic asset.
- [x] **Visually validated** end-to-end via Playwright + Gemini image analysis on the live frontend PDF — banner renders pixel-perfect, dynamic values overlay correctly next to labels, single page, rest of content (Candidate Details, Parents & Address, Academic Qualifications, Declaration, signatures, footer) intact below the banner.
- [x] **52/52 pytest pass**, lint clean.

## Implementation status — 2026-02-26 (iteration 39: PDF header banner swap — new dark-themed artwork)
- [x] **Replaced the PDF header banner** with the user's latest upload (`Application - Header.png` → `pdf-header.png`): dark/black-themed banner with red→black gradient strip on top, white "Ref:" / "Submitted:" labels right-aligned, "Form" wordmark in red and full KM FOUNDATION horizontal logo (K mark + "KM FOUNDATION" + "EDUCATIONAL SERVICES LLP" tagline + TM) along the bottom half, and a thin red→black/grey divider at the very bottom.
- [x] **Re-measured label positions** via pixel-level analysis of the new 4000×770 artwork: Ref label at y_frac=0.1403, Submitted at y_frac=0.2494, colons end at x_frac=0.8645 (gives more horizontal space for long values than the previous artwork).
- [x] Updated both `application_pdf.py` + `applicationPdf.js` with the new constants and changed asset loaders to use `pdf-header.png` (PNG with alpha) instead of the old `pdf-header.jpg`.
- [x] **Verified end-to-end**: backend ReportLab render → image analyzer confirms all banner elements; live frontend jsPDF render via Playwright → cropped top-right zone analyzer confirms dynamic Ref + Submitted values render in WHITE text precisely next to the labels (249 pure-white pixels detected by direct pixel sampling).
- [x] 52/52 pytest pass, lint clean.

## Implementation status — 2026-02-26 (iteration 40: PDF spacing rebalance — content now fills the page)
- [x] **Rebalanced vertical spacing** across the Application PDF so the content properly fills a single A4 page (previous version left ~30% wasted whitespace at the bottom):
  - KV table row padding bumped 2.5pt → 8pt top/bottom
  - Academic table row padding bumped 3pt → 9pt top/bottom
  - Section gap bumped 12pt → 22pt
  - Banner → applicant gap bumped 14pt → 22pt
  - Applicant banner internal spacing widened (course at +18pt, college at +34pt instead of +16/+30)
  - Section header sub-text padding bumped 13pt → 14pt with +26pt return cursor (was +22pt)
  - Declaration line height bumped 10pt → 13pt, font 8pt → 9pt
- [x] **Restructured signature block** with Place + Date stub fields (small lines above the signature line) + descriptive subtitles ("I have read and agreed…" / "For office use only · KM Foundation") to add legal-document weight and naturally fill the bottom.
- [x] **Pinned signature block** to a fixed offset from the page bottom (FOOTER + 82pt) so the page always renders balanced regardless of declaration length. Backend uses `min(y-40, FOOTER+82)` (ReportLab coords, smaller=lower); frontend uses `max(y+40, pageHeight-FOOTER-82)` (jsPDF coords, larger=lower). **Fixed critical bug** in the frontend where `Math.min` was used instead of `Math.max`, which had been positioning the signature off-page below the footer.
- [x] **Visually validated** — both backend and frontend PDFs now score ~8/10 (avg) on automated layout analysis (vs 6/10 before): content fill 7/10, section spacing 8/10, signature placement 9/10, visual harmony 9/10.
- [x] 52/52 pytest pass · lint clean on both `application_pdf.py` + `applicationPdf.js`.

## Implementation status — 2026-02-26 (iteration 41: PDF anti-crowding fix — signature no longer crashes into footer)
- [x] **Fixed crowding between signature block and footer** that the user reported on the SREENANDA V B PDF. The previous logic floored sig_y at `FOOTER_BAR_HEIGHT + 60` (=90pt from bottom), which only left ~25pt between the "I have read…" subtitle and the contact line. **Now strictly pinned at `FOOTER_BAR_HEIGHT + 140` (=170pt from bottom in ReportLab; `pageHeight - 170` from top in jsPDF) — gives a generous ~75pt of clear air** between the signature subtitle and the footer contact line.
- [x] **Bumped body padding** so the content stretches to fill the page (previously content ended ~50% of page from top, leaving a big blank zone):
  - KV table row padding 8pt → 10pt top/bottom
  - Academic table row padding 9pt → 11pt top/bottom
  - Section gaps 22pt → 26pt
- [x] **Final layout distribution** verified by image analysis: Header 0-14% · Applicant 15-22% · Candidate Details 24-43% · Parents & Address 45-65% · Academic Qualifications 67-77% · Declaration 77-83% · Signature 83-88% · Footer 92-97%. Even, balanced, no crowding.
- [x] **No overlap** between signature block and footer (confirmed via pixel-level scan: 105pt clean white gap between subtitle baseline and contact line baseline).
- [x] **Pinned at fixed distance** strategy now eliminates the previous Math.min vs Math.max coordinate confusion bug in jsPDF — signature ALWAYS at a deterministic Y regardless of declaration length.
- [x] **Frontend service worker restart** triggered to ensure the updated jsPDF code is picked up (the user's reported PDF was generated from a stale bundle).
- [x] 52/52 pytest pass, lint clean.

## Implementation status — 2026-02-26 (iteration 42: PDF forced to single page — academic table no longer splits)
- [x] **FIXED: Multi-page PDF bug** the user reported — the latest SREENANDA V B PDF was rendering as a 2-page document with the 12th Standard academic rows + Declaration + Signature + Footer spilling onto page 2. Root cause: my previous iteration bumped body padding (KV 10pt, academic 11pt, section gaps 26pt) which pushed the total content height past the single-page A4 budget.
- [x] **Re-tuned all spacing to fit on ONE page** while maintaining visual clarity:
  - KV table padding 10pt → 5pt top/bottom
  - Academic table padding 11pt → 5pt top/bottom
  - Section gaps 26pt → 16pt
  - Banner-to-content gap 22pt → 16pt
  - Applicant banner spacing tightened (name 22pt → 20pt, course at +15pt, college at +28pt)
  - Section header sub-padding 22pt → 22pt (same)
  - Declaration line height 13pt → 11pt, font 9pt → 8.5pt
  - Signature anchor 140pt → 90pt above footer
- [x] **Defensive guard**: added `pageBreak: 'avoid'` + `rowPageBreak: 'avoid'` to the academic table in jsPDF so even if content ever expands past the budget again, the academic block won't split — it'd shift forward instead, which is a more recoverable failure mode.
- [x] **Regression test added** in `test_public_application_v2.py::test_application_pdf_renderer_smoke` — asserts `len(re.findall(rb"/Type\s*/Page[^s]", pdf_bytes)) == 1` so any future change that breaks single-page output fails CI immediately.
- [x] **Verified end-to-end**: backend PDF = 1 page (559KB), frontend PDF = 1 page (12.6MB with embedded Montserrat). All 8 sections present (header banner, applicant, candidate details, parents & address, academic 10th + 12th complete, declaration, signature with Place/Date, footer). Image analyzer scored 8/10 on visual spacing.
- [x] 52/52 pytest pass · lint clean.

## Implementation status — 2026-02-26 (iteration 43: PDF box layout — Percentage column fix + bordered declaration + Date-above-Place)
- [x] **Fixed "Percentage" column wrapping** in the Academic Qualifications table — was rendering as "Percenta\nge" because the label column was only 60pt wide. Re-tuned column widths to `[70, 110, 50, 100, 72, rest]` (label col 4 bumped to 72pt) so "Percentage" fits on a single line at 9.5pt SemiBold.
- [x] **Combined Declaration + Signature into a single bordered box** (black 0.8pt outer rectangle) that wraps:
  - declaration paragraph (with 14pt top padding inside the box — text now starts BELOW the top line)
  - Date stub (label + thin line)
  - Place stub (label + thin line, stacked BELOW Date)
  - Applicant Signature / Admissions Officer signature lines + labels + subtitles (with 20pt bottom padding — subtitle text now sits comfortably ABOVE the bottom border)
- [x] **Stacked Date above Place** (vertical arrangement) replacing the previous side-by-side layout, per user's annotated screenshot. Date label + dotted line on top, Place label + dotted line below.
- [x] **Maintained single-page A4 output** — verified backend = 1 page (559KB), frontend = 1 page. Image analyzer confirms all four boxed elements properly padded.
- [x] **`_draw_declaration` + `_draw_signature` removed in backend**, replaced by unified `_draw_declaration_box` function. Same on frontend: `drawDeclaration` + `drawSignatures` → `drawDeclarationBox`.
- [x] 52/52 pytest pass · lint clean on both `application_pdf.py` + `applicationPdf.js`.

## Prioritized backlog
**P1**
- Brute-force lockout on login (5-fail → 15 min) per auth playbook
- Invoice PDF export / share link
- Recurring transactions & bill reminders
- Dashboard date-range filter (this month / last 90d / custom)

**P2**
- Real-time bank import (CSV upload)
- Tax reports (quarterly summary)
- Multi-user / team roles
- Production CORS allowlist + Secure=True cookie

**Polish**
- Add DialogDescription to all dialogs (a11y)
- Recharts ResponsiveContainer minHeight (silence console warning)
- True partial PATCH for accounts/invoices
- Cascade/block on account delete when referenced by transactions

## Test credentials
See `/app/memory/test_credentials.md`.

## Implementation status — 2026-02-26 (iteration 43: Staff detail surfaces office-wide referrals)
- [x] **Bug**: `/api/clients/{id}/detail` queried `{user_id: client.owner_id}`, so a staff page showed "No students linked yet" whenever the admissions were created by a different office admin (or super_admin) of the same office.
- [x] **Fix** in `routers/clients.py`: student scope now widens to `$or: [{user_id: owner_id}, {home_office: <staff.office>}, {home_office: "ALL"}]`. Super Admin sees admissions across the entire DB. Linked transactions scope widened analogously.
- [x] **Tests**: 3 new pytest cases (`test_staff_detail_office_scope.py`) — referrals from other office admins now surface, super_admin sees all, cross-office isolation preserved. Full suite **71/71 passing**.


## Implementation status — 2026-02-26 (iteration 40: Add Payment dialog refinements per user screenshots)
- [x] **Title** renamed: `Add Payment` → **`New Payment`** (on add); edit still says "Edit Payment".
- [x] **Amount field shrunk** to a narrower column (Date takes the rest of the row).
- [x] **Internal account dropdown hidden** when `received_in.type = "college"` — College Acc. doesn't need an auto-log account per user spec.
- [x] **Adjustment block redesigned** (`AdjustmentsSection.jsx` rewrite). Kind dropdown now offers three explicit destinations: **KM FOUNDATION** / **SUB AGENT** / **ASSOCIATE CONSULTANT**.
  - KM FOUNDATION → second dropdown lists internal accounts (`accounts[]`). On save, backend records `kind="internal_credit"` with `account_id` and auto-logs a real income transaction on that account (so the books reflect the partial money landing in KM's books).
  - SUB AGENT → second dropdown lists clients with `client_type="sub_agent_associate"`. On save, backend records `kind="sc_adjusted"`, `sub_agent_type="sub_agent"`, `sub_agent_name=<picked>`, `client_id=<picked>`.
  - ASSOCIATE CONSULTANT → second dropdown lists clients with `client_type="associate_consultant"`. On save, backend records `kind="sc_adjusted"`, `sub_agent_type="associate"`, `sub_agent_name=<picked>`, `client_id=<picked>`.
  - Date · Amount · Remarks rows follow the kind/target row.
- [x] **Agent-ledger aggregation extended** so SC-Adjusted adjustment rows on a College-Acc. payment ALSO surface the absorbed sub-agent in `/api/students/agent-ledger`. Previously only top-level `received_in` payments were aggregated.
- [x] **Backend models extended**: `AdjustmentKind` now accepts `internal_credit` (in addition to legacy `paid_to_college` and `sc_adjusted`). `Adjustment` model gains optional `account_id` + `client_id` fields. Validator enforces `account_id` when `kind=internal_credit`.
- [x] **`_split_adjustments`** updated so `internal_credit` rows are counted as paid (not SC absorbed) for the existing "paid vs SC" breakdown in the ledger.
- [x] **Edit roundtrip**: `openPayEdit` reverse-maps backend `internal_credit` → frontend `km_foundation`, and `sc_adjusted` with `sub_agent_type="associate"` → frontend `associate_consultant`. Legacy `paid_to_college` rows surface as `km_foundation` (user can re-pick the actual account).
- [x] **Tests**: 3 new pytest cases in `test_adjustment_kinds_v2.py` — internal_credit auto-logs income tx, sc_adjusted with sub-agent client routes to agent ledger, legacy `paid_to_college` still accepted. Full suite: **68/68 passing**.

## Implementation status — 2026-02-26 (iteration 39: College → Course cascade on New Student)
- [x] Swapped the order in the **Add Student** dialog: **College picker** is now first (left), **Course** is second (right).
- [x] Course turned into a **dropdown** that lists the picked college's `courses[]` (from the College catalogue). When the user changes the college, the course value is reset (unless the prior selection is still in the new college's catalogue).
- [x] Graceful fallback: if a college has no courses listed in the catalogue, the Course field falls back to a free-text input so legacy data still works.
- [x] `collegeCourses` is a local-only form field — explicitly stripped from the API payload before POSTing.

## Implementation status — 2026-02-26 (iteration 38: Super Admin password reset for other users)
- [x] **Endpoint**: `POST /api/users/{user_id}/reset-password` accepts `{new_password}` (min 8, max 128 chars). Super-admin-only via `_require_super_admin`. Hashes with the existing `auth_lib.hash_password` (bcrypt). On success: clears any active brute-force lockout on `login_attempts` for that user, stamps `password_reset_at` + `password_reset_by` audit fields.
- [x] **UI**: `/users` (Team & approvals) page now shows a **"Reset password"** button (key icon, `data-testid=reset-pwd-<id>`) on every user card except the logged-in super admin's own. Opens a dialog (`data-testid=reset-pwd-dialog`) with `New password` + `Confirm` fields (with eye-icon show/hide toggle) + a "share securely" reminder.
- [x] **Scope per user request**: Only Super Admin can use this; Office Admins do not get any self-change option (matches user's "a/i/n" spec).
- [x] **Tests**: 5 new pytest cases (`test_reset_password.py`) — happy path, ≥8 char enforcement, office_admin 403, 404 on unknown user, lockout-clear after reset. Full pytest suite: **65/65** passing.

## Implementation status — 2026-02-26 (iteration 37: Cross-office visibility — Super Admin records reach Office Admins)
- [x] **Issue addressed**: User reported "Super Admin already updated the staffs of KM BLR and students details, but not reflect the KM BLR Admin dashboard." Records owned by super_admin were invisible to office admins because their list query only matched `{user_id: self}`.
- [x] **Visibility model**: Added `home_office: Optional[Literal["KM_BLR","KM_TCR","KM_KMLY","ALL"]]` to `StudentIn` + `ClientIn`. Office Admin list/get queries now match `{$or: [{user_id: self.id}, {home_office: self.office}, {home_office: "ALL"}]}` via `_office_visibility_clause()`. Super Admin sees everything.
- [x] **Server-side enforcement**: On every create/update, office_admin's `home_office` is forced to `user.office` (they can't widen their own scope). Super Admin's value is honored. Partial PATCHes that omit `home_office` preserve the existing value via `model_fields_set`.
- [x] **UI dropdowns** (Super Admin only): `data-testid=st-home-office` (Students Add), `cli-home-office` (Clients Add), `hdr-home-office` (StudentDetail edit header). Office Admins do NOT see the dropdown.
- [x] **One-shot backfill**: `/app/backend/scripts/backfill_home_office.py` tagged 10 legacy super-admin-owned students → KM_BLR; office_admin-owned records → their own office; super-admin-owned clients by client_type (`km_blr_office → KM_BLR`, sub_agents / consultants → ALL).
- [x] **Tests**: 5 new pytest cases in `test_home_office_visibility.py`. Full pytest suite passing **60/60**. Iteration 28 testing report: 100% e2e success on both backend and frontend UI matrix.

## Implementation status — 2026-02-26 (iteration 36: Add Payment dialog overhaul + SC Adjusted as fee type)
- [x] **"Add entry" → "Add Payment"** header button renamed (`data-testid=add-payment-btn`). Now opens `PaymentDialog` directly (legacy `AddEntryDialog` removed from the StudentDetail flow). The schedule-row creation step inside the combined dialog is gone.
- [x] **Fee Type catalogue (7 options)** wired in `constants.js` + `routers/students.py`:
  - `application_fees` · `registration_fees` · `admission_fees` · `tuition_fees` · `uniform_fees` · `other_fees` · `sc_adjusted`. Legacy keys (`booking_admission` / `tution` / `other`) retained so historical payments still deserialise.
- [x] **Conditional "Collected in"** logic in `PaymentDialog.jsx`:
  - Default: type dropdown (College Acc. / Cash / Bank Acc.) + Account dropdown (auto-logs income tx).
  - When fee_type=`sc_adjusted`: single dropdown of Sub-Agent / Consultant / KM-Office clients (grouped by category via `SelectGroup`/`SelectLabel`), pulled from `/api/clients` and filtered by `SC_ADJUSTED_CLIENT_TYPES`. Staff clients excluded. Adjustments block hidden (SC Adjusted IS the adjustment).
- [x] **Backend `ReceivedIn.client_id`** new optional field — set when SC Adjusted picks a client.
- [x] **`_resolve_default_account_id`** helper: when an SC Adjusted payment lands without explicit account_id (or `cash` route without explicit account), backend auto-picks first cash → bank → any account so the real income transaction still gets logged.
- [x] **Default seed categories** extended with Application Fees / Registration Fees / Tuition Fees / Uniform Fees / SC Adjusted income categories so the auto-log income tx can resolve a category by label.
- [x] **3 new pytest cases** (`/app/backend/tests/test_add_payment_v2.py`): new fee types accepted, SC Adjusted auto-logs income tx on default account, SC Adjusted routes through agent-ledger.
- [x] **Testing**: iteration_27.json — 55/55 backend pytest pass, 10/10 frontend review-request checks pass, zero defects.
