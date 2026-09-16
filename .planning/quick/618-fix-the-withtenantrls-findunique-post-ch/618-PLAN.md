# quick-618 — PLAN

**Fix the `withTenantRLS` `findUnique` post-check that discards a tenant's own rows, then route
the ten MOBILE_API statements quick-617 stopped because of it.**

---

## The defect, as inherited

`withTenantRLS` cannot add `tenantId` to a `findUnique` `where` — *so the extension's comment
claimed* — and instead post-checks the result:

```ts
const result = await query(args);
if (result && (result as any).tenantId !== tenantId) return null;
```

When the call site passes a top-level `select` that omits `tenantId`, `result.tenantId` is
`undefined`, `undefined !== tenantId` is **true**, and the row is discarded **for its own tenant**.
`findUniqueOrThrow` is worse: it raises `Tenant isolation violation` for a legitimate row.

quick-617 stopped 10 statements across 8 MOBILE_API files for this reason. Every one is followed by
`if (!x) return 404`, so routing them would have made eight live mobile routes permanently "not
found" — with a 404 that looks exactly like correct isolation.

---

## Target and preconditions

- **staging only** (`wyixpgunnjmzguhggocz`), as `app_user`, tripwire armed. Production is never
  written; it is opened read-only, for `pg_policies`, to prove policy parity.
- Run from the repo root. Install nothing.
- Capture the vitest baseline **from the working tree at task start** — not from quick-617's
  published figure, which quick-561/565/567 each showed to be measuring something else.

## Tasks

### T1 — Establish the true count
AST scan (`618-finduniq-census.ts`) of every `findUnique` / `findUniqueOrThrow` on a **non-exempt**
model, classifying the **top-level** projection: `NO_PROJECTION` · `SELECT_HAS_TENANTID` ·
`SELECT_OMITS_TENANTID` · `OMIT_STRIPS_TENANTID` · `UNRESOLVABLE`.

Two things quick-617's scanner could not see, both to be fixed and **counted** so the delta between
the instruments is a measurement:
1. it text-matched `tenantId` over the whole `select` initialiser, so a **nested** relation select
   masks a top-level omission — a false negative;
2. it never looked at `omit: { tenantId: true }`.

Report against the 10 + 24 already named, and **name anything prior tasks missed**.

### T2 — Separate live from latent
The post-check only runs on a client that came through `withTenantRLS`. Resolve each receiver
**per-identifier, never per-file** (quick-602's rule; quick-617 recorded the file-level version
reporting 28 and being wrong). Three classes, counted separately and never summed:
- **LIVE** — a `withTenantRLS` client today. A production defect independent of the migration.
- **LATENT** — bare client; becomes affected the moment it is routed.
- **N/A** — `getAdminDb`, which applies no tenant extension and never will.

### T3 — Choose the fix, state the trade-offs first
Decide between (a) forcing `tenantId` into the select and stripping it, (b) skipping the post-check
when the select omits it, or (c) something better. State what the choice does **when RLS is not in
force** — production's bare connection today.

### T4 — Build it
Whatever replaces the post-check must still refuse a genuine cross-tenant read.

### T5 — Prove both directions on staging as `app_user`
Both methods × three projections × own/cross × RLS-in-force / RLS-not-in-force. Every zero paired
with a **privileged counter-read** on a separate connection; a control asserting the bypass really
engages, so "RLS not in force" cannot silently become a second copy of "in force". Run the matrix
against **HEAD first** — a passing probe proves nothing about what was wrong.

### T6 — Route the ten deferred MOBILE_API statements
Commits capped at ~10 files or ~250 changed lines (quick-617 §9). Carry that task's three applier
guards: match the **annotation form**, assert the emitted line and no new literal `undefined`,
never overwrite a pinned artefact.

### T7 — Report the other live sites
Whether this fix closes them; if any remain, what they need.

## Limits

- No writes to production.
- No `tenantId` where clause removed.
- Nothing any call site returns on success changes, **including its result shape**.
- Step 6 touches MOBILE_API and no other surface.

## Gates

`tsc --noEmit` clean **and probed** (CLAUDE.md: if the only errors are syntax, or in files you did
not touch, the gate is blind) · `npm run build` exit 0 · vitest failing-file set unchanged against
the step-0 baseline · remainder reconciled against 108.
