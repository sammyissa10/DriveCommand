---
phase: quick-503
plan: 503
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/dispatch/driver-readiness-label.ts
  - apps/web/src/lib/dispatch/driver-readiness-label.test.ts
  - apps/web/src/components/carrier/dispatches/NewDispatchForm.tsx
  - apps/web/src/app/(owner)/carrier/trips/new/NewTripMobile.tsx
autonomous: true

must_haves:
  truths:
    - "A driver with no onboarding PlaybookInstance shows an AMBER 'Onboarding not started' indicator (not green) in the Create Dispatch / New Trip form"
    - "A driver with open blocker steps shows AMBER/red 'Onboarding incomplete' listing blockerStepNames and linking to the open checklist"
    - "A driver who is ready with no warning shows GREEN 'Dispatch Ready'"
    - "The client preflight opens the block modal for a NO_ONBOARDING_INSTANCE driver BEFORE the network round-trip (client agrees with server 409)"
    - "The block modal names the real problem (not started vs incomplete steps) and offers a fix link (/checklists or the instance), keeping Cancel and the admin Override path intact"
    - "The pure driverReadinessLabel helper is unit-tested for all three states"
  artifacts:
    - path: "apps/web/src/lib/dispatch/driver-readiness-label.ts"
      provides: "Pure helper mapping readiness object to {tone,title,detail?,href?}"
      exports: ["driverReadinessLabel"]
    - path: "apps/web/src/lib/dispatch/driver-readiness-label.test.ts"
      provides: "Vitest covering ready / not_started / incomplete-with-blockers-and-href"
    - path: "apps/web/src/components/carrier/dispatches/NewDispatchForm.tsx"
      provides: "3-state desktop readiness chip + consistent preflight + actionable block modal"
    - path: "apps/web/src/app/(owner)/carrier/trips/new/NewTripMobile.tsx"
      provides: "Mobile parity 3-state chip + consistent preflight + block sheet copy using ds warning token"
  key_links:
    - from: "NewDispatchForm.tsx"
      to: "driver-readiness-label.ts"
      via: "driverReadinessLabel(driverReadiness)"
      pattern: "driverReadinessLabel"
    - from: "NewTripMobile.tsx"
      to: "driver-readiness-label.ts"
      via: "driverReadinessLabel(driverReadiness)"
      pattern: "driverReadinessLabel"
---

<objective>
The Create Dispatch readiness chip and the server dispatch gate disagree. For a driver with NO onboarding PlaybookInstance, `getDriverReadiness` returns `{ isReady: true, warning: 'NO_ONBOARDING_INSTANCE' }` (deliberate quick-497 behavior), so the chip shows green "Dispatch Ready" — but the server `createTrip` gate reads the stale `User.isDispatchReady` column (false) and returns 409, opening a vague modal. This surfaces the real state client-side.

Make the readiness indicator 3-state (ready / not started / incomplete), make the client preflight agree with the server gate earlier, and give the block modal accurate copy plus an actionable fix link — without touching any resolver, gate, or schema.

Purpose: Stop confusing users; the chip must tell the truth and the block must be actionable.
Output: A pure tested helper + updated desktop and mobile create-trip surfaces.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
Root cause is already diagnosed — do NOT re-diagnose. Anchors below are VERIFIED against current source.

**Verified data shape** (from `trpc.workflows.instance.getDriverReadiness`):
`{ isReady: boolean; blockerStepNames: string[]; openInstanceId: string | null; userId: string | null; warning?: 'NO_ONBOARDING_INSTANCE' }`

**Desktop `apps/web/src/components/carrier/dispatches/NewDispatchForm.tsx`** (VERIFIED):
- L130-133: `getDriverReadiness` query. L135: `const isDispatchReady = driverReadiness?.isReady ?? true;`
- L228: preflight `if (primaryDriverId && !isDispatchReady) { setBlockModalOpen(true); return; }`
- L201: defensive 409 handler `DRIVER_NOT_DISPATCH_READY` -> `setBlockModalOpen(true)` — KEEP AS-IS.
- L236 `handleOverrideSubmit` (OWNER/MANAGER + overrideReason). `ADMIN_ROLES` at L86. `isAdmin` at L113.
- L318-342: readiness chip (green CheckCircle2 / red XCircle). L463: modal title "This driver has incomplete required steps". Modal L458-540 already has blockerStepNames list + a "View Checklist" button (L506-516) + Override.
- Amber pattern already in the codebase (quick-499): `bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800` with amber text.

**Mobile `apps/web/src/app/(owner)/carrier/trips/new/NewTripMobile.tsx`** (VERIFIED — mirrors desktop):
- L105-107 query. L109 `const isDispatchReady = driverReadiness?.isReady ?? true;`
- L239 preflight (same shape). L248 override entityId.
- L353-371: chip using ds tokens `text-ds-success` / `text-ds-danger`.
- L402-469: block `SheetContainer` title "Driver not ready", body L406 "This driver has incomplete required steps.", blockerStepNames list, View checklist (L447), Override (L460).
- ds warning token confirmed available: `text-ds-warning` / `bg-ds-warning` (used in DashboardMobile.tsx, DriverDetailMobile.tsx).

**Vitest** (VERIFIED `apps/web/vitest.config.ts`): include globs already cover co-located `src/**/*.test.ts`; environment `node`; `@` alias -> `src`.

**Hard constraints:**
- Do NOT modify: `getDriverReadiness` resolver / `instance.ts`, `computeDispatchReadiness.ts`, `trips.ts` gate/override, `schema.prisma`, or anything from tasks 498-502.
- Reuse existing amber pattern (desktop) / `ds-warning` token (mobile). Do NOT invent new visual design.
- No emoji. Plain hyphen "-" in all copy.
- Executor MUST run `next build` from `apps/web` (tsc alone is NOT sufficient). tsc baseline ~35 pre-existing errors — only regressions in touched files or a build failure count.
- Commit atomically. Do NOT push. Do NOT run vercel.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract pure driverReadinessLabel helper + Vitest</name>
  <files>apps/web/src/lib/dispatch/driver-readiness-label.ts, apps/web/src/lib/dispatch/driver-readiness-label.test.ts</files>
  <action>
Create `apps/web/src/lib/dispatch/driver-readiness-label.ts` — a pure, framework-free module (no React, no trpc imports). Define a minimal input interface so the helper is decoupled from trpc types:

```ts
export interface DriverReadinessInput {
  isReady: boolean;
  blockerStepNames: string[];
  openInstanceId: string | null;
  userId: string | null;
  warning?: 'NO_ONBOARDING_INSTANCE';
}

export interface DriverReadinessLabel {
  tone: 'ready' | 'not_started' | 'incomplete';
  title: string;
  detail?: string;
  href?: string;
}

export function driverReadinessLabel(r: DriverReadinessInput): DriverReadinessLabel { ... }
```

Mapping (ORDER MATTERS — check warning FIRST because NO_ONBOARDING_INSTANCE has isReady:true):
1. `r.warning === 'NO_ONBOARDING_INSTANCE'` -> `{ tone: 'not_started', title: 'Onboarding not started', href: '/checklists' }`
2. `!r.isReady` -> `{ tone: 'incomplete', title: 'Onboarding incomplete', detail: r.blockerStepNames.join(', ') || undefined, href: r.openInstanceId ? \`/checklists/instances/${r.openInstanceId}\` : undefined }`
3. else -> `{ tone: 'ready', title: 'Dispatch Ready' }`

Also export a tiny convenience predicate for the preflight so both surfaces share it:
`export function canDispatchClientSide(r: DriverReadinessInput | undefined | null): boolean { return r ? (r.isReady && r.warning !== 'NO_ONBOARDING_INSTANCE') : true; }`

No emoji; plain hyphen in any copy. Keep it small — do not over-engineer.

Create co-located `driver-readiness-label.test.ts` with Vitest asserting the three states:
- ready: `{isReady:true, blockerStepNames:[], openInstanceId:null, userId:'u1'}` -> tone 'ready', title 'Dispatch Ready', no href.
- not_started: `{isReady:true, warning:'NO_ONBOARDING_INSTANCE', blockerStepNames:[], openInstanceId:null, userId:'u1'}` -> tone 'not_started', title 'Onboarding not started', href '/checklists'.
- incomplete-with-blockers-and-href: `{isReady:false, blockerStepNames:['CDL Upload','Drug Test'], openInstanceId:'inst-9', userId:'u1'}` -> tone 'incomplete', detail 'CDL Upload, Drug Test', href '/checklists/instances/inst-9'.
- (optional 4th) incomplete with null openInstanceId -> href undefined.
Also assert `canDispatchClientSide` returns false for the not_started case and true for a clean ready case.
  </action>
  <verify>cd apps/web && npx vitest run src/lib/dispatch/driver-readiness-label.test.ts — all assertions pass.</verify>
  <done>Pure helper exists with the three tones + canDispatchClientSide predicate; Vitest passes covering ready / not_started / incomplete(+href).</done>
</task>

<task type="auto">
  <name>Task 2: Desktop NewDispatchForm 3-state chip + consistent preflight + actionable modal</name>
  <files>apps/web/src/components/carrier/dispatches/NewDispatchForm.tsx</files>
  <action>
Import `{ driverReadinessLabel, canDispatchClientSide }` from `@/lib/dispatch/driver-readiness-label`.

(a) Preflight consistency (~L228): replace the `!isDispatchReady` branch condition with `!canDispatchClientSide(driverReadiness)` so a NO_ONBOARDING_INSTANCE driver opens the block modal client-side. Keep `isDispatchReady` (L135) if still referenced elsewhere, or compute `const label = driverReadiness ? driverReadinessLabel(driverReadiness) : null;`. Do NOT touch the L201 defensive 409 handler.

(b) 3-state chip (replace L318-342 block). When `primaryDriverId && driverReadiness`, render from `label.tone`:
- `ready` -> existing GREEN style: `text-green-700 dark:text-green-400`, `CheckCircle2`, text = label.title.
- `not_started` -> AMBER inline block using the quick-499 pattern: wrap in `bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800` rounded box, amber text (`text-amber-700 dark:text-amber-300`), `AlertTriangle` icon, label.title, plus a link `<a href="/checklists" className="underline font-medium">Start onboarding</a>`.
- `incomplete` -> AMBER/red box (reuse amber pattern or destructive text — match tone; use `XCircle`), label.title, `label.detail` (comma-joined blocker names) on a second line, and when `label.href` is set a link "View checklist" to `label.href`.
Import `AlertTriangle` (already imported) and any needed icons. No emoji.

(c) Block modal accurate copy + action (L458-540). Drive title/body from the selected driver's readiness:
- If `label?.tone === 'not_started'`: DialogTitle -> "This driver hasn't started onboarding"; body text -> "Onboarding must be completed - or overridden by an admin - before this driver can be dispatched."; add a link/button "Start onboarding" -> `/checklists` (mirror the existing View Checklist button style; navigate via `window.location.href='/checklists'`). Do NOT render the blockerStepNames list in this case (there are none).
- Else (`tone === 'incomplete'`): DialogTitle -> "This driver has incomplete onboarding steps"; keep the existing blockerStepNames list; keep the existing "View Checklist" button (uses `driverReadiness.openInstanceId`).
Keep Cancel; keep the admin Override flow (isAdmin + overrideReason + handleOverrideSubmit) exactly as-is. Plain hyphen, no emoji.
  </action>
  <verify>cd apps/web && npx tsc --noEmit 2>&1 | grep -i "NewDispatchForm" — no new errors in this file. Grep confirms: amber "Onboarding not started" branch present, preflight uses canDispatchClientSide, modal title switches on tone, Override + Cancel intact.</verify>
  <done>Desktop chip renders green only when ready&&no-warning; amber "Onboarding not started" with a /checklists link for NO_ONBOARDING_INSTANCE; amber "Onboarding incomplete" listing blockers + instance link otherwise; preflight opens modal client-side for the not_started case; modal names the real problem and offers a fix link; Override for OWNER/MANAGER intact.</done>
</task>

<task type="auto">
  <name>Task 3: Mobile NewTripMobile parity + full build/test verification</name>
  <files>apps/web/src/app/(owner)/carrier/trips/new/NewTripMobile.tsx</files>
  <action>
Apply the SAME 3-state indicator using the shared helper and mobile ds tokens.

Import `{ driverReadinessLabel, canDispatchClientSide }` from `@/lib/dispatch/driver-readiness-label`. Compute `const label = driverReadiness ? driverReadinessLabel(driverReadiness) : null;`.

(a) Preflight (~L239): change condition to `!canDispatchClientSide(driverReadiness)`.

(b) Chip (L353-371): switch on `label.tone`:
- `ready` -> existing `text-ds-success` + `CheckCircle2` + label.title.
- `not_started` -> `text-ds-warning` row (use `AlertTriangle`), label.title "Onboarding not started", plus a tappable "Start onboarding" that navigates to `/checklists` (button/anchor consistent with the file's existing link style, e.g. `window.location.href='/checklists'`). Use the ds warning token, not amber-50 (mobile uses `text-ds-warning` / `bg-ds-warning`).
- `incomplete` -> `text-ds-danger` (or `text-ds-warning`) `XCircle` + label.title + label.detail; the existing "View checklist" button already links to the instance — keep it.

(c) Block sheet (L402-469): drive title/body from `label.tone`:
- `not_started` -> SheetContainer title "Driver has not started onboarding"; body "Onboarding must be completed - or overridden by an admin - before this driver can be dispatched."; add a "Start onboarding" button (ds card style like the existing View checklist button) -> `/checklists`. Do not render the empty blocker list.
- else -> title "Driver not ready" / body "This driver has incomplete onboarding steps." + existing blocker list + View checklist.
Keep Cancel + admin Override intact. ds warning token for the not_started tone. No emoji; plain hyphen.

If a `NewTripFormClient.tsx` desktop variant in the same folder ALSO renders a readiness chip from getDriverReadiness, it is out of scope for this task's file list — note it in the summary but do NOT expand scope (the desktop surface is NewDispatchForm.tsx per requirements). Grep confirmed NewTripFormClient has no getDriverReadiness usage, so no action needed there.

FINAL VERIFICATION (run all):
1. `cd apps/web && npx vitest run src/lib/dispatch/driver-readiness-label.test.ts` — passes.
2. `cd apps/web && npm run build` (next build) — completes without a build failure; no NEW tsc errors in the 3 touched files.
  </action>
  <verify>next build passes from apps/web; vitest for the helper passes; grep shows NewTripMobile uses driverReadinessLabel + canDispatchClientSide and a text-ds-warning "Onboarding not started" branch.</verify>
  <done>Mobile create-trip surface mirrors the desktop 3-state behavior with ds warning tokens; preflight agrees with server; block sheet names the problem + offers a fix; next build and helper Vitest both pass.</done>
</task>

</tasks>

<verification>
- `cd apps/web && npm run build` completes (no build failure; no new tsc errors in the 3 touched files).
- `cd apps/web && npx vitest run src/lib/dispatch/driver-readiness-label.test.ts` passes (ready / not_started / incomplete+href).
- Reasoning check: NO_ONBOARDING_INSTANCE driver -> amber "Onboarding not started" chip (desktop amber pattern, mobile ds-warning); preflight opens block modal client-side; modal/sheet names the problem and links to /checklists; incomplete driver lists blockers + instance link; Override available to OWNER/MANAGER; green "Dispatch Ready" only when isReady && !warning.
- No changes to getDriverReadiness resolver, computeDispatchReadiness.ts, trips.ts, or schema.prisma.
</verification>

<success_criteria>
- Pure `driverReadinessLabel` helper + `canDispatchClientSide` predicate exist and are unit-tested.
- Desktop NewDispatchForm.tsx and mobile NewTripMobile.tsx both consume the helper for a 3-state indicator and a consistent client preflight.
- Block modal/sheet copy is accurate per state with an actionable fix link; Cancel + admin Override preserved.
- Existing amber (desktop) / ds-warning (mobile) styling reused; no new visual design; no emoji.
- next build + helper Vitest pass. Committed atomically; not pushed; vercel not run.
</success_criteria>

<output>
After completion, create `.planning/quick/503-surface-driver-onboarding-not-started-in/503-SUMMARY.md`.
</output>
