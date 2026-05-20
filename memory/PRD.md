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
