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

## Phase 4 (future) — Polish
- [ ] Live-refresh permissions in office_admin's session (websocket or polling, or simple `refresh on focus`).
- [ ] Add a client-side route guard so direct URL navigation to a `none` page redirects to /.
- [ ] Auto-create salary expense_request when marking incentive paid.
- [ ] Email notifications on register / approve / reject / new expense request.
- [ ] Brute-force lockout on login (5-fail → 15 min).
- [ ] Refactor Dashboard.jsx (>1000 lines) into smaller per-tile components.

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
