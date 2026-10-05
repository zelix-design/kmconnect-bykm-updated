# HRMS Portal + Dedicated HR Access

A Human Resources workspace inside KM Connect that brings employees, attendance, payroll, leave, and employee documents together in one place.
A new HR login role manages it centrally across all offices, and every staff member gets a simple self-service view of their own HR records.

## Who it's for
- **HR staff** — a new login role focused purely on people operations, with no access to finance, invoices, CRM, or admissions.
- **Super Admin** — creates HR accounts and retains full oversight of everything HR can see.
- **Employees (staff)** — get a personal self-service view of their own payslips, attendance, leave, and documents.

## Core features and experience

### 1. New "HR" role
- A fifth login role alongside Super Admin, Office Admin, Staff, and User.
- Created by a Super Admin from the existing Team screen (name, email, password).
- On login, HR lands on the HRMS portal. Their menu shows only HR modules: HRMS overview, Employees, Attendance & Payroll, Leave, Employee Documents, plus Messages and Settings.
- HR cannot see finance (transactions, accounts, invoices, ledger, admission revenue), CRM/leads, colleges, or approvals.
- HR is central: sees and manages employees across all three offices (KM_BLR, KM_TCR, KM_KMLY).

### 2. HRMS portal (landing hub)
- A dedicated HRMS home page with headline people-metrics: total employees, who's in today, on leave today, pending leave requests, and this month's payroll snapshot.
- Quick links into each HR module and an office filter (All / KM_BLR / KM_TCR / KM_KMLY).

### 3. Employees
- HR manages the full employee list across offices: view, add, edit, and see each person's profile (name, employee ID, office, contact, role/designation, join date, salary).
- Full payroll access: HR can view and edit salary figures, deductions, and generate/download payslips — the same payroll tools the Super Admin has today.

### 4. Employee Directory + Documents (new)
- Each employee gets a document locker: HR can upload and organise files such as offer letters, ID proofs, and contracts, each tagged by type, with the ability to view, download, and remove them.
- A searchable directory of all employees with photo, designation, office, and contact, as a clean people-browser on top of the existing records.

### 5. Attendance & Payroll
- HR uses the existing Attendance & Payroll hub (check-ins, "who's in", monthly attendance, salary and deductions, payslips), now scoped so HR sees all offices.

### 6. Leave
- HR reviews and approves/rejects leave requests and sees leave history across all offices.

### 7. Employee self-service (staff)
- Each staff member gets a "My HR" view showing their own payslips (download), their attendance summary, their leave requests/balance, and their own uploaded documents (read-only).
- Staff cannot see anyone else's HR data.

## User flow
1. Super Admin opens Team, creates an HR account, and shares the login.
2. HR logs in and lands on the HRMS portal, with the office filter defaulting to All offices.
3. HR opens Employees, adds a new joiner or edits an existing one, sets salary, and uploads their offer letter and ID proof into the document locker.
4. HR reviews pending leave requests and approves them; checks the "who's in" board and monthly attendance.
5. At month end, HR reviews salaries and deductions and generates payslips.
6. A staff member logs in, opens "My HR", downloads their latest payslip, checks their leave balance, and views their own documents.

## UI/UX feel
- Consistent with the current app: crimson/amber-on-near-black theme, Outfit display headings, rounded cards, the same sidebar and top bar.
- The HRMS portal uses the existing metric-tile and card patterns so it feels native, not bolted on.
- Employee documents presented as a tidy, labelled file list with type badges and upload/download/delete controls.
- HR's sidebar is deliberately lean — only people modules — so the workspace feels purpose-built for HR.

## Implementation phases

### Phase 1 — MVP (built now)
- New HR role with its own restricted menu and all-office scope.
- HRMS portal landing page with people-metrics and office filter.
- Employees management for HR across all offices, including full payroll (salaries, deductions, payslips).
- Employee Directory + per-employee Document locker (upload, tag by type, view, download, delete).
- HR access to the existing Attendance & Payroll and Leave modules, scoped to all offices.
- Employee self-service "My HR" view for staff (own payslips, attendance, leave, documents).

### Phase 2 — later
- HR Announcements / notice board for staff.
- Onboarding checklist for new joiners (tasks + document collection tracking).
- Document expiry reminders (e.g. contract/ID renewals) and email notifications.

### Phase 3 — later
- Configurable per-HR office scope and granular module toggles.
- Performance reviews / appraisals and goal tracking.
- Analytics dashboard (headcount trends, attrition, leave patterns).

## Assumptions
- HR is a single new role with a fixed module set (not per-person configurable in Phase 1); per-person configurability is deferred to Phase 3.
- "Employees" refers to the existing staff/employee records already in the app; the HRMS builds on these rather than creating a parallel list.
- Employee documents are stored using the app's existing object storage; no new third-party integration is required.
- Payslip generation reuses the existing payslip PDF tooling.
- HR accounts are created only by a Super Admin (no public/self sign-up for HR), consistent with how Staff and User accounts are created today.
- HR can view and edit salary data (per decision), so payroll figures are visible to the HR role by design.
- Self-service for staff is read-only for payslips/documents; staff continue to submit leave through the existing leave flow.
- Messages and Settings remain available to HR; all other non-HR pages are hidden and blocked server-side.
