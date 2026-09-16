# quick-619 — Step 3: every findUnique / findUniqueOrThrow in the 15 files

Measured by `619-finduniq-census.ts` (a copy of 618's with the output path changed) plus a plain grep
for the calls the census does not score (exempt models, no-select shapes). **10 calls.**

| site | model | projection | receiver today | this task | quick-618 fix |
|---|---|---|---|---|---|
| `lib/onboarding/activation-tracker.ts:74` | ActivationProgress | **select omits tenantId** | bare + bypass | ROUTED | covered — **where is `{ tenantId }`, the unique key itself; not a shape 618's probe exercised, so proven in step 6** |
| `lib/onboarding/activation-tracker.ts:96` | ActivationProgress | **select omits tenantId** | bare + bypass | ROUTED | same |
| `server/services/workflows/notifications.ts:252` | StepInstance | **select `{ dueDate }`** | bare + bypass | ROUTED | covered — proven in step 6 |
| `server/services/workflows/notifications.ts:63` | User | **select omits tenantId** | bare + bypass | STOPPED (`getUserName`, no tenant) | NOT reached — stays LATENT; covered the day it is routed |
| `server/services/workflows/notifications.ts:50` | Tenant | select `{ name }` | bare + bypass | ROUTED | N/A — `Tenant` is in EXEMPT_MODELS, the extension passes it through untouched. Isolation is the explicit `where: { id: tenantId }` + `tenant_self_read USING (id = current_tenant_id())` |
| `server/services/workflows/notifications.ts:150` | StepInstance | include, no select | bare + bypass | STOPPED (`loadStepInstance`) | not a hazard |
| `server/services/workflows/notifications.ts:330` | PlaybookInstance | include, no select | bare + bypass | ROUTED | not a hazard — result carries tenantId |
| `server/services/workflows/notifications.ts:571` | PlaybookInstance | include, no select | bare + bypass | ROUTED | not a hazard |
| `lib/auth/supabase.ts:165` | User | no select | bare + bypass (array tx) | STOPPED (BOOTSTRAP) | not a hazard |
| `server/services/workflows/generatePlaybookInstance.ts:131` | PlaybookInstance | no select (`findUniqueOrThrow`) | ALREADY a tenant client | not a bypass statement | not a hazard |

**Every hazard this task makes LIVE (3) reaches the fixed extension.** None is left uncovered. The one
hazard not made live (`getUserName`) stays on the bare client and will be covered when routed.
