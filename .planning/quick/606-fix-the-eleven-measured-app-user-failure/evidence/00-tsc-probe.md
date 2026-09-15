# quick-606 — the tsc probe (R8), Task 1

`npx tsc --noEmit` in `apps/web` exits 0. A clean run whose gate was never probed is not evidence
(CLAUDE.md), so a semantic error was injected into a file THIS TASK EDITED and confirmed reported at
the injected line.

Injected at the end of `apps/web/scripts/audit/604-survey.ts`:

```ts
const __probe606: number = 'y';
```

Reported:

```
scripts/audit/604-survey.ts(566,7): error TS2322: Type 'string' is not assignable to type 'number'.
```

Probe deleted, re-run clean (exit 0). `git status` confirms no probe survives.
