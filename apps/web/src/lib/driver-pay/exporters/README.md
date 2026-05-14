# Payroll Exporters

This directory contains the DriveCommand payroll export abstraction layer (Phase 11).

## Format Registry

| Format         | File             | Employment Type | Spec URL                                                                                                                              | Sandbox Status             |
| -------------- | ---------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `generic_csv`  | generic-csv.ts   | W-2 + 1099      | DriveCommand canonical (no external spec)                                                                                             | N/A (internal)             |
| `quickbooks`   | quickbooks.ts    | W-2 + 1099      | https://quickbooks.intuit.com/learn-support/en-us/help-article/import-export-data/format-csv-files-quickbooks-desktop/L9CqaWqaY_US_en_US | Not yet manually verified — TODO before production rollout |
| `adp`          | adp.ts           | W-2 + 1099      | https://support.adp.com/adp_payroll/content/hybrid/paydata_import.htm                                                                | Not yet manually verified — TODO before production rollout |
| `gusto`        | gusto.ts         | W-2 (separate)  | https://support.gusto.com/article/106621964100000                                                                                     | Not yet manually verified — TODO before production rollout |
| `gusto`        | gusto.ts         | 1099 (separate) | https://support.gusto.com/article/213842491000000                                                                                     | Not yet manually verified — TODO before production rollout |

---

## Per-Format Details

### Generic CSV (`generic_csv`)

**Spec source:** DriveCommand canonical format — no external provider.

**Verified columns (all):**
| Column | Description |
|--------|-------------|
| `settlement_reference` | Settlement reference number |
| `driver_id` | Driver UUID |
| `driver_first_name` | Driver first name |
| `driver_last_name` | Driver last name |
| `driver_email` | Driver email |
| `period_start` | Period start date (ISO 8601) |
| `period_end` | Period end date (ISO 8601) |
| `employment_type` | W2_EMPLOYEE / OWNER_OPERATOR_1099 / LEASE_OPERATOR |
| `gross_taxable` | Taxable gross pay |
| `gross_non_taxable` | Non-taxable (per-diem, reimbursements) |
| `total_deductions` | Total deductions (absolute value) |
| `net_pay` | Net pay |
| `line_count` | Number of pay component rows |
| `bonus_count` | Number of bonus rows |
| `deduction_count` | Number of deduction snapshot rows |

**Unverified columns:** None — all columns are DriveCommand-defined.

---

### QuickBooks Desktop General Journal Entry (`quickbooks`)

**Spec source:** https://quickbooks.intuit.com/learn-support/en-us/help-article/import-export-data/format-csv-files-quickbooks-desktop/L9CqaWqaY_US_en_US

**Why CSV not IIF:** Intuit has deprecated IIF for new integrations. The General Journal Entry CSV format has stable, current Intuit-published documentation.

**Verified columns:**
| Column | Notes |
|--------|-------|
| `Date` | MM/DD/YYYY — verified per Intuit docs |
| `Journal No.` | Settlement reference — verified per Intuit docs |
| `Account` | Chart-of-accounts name — partially verified (see TODOs) |
| `Debits` | Verified |
| `Credits` | Verified |
| `Description` | Verified |
| `Name` | Driver full name — verified |
| `Class` | Empty (carrier-optional) — verified |
| `Memo` | Verified |

**Unverified / TODO columns:**
| Column | TODO |
|--------|------|
| `Account` (for deductions) | Emits `"TODO:DEDUCTION_ACCOUNT"` — requires carrier to map each deduction type to their QuickBooks chart-of-accounts account name. |

**TODO before production rollout:** Import a sample CSV into QuickBooks Desktop 2024 sandbox and verify all column headers match exactly.

---

### ADP Run Paydata Grid (`adp`)

**Spec source:** https://support.adp.com/adp_payroll/content/hybrid/paydata_import.htm

**Verified columns (subset per ADP documentation):**
| Column | Notes |
|--------|-------|
| `Co Code` | Company code — TODO (see below) |
| `Batch ID` | Batch identifier — TODO (see below) |
| `File #` | Employee file number — TODO (see below) |
| `Reg Hours` | Regular hours — emitted as empty for flat-rate trucking |
| `O/T Hours` | Overtime hours — emitted as empty |
| `Hours 3 Code` | Hours type code — empty |
| `Hours 3 Amount` | Hours dollar amount — empty |
| `Earnings 3 Code` | MISC for W-2, 1099 for owner-operators |
| `Earnings 3 Amount` | Gross taxable pay |
| `Memo` | Settlement reference |

**Unverified / TODO columns:**
| Column | Placeholder | TODO |
|--------|-------------|------|
| `Co Code` | `TODO:CO_CODE` | Each carrier must enter their ADP company code (from ADP Run admin panel) |
| `Batch ID` | `TODO:BATCH_ID` | Carrier-defined batch identifier |
| `File #` | `TODO:FILE_NUM` | ADP employee file number — carrier must maintain mapping table |

**TODO before production rollout:** Import a sample CSV into ADP Run sandbox and verify all column headers match exactly. Replace TODO placeholders with carrier-specific values.

---

### Gusto Bulk Hours & Earnings / Contractor Pay (`gusto`)

**Spec source (W-2):** https://support.gusto.com/article/106621964100000
**Spec source (1099):** https://support.gusto.com/article/213842491000000

**W-2 verified columns:**
| Column | Notes |
|--------|-------|
| `employee_email` | Verified — must match Gusto employee record |
| `regular_hours` | Emits 0 (see trade-off below) |
| `overtime_hours` | Empty |
| `double_overtime_hours` | Empty |
| `bonus` | Gross taxable + bonuses (see trade-off below) |
| `commission` | Empty |
| `reimbursement` | Non-taxable gross (per-diem) |
| `other_hours_code` | Empty |
| `other_hours_amount` | Empty |
| `paycheck_tip_amount` | Empty |
| `cash_tip_amount` | Empty |
| `personal_note` | Settlement reference |

**1099 verified columns:**
| Column | Notes |
|--------|-------|
| `contractor_email` | Verified — must match Gusto contractor record |
| `wage` | Gross taxable pay |
| `reimbursement` | Non-taxable gross |
| `bonus` | Bonus total |

**Trade-offs:**
- **regular_hours = 0 for W-2:** Trucking pay is flat/CPM/percentage-based, not hourly. Since Gusto's W-2 CSV is designed for hourly workers, gross taxable pay is mapped to the `bonus` column. Carriers using Gusto for hourly W-2 drivers may need to adjust this mapping.
- **Homogeneous lists only:** The API route splits W-2 and 1099 settlements into separate exporter calls. Each `build()` receives a homogeneous list. Mixed lists will be processed based on the first settlement's employment type.

**TODO before production rollout:** Import a sample CSV into Gusto sandbox and verify W-2 and contractor column headers match exactly.

---

## W-2 vs 1099 Split Rationale

Exports are split by `employmentTypeSnapshot`, NOT by the driver's current `employmentType`.

**Why this matters:** A driver may change from W-2 to 1099 (or vice versa) mid-year. The `employmentTypeSnapshot` is written at the moment the settlement is FINALIZED (via `DriverCompensationTemplate.employmentType` active at that time). This means:

- Historical settlements always export with the tax status they were earned under.
- Future employment type changes do not retroactively rewrite prior settlements.
- The export is always a faithful reflection of what was owed at finalization time.

The split happens in the API route handler (`/api/reports/payroll-export/route.ts`), not in the exporters themselves. Each exporter receives a pre-filtered list.

---

## How to Verify (Per Provider)

For each non-generic format:

1. Create a sandbox/trial account with the payroll provider.
2. Generate a sample export using the DriveCommand fixtures in `__tests__/exporters/__fixtures__/`.
3. Import the CSV into the sandbox environment.
4. Confirm all rows import without errors.
5. Fix any column name or format discrepancies found.
6. Replace `TODO:*` placeholders in the exporter with actual carrier values.
7. Update the "Sandbox Status" table above from "Not yet manually verified" to "Verified YYYY-MM-DD".
8. Add any unresolved provider-specific issues to this README.
