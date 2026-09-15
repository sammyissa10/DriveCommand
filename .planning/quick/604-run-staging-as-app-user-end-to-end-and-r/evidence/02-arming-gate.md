# quick-604 · 02 — the arming gate, and the red run that earned it

`apps/web/src/lib/db/tripwire-arm.ts` ships in the module `lib/db/prisma.ts`
imports, which **production runs**. This is the highest-risk artefact in the
task, so both directions are asserted and the assertion was witnessed failing
before it was accepted.

## The gate, in one sentence

> The tripwire arms only when the resolved connection string contains the
> STAGING project ref `wyixpgunnjmzguhggocz` **and** the environment variable
> `TENANT_CONTEXT_TRIPWIRE` is exactly `on`.

The ref match is the load-bearing half and it is **positive**. The env flag is
belt and braces, not the control. `PRODUCTION_REF` appears in the file only as a
second, independent refusal that is unreachable by default.

## The wiring

`prisma.ts` evaluates the gate **once at module scope**:

```ts
const ARM_TRIPWIRE = shouldArmTripwire(
  process.env.DATABASE_URL,
  process.env.TENANT_CONTEXT_TRIPWIRE,
);
```

and inside the existing `pool.on('connect')` handler, **after** the tenant-GUC
initialiser and never before it:

```ts
if (ARM_TRIPWIRE) {
  client
    .query("SELECT set_config('app.tenant_context_tripwire', 'on', false)")
    .catch((err) => { console.warn('[prisma] tripwire arm failed:', err?.message ?? err); });
}
```

Session scope (`false`) because Supavisor session mode holds the backend for the
connection's life. `.catch()` because an arm failure must never crash a request —
the same treatment the tenant-GUC init already has.

## The witnessed RED

`tripwire-arm.ts` was temporarily inverted to a NEGATIVE gate:

```ts
// DELIBERATE INVERSION (quick-604 witnessed-red probe) — a NEGATIVE gate.
if (connectionString.includes(PRODUCTION_REF)) return false;
void STAGING_REF;
```

`npx vitest run tests/security/tripwire-arming-gate.test.ts`, verbatim:

```
     ✓ staging string + flag "on" → true 1ms
     ✓ PRODUCTION string + flag "on" → false 0ms
     ✓ production string, flag unset → false 0ms
     ✓ staging string, flag unset → false 0ms
     ✓ staging string, flag "off" → false 0ms
     ✓ staging string, flag "ON" → false 0ms
     ✓ staging string, flag "1" → false 0ms
     ✓ staging string, flag "true" → false 0ms
     × UNRECOGNISED ref + flag "on" → false 4ms
     ✓ undefined connection string + flag "on" → false 0ms
     ✓ empty connection string + flag "on" → false 0ms
     ...
     × tripwire-arm.ts states the gate positively 5ms
 FAIL  tests/security/tripwire-arming-gate.test.ts > shouldArmTripwire — both directions > UNRECOGNISED ref + flag "on" → false
AssertionError: expected true to be false // Object.is equality
 FAIL  tests/security/tripwire-arming-gate.test.ts > prisma.ts wiring — source scan > tripwire-arm.ts states the gate positively
AssertionError: expected '/**\n * quick-604 — the unmigrated-pa…' to contain 'if (!connectionString.includes(STAGIN…'
 Test Files  1 failed (1)
      Tests  2 failed | 17 passed (19)
```

## A correction to the plan, recorded rather than reconciled

The plan says: *"temporarily invert the ref check to a negative gate, confirm the
**production-shaped** and unrecognised-ref cases fail"*.

**Only the unrecognised-ref case failed.** The production-shaped case still
returned `false` under the inversion — of course it did: a negative gate's whole
content is "refuse the production ref". That is precisely why a negative gate is
seductive and why the plan's own worked example is wrong about which row catches
it. **The row that catches it is `UNRECOGNISED ref + flag "on"`**, and that row
exists in the suite for no other reason.

## Green, after revert

```
 Test Files  1 passed (1)
      Tests  19 passed (19)
```

## tsc, probed

```
$ npx tsc --noEmit                       → exit 0, no output
$ (probe injected into tripwire-arm.ts)
src/lib/db/tripwire-arm.ts(79,7): error TS2322: Type 'string' is not assignable to type 'number'.
$ (probe deleted)
$ npx tsc --noEmit                       → exit 0, no output
```

The probe is a **semantic** TS2322 in a file this task actually edited, so the
clean run is evidence rather than the blind gate CLAUDE.md warns about.

`npx eslint` — **not run, and not claimed**. `apps/web` has no working lint
entry point (quick-562): `next lint` no longer accepts `--dir` on this Next
version and ESLint 9 finds no `eslint.config.js`.
