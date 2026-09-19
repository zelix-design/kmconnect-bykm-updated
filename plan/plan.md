# Monthly employee payslips in the uploaded template

## Goal
Produce a payslip PDF that looks like the uploaded sample (`KM134-Jishna K Jeemon-01-06-26.pdf`, a Razorpay‑style payslip) and let staff/office admins generate one for each employee, every month. This replaces the current plain payslip PDF that the Payroll tab produces today.

## What the new payslip will contain
Laid out to match the sample:

1. **Company header** — logo, legal name, and full address (top of the page).
2. **Net Pay summary band** — "Net Pay = Gross Pay (A) − Deductions (B)" with the three figures shown prominently.
3. **Employee details block** — Employee code, Name, Designation, Department, Bank account no., IFSC code, Date of joining, Payable days, Leave balance, Regime opted.
4. **Earnings table (Gross Pay A)** — Basic, House Rent Allowance, Special Allowance, Leave & Travel Allowance, each with a "Monthly" and "Total amount" column, plus the gross total. (These four components already exist in the current salary structure: 50 / 25 / 15 / 10 %.)
5. **Deductions table (Deductions B)** — any pay deductions for the month, with a total.
6. **Yearly Taxable Income (C)** — annual Gross / Exempted / Taxable breakdown per component.
7. **Footer** — "This is a computer generated payslip and does not require a signature."

## Where the numbers come from
- **Earnings** = the employee's monthly salary split into the four components (Basic/HRA/Special/LTA) already used in the app.
- **Deductions** = any unpaid‑absence deduction for the month plus a salary‑hold, using the figures the Payroll screen already calculates. Net pay on the payslip will match the net pay shown on the Payroll tab.
- **Payable days** = derived from the month's attendance.
- **Annual figures** = the monthly amounts × 12.

## New information needed per employee
The sample shows fields the system does not store yet. These will be added as **optional** fields on the employee record, editable by an admin:
- Designation, Department, Date of joining, Leave balance, Tax regime.
- Bank account number and IFSC code (sensitive — see open decision 3).
- Employee code will reuse the existing employee ID (e.g. `KM134`).

Any field left blank is simply hidden on the payslip, so payslips still generate cleanly before every detail is filled in.

## Company identity
A single company profile (legal name, address, logo image) will be set once by an admin and used on every payslip. It will be pre‑filled with the values from the sample:
- **KM FOUNDATION (Zelix Ventures LLP)**
- 4th Floor A Block, AKR Tech Park, Garebhavi Palya, Krishna Reddy Layout, AMR Tech Park, Karnataka – 560100

## Monthly workflow
- From the Payroll tab, pick a month and generate the payslip for any employee — matching where payslips are produced today.
- A "Download all" option produces every employee's payslip for the selected month in one go.
- Delivery to employees: see open decision 2.

## Assumptions (chosen unless changed)
1. The payslip keeps the sample's **layout and section names**, but visual styling is adapted to the app's own branding rather than reproducing Razorpay's exact colours.
2. **No income‑tax engine.** The tax/exemption figures (TDS, standard deduction, monthly tax projection on the sample's second page) are not computed automatically. The Yearly Taxable Income table is shown, and any tax‑deducted amount defaults to 0 (matching the sample) unless an admin enters one. The detailed second‑page monthly tax projection is omitted.
3. Bank account and IFSC are stored so they can appear on the payslip.
4. The company logo is uploaded by the admin; if none is uploaded, the company name is shown as text.
5. Payslips are available to admins; whether each employee can also download their own is covered by existing access rules and not expanded here.

## Open decisions worth challenging
1. **Tax section depth.** The default is to skip automatic income‑tax calculation and the second‑page monthly tax projection (assumption 2). If full tax computation and the monthly projection are required, that is a much larger, India‑tax‑rules build and needs its own confirmation.
2. **How employees receive the payslip.** Options: (a) admin downloads and shares manually; (b) an "Email payslip" button emails the PDF to the employee on demand; (c) fully automatic email to all employees at month‑end; (d) send via WhatsApp. Default assumed for now: (a) + (b) — download plus an on‑demand email button, reusing the email service the app already uses. Automatic month‑end sending (c) can be added if wanted.
3. **Storing bank details.** Account number and IFSC are sensitive. Default is to store and show them. Confirm this is acceptable, or the payslip can omit banking fields.
