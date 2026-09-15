# quick-613 — routed `AutomationRule` sites, both directions (BEFORE)

project `wyixpgunnjmzguhggocz` (staging) · ADMIN lane `app_admin` · TENANT lane `app_user` (tripwire `on`) · counter-reads as `postgres`

Every probe runs inside `BEGIN … ROLLBACK`. Fixtures are COMMITTED (the probes run on other connections) and torn down in a `finally`.

grants on `"AutomationRule"`: `app_user: DELETE` · `app_user: INSERT` · `app_user: SELECT` · `app_user: UPDATE`

pg_policy total = **186** · `bypass_rls_policy` = **86**
SYSTEM platform rules: **6** at entry, **6** at close
SYSTEM rule under test: `activation_celebration` (`394a8cc3-38b6-4843-8bae-7337e0c8594e`, isActive = true)
tenant A = `b5623cdd-dc19-4900-b75d-0ecfcaf191b8` · tenant B = `8c6136c4-eb7b-4a89-a524-d1d0e2c8d045`

## the matrix

| site | lane | expectation | probe | result | counter-read | paired own-read |
|---|---|---|---|---|---|---|
| 1 | ADMIN — app_admin, no GUC | must SUCCEED | every rule, and a run count spanning BOTH tenants | ERROR [42501] permission denied for table AutomationRule | — | — |
| 1 | TENANT — app_user, GUC = tenant A | must UNDER-READ | run count drops every run the GUC does not name | rules_visible = **7** · runs_counted = **1** | — | — |
| 1 | TENANT — app_user, GUC EMPTY (what a sysadmin request carries) | MEASURE | the GUC a sysadmin request actually carries | ERROR [TC001] tenant context is required: app.current_tenant_id is the EMPTY STRING | — | — |
| 2 | ADMIN — app_admin, no GUC | must SUCCEED | both runs and both tenant names | ERROR [42501] permission denied for table AutomationRule | — | — |
| 2 | TENANT — app_user, GUC = tenant A | must UNDER-READ | tenant B's run and its tenant name are invisible | runs_visible = **1** · tenant_names_visible = **1** | — | — |
| 2 | TENANT — app_user, GUC EMPTY (what a sysadmin request carries) | MEASURE | the GUC a sysadmin request actually carries | ERROR [TC001] tenant context is required: app.current_tenant_id is the EMPTY STRING | — | — |
| 3 | ADMIN — app_admin, no GUC | must be 42501 — NO GRANT YET | flip isActive on a platform rule | ERROR [42501] permission denied for table AutomationRule | the SYSTEM rule still carries its original isActive = **1** | — |
| 3 | TENANT — app_user, GUC = tenant A | must be REFUSED | post-612 this is a SILENT 0 rows, not a 42501 | 0 row(s) affected | the SYSTEM rule still carries its original isActive = **1** | — |
| 3 | TENANT — app_user, GUC EMPTY (what a sysadmin request carries) | MEASURE | the GUC a sysadmin request actually carries | ERROR [TC001] tenant context is required: app.current_tenant_id is the EMPTY STRING | the SYSTEM rule still carries its original isActive = **1** | — |
| 4 | ADMIN — app_admin, no GUC | must SUCCEED | reads tenant B, which the operator is not | n = **1** | — | — |
| 4 | TENANT — app_user, GUC = tenant A | must be REFUSED | tenant B is invisible — paired with an own > 0 | n = **0** | — | own tenant A still readable on the SAME connection = **1** |
| 4 | TENANT — app_user, GUC EMPTY (what a sysadmin request carries) | MEASURE | the GUC a sysadmin request actually carries | ERROR [TC001] tenant context is required: app.current_tenant_id is the EMPTY STRING | — | own tenant A still readable on the SAME connection → ERROR [TC001] |
| 5a | ADMIN — app_admin, no GUC | must SUCCEED | reads the platform rule | ERROR [42501] permission denied for table AutomationRule | — | — |
| 5a | TENANT — app_user, GUC = tenant A | HONEST FINDING — visible today | 612's SELECT half deliberately keeps the SYSTEM branch | n = **1** | — | — |
| 5a | TENANT — app_user, GUC EMPTY (what a sysadmin request carries) | MEASURE | the GUC a sysadmin request actually carries | ERROR [TC001] tenant context is required: app.current_tenant_id is the EMPTY STRING | — | — |
| 5b | ADMIN — app_admin, no GUC | must SUCCEED | reads tenant B's TENANT-scoped rule | ERROR [42501] permission denied for table AutomationRule | — | — |
| 5b | TENANT — app_user, GUC = tenant A | must be REFUSED | the structural cross-tenant case — paired with an own > 0 | n = **0** | — | own tenant A's rule still readable on the SAME connection = **1** |
| 5b | TENANT — app_user, GUC EMPTY (what a sysadmin request carries) | MEASURE | the GUC a sysadmin request actually carries | ERROR [TC001] tenant context is required: app.current_tenant_id is the EMPTY STRING | — | own tenant A's rule still readable on the SAME connection → ERROR [TC001] |

## the five sites

- **1** — getAutomationRules — findMany + _count.runs
- **2** — getRuleWithRuns — last 10 runs joined to Tenant.name
- **3** — toggleRuleActive — UPDATE a SYSTEM platform rule
- **4** — manualTriggerRule — tenant.findUnique (an ARBITRARY operator-supplied tenant)
- **5a** — manualTriggerRule — automationRule.findUnique, a SYSTEM rule
- **5b** — manualTriggerRule — automationRule.findUnique, another TENANT's rule

## live policies consulted by these statements

- **AutomationRule** [ALL] `bypass_rls_policy`
  - USING      : `(current_setting('app.bypass_rls'::text, true) = 'on'::text)`
  - WITH CHECK : `(none)`
- **AutomationRule** [DELETE] `automation_rule_delete_policy`
  - USING      : `("tenantId" = current_tenant_id())`
  - WITH CHECK : `(none)`
- **AutomationRule** [INSERT] `automation_rule_insert_policy`
  - USING      : `(none)`
  - WITH CHECK : `("tenantId" = current_tenant_id())`
- **AutomationRule** [SELECT] `tenant_isolation_policy`
  - USING      : `((scope = 'SYSTEM'::"AutomationScope") OR ("tenantId" = current_tenant_id()))`
  - WITH CHECK : `(none)`
- **AutomationRule** [UPDATE] `automation_rule_update_policy`
  - USING      : `("tenantId" = current_tenant_id())`
  - WITH CHECK : `("tenantId" = current_tenant_id())`
- **AutomationRun** [ALL] `bypass_rls_policy`
  - USING      : `(current_setting('app.bypass_rls'::text, true) = 'on'::text)`
  - WITH CHECK : `(none)`
- **AutomationRun** [ALL] `tenant_isolation_policy`
  - USING      : `("tenantId" = current_tenant_id())`
  - WITH CHECK : `("tenantId" = current_tenant_id())`
- **Tenant** [ALL] `bypass_rls_policy`
  - USING      : `(current_setting('app.bypass_rls'::text, true) = 'on'::text)`
  - WITH CHECK : `(none)`
- **Tenant** [INSERT] `tenant_bootstrap_insert`
  - USING      : `(none)`
  - WITH CHECK : `(id = current_tenant_id())`
- **Tenant** [SELECT] `tenant_self_read`
  - USING      : `(id = current_tenant_id())`
  - WITH CHECK : `(none)`
- **Tenant** [UPDATE] `tenant_self_update`
  - USING      : `(id = current_tenant_id())`
  - WITH CHECK : `(id = current_tenant_id())`
