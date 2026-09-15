# quick-602 — `03-tag-equivalence`

Generated 2026-09-15T05:09:48.369Z against staging (`wyixpgunnjmzguhggocz`).

```json
{
  "fixtures": {
    "tenantA": "4ee5d2e9-f8ad-4774-a98e-6af1a6c2c7e4",
    "tenantB": "5a112826-6750-43cc-8732-1bb98223415e",
    "tagA": "ed563bbf-9b8a-4af8-87dc-5a91fd8f44f1",
    "tagB": "f8a040d8-5230-4acd-9f8f-ea7814d5ce20",
    "tags": 2,
    "assignments": 2
  },
  "capturedBodies": {
    "Tag": {
      "using": "((\"tenantId\")::text = current_setting('app.current_tenant_id'::text, true))",
      "withCheck": null
    },
    "TagAssignment": {
      "using": "((\"tenantId\")::text = current_setting('app.current_tenant_id'::text, true))",
      "withCheck": null
    }
  },
  "before": {
    "before | Tag | tenant A (canonical lowercase)": {
      "select": "rows=1 {\"n\":1}",
      "insertOwn": "rows=1",
      "insertForeign": "42501"
    },
    "before | Tag | tenant B": {
      "select": "rows=1 {\"n\":0}",
      "insertOwn": "42501",
      "insertForeign": "rows=1"
    },
    "before | Tag | '' (the pool default)": {
      "select": "rows=1 {\"n\":0}",
      "insertOwn": "42501",
      "insertForeign": "42501"
    },
    "before | Tag | unset": {
      "select": "rows=1 {\"n\":0}",
      "insertOwn": "42501",
      "insertForeign": "42501"
    },
    "before | Tag | tenant A UPPERCASED": {
      "select": "rows=1 {\"n\":0}",
      "insertOwn": "42501",
      "insertForeign": "42501"
    },
    "before | Tag | 'not-a-uuid'": {
      "select": "rows=1 {\"n\":0}",
      "insertOwn": "42501",
      "insertForeign": "42501"
    },
    "before | TagAssignment | tenant A (canonical lowercase)": {
      "select": "rows=1 {\"n\":1}",
      "insertOwn": "rows=1",
      "insertForeign": "42501"
    },
    "before | TagAssignment | tenant B": {
      "select": "rows=1 {\"n\":0}",
      "insertOwn": "42501",
      "insertForeign": "rows=1"
    },
    "before | TagAssignment | '' (the pool default)": {
      "select": "rows=1 {\"n\":0}",
      "insertOwn": "42501",
      "insertForeign": "42501"
    },
    "before | TagAssignment | unset": {
      "select": "rows=1 {\"n\":0}",
      "insertOwn": "42501",
      "insertForeign": "42501"
    },
    "before | TagAssignment | tenant A UPPERCASED": {
      "select": "rows=1 {\"n\":0}",
      "insertOwn": "42501",
      "insertForeign": "42501"
    },
    "before | TagAssignment | 'not-a-uuid'": {
      "select": "rows=1 {\"n\":0}",
      "insertOwn": "42501",
      "insertForeign": "42501"
    }
  },
  "after": {
    "after | Tag | tenant A (canonical lowercase)": {
      "select": "rows=1 {\"n\":1}",
      "insertOwn": "rows=1",
      "insertForeign": "42501"
    },
    "after | Tag | tenant B": {
      "select": "rows=1 {\"n\":0}",
      "insertOwn": "42501",
      "insertForeign": "rows=1"
    },
    "after | Tag | '' (the pool default)": {
      "select": "rows=1 {\"n\":0}",
      "insertOwn": "42501",
      "insertForeign": "42501"
    },
    "after | Tag | unset": {
      "select": "rows=1 {\"n\":0}",
      "insertOwn": "42501",
      "insertForeign": "42501"
    },
    "after | Tag | tenant A UPPERCASED": {
      "select": "rows=1 {\"n\":1}",
      "insertOwn": "rows=1",
      "insertForeign": "42501"
    },
    "after | Tag | 'not-a-uuid'": {
      "select": "22P02",
      "insertOwn": "22P02",
      "insertForeign": "22P02"
    },
    "after | TagAssignment | tenant A (canonical lowercase)": {
      "select": "rows=1 {\"n\":1}",
      "insertOwn": "rows=1",
      "insertForeign": "42501"
    },
    "after | TagAssignment | tenant B": {
      "select": "rows=1 {\"n\":0}",
      "insertOwn": "42501",
      "insertForeign": "rows=1"
    },
    "after | TagAssignment | '' (the pool default)": {
      "select": "rows=1 {\"n\":0}",
      "insertOwn": "42501",
      "insertForeign": "42501"
    },
    "after | TagAssignment | unset": {
      "select": "rows=1 {\"n\":0}",
      "insertOwn": "42501",
      "insertForeign": "42501"
    },
    "after | TagAssignment | tenant A UPPERCASED": {
      "select": "rows=1 {\"n\":1}",
      "insertOwn": "rows=1",
      "insertForeign": "42501"
    },
    "after | TagAssignment | 'not-a-uuid'": {
      "select": "22P02",
      "insertOwn": "22P02",
      "insertForeign": "22P02"
    }
  },
  "restoredBodies": {
    "Tag": "((\"tenantId\")::text = current_setting('app.current_tenant_id'::text, true))",
    "TagAssignment": "((\"tenantId\")::text = current_setting('app.current_tenant_id'::text, true))"
  },
  "restoredByteEqual": true
}
```

| direction | probe | result |
|---|---|---|
| observation | before \| Tag \| tenant A (canonical lowercase) \| SELECT tenant A rows | OK — rows=1 {"n":1} |
| legitimate | before \| Tag \| tenant A (canonical lowercase) \| INSERT own tenant (A) | OK — rows=1 |
| cross-tenant | before \| Tag \| tenant A (canonical lowercase) \| INSERT foreign tenant (B) | `42501` new row violates row-level security policy for table "Tag" |
| observation | before \| Tag \| tenant B \| SELECT tenant A rows | OK — rows=1 {"n":0} |
| legitimate | before \| Tag \| tenant B \| INSERT own tenant (A) | `42501` new row violates row-level security policy for table "Tag" |
| cross-tenant | before \| Tag \| tenant B \| INSERT foreign tenant (B) | OK — rows=1 |
| observation | before \| Tag \| '' (the pool default) \| SELECT tenant A rows | OK — rows=1 {"n":0} |
| legitimate | before \| Tag \| '' (the pool default) \| INSERT own tenant (A) | `42501` new row violates row-level security policy for table "Tag" |
| cross-tenant | before \| Tag \| '' (the pool default) \| INSERT foreign tenant (B) | `42501` new row violates row-level security policy for table "Tag" |
| observation | before \| Tag \| unset \| SELECT tenant A rows | OK — rows=1 {"n":0} |
| legitimate | before \| Tag \| unset \| INSERT own tenant (A) | `42501` new row violates row-level security policy for table "Tag" |
| cross-tenant | before \| Tag \| unset \| INSERT foreign tenant (B) | `42501` new row violates row-level security policy for table "Tag" |
| observation | before \| Tag \| tenant A UPPERCASED \| SELECT tenant A rows | OK — rows=1 {"n":0} |
| legitimate | before \| Tag \| tenant A UPPERCASED \| INSERT own tenant (A) | `42501` new row violates row-level security policy for table "Tag" |
| cross-tenant | before \| Tag \| tenant A UPPERCASED \| INSERT foreign tenant (B) | `42501` new row violates row-level security policy for table "Tag" |
| observation | before \| Tag \| 'not-a-uuid' \| SELECT tenant A rows | OK — rows=1 {"n":0} |
| legitimate | before \| Tag \| 'not-a-uuid' \| INSERT own tenant (A) | `42501` new row violates row-level security policy for table "Tag" |
| cross-tenant | before \| Tag \| 'not-a-uuid' \| INSERT foreign tenant (B) | `42501` new row violates row-level security policy for table "Tag" |
| observation | before \| TagAssignment \| tenant A (canonical lowercase) \| SELECT tenant A rows | OK — rows=1 {"n":1} |
| legitimate | before \| TagAssignment \| tenant A (canonical lowercase) \| INSERT own tenant (A) | OK — rows=1 |
| cross-tenant | before \| TagAssignment \| tenant A (canonical lowercase) \| INSERT foreign tenant (B) | `42501` new row violates row-level security policy for table "TagAssignment" |
| observation | before \| TagAssignment \| tenant B \| SELECT tenant A rows | OK — rows=1 {"n":0} |
| legitimate | before \| TagAssignment \| tenant B \| INSERT own tenant (A) | `42501` new row violates row-level security policy for table "TagAssignment" |
| cross-tenant | before \| TagAssignment \| tenant B \| INSERT foreign tenant (B) | OK — rows=1 |
| observation | before \| TagAssignment \| '' (the pool default) \| SELECT tenant A rows | OK — rows=1 {"n":0} |
| legitimate | before \| TagAssignment \| '' (the pool default) \| INSERT own tenant (A) | `42501` new row violates row-level security policy for table "TagAssignment" |
| cross-tenant | before \| TagAssignment \| '' (the pool default) \| INSERT foreign tenant (B) | `42501` new row violates row-level security policy for table "TagAssignment" |
| observation | before \| TagAssignment \| unset \| SELECT tenant A rows | OK — rows=1 {"n":0} |
| legitimate | before \| TagAssignment \| unset \| INSERT own tenant (A) | `42501` new row violates row-level security policy for table "TagAssignment" |
| cross-tenant | before \| TagAssignment \| unset \| INSERT foreign tenant (B) | `42501` new row violates row-level security policy for table "TagAssignment" |
| observation | before \| TagAssignment \| tenant A UPPERCASED \| SELECT tenant A rows | OK — rows=1 {"n":0} |
| legitimate | before \| TagAssignment \| tenant A UPPERCASED \| INSERT own tenant (A) | `42501` new row violates row-level security policy for table "TagAssignment" |
| cross-tenant | before \| TagAssignment \| tenant A UPPERCASED \| INSERT foreign tenant (B) | `42501` new row violates row-level security policy for table "TagAssignment" |
| observation | before \| TagAssignment \| 'not-a-uuid' \| SELECT tenant A rows | OK — rows=1 {"n":0} |
| legitimate | before \| TagAssignment \| 'not-a-uuid' \| INSERT own tenant (A) | `42501` new row violates row-level security policy for table "TagAssignment" |
| cross-tenant | before \| TagAssignment \| 'not-a-uuid' \| INSERT foreign tenant (B) | `42501` new row violates row-level security policy for table "TagAssignment" |
| observation | after \| Tag \| tenant A (canonical lowercase) \| SELECT tenant A rows | OK — rows=1 {"n":1} |
| legitimate | after \| Tag \| tenant A (canonical lowercase) \| INSERT own tenant (A) | OK — rows=1 |
| cross-tenant | after \| Tag \| tenant A (canonical lowercase) \| INSERT foreign tenant (B) | `42501` new row violates row-level security policy for table "Tag" |
| observation | after \| Tag \| tenant B \| SELECT tenant A rows | OK — rows=1 {"n":0} |
| legitimate | after \| Tag \| tenant B \| INSERT own tenant (A) | `42501` new row violates row-level security policy for table "Tag" |
| cross-tenant | after \| Tag \| tenant B \| INSERT foreign tenant (B) | OK — rows=1 |
| observation | after \| Tag \| '' (the pool default) \| SELECT tenant A rows | OK — rows=1 {"n":0} |
| legitimate | after \| Tag \| '' (the pool default) \| INSERT own tenant (A) | `42501` new row violates row-level security policy for table "Tag" |
| cross-tenant | after \| Tag \| '' (the pool default) \| INSERT foreign tenant (B) | `42501` new row violates row-level security policy for table "Tag" |
| observation | after \| Tag \| unset \| SELECT tenant A rows | OK — rows=1 {"n":0} |
| legitimate | after \| Tag \| unset \| INSERT own tenant (A) | `42501` new row violates row-level security policy for table "Tag" |
| cross-tenant | after \| Tag \| unset \| INSERT foreign tenant (B) | `42501` new row violates row-level security policy for table "Tag" |
| observation | after \| Tag \| tenant A UPPERCASED \| SELECT tenant A rows | OK — rows=1 {"n":1} |
| legitimate | after \| Tag \| tenant A UPPERCASED \| INSERT own tenant (A) | OK — rows=1 |
| cross-tenant | after \| Tag \| tenant A UPPERCASED \| INSERT foreign tenant (B) | `42501` new row violates row-level security policy for table "Tag" |
| observation | after \| Tag \| 'not-a-uuid' \| SELECT tenant A rows | `22P02` invalid input syntax for type uuid: "not-a-uuid" |
| legitimate | after \| Tag \| 'not-a-uuid' \| INSERT own tenant (A) | `22P02` invalid input syntax for type uuid: "not-a-uuid" |
| cross-tenant | after \| Tag \| 'not-a-uuid' \| INSERT foreign tenant (B) | `22P02` invalid input syntax for type uuid: "not-a-uuid" |
| observation | after \| TagAssignment \| tenant A (canonical lowercase) \| SELECT tenant A rows | OK — rows=1 {"n":1} |
| legitimate | after \| TagAssignment \| tenant A (canonical lowercase) \| INSERT own tenant (A) | OK — rows=1 |
| cross-tenant | after \| TagAssignment \| tenant A (canonical lowercase) \| INSERT foreign tenant (B) | `42501` new row violates row-level security policy for table "TagAssignment" |
| observation | after \| TagAssignment \| tenant B \| SELECT tenant A rows | OK — rows=1 {"n":0} |
| legitimate | after \| TagAssignment \| tenant B \| INSERT own tenant (A) | `42501` new row violates row-level security policy for table "TagAssignment" |
| cross-tenant | after \| TagAssignment \| tenant B \| INSERT foreign tenant (B) | OK — rows=1 |
| observation | after \| TagAssignment \| '' (the pool default) \| SELECT tenant A rows | OK — rows=1 {"n":0} |
| legitimate | after \| TagAssignment \| '' (the pool default) \| INSERT own tenant (A) | `42501` new row violates row-level security policy for table "TagAssignment" |
| cross-tenant | after \| TagAssignment \| '' (the pool default) \| INSERT foreign tenant (B) | `42501` new row violates row-level security policy for table "TagAssignment" |
| observation | after \| TagAssignment \| unset \| SELECT tenant A rows | OK — rows=1 {"n":0} |
| legitimate | after \| TagAssignment \| unset \| INSERT own tenant (A) | `42501` new row violates row-level security policy for table "TagAssignment" |
| cross-tenant | after \| TagAssignment \| unset \| INSERT foreign tenant (B) | `42501` new row violates row-level security policy for table "TagAssignment" |
| observation | after \| TagAssignment \| tenant A UPPERCASED \| SELECT tenant A rows | OK — rows=1 {"n":1} |
| legitimate | after \| TagAssignment \| tenant A UPPERCASED \| INSERT own tenant (A) | OK — rows=1 |
| cross-tenant | after \| TagAssignment \| tenant A UPPERCASED \| INSERT foreign tenant (B) | `42501` new row violates row-level security policy for table "TagAssignment" |
| observation | after \| TagAssignment \| 'not-a-uuid' \| SELECT tenant A rows | `22P02` invalid input syntax for type uuid: "not-a-uuid" |
| legitimate | after \| TagAssignment \| 'not-a-uuid' \| INSERT own tenant (A) | `22P02` invalid input syntax for type uuid: "not-a-uuid" |
| cross-tenant | after \| TagAssignment \| 'not-a-uuid' \| INSERT foreign tenant (B) | `22P02` invalid input syntax for type uuid: "not-a-uuid" |

---

## Narrative (appended by hand after the final `--tag-equivalence` run)

Fixtures are mandatory here: both tables hold **0 rows** on staging (`01-baseline`), so a matrix
without them would be the "every assertion passed, nothing was tested" shape. `--setup` creates two
`RLS602` tenants, one `Tag` each and one `TagAssignment` each, as `postgres`; `--teardown` was
demonstrated (deleted 2 tenants, 0 leftovers of each kind) and the fixtures were then re-seeded.

Method: the live bodies are captured from `pg_get_expr`, the policy is `DROP`/`CREATE`d **under the
same name** with the proposed body, the matrix is re-run, and the captured body is restored in a
`finally` with **byte-equality asserted** (`restoredByteEqual: true`, and the restored text is quoted
in the JSON above).

### The matrix — 2 tables × 6 GUC values × (SELECT, INSERT own tenant A, INSERT foreign tenant B)

`SELECT` counts rows of tenant A. `before` = live text-to-text policy. `after` = proposed
`("tenantId" = current_tenant_id())`.

| GUC value | table | SELECT before → after | INSERT own before → after | INSERT foreign before → after | verdict |
|---|---|---|---|---|---|
| tenant A (canonical lowercase) | Tag | 1 → 1 | ok → ok | 42501 → 42501 | **identical** |
| tenant A (canonical lowercase) | TagAssignment | 1 → 1 | ok → ok | 42501 → 42501 | **identical** |
| tenant B | Tag | 0 → 0 | 42501 → 42501 | ok → ok | **identical** |
| tenant B | TagAssignment | 0 → 0 | 42501 → 42501 | ok → ok | **identical** |
| `''` (the pool default) | Tag | 0 → 0 | 42501 → 42501 | 42501 → 42501 | **identical** |
| `''` (the pool default) | TagAssignment | 0 → 0 | 42501 → 42501 | 42501 → 42501 | **identical** |
| unset (observed as `''`, see `02-mechanism` §4) | Tag | 0 → 0 | 42501 → 42501 | 42501 → 42501 | **identical** |
| unset (observed as `''`) | TagAssignment | 0 → 0 | 42501 → 42501 | 42501 → 42501 | **identical** |
| **tenant A UPPERCASED** | Tag | **0 → 1** | **42501 → ok** | 42501 → 42501 | **WIDENING** |
| **tenant A UPPERCASED** | TagAssignment | **0 → 1** | **42501 → ok** | 42501 → 42501 | **WIDENING** |
| **`'not-a-uuid'`** | Tag | **0 → `22P02`** | **42501 → `22P02`** | **42501 → `22P02`** | **BEHAVIOUR CHANGE** |
| **`'not-a-uuid'`** | TagAssignment | **0 → `22P02`** | **42501 → `22P02`** | **42501 → `22P02`** | **BEHAVIOUR CHANGE** |

Ten of the twelve rows are identical in all three columns. The two that are not are exactly the two
the plan predicted, and both are now measured rather than assumed:

1. **Non-canonical (uppercase) uuid widens.** Text comparison rejects `4EE5…` against a stored
   `4ee5…`; uuid equality accepts it. Arguably a fix — these are the same uuid — but it is a change
   and it is named. No application path writes an uppercase uuid into the GUC
   (`tenant-context.ts` passes the value straight from Prisma, which returns canonical lowercase).
2. **Non-uuid garbage raises `22P02` instead of filtering.** This is the same class quick-597 removed
   from `audit_log`, and it puts `Tag`/`TagAssignment` on exactly the footing the other 91 policies
   have had all along: `current_tenant_id()` casts, so a junk GUC has always been a `22P02` there.
   It is a louder failure for an input no code path produces, not a new way to leak a row.

**The write door moved with the read door**, which is why the INSERT columns are here: both policies
are `FOR ALL` with `WITH CHECK` undeclared, so Postgres derives the check from `USING`. The migration
keeps `WITH CHECK` undeclared for exactly that reason — declaring one would be a second change
smuggled in beside the one being measured.
