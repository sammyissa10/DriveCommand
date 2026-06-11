---
phase: quick-434
plan: 434
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/src/app/(owner)/actions/activation-congrats.ts
  - apps/web/src/components/onboarding/CongratsDialog.tsx
  - apps/web/src/components/navigation/owner-shell.tsx
  - apps/web/src/app/(owner)/layout.tsx
autonomous: true

must_haves:
  truths:
    - "ActivationProgress has a nullable congratsShownAt column in DB and Prisma client"
    - "First time isActivated is true and congratsShownAt is null, owner sees a one-time congrats AlertDialog"
    - "A sonner toast.success fires as a lightweight fallback alongside the dialog"
    - "congratsShownAt persists to now() exactly once, so the moment never re-shows across reloads/devices/re-renders"
    - "next build passes with no type errors"
  artifacts:
    - path: "apps/web/prisma/schema.prisma"
      provides: "congratsShownAt DateTime? on ActivationProgress model"
      contains: "congratsShownAt"
    - path: "apps/web/src/app/(owner)/actions/activation-congrats.ts"
      provides: "markCongratsShown server action (idempotent set-once via getTenantPrisma)"
      contains: "markCongratsShown"
    - path: "apps/web/src/components/onboarding/CongratsDialog.tsx"
      provides: "AlertDialog-based congrats UI"
      contains: "AlertDialog"
    - path: "apps/web/src/components/navigation/owner-shell.tsx"
      provides: "useEffect trigger + toast + dialog wiring"
      contains: "CongratsDialog"
  key_links:
    - from: "apps/web/src/app/(owner)/layout.tsx"
      to: "OwnerShell congratsShownAt prop"
      via: "$queryRaw selecting congratsShownAt alongside isActivated"
      pattern: "congratsShownAt"
    - from: "apps/web/src/components/navigation/owner-shell.tsx"
      to: "markCongratsShown"
      via: "useEffect calling the server action once on activation"
      pattern: "markCongratsShown"
---

<objective>
Add a one-time "activation complete" congratulations moment for owner tenants. When a tenant's onboarding finishes (isActivated true) and they have not yet seen the celebration (congratsShownAt null), OwnerShell shows a congrats AlertDialog + sonner toast exactly once, then persists congratsShownAt so it never re-shows.

Purpose: Tenants currently get zero acknowledgment when activation completes — the Finish Setup banner just unmounts. This adds a positive completion signal.
Output: Schema column + server action + CongratsDialog component + OwnerShell/layout wiring.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/schema.prisma
@apps/web/src/app/(owner)/layout.tsx
@apps/web/src/components/navigation/owner-shell.tsx
@apps/web/src/app/(owner)/actions/compliance.ts
@apps/web/src/components/ui/alert-dialog.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add congratsShownAt column + idempotent markCongratsShown server action</name>
  <files>apps/web/prisma/schema.prisma, apps/web/src/app/(owner)/actions/activation-congrats.ts</files>
  <action>
Schema:
- In `model ActivationProgress` (apps/web/prisma/schema.prisma, ~line 2825), add a nullable column right after `isActivated`:
  `congratsShownAt DateTime? @db.Timestamptz`
- Apply the DB change via Supabase MCP `apply_migration` (NOT prisma migrate deploy). Run:
  `ALTER TABLE "ActivationProgress" ADD COLUMN IF NOT EXISTS "congratsShownAt" timestamptz;`
- Run `npx prisma generate` (from apps/web) so the Prisma client picks up the new field.

Server action — create `apps/web/src/app/(owner)/actions/activation-congrats.ts`:
- `'use server'` at top.
- Import `getTenantPrisma` from `@/lib/context/tenant-context` (same pattern as compliance.ts).
- Export `async function markCongratsShown(): Promise<{ ok: boolean }>`.
- Establish tenant-scoped client: `const prisma = await getTenantPrisma();` (NO bare prisma calls).
- Idempotent set-once write using updateMany with a null guard so a race/double-call never overwrites:
  `await prisma.activationProgress.updateMany({ where: { isActivated: true, congratsShownAt: null }, data: { congratsShownAt: new Date() } });`
  (getTenantPrisma already scopes to the current tenant; the updateMany WHERE additionally guards on isActivated + null so it only writes once.)
- Wrap in try/catch; on error return `{ ok: false }`, otherwise `{ ok: true }`. Do not throw — this is a fire-and-forget UI write.

Do NOT touch the four activation step triggers or recordActivationEvent. Use field name `activationProgress` exactly as Prisma generates it (confirm casing after prisma generate).
  </action>
  <verify>
Run `npx prisma generate` from apps/web with no errors. Confirm `congratsShownAt` exists on the model in the generated client (grep the schema). Confirm the action file compiles by including it in the Task 3 build.
  </verify>
  <done>ActivationProgress has congratsShownAt in DB + Prisma client; markCongratsShown writes congratsShownAt=now only when isActivated && congratsShownAt is null, tenant-scoped, no bare prisma.</done>
</task>

<task type="auto">
  <name>Task 2: Build CongratsDialog component (reuse shadcn AlertDialog)</name>
  <files>apps/web/src/components/onboarding/CongratsDialog.tsx</files>
  <action>
Create `apps/web/src/components/onboarding/CongratsDialog.tsx` as a `"use client"` component.
- Import the existing shadcn AlertDialog primitives from `@/components/ui/alert-dialog`:
  `AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction`.
- Props: `{ open: boolean; onOpenChange: (open: boolean) => void }`.
- Use a controlled AlertDialog (`<AlertDialog open={open} onOpenChange={onOpenChange}>`).
- Content:
  - Title: "Your fleet is all set!"
  - Description: a short, warm one-liner, e.g. "Onboarding is complete. Your trucks, drivers, clients, and first load are ready to roll — welcome to DriveCommand."
  - Footer: a single `AlertDialogAction` CTA labeled "Go to Dashboard". On click, call `onOpenChange(false)` then navigate to `/carrier/dashboard` using `useRouter().push` from `next/navigation` (import at top).
- Match existing shadcn/Tailwind styling — do not add new dependencies, custom modal systems, or animation libs. Keep it minimal and consistent with how cancel-load / dispatch modals use AlertDialog.
- Optionally add a small celebratory icon from lucide-react (e.g. PartyPopper or CheckCircle2) above the title if lucide-react is already a dependency (it is); keep it lightweight.
  </action>
  <verify>Component imports resolve against existing `@/components/ui/alert-dialog`; confirmed via Task 3 next build.</verify>
  <done>CongratsDialog renders a controlled AlertDialog with title, congrats copy, and a single "Go to Dashboard" CTA that routes to /carrier/dashboard, using only existing UI primitives.</done>
</task>

<task type="auto">
  <name>Task 3: Wire trigger into OwnerShell + layout, then verify with next build</name>
  <files>apps/web/src/components/navigation/owner-shell.tsx, apps/web/src/app/(owner)/layout.tsx</files>
  <action>
Layout (apps/web/src/app/(owner)/layout.tsx):
- Extend the existing ActivationProgress $queryRaw (currently selects only isActivated, ~line 52) to also select congratsShownAt:
  `SELECT "isActivated", "congratsShownAt" FROM "ActivationProgress" WHERE "tenantId" = ${session.tenantId}::uuid LIMIT 1`
- Update the row type to `{ isActivated: boolean; congratsShownAt: Date | null }[]`.
- Derive `const congratsShownAt = activationRows[0]?.congratsShownAt ?? null;` (default null if row missing/error).
- Pass `congratsShownAt={congratsShownAt ? congratsShownAt.toISOString() : null}` to `<OwnerShell>` (serialize to string/null — keep it a plain serializable prop crossing the server→client boundary).

OwnerShell (apps/web/src/components/navigation/owner-shell.tsx):
- Add to `OwnerShellProps`: `congratsShownAt?: string | null;`.
- Destructure `congratsShownAt = null` in the component signature.
- Add imports: `import { useEffect, useRef, useState } from "react";`, `import { toast } from "sonner";`, `import { CongratsDialog } from "@/components/onboarding/CongratsDialog";`, `import { markCongratsShown } from "@/app/(owner)/actions/activation-congrats";`.
- Add state: `const [congratsOpen, setCongratsOpen] = useState(false);` and `const firedRef = useRef(false);`.
- Add a useEffect: if `onboardingComplete === true && congratsShownAt == null && !firedRef.current`, then set `firedRef.current = true` (guards re-renders before the server write lands so it never double-fires), `setCongratsOpen(true)`, `toast.success("Your fleet is all set!")`, and `void markCongratsShown();`. Dependency array: `[onboardingComplete, congratsShownAt]`.
  (Note: OwnerShell already receives onboardingComplete which is ActivationProgress.isActivated from the layout — reuse it as the isActivated signal.)
- Render `<CongratsDialog open={congratsOpen} onOpenChange={setCongratsOpen} />` once inside the CommandPaletteProvider (top level, not duplicated per desktop/mobile branch).

Do not touch OnboardingReminderRibbon, checklist.tsx, or activation step triggers.

After wiring, run the build to verify the whole change compiles and downstream types are fixed.
  </action>
  <verify>From apps/web run `npm run build` (next build) — must complete with no TypeScript or build errors. Confirm CongratsDialog and markCongratsShown imports resolve and the serialized prop crosses the server/client boundary cleanly.</verify>
  <done>Layout loads congratsShownAt and passes it to OwnerShell; OwnerShell fires the dialog + toast + markCongratsShown exactly once when isActivated && congratsShownAt is null; next build passes.</done>
</task>

</tasks>

<verification>
- DB column `ActivationProgress.congratsShownAt` exists (Supabase MCP applied) and is present in the generated Prisma client.
- `next build` (npm run build in apps/web) completes with zero errors.
- markCongratsShown is tenant-scoped via getTenantPrisma() and only writes when congratsShownAt is null (idempotent set-once).
- OwnerShell effect guarded by useRef so it fires once even if re-rendered before the server write completes.
</verification>

<success_criteria>
- First owner visit after activation: AlertDialog "Your fleet is all set!" + sonner toast appear once.
- congratsShownAt is persisted to now(); reload/another device shows nothing (effect condition false).
- No changes to activation step triggers, recordActivationEvent, checklist.tsx, or unrelated components.
- next build passes.
</success_criteria>

<output>
After completion, create `.planning/quick/434-build-activation-complete-congrats-momen/434-SUMMARY.md`
</output>
