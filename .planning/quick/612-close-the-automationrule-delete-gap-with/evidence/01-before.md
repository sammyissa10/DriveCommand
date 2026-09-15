# quick-612 — AutomationRule policy matrix (BEFORE)

project `wyixpgunnjmzguhggocz` · probes as `app_user` · GUC = tenant A · every probe inside BEGIN…ROLLBACK

pg_policy total = **183** · bypass_rls_policy = **86**
SYSTEM rows: 6 at open, 6 at close

## live policies on "AutomationRule"

- **[ALL] bypass_rls_policy** (PERMISSIVE)
  - USING      : `(current_setting('app.bypass_rls'::text, true) = 'on'::text)`
  - WITH CHECK : `(none)`
- **[ALL] tenant_isolation_policy** (PERMISSIVE)
  - USING      : `((scope = 'SYSTEM'::"AutomationScope") OR ("tenantId" = current_tenant_id()))`
  - WITH CHECK : `("tenantId" = current_tenant_id())`

## the matrix

| # | cmd | direction | probe | result | counter-read |
|---|---|---|---|---|---|
| S1 | SELECT | must SUCCEED | tenant reads the 6 SYSTEM platform rules | **6** row(s) visible | — |
| S2 | SELECT | must SUCCEED | tenant reads its OWN rule | **1** row(s) visible | — |
| S3 | SELECT | must be REFUSED | tenant B's rules are invisible to tenant A | **0** row(s) visible | — |
| I1 | INSERT | must SUCCEED | INSERT naming OWN tenant | 1 row(s) affected | — |
| I2 | INSERT | must be REFUSED | INSERT naming ANOTHER tenant (cross-tenant) | ERROR [42501] new row violates row-level security policy for table "AutomationRule" | — |
| I3 | INSERT | must be REFUSED | INSERT a new SYSTEM rule (tenantId NULL) | ERROR [42501] new row violates row-level security policy for table "AutomationRule" | — |
| U1 | UPDATE | must SUCCEED | UPDATE own rule | 1 row(s) affected | — |
| U2 | UPDATE | must be REFUSED | UPDATE a SYSTEM rule (touch a non-tenantId column) | ERROR [42501] new row violates row-level security policy for table "AutomationRule" | SYSTEM rows still present = **6** |
| U3 | UPDATE | must be REFUSED | CAPTURE: UPDATE SYSTEM rules SET tenantId = own | 6 row(s) affected | SYSTEM rows STILL scope=SYSTEM with tenantId NULL = **6** |
| U4 | UPDATE | must be REFUSED | UPDATE another tenant's rule | 0 row(s) affected | — |
| D1 | DELETE | must SUCCEED | DELETE own rule | 1 row(s) affected | own rule still present (probe was rolled back) = **1** |
| D2 | DELETE | must be REFUSED | DELETE the 6 SYSTEM platform rules | 6 row(s) affected | SYSTEM rows still present = **6** |
| D3 | DELETE | must be REFUSED | DELETE another tenant's rules | 0 row(s) affected | — |
