# DriveCommand — Driver Pay Module v4.0

**Build Specification for Claude Code in VS Code**

*Version 4.0 — May 2026*

---

## Section 0 — How To Use This Document

This file is the single source of truth for building the Driver Pay module.

**If you're a developer who has never worked in trucking:** read Section 1. After 8 minutes you'll understand the domain like an expert and know exactly what to build, why, and how to test it.

**If you're ready to build:** read Section 1, skim Sections 2–10 to understand structure, then jump to Section 12 (placing this file) and Section 14 (prompts).

**If you're a stakeholder:** read Section 1 and Section 13 (workflows).

---

## Section 1 — Quick Read for Non-Carrier Developers

> Goal: after reading this, you understand the carrier domain like an expert and you know exactly what to build, why, and how to test it.

### 1.1 What a carrier company actually does

A carrier is a trucking company. Its product is moving freight from point A to point B. A carrier has trucks, drivers, and customers (called shippers, brokers, or clients). The unit of work is a **load**: one freight job with a pickup, possibly several waypoints, and a delivery. Each load belongs to a contract that belongs to a client.

In our system the existing entity hierarchy already exists: `Client → Contract → Load → Stop`, plus `Driver` and `Truck` resources assigned to loads. We are adding the layer that figures out how much to pay each driver for each load, gives drivers a self-service portal modeled on Uber's driver app, and rolls everything into a weekly paycheck.

### 1.2 Why driver pay is harder than it looks

Six reasons why `pay = miles × rate` is wrong, and every one of them is a real-world dispute that loses carriers their drivers:

1. **There are six valid pay models.** Per-mile (CPM), hourly, percentage of revenue, flat per load, daily, and salary. A single carrier often runs all six because different drivers and routes need different structures.
2. **The same driver might be paid differently for a special load.** A driver who normally earns 0.58/mile gets +0.10 hazmat premium on a chemical load, or 1.5x on a holiday. The base contract is a template; per-load adjustments are overrides.
3. **Driving is only part of the work.** Drivers wait at warehouses (detention), get stuck overnight (layover), are dispatched then cancelled (TONU), strap and tarp flatbed cargo (tarp pay), pay the warehouse to unload (lumper, reimbursable), make extra deliveries (stop-off). Accessorials make up 10–25% of weekly pay.
4. **Carriers also deduct money from drivers.** Cash advances, escrow, fuel-card debt, child-support garnishments, equipment damage. Can take 25%+ of gross.
5. **Drivers do not get paid per load — they get paid per settlement.** A settlement is the weekly pay statement that aggregates many loads, plus standalone bonuses, minus deductions. The settlement is what the driver sees, disputes, and what payroll runs against.
6. **Audit trail is not optional.** Drivers will dispute. Auditors will check. State labor boards will check overtime. Every dollar must trace back to: a load, a stop, a template version, a calculation, a user who entered it, a user who approved it.

### 1.3 The architectural shape, in one paragraph

We have one **DriverCompensationTemplate** per driver per time period (their standard contract). When a driver is assigned to a load, we **snapshot** that template into a **LoadDriverAssignment** row — copy the values, not reference the template, so future template changes don't retroactively rewrite history. The dispatcher can override fields on the assignment for that one load (which requires a written reason). Every dollar of pay is a row in **LoadPayComponent** — base pay, each accessorial, each load-tied bonus, each load-level deduction. Off-load bonuses (sign-on, retention) and recurring deductions (advances, garnishments) live on the driver in **DriverBonus** and **DriverDeduction**. Once a week, an admin runs **settlement generation** which aggregates approved assignments + due bonuses + scheduled deductions into a **DriverSettlement** row plus a PDF the driver can read. Marking the settlement paid locks all underlying rows. Drivers see their pay in real time through a self-service portal modeled on Uber's driver app — daily/weekly earnings cards, per-load breakdown, dispute flow.

### 1.4 What you must absolutely get right

| Requirement | Why it matters | How you test it |
|---|---|---|
| Money uses `Decimal`, never `Number` or `float` | Floating-point on a $1,247.83 paycheck across 50 components produces wrong totals | Run a 50-row fixture, assert exact penny match |
| Snapshot semantics on assignment | If we FK the template, editing the template rewrites paid history | Create template, assign, edit template, verify assignment unchanged |
| Multi-tenant isolation by default | Without it Carrier A sees Carrier B's drivers | Section 7 covers RLS tests |
| Status transitions enforce prerequisites | Approving a CPM without `actual_miles` underpays | State machine test rejects every illegal transition |
| Settlements are atomic | Two simultaneous "generate" clicks must not double-count | Concurrent test with `Promise.all` |
| Once paid, components are immutable | Editing a paid row breaks audit and tax | PATCH a paid component, expect 409 |
| Mileage source is recorded | The #1 driver dispute is "PC*Miler vs Google miles" | Cannot leave DRAFT without `mileage_source` on a CPM assignment |
| Driver portal updates in real time | Drivers refresh the screen anxiously after each load | New load completion appears within 5 seconds in driver portal |

### 1.5 18-step end-to-end acceptance test

If a build passes all 18 in order, the module is production-ready.

1. Create tenant Carrier-A and Carrier-B with users; confirm a Carrier-B user fetching drivers returns zero Carrier-A drivers.
2. As Carrier-A admin, create driver Jane with a CPM template at $0.58/mile, $0.10 hazmat premium, $69/day per diem, federal OT.
3. As dispatcher, create load #L1 (412 mi, hazmat). Assign Jane. Verify auto-snapshot.
4. Override Jane's pay on L1 to add hazmat premium; confirm reason required.
5. Confirm L1 has BASE_PAY_MILEAGE and HAZMAT_PREMIUM components.
6. As driver, mark stop arrival/departure such that 4hr was spent at a 2hr free-time shipper. Auto-detention component appears.
7. Submit for review; validation blocks if `actual_miles` still null.
8. Confirm `actual_miles` from ELD; submit; allowed.
9. As manager, approve.
10. Repeat with two more loads (L2, L3). One has a $40 lumper reimbursement with receipt photo.
11. **As Jane via the driver portal: see all 3 loads listed under "This week" with running total. Tap one, see breakdown.**
12. As admin, run settlement generation for the past Mon–Sun. Verify Jane's draft settlement aggregates correctly.
13. Verify totals match a hand-calculated answer to the exact penny.
14. Finalize the settlement; verify PDF generated.
15. **As Jane via driver portal: see the new settlement card prominent, last week's total, "View statement" opens the PDF inline.**
16. Mark paid; verify all 3 assignments now PAID and immutable.
17. **As Jane via driver portal: tap on a load, see "Looks wrong?" button → submit dispute → confirmation shown → manager gets notification.**
18. Issue a $25 correction; verify it appears as `ADJUSTMENT_NEGATIVE` linked to the original component. Check Jane sees the adjustment in next week's portal.

### 1.6 Trucking glossary

| Term | Meaning |
|---|---|
| Carrier | The trucking company. Our customer (the tenant). |
| Driver | A person who drives a truck. Employee (W-2) or contractor (1099/owner-operator). |
| Owner-operator | Driver who owns the truck. Paid 1099, usually % or flat. |
| Load | One freight job: pickup → optional stops → delivery. |
| Stop | An event during a load: pickup, delivery, truck stop, mandated rest. Has timestamps. |
| CPM | Cents Per Mile. Standard pay unit. |
| Loaded miles | Miles with cargo (vs deadhead). Some contracts pay only loaded. |
| Accessorial | Pay for non-driving activity. |
| Detention | Pay for waiting beyond "free time" at a shipper. |
| Free time | Contracted unpaid waiting window before detention starts. Typically 2 hours. |
| Layover | Pay for forced overnight stay. |
| TONU | Truck Ordered Not Used — cancelled after dispatch. |
| Stop-off | Extra pay for additional delivery stops. |
| Lumper | Third-party warehouse labor, often reimbursed. |
| FSC | Fuel Surcharge — separately quoted, tied to diesel index. |
| Per Diem | IRS non-taxable daily expense allowance. $69/day domestic in 2026. |
| ELD | Electronic Logging Device — federally mandated, tracks hours and miles. |
| HOS | Hours of Service — federal driving-time regulations. |
| Settlement | The driver's weekly/biweekly pay statement document. |
| Escrow | Money withheld each settlement against future damage; refundable on separation. |
| Garnishment | Court-ordered withholding (child support, tax). Has legal caps. |

---

## Section 2 — What Changed From v3.0

| # | Change | Why |
|---|---|---|
| 1 | Driver Portal added (Section 9), modeled on Uber's driver app structure | Drivers need self-service. Phone calls to dispatch about pay are the carrier's #1 productivity drain. |
| 2 | UX patterns elevated to "world-class," not just "best practice" | Uber's earnings UX is the bar. Generic SaaS forms aren't. |
| 3 | Simplified VS Code instructions to one drag-and-drop step | Developer is not a VS Code expert. Removed everything optional. |
| 4 | Removed Node version checks; folded "framework audit and update" into Prompt 1 | Developer doesn't need to think about it; Claude Code handles it. |
| 5 | Removed the priming/preamble message | Just Prompt 1, that's it. Each prompt is self-sufficient. |
| 6 | Form/template/report patterns spec'd in detail (Section 8) | The previous spec hand-waved at "good UX." Now it's prescriptive. |

---

## Section 3 — Visual Diagrams

### 3.1 Multi-tenant entity relationship

```
                    ┌──────────────┐
                    │    Tenant    │  (one carrier company)
                    └──────┬───────┘
                           │ 1
              ┌────────────┴───────────────────────────────────┐
              ▼ *                                              ▼ *
        ┌──────────┐                                      ┌──────────┐
        │   User   │                                      │  Driver  │ ◄── linked to a User
        └──────────┘                                      └─────┬────┘     if driver has login
              │                                                 │ 1
              │ created_by / approved_by FKs                    ▼ *
              │                              ┌─────────────────────────────────┐
              │                              │ DriverCompensationTemplate      │
              │                              │ (versioned by effective dates)  │
              │                              └────────────────┬────────────────┘
              │                                               │
              │                                  snapshot copied ↓
              │                                               ▼
              │                              ┌─────────────────────────────────┐
              │                              │ LoadDriverAssignment            │ * ── 1   ┌──────┐
              │                              └────────────────┬────────────────┘ ────────►│ Load │
              │                                               │                            └──┬───┘
              │                                               ▼ *                              │ 1
              │                              ┌─────────────────────────────────┐               ▼ *
              │                              │ LoadPayComponent                │ * ─────► ┌──────┐
              │                              │ (every $ is a row, ± signed)    │          │ Stop │
              │                              └────────────────┬────────────────┘          └──────┘
              │                                               │ 1
              │                                               ▼ *
              │                              ┌─────────────────────────────────┐
              │                              │ PayComponentAttachment          │
              │                              └─────────────────────────────────┘
              │
              │ 1 ── *   DriverBonus        DriverDeduction      DriverSettlement     AuditLog
              ▼          (off-load)         (recurring)          (weekly statement)   (every change)
       all writes recorded
```

Every box other than `Tenant` itself carries a `tenant_id` FK. RLS enforces isolation at the database level.

### 3.2 Pay lifecycle state machine

```
   [Driver assigned to Load — auto-DRAFT]
                  │
                  │ add accessorials, confirm actual_miles + mileage_source
                  ▼
            ┌─────────┐  submit (validates prereqs)   ┌─────────────┐
            │  DRAFT  │ ─────────────────────────────►│ PENDING_    │
            └─────────┘                               │ REVIEW      │
                ▲                                     └──────┬──────┘
                │ reject                                     │
                │                                            │ approve
                │                                            ▼
            ┌─────────────┐                            ┌──────────┐
            │  DISPUTED   │ ◄───── dispute (any) ──── │ APPROVED │
            └─────────────┘                            └─────┬────┘
                                                             │
                                                             │ rolled into settlement;
                                                             │ settlement marked paid
                                                             ▼
                                                       ┌────────┐
                                                       │  PAID  │ ◄── immutable
                                                       └────┬───┘
                                                            │
                                                            │ correction
                                                            ▼
                                                       ┌──────────┐
                                                       │CORRECTED │
                                                       └──────────┘
```

### 3.3 Settlement aggregation

```
   Pay period: Mon 2026-05-04 → Sun 2026-05-10 / Driver Jane Doe / Tenant Carrier-A
   ─────────────────────────────────────────────────────────────────────────────────

   Approved assignments not yet settled:
     L1: 412 mi × $0.58 + 412 mi × $0.10 hazmat + 1.5 hr detention
     L2: 985 mi × $0.58 + 2 stop-off × $30
     L3: 720 mi × $0.58 + $40 lumper reimbursement (receipt)

   Standalone items in window:
     + Safety bonus (90-day milestone)         $100
     + Per-diem (3 nights away)                $207  (non-taxable)
     − Escrow deduction (recurring weekly)     $50
     − Advance repayment (installment 2 of 4)  $150

                              ▼

                  ┌─────────────────────────────────┐
                  │  DriverSettlement               │
                  │  Gross taxable        $1,398    │
                  │  Non-taxable          $247      │
                  │  Total deductions     $200      │
                  │  ─────────────────────────────  │
                  │  Net to driver        $1,445    │
                  │  Status: DRAFT                  │
                  └─────────────────────────────────┘
                              │ admin reviews + finalizes
                              ▼
                  PDF generated + Jane notified in Driver Portal
                              │ payroll runs externally
                              ▼
                  Mark Paid → all 3 assignments lock
                              ▼
                  Visible in Jane's Driver Portal as "Paid 2026-05-12"
```

### 3.4 Driver Portal screen tree (Uber-modeled)

```
┌─────────────────────────────────────────────────────────────────┐
│                     DRIVER PORTAL (Jane Doe)                    │
└─────────────────────────────────────────────────────────────────┘
       │
       ├── Home (Earnings Hub)
       │     │
       │     ├── This Week card (live total + progress bar to weekly goal)
       │     ├── Last paid settlement card (big net pay, "View statement" CTA)
       │     ├── Today's loads (live, with running totals)
       │     └── 4-week earnings trend (sparkline)
       │
       ├── Earnings (deep dive)
       │     ├── Weekly statements (list, tap to view PDF + per-load breakdown)
       │     ├── Trip-by-trip / load-by-load breakdown for current week
       │     └── Yearly summary (for taxes)
       │
       ├── Loads
       │     ├── Active loads (current dispatch)
       │     ├── Recent loads (last 30 days, with pay status badge per load)
       │     └── Load detail (every component with breakdown + dispute button)
       │
       ├── Pay
       │     ├── My compensation (current template, read-only)
       │     ├── Bonuses (history, pending milestones)
       │     ├── Deductions (active recurring + balance progress)
       │     └── Disputes (open + resolved, with status)
       │
       └── Profile
             ├── Personal info
             ├── Tax info (W-9, W-4, 1099/W-2 forms)
             ├── Direct deposit / payout method
             └── Help / Support
```

### 3.5 Override decision flow on assignment

```
       Dispatcher assigns driver to load
                    │
                    ▼
       Look up driver's active template
                    │
                    ▼
       Snapshot template fields → assignment row
                    │
                    ▼
       Special load? (hazmat / holiday / split / rate exception)
                    │
            ┌───────┴───────┐
            │ NO            │ YES
            ▼               ▼
   "Inheriting standard    Edit fields → reason field
    pay" green banner       becomes required → save
            │               │
            └───────┬───────┘
                    ▼
       BASE_PAY component auto-created when status leaves DRAFT
```

---

## Section 4 — Existing Data Model Context

| Entity | Notes |
|---|---|
| `Tenant` | The carrier company. Root of all data isolation. |
| `User` | A person who logs in (admin, manager, dispatcher, driver, viewer). Belongs to one tenant. |
| `Client` | Broker, shipper, or direct customer. |
| `Contract` | Agreement with a client. |
| `Load` | A freight job. |
| `Stop` | Pickup, delivery, truck stop, rest. |
| `Driver` | A driver resource. May be linked to a User if driver has login. |
| `Truck` | Vehicle. |

**Required additions to existing tables (Phase 1 prompt handles this):**

- `Stop`: add `arrived_at TIMESTAMPTZ NULL`, `departed_at TIMESTAMPTZ NULL`, `free_time_minutes INT DEFAULT 120`, `work_state VARCHAR(2) NULL`.
- `Contract`: add `default_free_time_minutes INT NULL`.
- `Load`: add `total_miles DECIMAL(10,2) NULL`, `loaded_miles DECIMAL(10,2) NULL`, `mileage_source ENUM NULL`.

If these tables don't already exist exactly as shown, the developer adapts — the spec says *what* to add, not the literal SQL.

---

## Section 5 — Schema Design

Every tenant-scoped table includes (don't repeat in tables below):

```
tenant_id    UUID NOT NULL  REFERENCES tenants(id)
created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
created_by   UUID NOT NULL  REFERENCES users(id)
deleted_at   TIMESTAMPTZ NULL  -- soft delete
```

All tenant-scoped tables have RLS enabled per Section 7.

### 5.1 `driver_compensation_templates`

| Field | Type | Null | Notes |
|---|---|---|---|
| id | UUID PK | No | |
| driver_id | UUID FK | No | |
| employment_type | ENUM | No | W2_EMPLOYEE \| OWNER_OPERATOR_1099 \| LEASE_OPERATOR |
| pay_type | ENUM | No | CPM \| HOURLY \| FLAT_PER_LOAD \| PERCENTAGE \| DAILY \| SALARY |
| base_rate | DECIMAL(10,4) | No | |
| rate_unit | ENUM | No | PER_MILE \| PER_HOUR \| PER_LOAD \| PERCENTAGE \| PER_DAY \| ANNUAL |
| loaded_miles_only | BOOLEAN | No | CPM only |
| fuel_surcharge_rate | DECIMAL(10,4) | Yes | Separate FSC per mile |
| per_diem_enabled | BOOLEAN | No | |
| per_diem_rate | DECIMAL(8,2) | Yes | |
| overtime_eligible | BOOLEAN | No | |
| overtime_threshold_hours | DECIMAL(5,2) | Yes | Default 40 federal |
| overtime_multiplier | DECIMAL(4,2) | Yes | 1.5 standard |
| daily_overtime_threshold | DECIMAL(4,2) | Yes | CA/CO/NV state rules |
| weekly_earning_goal | DECIMAL(10,2) | Yes | For driver portal progress bar |
| currency | VARCHAR(3) | No | USD |
| effective_from | DATE | No | |
| effective_to | DATE | Yes | NULL = active |
| notes | TEXT | Yes | |

**Constraints:** EXCLUDE on overlapping date ranges per `driver_id`; CHECK `base_rate >= 0`; CHECK `effective_to IS NULL OR effective_to > effective_from`.

### 5.2 `load_driver_assignments`

| Field | Type | Null | Notes |
|---|---|---|---|
| id | UUID PK | No | |
| load_id | UUID FK | No | |
| driver_id | UUID FK | No | |
| driver_role | ENUM | No | MAIN_DRIVER \| CO_DRIVER |
| template_id | UUID FK | Yes | Source of snapshot |
| pay_type | ENUM | No | Snapshot, overrideable |
| base_rate | DECIMAL(10,4) | No | Snapshot, overrideable |
| rate_unit | ENUM | No | |
| loaded_miles_only | BOOLEAN | No | |
| fuel_surcharge_rate | DECIMAL(10,4) | Yes | |
| split_percentage | DECIMAL(5,2) | Yes | |
| per_diem_enabled | BOOLEAN | No | |
| per_diem_rate | DECIMAL(8,2) | Yes | |
| override_reason | TEXT | Yes | Required when snapshot differs from template |
| estimated_miles | DECIMAL(10,2) | Yes | |
| actual_miles | DECIMAL(10,2) | Yes | |
| mileage_source | ENUM | Yes | PCMILER \| GOOGLE \| ELD \| MANUAL \| RAND_MCNALLY |
| mileage_source_reference | VARCHAR(255) | Yes | |
| estimated_hours | DECIMAL(8,2) | Yes | |
| actual_hours | DECIMAL(8,2) | Yes | |
| load_revenue | DECIMAL(12,2) | Yes | Required for PERCENTAGE |
| pay_status | ENUM | No | DRAFT \| PENDING_REVIEW \| APPROVED \| PAID \| DISPUTED \| CORRECTED |
| settlement_id | UUID FK | Yes | |
| approved_by | UUID FK | Yes | |
| approved_at | TIMESTAMPTZ | Yes | |
| paid_at | TIMESTAMPTZ | Yes | |
| currency | VARCHAR(3) | No | |

`UNIQUE (load_id, driver_id)`; partial unique on `(load_id) WHERE driver_role = 'MAIN_DRIVER'`.

### 5.3 `load_pay_components`

| Field | Type | Null | Notes |
|---|---|---|---|
| id | UUID PK | No | |
| assignment_id | UUID FK | No | |
| load_id | UUID FK | No | Denormalized |
| driver_id | UUID FK | No | Denormalized |
| stop_id | UUID FK | Yes | Stop-tied items |
| component_type | ENUM | No | Full list below |
| category | ENUM | No | EARNING \| BONUS \| ACCESSORIAL \| ALLOWANCE \| REIMBURSEMENT \| DEDUCTION \| ADJUSTMENT |
| description | VARCHAR(255) | No | |
| quantity | DECIMAL(10,4) | No | |
| unit | ENUM | No | MILES \| HOURS \| STOPS \| DAYS \| FLAT \| PERCENTAGE |
| rate | DECIMAL(10,4) | No | |
| multiplier | DECIMAL(5,2) | No | Default 1.0 |
| gross_amount | DECIMAL(12,2) | No | Computed; negative for deductions |
| is_taxable | BOOLEAN | No | |
| is_reimbursement | BOOLEAN | No | |
| original_component_id | UUID FK | Yes | Self-ref for corrections |
| visible_to_driver | BOOLEAN | No | Default true; some adjustments may be hidden |
| notes | TEXT | Yes | |
| entered_by | UUID FK | No | |

**Component types:** BASE_PAY_MILEAGE, BASE_PAY_HOURLY, BASE_PAY_FLAT, BASE_PAY_PERCENTAGE, BASE_PAY_DAILY, FUEL_SURCHARGE, OVERTIME, HAZMAT_PREMIUM, HOLIDAY_PREMIUM, LOAD_COMPLETION_BONUS, FUEL_EFFICIENCY_BONUS, DETENTION, LAYOVER, TONU, STOP_OFF, TARP, BREAKDOWN, PER_DIEM, LUMPER_REIMBURSEMENT, SCALE_REIMBURSEMENT, FUEL_REIMBURSEMENT, ADVANCE_REPAYMENT, ESCROW_CONTRIBUTION, FUEL_CARD_DEBT, CARGO_CLAIM, EQUIPMENT_DAMAGE, GARNISHMENT, CHILD_SUPPORT, ADJUSTMENT_POSITIVE, ADJUSTMENT_NEGATIVE.

**Constraints:** CHECK `category != 'DEDUCTION' OR gross_amount <= 0`; CHECK `category IN ('DEDUCTION','ADJUSTMENT') OR gross_amount >= 0`.

### 5.4 `driver_bonuses`

Off-load bonuses (sign-on, retention, safety, referral). Standard tenant columns plus:

| Field | Type | Null | Notes |
|---|---|---|---|
| id | UUID PK | No | |
| driver_id | UUID FK | No | |
| bonus_type | ENUM | No | SIGN_ON \| RETENTION \| SAFETY \| FUEL_EFFICIENCY \| REFERRAL \| PERFORMANCE \| OTHER |
| amount | DECIMAL(12,2) | No | |
| description | VARCHAR(255) | No | |
| trigger_date | DATE | No | |
| scheduled_pay_date | DATE | Yes | |
| paid_at | TIMESTAMPTZ | Yes | |
| installment_number | INT | Yes | |
| total_installments | INT | Yes | |
| parent_bonus_id | UUID FK | Yes | Self-ref |
| referred_driver_id | UUID FK | Yes | REFERRAL only |
| settlement_id | UUID FK | Yes | |
| is_taxable | BOOLEAN | No | |
| visible_to_driver | BOOLEAN | No | Default true |
| notes | TEXT | Yes | |

### 5.5 `driver_deductions`

| Field | Type | Null | Notes |
|---|---|---|---|
| id | UUID PK | No | |
| driver_id | UUID FK | No | |
| deduction_type | ENUM | No | ADVANCE \| ESCROW \| GARNISHMENT \| CHILD_SUPPORT \| EQUIPMENT_LEASE \| INSURANCE \| OTHER |
| schedule | ENUM | No | ONE_TIME \| EVERY_SETTLEMENT \| FIXED_INSTALLMENTS |
| amount_per_period | DECIMAL(12,2) | No | |
| total_amount | DECIMAL(12,2) | Yes | |
| amount_collected | DECIMAL(12,2) | No | Default 0 |
| max_percentage_of_net | DECIMAL(5,2) | Yes | |
| starts_on | DATE | No | |
| ends_on | DATE | Yes | |
| paused | BOOLEAN | No | Default false |
| visible_to_driver | BOOLEAN | No | Default true |
| notes | TEXT | Yes | |

### 5.6 `driver_settlements`

| Field | Type | Null | Notes |
|---|---|---|---|
| id | UUID PK | No | |
| driver_id | UUID FK | No | |
| period_start | DATE | No | |
| period_end | DATE | No | |
| status | ENUM | No | DRAFT \| FINALIZED \| PAID \| VOIDED |
| gross_taxable | DECIMAL(12,2) | No | |
| gross_non_taxable | DECIMAL(12,2) | No | |
| total_deductions | DECIMAL(12,2) | No | |
| net_pay | DECIMAL(12,2) | No | |
| finalized_by | UUID FK | Yes | |
| finalized_at | TIMESTAMPTZ | Yes | |
| paid_at | TIMESTAMPTZ | Yes | |
| settlement_reference | VARCHAR(100) | Yes | |
| pdf_url | VARCHAR(500) | Yes | |
| notes | TEXT | Yes | |

`UNIQUE (driver_id, period_start, period_end)`.

### 5.7 `pay_component_attachments`

Standard receipts/photos table per v3.0.

### 5.8 `driver_disputes` (NEW for portal)

| Field | Type | Null | Notes |
|---|---|---|---|
| id | UUID PK | No | |
| driver_id | UUID FK | No | |
| target_type | ENUM | No | LOAD_PAY \| SETTLEMENT \| COMPONENT |
| target_id | UUID | No | |
| issue_category | ENUM | No | WRONG_AMOUNT \| MISSING_PAY \| WRONG_MILES \| MISSING_RECEIPT \| OTHER |
| driver_message | TEXT | No | |
| status | ENUM | No | OPEN \| IN_REVIEW \| RESOLVED_PAID \| RESOLVED_NO_CHANGE \| CLOSED |
| assigned_to | UUID FK | Yes | Manager handling it |
| resolution_message | TEXT | Yes | What manager replied |
| resolved_at | TIMESTAMPTZ | Yes | |
| linked_correction_id | UUID FK | Yes | If resolution created an ADJUSTMENT |

### 5.9 `audit_logs`

Per v3.0 — every status transition and money mutation.

---

## Section 6 — Permissions Matrix

| Action | ADMIN | MANAGER | DISPATCHER | DRIVER | VIEWER |
|---|---|---|---|---|---|
| Create/edit driver compensation template | Y | Y | — | — | — |
| View any driver's template | Y | Y | Y | self | Y |
| Assign driver to load | Y | Y | Y | — | — |
| Override pay on assignment | Y | Y | Y | — | — |
| Add accessorial component | Y | Y | Y | self only | — |
| Add deduction component | Y | Y | — | — | — |
| Upload receipt | Y | Y | Y | self | — |
| Submit assignment for review | Y | Y | Y | — | — |
| Approve assignment | Y | Y | — | — | — |
| Issue correction (post-paid) | Y | Y | — | — | — |
| Generate settlements | Y | Y | — | — | — |
| Finalize settlement | Y | — | — | — | — |
| Mark settlement paid | Y | — | — | — | — |
| View settlement | Y | Y | Y | self | Y |
| Driver Portal access | — | — | — | Y | — |
| Submit dispute | — | — | — | self | — |
| Resolve dispute | Y | Y | — | — | — |
| Export payroll | Y | — | — | — | — |
| View audit logs | Y | Y | — | — | — |

---

## Section 7 — Multi-Tenant Security (Three Layers)

### 7.1 Layer 1 — Application middleware

Every Prisma query is wrapped in middleware that injects `where: { tenantId: ctx.tenantId }`. The middleware also auto-injects `tenantId` on creates. Source of truth: verified JWT only, never request body or query param.

### 7.2 Layer 2 — Postgres Row-Level Security

Each tenant-scoped table:

```sql
ALTER TABLE driver_compensation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_compensation_templates FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON driver_compensation_templates
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

App connects with non-superuser `app_user` role. `SET LOCAL app.current_tenant_id = '...'` at the start of every request transaction.

### 7.3 Layer 3 — RBAC (Section 6 matrix)

Enforced in route handlers via permission middleware. Independent of and additive to RLS.

### 7.4 Other security

- All money mutations and status transitions write to `audit_logs`.
- Receipt object keys: `{tenant_id}/components/{component_id}/{filename}`.
- Presigned URLs: 15-minute max expiry, scoped to one component.
- Soft-delete only on financial rows.
- API rate limit: 100 writes/min per user, 1000 reads/min per user.
- Driver Portal API uses driver-scoped JWT — drivers cannot access other drivers' data even within the same tenant.
- Tenant-isolation tests required on every PR touching a tenant-scoped table.

---

## Section 8 — UX Specification

This section is the design contract. The dispatchers, admins, and drivers using this software are not technical. The interface decides whether they actually use the system or fall back to spreadsheets.

### 8.1 Design principles

1. **Show the answer first, the math underneath.** Big number at the top, breakdown below.
2. **Default to the obvious next action.** Every screen has a single primary button.
3. **Prevent errors. When you can't, explain what to do, not what went wrong.**
4. **No raw data dumps.** Every number has a label, a unit, and where useful, a comparison.
5. **Keyboard-first on desktop. Touch-first on mobile.**
6. **Money is never a mystery.** Every amount has a tooltip or expansion showing where it came from.
7. **Real-time updates.** Drivers refresh anxiously. Make refresh unnecessary.
8. **Accessibility is a baseline.** WCAG 2.1 AA.

### 8.2 Color tokens

| Token | Use | Light hex | Dark hex |
|---|---|---|---|
| `--color-primary` | Primary buttons, active nav, links | `#2563eb` | `#3b82f6` |
| `--color-success` | "Inheriting standard pay" banner; saved state; positive amounts on driver portal | `#16a34a` | `#22c55e` |
| `--color-warning` | "Overridden" banner; soft warnings | `#d97706` | `#f59e0b` |
| `--color-danger` | Validation errors; failed save; deductions in totals | `#dc2626` | `#ef4444` |
| `--color-info` | Tooltips; informational chips | `#0891b2` | `#06b6d4` |
| `--color-muted` | Disabled, secondary text, dividers | `#64748b` | `#94a3b8` |

**Rule:** never red for non-error. Never green for warnings (even favorable values). Drivers panic at red on a pay screen.

### 8.3 Form patterns (template, accessorial entry, settings)

**Layout:**
- One column on mobile, two columns on desktop for short forms, single column for forms >5 fields.
- Group related fields under a small section heading.
- Section dividers are space, not lines.

**Labels:**
- Above inputs always. Never floating. Never placeholder-only.
- Required marked with `*` after the label.
- Helper text below the input in muted color when needed.

**Inputs:**
- Width matches expected content (state code 4ch wide, license number 16ch wide, money 12ch).
- Currency: static `$` prefix, right-aligned digits, auto-format `1234.5` → `$1,234.50` on blur.
- Mileage/hours: unit suffix (`mi`, `hr`) outside the input.
- Date: native picker, smart defaults (today, last Monday, etc.).
- Number-only inputs use `inputmode="decimal"` on mobile for the right keypad.

**Smart defaults — required behavior:**
- Picking pay_type=CPM auto-fills rate_unit=PER_MILE (editable).
- Picking pay_type=HOURLY auto-fills rate_unit=PER_HOUR.
- Adding detention auto-fills rate from driver's standard detention rate (configurable).
- Effective_from defaults to today.
- Period_end defaults to last completed Sunday.

**Validation:**
- On blur, not on every keystroke (except "no negative" rule which is instant).
- Errors inline below the field, not in a banner.
- Format: `[icon] [problem]. [Specific fix].` Example:
  > Base rate must be greater than zero. Try $0.45/mile or higher.
- Success: small green checkmark inside input. Not a green border.

**Save state:**
- Button shows inline spinner + "Saving…" label.
- Whole form is not disabled, only the button.
- On save: button shows green checkmark + "Saved" for 2s, then resets.
- Toast for cross-page confirmations (e.g., "Template saved. Active for new loads.").

### 8.4 Template creation — the "set it and forget it" pattern

Setting up a driver's compensation template is the most error-prone task because it has many fields and most are conditional. Required UX:

1. **Wizard, not a wall of fields.** Three steps:
   - Step 1: Pay model (CPM / Hourly / Flat / etc.) — single choice with descriptive cards explaining each.
   - Step 2: Rate and unit (smart-defaulted from step 1).
   - Step 3: Add-ons (overtime, per diem, fuel surcharge) as toggles, each opening detail fields when on.

2. **Live preview panel.** As the user fills in fields, a sidebar shows:
   > "On a typical 412-mile load, this driver earns: $238.96 (412 × $0.58) + per diem if applicable. With OT after 40 hours."

3. **Templates from existing drivers.** "Copy from another driver" button — pick a driver, all their template values pre-fill, user adjusts.

4. **Library of common configurations.** Pre-built starter templates: "Standard OTR CPM," "Local Hourly," "Hotshot Flat," "1099 Owner-Operator Percentage." User picks one, fields pre-fill, then customize.

5. **Confirmation before save.** Show a clean summary card:
   > "You're setting Jane Doe's pay to $0.58/mile, with $0.10 hazmat premium and $69/day per diem, effective May 7. The previous template will end May 6. Save?"

### 8.5 Error message catalog

**Pattern A — Validation:**
> Base rate must be greater than zero. Try $0.45/mile or higher.

**Pattern B — Pre-condition:**
> Cannot approve this load because actual miles haven't been recorded yet. Confirm them in the load summary, then return here.

**Pattern C — Permission:**
> You don't have permission to mark settlements as paid. Ask an admin to do this for you.

**Pattern D — System error:**
> Something went wrong while saving the receipt. Try again in a moment. If this keeps happening, contact support.

**Pattern E — Confirmation (destructive):**
> Mark this settlement as paid? This locks all 3 loads inside it from any further edits. You can still issue corrections after, but the original numbers can't be changed.

### 8.6 Empty states (every list has one)

| Screen | Empty state |
|---|---|
| Driver Compensation Tab | "No compensation template yet. Set one up to start paying [Name] for loads." + primary "Set up compensation" |
| Pending Pay Queue | "All caught up. No pay items waiting for review." + checkmark icon |
| Driver Settlements | "No settlements yet. They'll show here once approved loads are settled." |
| Pay Components | "No pay components yet. Base pay will appear automatically when you submit this for review." |
| Receipts | "No receipts uploaded. Drag a photo or PDF here, or click to browse." (drag zone) |
| Driver Portal — This week | "Quiet week so far. Your next completed load will show up here." |
| Driver Portal — Disputes | "No open disputes. Found something wrong on a load? Tap any load to report it." |

### 8.7 Loading and saving

- Initial page load: skeleton placeholders matching final layout, never a centered spinner.
- Saving: button shows inline spinner + "Saving…"; whole form not disabled.
- Saved: green checkmark + "Saved" for 2s.
- Background refresh: subtle indicator at top, never interrupts the user.
- Driver Portal "this week" total updates live (poll or websocket) — visible cue when it changes.

### 8.8 Reports — pattern catalog

Reports are read by managers and finance, not analysts. Required patterns:

1. **Big number first.** The report's main answer is an oversized number at the top with a subtitle ("Total driver pay this week" / "$48,372.16 across 23 drivers").
2. **Comparison built in.** Every big number has a delta vs previous period with a colored arrow (success/danger).
3. **Sparklines beat charts.** A 6-week sparkline beside the big number tells the story faster than a full chart.
4. **Tables are sorted, filtered, paginated by default.** Sort by most-likely-relevant column (date desc, amount desc).
5. **Export is a secondary action.** Don't make it the most prominent button.
6. **Drill-down everywhere.** Click any number in any table to see the rows behind it.

### 8.9 Critical UX flows (user stories)

**Flow A — Dispatcher assigns driver to normal load (80% case):**
> Tom clicks Load #4471 → "Assign Driver" → searches "Jane" → clicks her → sees green banner: "Inheriting Jane's standard pay: $0.58/mile, 412 estimated miles ≈ $239." Clicks Assign. Total: 8 seconds, no fields edited, no reason required.

**Flow B — Override for hazmat (15% case):**
> Same flow, but the load is hazmat. Tom sees the inheriting banner plus an info chip: "This load is hazmat. Jane's hazmat premium is +$0.10/mile." Clicks "Apply hazmat premium." Reason field appears, pre-filled "Hazmat load #4471." Confirms. Banner switches to amber "Overridden — Hazmat load #4471."

**Flow C — Manager approves on Friday (queue clearing):**
> Lisa opens Pending Pay. 23 items, oldest first. Clicks the top one. Right pane shows full breakdown. Keyboard: A approves and advances, D disputes, ↑/↓ navigates. Clears 23 items in 4 minutes.

**Flow D — Driver checks earnings on mobile (Uber-pattern):**
> Mike opens DriveCommand mobile app. Home screen shows a big card: "$1,247.50 — This week." Below: progress bar to weekly goal. Below: 3 load cards from this week with running totals. He taps load #4471 → sees per-component breakdown → notices detention is short → taps "Looks wrong?" → form: "What's the issue?" → picks Wrong Amount → types message → submits → confirmation: "Sent to your dispatcher. Reply within 24 hours."

**Flow E — Friday settlement run:**
> Lisa clicks Generate Settlements. Modal: "Period: Mon May 4 → Sun May 10. Drivers: 47." Clicks Generate. ~15s progress bar. Results: 47 draft settlements. Anomaly cards (drivers with >25% deviation from their 4-week average) flagged amber. Reviews flagged ones, finalizes all. PDFs generated and pushed to driver portals.

### 8.10 Accessibility (WCAG 2.1 AA minimum)

- All text contrast ≥ 4.5:1.
- Focus rings on every interactive element.
- Tab order matches visual order.
- All inputs have `<label for>`.
- Status messages use `aria-live="polite"`.
- Touch targets ≥ 44×44px.
- No information by color alone (icons + text + color together).

---

## Section 9 — Driver Portal (Modeled on Uber)

The driver portal is a dedicated sub-app accessible from web (`drive.drivecommand.com`) and embedded into the React Native mobile app. Its job is to make pay transparent, instant, and disputable.

### 9.1 What we're copying from Uber's driver app

Uber's driver app structure has won because it organizes everything around two questions a driver asks: *"How much have I made?"* and *"What's wrong with this number?"* We mirror that structure:

1. **Earnings Hub at the center.** Earnings is the home tab — not a buried sub-page.
2. **Live "this week" running total** with progress bar to goal, replacing per-trip messages with running totals.
3. **Per-load breakdown** clickable from the weekly view, showing every component.
4. **Weekly statement download** as PDF, plus inline transaction history.
5. **Dispute flow built into every load and statement** — never a generic support form.
6. **Tax forms accessible and labeled** ("1099-NEC for 2025"), not buried in settings.
7. **Direct deposit / payout method** editable inline.

### 9.2 Screen-by-screen

#### 9.2.1 Home (Earnings Hub)

Hierarchy of cards, top to bottom:

1. **Hero card — This Week**
   - Big net total (e.g., `$1,247.50`).
   - Subtitle: "Mon May 4 – Sun May 10 · 4 loads · 1,847 mi."
   - Progress bar to `weekly_earning_goal` from template (if set). "78% of your $1,600 goal."
   - Live updates as new components are added.
   - Sparkline of last 6 weeks of net pay.

2. **Last paid statement card**
   - "$1,398.00 paid Apr 28 for Apr 21–27."
   - Primary button: "View statement" → opens PDF inline + per-load breakdown drawer.

3. **Today / Active loads card**
   - List of current and today-completed loads with running pay total.
   - Tap → load detail.

4. **Pending pay card** (if any)
   - "$340 pending review by your manager. Usually approved within 1 business day."
   - Tap → list of pending assignments.

5. **Open disputes card** (if any)
   - "1 open dispute since May 3 — Awaiting reply."
   - Tap → dispute thread.

#### 9.2.2 Earnings (deep dive)

- **Tabs:** This Week | Statements | Yearly Summary | Trip-by-Trip
- **Statements:** list of all settlements (newest first), each with status badge (DRAFT / FINALIZED / PAID), dates, net amount. Tap → settlement detail with loads, components, deductions, PDF download.
- **Trip-by-Trip:** every load in the current week as a card. Each card: load number, pickup/delivery cities, miles, base + accessorial summary, total pay, status badge.
- **Yearly Summary:** for taxes. "2025 gross taxable: $62,400. Per diem: $7,200. Reimbursements: $1,840." Plus a "Download tax forms" link to W-2 / 1099 PDFs.

#### 9.2.3 Loads

- **Tabs:** Active | Recent | All
- **Active:** loads where the driver is dispatched but not yet delivered.
- **Recent:** last 30 days. Each card: pickup/delivery, dates, total pay, pay status (DRAFT / PENDING / APPROVED / PAID).
- **Load detail screen:**
  - Hero: load number, pickup → delivery, dates, total pay.
  - Components section: every BASE_PAY, accessorial, bonus on this load with description and amount.
  - Deductions specific to this load (if any).
  - Stops timeline with arrived_at / departed_at.
  - "Looks wrong?" button at the bottom (always visible).

#### 9.2.4 Pay (settings/info)

- **My Compensation:** read-only summary of active template (pay model, rate, OT rules, per diem). "Questions? Contact your manager."
- **Bonuses:** all earned bonuses, paid + pending. Future scheduled installments visible too. "Your 6-month retention bonus of $500 is scheduled for July 14."
- **Deductions:** active recurring deductions with progress bars for installment plans. "Advance repayment: $300 of $800 collected."
- **Disputes:** all submitted disputes with status. Threaded conversation with manager.

#### 9.2.5 Profile

- Personal info, tax info (W-9/W-4), payout method (direct deposit), help/support.

### 9.3 Dispute flow (the most important interaction)

The dispute flow is the difference between a driver staying and a driver leaving for another carrier. It must be:

1. **Discoverable from any pay-related screen.** Every load detail, every component, every settlement has a "Looks wrong?" button.

2. **Three taps maximum from anywhere.** Home → load → "Looks wrong?" → category picker → message → submit.

3. **Category picker uses driver language:**
   - "Wrong amount"
   - "Missing pay (something I expected isn't here)"
   - "Wrong miles"
   - "Missing or wrong receipt"
   - "Other"

4. **Message field with smart prompt.** "Tell us what's wrong. Include any details you have — photos, screenshots, gate timestamps, etc."

5. **Photo attachment** from camera or library.

6. **Confirmation with ETA.** "Sent to dispatch. Most disputes get a reply within 24 hours. We'll notify you here."

7. **Status visible.** Open → In Review → Resolved (paid / no change / closed).

8. **Manager-side workflow** is invisible to the driver. They just see status + reply.

### 9.4 Driver portal implementation notes

- Driver-scoped JWT: token contains `driverId` and `tenantId`; API filters everything by `driverId` automatically — drivers cannot fetch other drivers' data within the same tenant.
- Web portal at `drive.drivecommand.com` (subdomain) shares auth with the carrier app but has a separate UI codebase or feature flag.
- Mobile uses the same Expo React Native app; portal is the default route when logged in as a driver role.
- All money on driver portal is shown to the cent. Never round.
- Real-time updates: poll every 30 seconds when the user is active on the home screen; longer interval otherwise. Use server-sent events if the project already uses them.
- Offline mode: cached last-fetched data; "Last updated 2 minutes ago" indicator at top; sync on reconnect.

### 9.5 What NOT to copy from Uber

- Uber's "Quests" and surge gamification — not appropriate for trucking.
- Uber's hyper-aggressive promotional notifications — drivers want clarity, not nudges.
- Uber's instant-pay teaser fees — keep payouts straightforward; no upsell into the pay UX.

---

## Section 10 — Business Logic

### 10.1 Pay formulas

| Pay Type | Formula |
|---|---|
| CPM | `actual_miles × base_rate × multiplier` (use loaded_miles if loaded_miles_only) |
| Fuel Surcharge | `actual_miles × fuel_surcharge_rate` |
| Hourly | `actual_hours × base_rate × multiplier` |
| Flat | `base_rate × multiplier` |
| % Revenue | `load_revenue × base_rate (decimal)` |
| Daily | `days_on_load × base_rate` |
| Split | `total_load_pay × split_percentage / 100` |
| Detention | `MAX(0, departed - arrived - free_time/60) × detention_rate` |
| Layover | `layover_days × layover_rate` |
| Federal OT | `MAX(0, weekly_hours - 40) × base_rate × OT_mult` |
| State Daily OT | `MAX(0, daily_hours - daily_threshold) × base_rate × OT_mult` |

### 10.2 Validation rules

- Assignment cannot leave DRAFT without at least one BASE_PAY_* component.
- If any snapshot field on assignment differs from template, `override_reason` is required.
- CPM cannot reach APPROVED without `actual_miles` AND `mileage_source`.
- PERCENTAGE cannot reach APPROVED without `load_revenue`.
- `gross_amount` always recomputed server-side on save.
- DEDUCTION components stored as negative.
- One MAIN_DRIVER per load (DB constraint).
- PER_DIEM and reimbursements have `is_taxable = false`.
- Reimbursements warn (not block) if no attachment.

### 10.3 Audit and immutability

- Once `pay_status = PAID`, components are immutable.
- Corrections create new ADJUSTMENT components with `original_component_id`.
- Template changes never retroactively modify existing assignments.
- Money: DECIMAL only. Timestamps: TIMESTAMPTZ only.
- Every status transition writes to `audit_logs`.

### 10.4 Settlement generation algorithm

```
function generateSettlement(driverId, periodStart, periodEnd, tenantId):
  Inside a serializable transaction:
  1. Lock approved-and-unsettled assignments for this driver/window (FOR UPDATE).
  2. Sum LoadPayComponents by category for those assignments.
  3. Find DriverBonuses where paid_at IS NULL, scheduled_pay_date <= periodEnd.
  4. Compute scheduled DriverDeductions:
     - schedule = EVERY_SETTLEMENT: include amount_per_period
     - schedule = FIXED_INSTALLMENTS: include if amount_collected < total_amount
     - Apply max_percentage_of_net cap; carry overage to next period.
  5. Totals:
     gross_taxable     = SUM(taxable EARNING+BONUS+ALLOWANCE_taxable+ADJUSTMENT_POS)
     gross_non_taxable = SUM(non-taxable PER_DIEM + REIMBURSEMENT)
     total_deductions  = ABS(SUM(DEDUCTION + ADJUSTMENT_NEG)) + scheduled deductions
     net_pay           = gross_taxable + gross_non_taxable - total_deductions
  6. Insert DriverSettlement (status=DRAFT).
  7. Update settlement_id on touched assignments + bonuses.
  8. Bump amount_collected on touched DriverDeductions.
  9. Write audit_logs entries.
  Commit transaction.
```

---

## Section 11 — Stack Context (Verified May 2026)

These are the targets. **Prompt 1 instructs Claude Code to audit the project's `package.json` and upgrade anything outdated.**

| Component | Target version | Notes |
|---|---|---|
| Next.js | 16.2 (latest stable) | App Router. Turbopack default. |
| React | 19.2 | Compiler stable; useEffectEvent, View Transitions. |
| TypeScript | 5.x strict | |
| Prisma | 7 (latest stable) | TypeScript-rewritten client. |
| PostgreSQL | 16+ | RLS, EXCLUDE constraints, partial unique indexes. |
| Expo SDK | 55 (current stable) | RN 0.83, React 19.2. New Architecture only. |
| React Native | 0.83 | |
| Auth | Existing (migrating to Supabase Auth) | |
| Storage | AWS S3 (migrating to Supabase Storage) | Tenant-scoped object keys. |
| Hosting | Vercel (web), EAS Build (mobile) | |
| Money library | `decimal.js` | Never `Number` for currency. |
| Validation | Zod | Shared client + server. |
| PDF | `@react-pdf/renderer` | Server-side. |
| Charts | Recharts (or whatever exists) | Don't introduce new lib. |

---

## Section 12 — How To Place This File (VS Code)

**One step:** drag this `.md` file from your downloads / desktop into the VS Code Explorer panel and drop it on the **top-most folder** (the one whose name matches your project, e.g. "DriveCommand"). That's it.

If you're not sure which folder is the top-most: it's the folder at the very top of the Explorer panel on the left side of VS Code. Drop the file there.

After dropping, you should see `DriverPay_TechnicalSpec_v4.md` in the list. Open it (single-click) to verify.

If you'd rather use the menu: `File → Save As → [your project folder] → name it the same`.

---

## Section 13 — Business Workflows

### Workflow A — Onboarding a new driver
Admin creates the Driver record, opens the Compensation tab, fills the template wizard, saves. Optional: sets up recurring deductions.

### Workflow B — Daily dispatch (80% case)
Dispatcher creates Load, clicks Assign Driver, picks driver, sees green "Inheriting standard pay" banner, confirms. Done in seconds.

### Workflow C — Override for special load (15% case)
Same as B but for hazmat/holiday/rush — dispatcher edits a field, reason becomes required, save shows amber "Overridden" banner.

### Workflow D — Mid-load accessorial entry
Dispatcher (or driver from mobile) adds DETENTION because driver waited 4hr at a 2hr-free shipper. Or adds LUMPER_REIMBURSEMENT with a receipt photo from mobile.

### Workflow E — Manager approval queue
Manager opens Pending Pay queue, reviews each card, approves with `A` keyboard shortcut. Cleared in minutes.

### Workflow F — Friday settlement run
Admin clicks Generate Settlements for last week, reviews drafts (anomalies flagged amber), finalizes, PDFs generated and pushed to driver portals.

### Workflow G — Monday mark-paid
After payroll runs externally, admin marks settlements PAID. All child rows lock. Audit log records.

### Workflow H — Driver checks pay (the new core flow)
Driver opens DriveCommand mobile app. Home shows "$1,247.50 — This week" with progress bar. Taps a load to see breakdown. Taps "Looks wrong?" to dispute if needed.

### Workflow I — Dispute and correction
Driver disputes from portal. Manager investigates, finds error, issues correction (creates ADJUSTMENT). Adjustment rolls into next settlement automatically and appears in driver's portal.

---

## Section 14 — Claude Code Prompts (Run in Order)

> Each prompt is in a single fenced code block — use the copy icon to copy. Paste into Claude Code in VS Code and run. Verify the result before moving to the next. Prompts adapt to your project's existing folder structure.

### Prompt 1 — Foundation: framework audit, schema, multi-tenancy

```
Use the GSD skill to build Phase 1 of the Driver Pay module. The full specification is in DriverPay_TechnicalSpec_v4.md at the root of this workspace — read it first, especially Sections 1, 5, 7, 11.

This phase has three parts and you do them in order: framework audit + upgrade, then schema, then multi-tenant security.

Part A — Framework audit and upgrade (do this BEFORE writing any code):

1. Read the existing package.json files in the project. There may be multiple if it's a monorepo.

2. Compare every framework version to the targets in spec Section 11:
   - Next.js 16.2
   - React 19.2
   - TypeScript 5.x with strict mode
   - Prisma 7
   - PostgreSQL 16+ (server-side, check connection string)
   - Expo SDK 55
   - React Native 0.83
   - decimal.js (any recent version)
   - Zod (any recent version)
   - @react-pdf/renderer (any recent version)
   - Recharts or whatever charting library is already in use

3. For anything older than the target, upgrade it. Run the appropriate upgrade commands. For Next.js, prefer the official codemod: npx @next/codemod@canary upgrade latest. For Expo, use npx expo install --fix and follow the SDK upgrade guide. For Prisma, npm install prisma@latest @prisma/client@latest and apply any required migrations.

4. Confirm the project still type-checks and the dev server boots after the upgrade. If anything breaks, fix the breakages and explain what changed.

5. Report the before/after version table.

Part B — Schema additions:

1. Locate the existing Prisma schema file and add the seven new models from spec Section 5: DriverCompensationTemplate, LoadDriverAssignment, LoadPayComponent, DriverBonus, DriverDeduction, DriverSettlement, PayComponentAttachment, plus DriverDispute (Section 5.8) and AuditLog (Section 5.9). Total: nine new models.

2. Add field additions to existing Stop, Contract, and Load models per spec Section 4. Don't modify any other fields on those models.

3. Every tenant-scoped table includes: tenant_id (UUID, required, FK to tenants), created_at, updated_at, created_by (UUID FK to users), deleted_at (nullable, for soft-delete).

4. Index every foreign key. Composite index (tenant_id, driver_id) on assignments and bonuses. Composite index (tenant_id, period_start) on settlements. Index (driver_id, paid_at) for fast driver-portal queries.

5. Money fields use Decimal with the precision/scale in spec Section 5. All timestamps are DateTime @db.Timestamptz(6). Use @map for snake_case at the database level while keeping camelCase in Prisma.

6. All foreign keys on financial tables: onDelete: Restrict.

7. Define enums as Prisma enums backed by PostgreSQL native enums.

8. Generate the migration with prisma migrate dev. Then manually edit the SQL migration to add what Prisma can't express:
   - EXCLUDE constraint on driver_compensation_templates preventing overlapping date ranges per driver_id.
   - Partial unique index on load_driver_assignments (load_id) WHERE driver_role = 'MAIN_DRIVER'.
   - Row-Level Security setup on every tenant-scoped table per spec 7.2.
   - The tenant_isolation policy on each.
   - Create app_user PostgreSQL role with SELECT/INSERT/UPDATE/DELETE on the new tables but no superuser.

Part C — Application-level multi-tenant middleware:

1. Add a Prisma client extension or middleware that:
   - Runs SET LOCAL app.current_tenant_id = '<uuid>' at the start of every transaction, sourced from request context.
   - Auto-injects tenant_id on creates and where clauses on reads/updates for tenant-scoped tables.
   - Refuses queries when no tenant context is set (fail closed).

2. Add tenant-isolation tests: create two tenants, insert as tenant A, query as tenant B, assert zero results. One test per tenant-scoped table.

Constraints:
- Do not modify existing model fields beyond Section 4 additions.
- The application connects via app_user role, never a superuser.
- Soft-delete pattern (no hard deletes) on financial tables.
- Money fields: Decimal, never Float, never Number.

Verify before stopping:
- All upgraded packages pass their type checks.
- npx prisma generate succeeds.
- npx prisma validate passes.
- The migration applies cleanly to a fresh local database.
- Tenant-isolation tests all pass.
- A query without tenant context returns no rows or throws (not all rows).

Report:
- The framework before/after version table.
- File paths of new and modified files.
- Test output.
- Any spec ambiguity I should resolve before proceeding.

Adapt to the existing project structure. If anything in the project conflicts with the spec, describe the conflict and propose options before changing anything.
```

### Prompt 2 — Compensation template management (with wizard UX)

```
Use the GSD skill to build Phase 2 of the Driver Pay module per DriverPay_TechnicalSpec_v4.md. Read Sections 5.1, 6, 8.3, 8.4 carefully — the template-creation UX is a wizard, not a flat form.

Goal: an admin or manager can open a driver's profile, see the active compensation template, view history, and create a new version through a 3-step wizard with smart defaults, live preview, and starter templates.

Build:

1. CRUD API routes in your existing API directory under paths like /drivers/:driverId/compensation-templates and /compensation-templates/:id. Apply RBAC per spec Section 6: ADMIN+MANAGER mutate; ADMIN+MANAGER+DISPATCHER+VIEWER read; DRIVER reads own only.

2. Zod validator with these refinements:
   - overtime_threshold_hours and overtime_multiplier required when overtime_eligible.
   - per_diem_rate required when per_diem_enabled.
   - REFERRAL bonus type requires referred_driver_id.
   - effective_from cannot be in the past unless an explicit override flag is set.

3. A "Compensation" tab on the driver profile page:
   - Active template card at top with all current values, "Edit" and "End and replace" buttons.
   - "Previous versions" expandable section, read-only.
   - Empty state per spec 8.6.

4. A 3-step template wizard (modal or full-page route, match your project's pattern):
   - Step 1: Pay model — single-choice with descriptive cards: "CPM", "Hourly", "Flat per Load", "Percentage of Revenue", "Daily Rate", "Annual Salary." Each card has a 1-line description and a typical-use example.
   - Step 2: Rate and unit — fields auto-populated from step 1's smart defaults but always editable. CPM auto-fills rate_unit=PER_MILE; HOURLY=PER_HOUR; etc.
   - Step 3: Add-ons — toggles for Overtime, Per Diem, Fuel Surcharge. Each toggle reveals its detail fields when on.
   - Throughout: a sidebar live-preview panel shows: "On a typical 412-mile load this driver earns: $X.XX. Plus per diem if applicable. With OT after Y hours."
   - Final confirmation card before save (Pattern E from spec 8.5).

5. "Copy from another driver" button on step 1 — pick any driver from the same tenant; their template values pre-fill.

6. Library of starter templates (hard-coded for v1, can be DB-backed later): "Standard OTR CPM ($0.55/mi)", "Local Hourly ($25/hr)", "Hotshot Flat ($300/load)", "Owner-Operator 80% Percentage", "Dedicated Salary ($65k/yr)". Picking a starter pre-fills all fields.

7. Smart save flow: creating a new version atomically sets the previous template's effective_to to (new effective_from − 1 day) inside a Prisma $transaction. Show confirmation card before submitting.

8. Form patterns from spec 8.3:
   - Labels above inputs with * for required.
   - Currency inputs: $ prefix, right-aligned, auto-format on blur.
   - Real-time validation on blur with Pattern A error messages.
   - Save button shows "Saving..." + spinner; success shows checkmark.

9. Tests:
   - Zod refinements (each rule).
   - Atomic end-and-replace transaction.
   - Tenant isolation: tenant B cannot read tenant A templates.
   - RBAC: DISPATCHER POST returns 403.
   - Wizard step transitions.
   - Live preview math accuracy.

Constraints:
- Use your project's existing UI components and Tailwind setup. Do not introduce a new component library.
- All money math: decimal.js.
- Tenant isolation handled by Phase 1 middleware — do not duplicate.
- The wizard should feel obvious. If a non-trucking person can't set up a CPM template in under 60 seconds, the UX is wrong.

UX requirements (spec Section 8):
- Color tokens per 8.2.
- Empty state language per 8.6.
- Errors follow Patterns A through E from 8.5.
- Active template card has a "Effective since [date]" badge in success color.
- Templates ending within 7 days show an amber "Ending soon" badge.
- Keyboard: Enter advances wizard step; Escape closes; Tab order matches visual order.

Verify:
- TypeScript clean.
- Wizard fully keyboard-navigable.
- WCAG AA contrast on all states.
- Live preview updates within 100ms of input change.
- Existing tests still pass.

Adapt file paths to your project. Report new and modified files.
```

### Prompt 3 — Load-driver assignment with snapshot and override

```
Use the GSD skill to build Phase 3 of the Driver Pay module per DriverPay_TechnicalSpec_v4.md. Read Sections 5.2, 6, 8.9 (Flow A and B).

Goal: a dispatcher assigns a driver to a load. The driver's compensation template is snapshotted into the assignment row at assignment time. The dispatcher can override pay terms for that one load with a required reason. Future template changes never modify existing assignments.

Build:

1. A server-side service that takes (driverId, tenantId) and returns the snapshot fields from the driver's currently active template. Throws a clear error if no active template.

2. API routes for assignments:
   - List assignments for a load.
   - Create assignment (calls snapshot service server-side).
   - Update assignment (override).
   - Delete assignment (only if status = DRAFT).
   RBAC per spec Section 6.

3. UI on the load detail page:
   - "Driver Assignments" section showing all assignments for the load.
   - Each card: role badge (MAIN_DRIVER / CO_DRIVER), driver name, pay summary, status badge.
   - "Assign Driver" button opens a modal: search-picker for driver, role selector, then auto-snapshot preview.
   - Default banner on each card: green "Inheriting [Driver]'s standard pay: $X.XX/mi, ~Y mi ≈ $Z."
   - When any field differs from snapshot: amber "Overridden — [reason]" banner.

4. Override form on assignment card: opens with snapshot values pre-filled. As soon as any field changes, a "Reason" textarea appears (required, min 10 chars). Server validates too.

5. "Override is computed" — comparing assignment fields to template snapshot. No is_override boolean column.

6. Validation:
   - 422 with Pattern B message if driver has no active template.
   - 409 from DB constraint on second MAIN_DRIVER, translated to friendly Pattern B message.
   - 400 if override fields differ but reason missing.

7. Smart UX hints:
   - When the load is hazmat, show an info chip: "This load is hazmat. [Driver]'s hazmat premium is +$0.10/mile." with "Apply hazmat premium" button that pre-fills the override.
   - When the load is on a recognized US holiday, show similar holiday-multiplier hint.

8. Tests:
   - Snapshot semantics: edit template after assign, assignment unchanged.
   - Override validation: change field without reason → 400.
   - Two MAIN_DRIVER → 409 with friendly message.
   - Tenant isolation.
   - Soft delete.

UX requirements (spec Section 8):
- Empty state when no driver assigned: "No driver assigned yet. Pay terms will be set when you assign one." + primary "Assign Driver."
- Banner colors per 8.2 (success / warning).
- Driver search-picker: live filter, shows name + employment-type chip + active-template indicator (red dot if no active template).
- Errors follow Pattern A/B/C from 8.5.
- Confirm dialog (Pattern E) before delete.

Constraints:
- Snapshot happens server-side only.
- No is_override column.
- Do not auto-create LoadPayComponents — Phase 4.
- Tenant isolation via Phase 1 middleware.

Verify:
- All tests pass.
- TypeScript clean.
- Banner color/text update immediately on save.
- End-to-end manual scenario works.

Adapt to project. Report.
```

### Prompt 4 — Pay components, auto base pay, auto detention

```
Use the GSD skill to build Phase 4 of the Driver Pay module per DriverPay_TechnicalSpec_v4.md. Read Sections 5.3, 10.1, 10.2.

Goal: each assignment has many LoadPayComponent rows. Base pay auto-creates when the assignment leaves DRAFT. Detention is auto-suggested from stop timestamps. Deductions stored as negative gross_amount.

Build:

1. Pure-function pay calculator service: one function per pay type (Section 10.1), plus a dispatch function. Uses decimal.js. No side effects.

2. Auto-detention service: given a Stop with arrived_at, departed_at, and free_time_minutes, returns a suggested DETENTION component or null. Rounds hours to 2 decimals.

3. API routes:
   - List components for an assignment.
   - Create / Update / Delete component (delete only when assignment in DRAFT or PENDING_REVIEW; never PAID).
   - Suggest detention for a stop (preview without creating).
   RBAC: DRIVER can only create REIMBURSEMENT components on own assignments.

4. Auto base-pay logic on DRAFT → PENDING_REVIEW transition (this transition is implemented in Phase 6 but stub the trigger here). If no BASE_PAY_* exists, create one based on assignment's pay_type and rate using actuals if set, else estimates.

5. Component category enforcement:
   - DEDUCTION: stored negative; UI accepts positive; server negates.
   - REIMBURSEMENT: is_taxable=false, is_reimbursement=true.
   - PER_DIEM: is_taxable=false.
   - Server recomputes gross_amount on every save.
   - visible_to_driver defaults true; some adjustments may be hidden (admin-only field on form).

6. UI:
   - Component list grouped by category with subtotals + grand total at bottom.
   - "Add pay component" button: first picks category (Bonus, Accessorial, Allowance, Reimbursement, Deduction, Adjustment); category narrows component_type dropdown.
   - "Suggest detention" button on each Pickup/Delivery stop card showing preview with editable rate/hours.
   - Each component row shows audit chip "Added by [user] [time ago]" for dispute investigation.

7. Tests:
   - One unit test per pay formula in 10.1, including edge cases.
   - Auto-detention boundary tests.
   - DEDUCTION sign convention.
   - Total computation across mixed components.
   - Cannot edit on PAID → 409.
   - Tenant isolation.

UX requirements (spec Section 8):
- Numbers right-aligned in tables.
- DEDUCTION rows in danger color with minus sign, NOT red background.
- Reimbursement without attachment shows warning chip (warning color).
- Empty state per 8.6.
- "Suggest detention" button is primary when detention applies but no component exists yet.
- Tooltip on every gross_amount: "X qty × Y rate × Z multiplier = $T".

Constraints:
- All money: decimal.js.
- Server is source of truth for gross_amount.
- No settlement logic in this phase.
- No attachments — Phase 5.

Verify:
- Formula tests penny-exact.
- DEDUCTION sign consistent.
- Immutability on PAID enforced.
- TypeScript clean.

Adapt paths. Report.
```

### Prompt 5 — Receipt attachments (web + mobile)

```
Use the GSD skill to build Phase 5 of the Driver Pay module per DriverPay_TechnicalSpec_v4.md. Read Section 5.7 and Section 9 (Driver Portal — drivers upload receipts from mobile).

Goal: dispatchers and drivers attach receipts to reimbursement components. Drivers from mobile camera; dispatchers from web. Files in tenant-scoped object storage with short-lived signed URLs.

Build:

1. Storage abstraction: getUploadUrl, getDownloadUrl, delete. Two implementations: AWS S3 (current) and Supabase Storage (future). Switch via env var.

2. Object key convention: {tenant_id}/components/{component_id}/{uuid}.{ext}. Defense-in-depth alongside RLS.

3. Upload flow:
   - Client requests presigned URL from API (rate-limited, 15min expiry).
   - Server checks user has access (RLS + RBAC).
   - Client uploads directly to storage.
   - Client confirms with second endpoint that creates the row.

4. Download flow:
   - Client requests download URL.
   - Server re-checks access on every request, returns short-lived URL.
   - Not cacheable client-side.

5. Web UI: drag-drop zone + file picker on reimbursement component forms. Multi-file. Per-file progress. Thumbnails for images, file icon for PDFs.

6. Mobile UI (Driver Portal): receipt capture using expo-camera and expo-image-picker. Auto-rotate, retake option, preview before upload. Server-side image compression if >2MB.

7. Validation:
   - Max 10MB per file.
   - Accept image/jpeg, image/png, image/heic, application/pdf.
   - Validate MIME server-side.
   - Reject if user can't access component.

8. Soft delete: deleted_at column; daily cleanup job removes storage object (leave TODO).

9. Tests:
   - Tenant B gets 404 (not 403) for tenant A's attachment URL.
   - Cross-tenant component_id guess fails.
   - File type validation.
   - Soft delete: subsequent fetches 404.

UX requirements (spec Section 8):
- Drag-drop dashed border in muted color, primary on hover/drag-over.
- Empty state per 8.6.
- Upload errors Pattern D.
- Reimbursement without attachments still saves but shows warning chip.
- Mobile: shutter button bottom-center, retake/use after capture, preview before upload.
- Touch targets ≥44px.
- Image thumbnails ≥80×80, click to expand.

Constraints:
- Never store presigned URLs; always generate fresh.
- Object keys MUST include tenant_id.
- Don't bypass access checks.

Verify:
- Web upload works locally end-to-end.
- Mobile upload works in iOS simulator.
- Tenant isolation tests pass.
- TypeScript clean.

Adapt to project. Report.
```

### Prompt 6 — Status workflow, approval queue, corrections

```
Use the GSD skill to build Phase 6 of the Driver Pay module per DriverPay_TechnicalSpec_v4.md. Read Sections 3.2, 6, 8.5, 8.9 (Flow C), 10.2.

Goal: assignments move through DRAFT → PENDING_REVIEW → APPROVED → PAID with DISPUTED and CORRECTED branches. Managers have a centralized queue. Corrections after PAID create new ADJUSTMENT components.

Build:

1. State machine module (pure logic, testable in isolation):
   - canTransition(assignment, newStatus, components) → discriminated union.
   - Transition rules per spec 10.2.
   - Returns user-friendly Pattern B error strings.

2. Transition API routes (submit, approve, dispute, correct). Each calls the state machine. Each writes audit_log. RBAC per Section 6.

3. Pending Pay queue page:
   - All assignments in PENDING_REVIEW or DISPUTED for the user's tenant.
   - Filters: driver, date range, total amount, override-vs-standard.
   - Sortable, oldest first by default.
   - Selecting a row opens detail pane.

4. Approval card UI: full breakdown, total, "Approve" (primary) and "Dispute" buttons. Keyboard shortcuts: A approve, D dispute, ↑/↓ navigate, Enter open. After approve, advance to next.

5. Sidebar nav badge: count of PENDING_REVIEW for user's tenant. Live update via polling or SSE.

6. Corrections workflow: from PAID assignment, "Issue correction" modal:
   - Pick original component (or general adjustment).
   - Reason (required).
   - Adjustment amount (sign auto-determined).
   - Save creates new ADJUSTMENT component with original_component_id and right sign.
   - Picked up by next settlement (Phase 8).

7. Audit log integration: every transition writes user_id, before_state, after_state, ip_address, user_agent.

8. Tests:
   - Every valid + invalid transition pair.
   - Pre-condition errors return user-friendly messages.
   - Corrections create right sign.
   - Tenant isolation.
   - RBAC: DISPATCHER → 403 on approve.
   - audit_logs receives entries.

UX requirements (spec Section 8):
- Empty state per 8.6.
- Approval card: header (driver + load + total), component table, sticky action buttons.
- Override badges visible.
- Dispute modal: required reason, Pattern E confirm.
- Correction modal: original component shown with strikethrough next to new adjustment.
- Pre-condition errors inline on action button (not popup): "Cannot approve — actual miles not yet recorded. Open the load to confirm." with link.
- Approve animates green briefly, advances; dispute keeps user on row.

Constraints:
- Settlements integration in Phase 8.
- No editing PAID components — corrections only.
- Audit logs cannot be deleted.

Verify:
- All transition tests pass.
- Keyboard shortcuts work.
- Audit entries correct.
- TypeScript clean.

Adapt to project. Report.
```

### Prompt 7 — Off-load bonuses, recurring deductions

```
Use the GSD skill to build Phase 7 of the Driver Pay module per DriverPay_TechnicalSpec_v4.md. Read Sections 5.4, 5.5, 6.

Goal: admins record sign-on bonuses (often installments), retention milestones, safety bonuses, referral bonuses. Admins set up recurring deductions like weekly escrow or court-ordered child support. These roll into settlements (Phase 8).

Build:

1. CRUD API routes:
   - Bonuses on a driver: list, create, update, mark-paid.
   - Deductions on a driver: list, create, update, pause/unpause.
   RBAC: ADMIN+ for create; MANAGER+ for mark-paid.

2. Installment scheduler service: total + count + start_date + interval → N child bonus rows linked via parent_bonus_id. Last installment absorbs rounding so sum equals total exactly.

3. Driver profile UI:
   - Bonuses tab: list with paid/unpaid badges, filterable.
   - Deductions tab: list with running balance for FIXED_INSTALLMENTS ("Collected $X of $Y").
   - Add Bonus form: type, amount, description, trigger_date, scheduled_pay_date, installments, referred_driver_id (REFERRAL only).
   - Add Deduction form: type, schedule, amount per period, total (installments), max_percentage_of_net (garnishments), starts_on, ends_on, visible_to_driver.
   - Pause toggle on each deduction.

4. Validation:
   - REFERRAL requires referred_driver_id; others reject it.
   - Installment count ≥ 2 if set.
   - max_percentage_of_net ≤ 50 (federal upper bound for total garnishments).
   - starts_on ≤ ends_on if both set.

5. Tests:
   - Installment splitter penny-exact: $1000/3 = [333.33, 333.33, 333.34].
   - Pause persists.
   - REFERRAL validation both directions.
   - Tenant isolation.

UX requirements (spec Section 8):
- Empty states per 8.6.
- Bonus form: when installments > 1, show schedule preview with dates and amounts before save.
- Deduction balance: progress bar in success color for FIXED_INSTALLMENTS.
- Paused deductions: reduced opacity + "Paused" badge.
- Mark-paid confirmation (Pattern E): "Mark $X bonus as paid? This adds it to the next settlement run for [Driver]."

Constraints:
- All money: decimal.js.
- Installment children reference parent_bonus_id.
- Don't auto-pause on amount_collected = total_amount; that's settlement behavior.
- No settlement rollup here.

Verify:
- Installment math penny-exact.
- Pause works.
- Tests pass.
- TypeScript clean.

Adapt. Report.
```

### Prompt 8 — Settlements: generation, review, finalization, PDF, mark-paid

```
Use the GSD skill to build Phase 8 of the Driver Pay module per DriverPay_TechnicalSpec_v4.md. Read Sections 5.6, 8.9 (Flow E), 10.4. This is the most important phase — settlements are what drivers get paid against.

Goal: admin selects date range and drivers, system generates DRAFT settlements aggregating approved assignments + due bonuses + scheduled deductions with garnishment caps and carryover. Admin reviews, finalizes, system generates PDF. After payroll runs, admin marks paid which locks all child rows.

Build:

1. Settlement generator service implementing the algorithm in spec 10.4 exactly. Wrap in Prisma $transaction with serializable isolation. Lock approved-and-unsettled assignments inside the transaction (FOR UPDATE) so concurrent generation runs cannot double-count.

2. Garnishment cap and carryover: when max_percentage_of_net would push deductions above the cap, apply only what fits, store carryover for next period.

3. API routes:
   - Generate settlements (body: driverIds + period_start + period_end).
   - List settlements for a driver.
   - Get one settlement with full breakdown.
   - Finalize a settlement.
   - Mark a settlement paid.
   - Void (DRAFT or FINALIZED only, never PAID).
   - Get settlement PDF (streamed).
   RBAC: ADMIN+ for generate/finalize/mark-paid/void; MANAGER+ to read; DRIVER reads own only.

4. PDF generation using @react-pdf/renderer:
   - Header: carrier name, driver name + employment type, period dates, settlement reference.
   - Summary table: gross taxable, gross non-taxable, total deductions, net pay.
   - Per-load breakdown.
   - Standalone bonuses section.
   - Deductions section.
   - Footer: timestamp, settlement ID, signature line.
   - Clean professional typography, print-safe colors.

5. UI:
   - Settlements list page: filter by driver, status, period; sortable.
   - Settlement detail page: same data as PDF, interactive. Click any line to see origin (link to load).
   - Generate Settlements modal:
     - Pre-fill period to last full pay week.
     - Driver picker with "All drivers with approved pay this period" default.
     - Preview count of items to be picked up.
     - Progress bar during generation.
   - Results page: summary cards per driver. Anomaly flag (amber) if net pay deviates >25% from 4-week average.
   - Finalize: Pattern E confirm listing what locks.
   - Mark Paid: Pattern E confirm with strong warning ("Cannot be undone").

6. Anti-double-generate:
   - Block if existing FINALIZED or PAID overlaps period for any driver.
   - Idempotency key on generate endpoint.

7. Tests:
   - Algorithm correct vs comprehensive fixture (multiple loads, bonuses, deductions, garnishment cap).
   - Re-running generation skips already-settled assignments.
   - Carryover for capped garnishments works.
   - Concurrent generate: only one succeeds.
   - Finalize idempotent.
   - Mark Paid flips children, irreversible.
   - PDF golden-file test.
   - Anomaly detection.
   - Tenant isolation.

UX requirements (spec Section 8):
- Settlement detail mirrors PDF visually so what user sees is what driver sees.
- Net pay big and bold at top.
- Deductions in danger color with minus sign, not red rows.
- Anomaly flag: amber "Higher than usual — review" with comparison tooltip.
- Generate progress: percentage + "Processed X of Y drivers."
- Empty state per 8.6.
- Mark Paid confirmation lists dollar amount and driver count to prevent fat-finger.

Constraints:
- All money: decimal.js.
- Generation MUST be single transaction with serializable isolation.
- PDF generation server-side.
- Once PAID, no fields can be modified.

Verify:
- Algorithm tests pass.
- Concurrent test passes.
- PDF golden-file matches.
- Mark Paid locks correctly.
- TypeScript clean.

Adapt. Report.
```

### Prompt 9 — Driver Portal (Uber-modeled self-service)

```
Use the GSD skill to build Phase 9 of the Driver Pay module per DriverPay_TechnicalSpec_v4.md. Read Section 9 (entire section) and Section 8 (UX). This is the driver-facing self-service portal modeled on Uber's driver app.

Goal: drivers see their pay in real time. The portal is the difference between drivers staying and drivers leaving for another carrier. Web at drive.drivecommand.com (or equivalent subdomain in your project setup); mobile via existing Expo app.

Build:

1. Authentication and routing:
   - Driver-scoped JWT: token contains driverId and tenantId.
   - API filters everything by driverId automatically.
   - When a user with role=DRIVER logs in, default landing route is the portal home, not the carrier admin app.
   - Drivers cannot access carrier admin routes (403).

2. Home / Earnings Hub screen (spec 9.2.1):
   - Hero card "This Week" with big net total, subtitle (period + load count + total miles), progress bar to weekly_earning_goal, 6-week sparkline.
   - Last paid statement card with primary "View statement" → opens PDF inline + per-load drawer.
   - Today / Active loads card: list of current and today-completed loads with running pay totals.
   - Pending pay card if any.
   - Open disputes card if any.
   - Live updates via 30s polling on home screen, longer interval otherwise.

3. Earnings deep-dive screen (spec 9.2.2):
   - Tabs: This Week | Statements | Yearly Summary | Trip-by-Trip.
   - Statements tab: list newest-first, status badge, dates, net amount. Tap → settlement detail with loads, components, deductions, PDF download.
   - Trip-by-Trip tab: every load this week as card.
   - Yearly Summary: gross taxable, per diem, reimbursements, "Download tax forms" link.

4. Loads screen (spec 9.2.3):
   - Tabs: Active | Recent | All.
   - Recent: last 30 days as cards.
   - Load detail: hero (load# + cities + dates + total), components section, deductions section, stops timeline, "Looks wrong?" button always visible.

5. Pay screen (spec 9.2.4):
   - My Compensation: read-only summary of active template.
   - Bonuses: paid + pending + future scheduled.
   - Deductions: active recurring + balance progress bars.
   - Disputes: all submitted with status threads.

6. Profile screen (spec 9.2.5):
   - Personal info, tax info, payout method, help/support.

7. Dispute flow (spec 9.3):
   - "Looks wrong?" button on every load detail, settlement, and component.
   - Three-tap maximum from anywhere.
   - Category picker with driver language: "Wrong amount", "Missing pay", "Wrong miles", "Missing or wrong receipt", "Other".
   - Message field with smart prompt.
   - Photo attachment (camera or library on mobile).
   - Confirmation with ETA: "Sent to dispatch. Most disputes get a reply within 24 hours."
   - Status visible: Open → In Review → Resolved (paid / no change / closed).
   - Implements driver_disputes table from spec 5.8.

8. Manager-side dispute resolution (extension of admin app):
   - Notification when dispute submitted.
   - Inbox view with open disputes.
   - Reply textarea + status dropdown + optional "Issue correction" button that links to Phase 6 corrections flow.
   - When dispute resolves with a correction, link the dispute to the ADJUSTMENT component via linked_correction_id.

9. Real-time updates:
   - Polling every 30s on home screen.
   - Longer interval on other screens.
   - Use SSE if your project already does.
   - "Last updated [time]" indicator on home.

10. Tests:
    - Driver can only see own data; tenant-isolation test PLUS driver-isolation test (driver from same tenant cannot see other driver's data).
    - Dispute flow end-to-end.
    - Settlement PDF rendering matches on-screen breakdown to the cent.
    - Mobile: receipt photo upload from camera works.

UX requirements (spec Section 8 + 9):
- Big net pay number is the dominant visual element on home.
- Progress bar uses success color when ≥ 100% of goal, primary color below.
- Sparkline color: success.
- Status badges use semantic colors: PAID success, FINALIZED primary, PENDING_REVIEW warning, DISPUTED danger.
- Empty states per spec 8.6 + 9 ("Quiet week so far. Your next completed load will show up here.").
- Dispute confirmation has an ETA so the driver feels heard, not ignored.
- All money to the cent, never rounded.
- Mobile: bottom tab navigation (Home / Earnings / Loads / Pay / Profile). 44px+ touch targets.
- Web: same five sections in a left sidebar, same content structure as mobile for parity.
- DO NOT copy from Uber: surge-style gamification, aggressive notifications, instant-pay upsell.

Constraints:
- Driver-scoped JWT: NEVER trust driverId from request body or query.
- Money: decimal.js.
- Mobile and web share business logic (settlement generation, calculator) but have separate UI.
- Don't introduce new chart or component libraries — use what's there.

Verify:
- Driver isolation test (driver A cannot see driver B's data within same tenant).
- Live update on home works.
- Dispute flow end-to-end works on mobile and web.
- PDF on driver portal matches admin-side exactly.
- TypeScript clean.

Adapt to project structure (subdomain, mobile route layout, etc.). Report new and modified paths.
```

### Prompt 10 — Reporting dashboard (admin)

```
Use the GSD skill to build Phase 10 of the Driver Pay module per DriverPay_TechnicalSpec_v4.md. Read Section 8.8 (report patterns).

Goal: managers and admins get clear, scannable reports. Big number first, comparison built in, sparkline, table with drill-down, secondary export.

Build:

1. Shared report query helpers (date-range, driver-filter, pagination, tenant-filter handled by middleware).

2. Report endpoints + UI tabs:
   - Driver Pay Summary (per period): big total at top, bar chart by driver, sortable table.
   - Accessorial Spend by Shipper/Contract.
   - Load Profitability: revenue minus driver pay components per load.
   - Pay by Component Type: pie + table.
   - Overtime Exposure.
   - Override Audit: which dispatchers are overriding what.
   - Deduction Balances: outstanding advance/escrow per driver.
   - Settlement History.

3. Reports dashboard page with tabs. Date range picker at top applies to all.

4. Charts: existing chart library only (typically Recharts).

5. Performance:
   - Every query uses indexed fields. Run EXPLAIN ANALYZE; add indexes via migration if needed.
   - Pagination on >500 rows.
   - CSV exports stream.

6. RBAC:
   - MANAGER+: most reports.
   - DRIVER: own settlements only.
   - VIEWER: read-only summary, no exports.

7. Tests:
   - Each report's aggregation correct vs fixture.
   - CSV streams (chunks emit before full assembly).
   - Tenant isolation.
   - RBAC.

UX requirements (spec 8.8):
- Big number at top of every report (the report's main answer).
- Delta vs previous period beside big number with arrow + color.
- Sparkline beside big number.
- Tables sorted, filtered, paginated by default.
- Click any number → drill-down to underlying rows.
- Export is secondary action.
- Empty state per 8.6 when date range has no data.
- Loading skeletons not centered spinners.

Constraints:
- No new chart library.
- Streaming CSV: do not buffer.

Verify:
- Each report loads <1s on 10k-assignment fixture.
- CSV streams.
- Tenant tests pass.
- TypeScript clean.

Adapt. Report.
```

### Prompt 11 — Payroll export (final phase)

```
Use the GSD skill to build Phase 11 of the Driver Pay module per DriverPay_TechnicalSpec_v4.md. Final phase: producing files that import cleanly into payroll providers.

Goal: admin exports a finalized settlement period as CSV (generic) or in QuickBooks / ADP / Gusto format. W-2 employees and 1099 owner-operators kept in separate exports because they have different tax treatment.

Build:

1. Exporter interface + four implementations (Generic CSV, QuickBooks IIF/CSV, ADP, Gusto). Each takes settlement list, returns streamable file.

2. Format details: verify against each provider's current docs. Link source in code comments. Mark unverified columns with TODO. Track in README.

3. Splitting:
   - W-2 settlements → payroll wage export (taxable wages, OT, non-taxable per diem on separate row, reimbursements separate row).
   - 1099 settlements → contractor pay export.

4. API endpoint POST /api/reports/payroll-export with body {periodStart, periodEnd, format, employmentType?}:
   - Streaming response.
   - RBAC: ADMIN only.
   - Logs export to audit_logs (full payload).

5. UI:
   - "Export Payroll" on settlements list, enabled only when ≥1 FINALIZED or PAID settlement in period.
   - Modal: format radio, employment type (W-2 / 1099 / Both), period (defaults to last finalized).
   - Generate → file download.

6. Tests:
   - Golden-file per format using fixture (W-2 driver with taxable + per diem + reimbursement; 1099 with flat + reimbursement; multiple deductions).
   - Outputs match golden file byte-for-byte.
   - Audit log entry on export.

7. Documentation:
   - README in exporters folder listing each format, source URL, verified vs not.

UX requirements (spec Section 8):
- Confirm dialog (Pattern E) before generating: "Export [count] settlements totaling $[total] in [format]?"
- File download progress for large files.
- Pattern B if any settlements still DRAFT: "Cannot export — [N] settlements in DRAFT. Finalize them first."

Constraints:
- W-2 vs 1099 cleanly split. Mixing them hurts at tax time.
- No real-name fixture data.
- Don't guess unverified columns.

Verify:
- Golden-file tests pass.
- Test export imports into a sandbox account of at least one provider (manual; note in README).
- Audit logs correct.
- TypeScript clean.

Adapt. Report.
```

---

## Section 15 — Acceptance Criteria

Build is done when the 18-step test in Section 1.5 passes against a real local environment, plus:

1. Two-tenant test confirms zero cross-tenant data leakage.
2. RBAC matrix from Section 6 enforced everywhere.
3. All money calculations are penny-exact against hand-computed fixtures.
4. WCAG 2.1 AA contrast on every screen.
5. Mobile receipt upload works in iOS and Android simulators.
6. Settlement PDFs render identically to on-screen breakdowns.
7. Concurrent settlement generation doesn't double-count.
8. Mark-Paid is irreversible (audit log records; rows immutable).
9. Payroll exports import cleanly into a sandbox account.
10. Audit logs capture every state transition and money mutation.
11. Driver Portal home screen shows real-time updates on completed loads.
12. Driver dispute submission generates a manager notification within 30s.

---

## Section 16 — Open Product Questions

Resolve before kickoff:

1. Default settlement period: weekly Mon–Sun (recommended) or biweekly?
2. Multi-currency: USD-only for v1 or CAD/MXN day-one?
3. Default garnishment cap: 25% (federal max) or per-deduction?
4. Driver mobile self-service for tax forms: in-app or external link to ADP/Gusto portal?
5. Tax form generation (W-2, 1099-NEC) in scope or external?
6. Single-level approval or two-level (manager → admin above $X)?
7. SOC 2 audit log retention: 1 year, 3 years, 7 years?
8. Driver portal subdomain: drive.drivecommand.com or my.drivecommand.com?

---

*End of Document — DriveCommand Driver Pay Module Technical Specification v4.0*
*For internal use and Claude Code implementation session only.*
