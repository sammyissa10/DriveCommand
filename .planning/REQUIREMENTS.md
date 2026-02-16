# Requirements: DriveCommand

**Defined:** 2026-02-16
**Core Value:** Logistics owners can manage their entire operation from one platform, with fleet intelligence dashboards providing real-time visibility into vehicle location, driver safety, and fuel efficiency.

## v3.0 Requirements

Requirements for v3.0 Route Finance & Driver Documents. Each maps to roadmap phases.

### Route Finance

- [ ] **FIN-01**: User can add line-item expenses to a route (gas cost, driver salary, insurance, tolls, custom)
- [ ] **FIN-02**: User can edit and delete individual expense line items
- [ ] **FIN-03**: User can record payment/revenue for a route
- [ ] **FIN-04**: User can see total operating cost (sum of all expenses) per route
- [ ] **FIN-05**: User can see profit calculation (payment - total expenses) per route
- [ ] **FIN-06**: User can track payment status per expense (pending/paid)
- [ ] **FIN-07**: User can create custom expense categories for their tenant
- [ ] **FIN-08**: User can apply expense templates to pre-fill common route costs
- [ ] **FIN-09**: User can view cost per mile and compare against fleet average
- [ ] **FIN-10**: User receives alert when route profit margin falls below configured threshold

### Route Page UX

- [ ] **RUX-01**: User can view and edit route details on a single unified page
- [ ] **RUX-02**: User can toggle between view mode and edit mode
- [ ] **RUX-03**: User can edit route status from the unified page

### Driver Documents

- [ ] **DOC-01**: User can upload driver license document to a driver profile
- [ ] **DOC-02**: User can upload driver application document to a driver profile
- [ ] **DOC-03**: User can upload general documents to a driver profile
- [ ] **DOC-04**: User can set expiry dates on driver documents
- [ ] **DOC-05**: User can see expiry status warnings on driver documents (valid/expiring soon/expired)

## Future Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Route Finance Advanced

- **FIN-F01**: User can view expense approval workflow with manager sign-off
- **FIN-F02**: User can forecast route costs using historical averages
- **FIN-F03**: User can compare route profitability side-by-side

### Driver Documents Advanced

- **DOC-F01**: User can bulk upload multiple documents at once
- **DOC-F02**: User can see document version history
- **DOC-F03**: User receives auto-expiry reminders via email (30/60/90 days)
- **DOC-F04**: System can OCR driver license to auto-populate fields

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real-time expense entry during route | Safety risk — drivers shouldn't enter data while driving |
| Multi-currency support | Most fleets are domestic — single currency per tenant sufficient |
| Nested expense subcategories | Over-categorization — flat categories with notes field is simpler |
| Predictive expense forecasting (ML) | Insufficient historical data — simple averages first |
| Inline editing for all fields | Complex fields need full form context — edit mode toggle sufficient |
| Auto-deletion of expired documents | DOT audits require historical records — use soft expiry instead |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FIN-01 | Phase 16 | Pending |
| FIN-02 | Phase 16 | Pending |
| FIN-03 | Phase 16 | Pending |
| FIN-04 | Phase 16 | Pending |
| FIN-05 | Phase 16 | Pending |
| FIN-06 | Phase 16 | Pending |
| FIN-07 | Phase 16 | Pending |
| FIN-08 | Phase 16 | Pending |
| FIN-09 | Phase 16 | Pending |
| FIN-10 | Phase 16 | Pending |
| RUX-01 | Phase 17 | Pending |
| RUX-02 | Phase 17 | Pending |
| RUX-03 | Phase 17 | Pending |
| DOC-01 | Phase 18 | Pending |
| DOC-02 | Phase 18 | Pending |
| DOC-03 | Phase 18 | Pending |
| DOC-04 | Phase 18 | Pending |
| DOC-05 | Phase 18 | Pending |

**Coverage:**
- v3.0 requirements: 18 total
- Mapped to phases: 18 (100% ✓)
- Unmapped: 0

**Phase breakdown:**
- Phase 16 (Route Finance Foundation): 10 requirements
- Phase 17 (Unified Route View/Edit Page): 3 requirements
- Phase 18 (Driver Document Uploads): 5 requirements

---
*Requirements defined: 2026-02-16*
*Last updated: 2026-02-16 after v3.0 roadmap creation*
