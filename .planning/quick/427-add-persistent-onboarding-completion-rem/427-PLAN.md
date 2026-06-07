---
phase: quick-427
plan: 427
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/onboarding/OnboardingReminderRibbon.tsx
  - apps/web/src/app/(owner)/layout.tsx
autonomous: true

must_haves:
  truths:
    - "When a tenant's onboarding is incomplete, an owner sees a fixed top-right ribbon on every owner-portal page"
    - "When a tenant's onboarding is complete, no ribbon renders anywhere"
    - "The ribbon links to the onboarding/get-started page so the owner can finish setup"
    - "The ribbon has no dismiss control — visibility is driven solely by completion status"
  artifacts:
    - path: "apps/web/src/components/onboarding/OnboardingReminderRibbon.tsx"
      provides: "Fixed top-right onboarding reminder ribbon, renders null when complete"
      min_lines: 20
    - path: "apps/web/src/app/(owner)/layout.tsx"
      provides: "Server-side fetch of ActivationProgress.isActivated + mount of ribbon"
      contains: "OnboardingReminderRibbon"
  key_links:
    - from: "apps/web/src/app/(owner)/layout.tsx"
      to: "ActivationProgress.isActivated"
      via: "prisma.$queryRaw scoped to session.tenantId"
      pattern: "ActivationProgress"
    - from: "apps/web/src/app/(owner)/layout.tsx"
      to: "apps/web/src/components/onboarding/OnboardingReminderRibbon.tsx"
      via: "JSX mount with onboardingComplete prop"
      pattern: "OnboardingReminderRibbon"
---

<objective>
Add a persistent, non-dismissible onboarding-completion reminder ribbon to the owner portal.
It renders fixed top-right on every owner page ONLY while the tenant's onboarding is incomplete,
and disappears automatically once onboarding is complete.

Purpose: Keep new owners aware that setup is unfinished without nagging modals or a dismiss button
that would let them hide an incomplete state permanently.

Output:
- New client component `OnboardingReminderRibbon.tsx`
- Owner layout fetches completion status and mounts the ribbon
</objective>

<research_findings>
Pre-planning research confirmed the onboarding-completion field EXISTS — proceed (no STOP).

**Completion status source of truth:** `ActivationProgress` model (prisma/schema.prisma line 2825).
- `tenantId String @unique` — one row per tenant
- `isActivated Boolean @default(false)` — canonical "onboarding complete" flag (use this)
- `completionPct Int @default(20)` — secondary progress metric
- Row may NOT exist yet for a brand-new tenant. Treat a missing row as INCOMPLETE (show ribbon).

**Onboarding destination:** `/onboarding/welcome` — the "Get started checklist" page
(apps/web/src/app/onboarding/welcome/page.tsx, public route in middleware allowlist).
The ribbon should link here.

**Authenticated layout that wraps all owner pages:**
`apps/web/src/app/(owner)/layout.tsx` — server component, already runs `prisma.$queryRaw`
for the tenant name and has `session.tenantId` in scope. This is the correct mount point.
It renders `<OwnerShell>` (a `"use client"` component). Because the ribbon is `position: fixed`,
it can be mounted as a sibling of `OwnerShell` inside the layout — no need to touch OwnerShell.

**No existing server action / API returns onboarding status for the dashboard** — the welcome
page queries `prisma.activationProgress` directly. The layout will do the same minimal query.

**Constraints honored:** no onboarding-flow screens touched, no API/auth layer touched,
no Prisma schema change, no dismiss button.
</research_findings>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(owner)/layout.tsx
@apps/web/src/components/navigation/owner-shell.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create OnboardingReminderRibbon client component</name>
  <files>apps/web/src/components/onboarding/OnboardingReminderRibbon.tsx</files>
  <action>
Create a new client component (`"use client"`) named `OnboardingReminderRibbon`.

Props:
```ts
interface OnboardingReminderRibbonProps {
  onboardingComplete: boolean;
}
```

Behavior:
- If `onboardingComplete === true`, return `null` (render nothing).
- Otherwise render a fixed top-right ribbon that is a `next/link` (`Link`) pointing to `/onboarding/welcome`.

Markup/styling (use existing Tailwind tokens, no new CSS, match the app's professional look):
- Wrap in `Link` with `href="/onboarding/welcome"`.
- Container classes: `fixed top-3 right-3 z-[1100] flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 shadow-md hover:shadow-lg transition-shadow text-sm`
  (z-index 1100 sits above the mobile sticky header which is z-[1001]).
- Use a lucide icon `Rocket` (or `Sparkles`) sized `h-4 w-4 text-primary` plus an `aria-hidden` wrapper.
- Text: a short label like `Finish setup` in `font-medium text-foreground`.
- Add `aria-label="Finish onboarding setup"` on the Link and `role` is implicit (anchor).
- No dismiss / close button anywhere — visibility is driven solely by `onboardingComplete`.

Keep it minimal and self-contained — no data fetching inside the component; status comes via the prop.
  </action>
  <verify>
`npx tsc --noEmit` (from apps/web) reports no NEW errors involving OnboardingReminderRibbon.
Confirm the component returns `null` when `onboardingComplete` is true and renders a fixed Link to `/onboarding/welcome` otherwise. Confirm there is NO button/onClick that hides the ribbon.
  </verify>
  <done>
File exists at apps/web/src/components/onboarding/OnboardingReminderRibbon.tsx, is a `"use client"` component, accepts `onboardingComplete: boolean`, returns null when complete, and renders a fixed top-right ribbon linking to /onboarding/welcome with no dismiss control.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fetch completion status and mount ribbon in owner layout</name>
  <files>apps/web/src/app/(owner)/layout.tsx</files>
  <action>
Edit the existing owner layout (do NOT touch OwnerShell or any onboarding screen).

1. Import the ribbon:
   `import { OnboardingReminderRibbon } from "@/components/onboarding/OnboardingReminderRibbon";`

2. After the existing tenant-name query block, add a small query to read activation status,
   following the SAME raw-SQL pattern already used in the file. Default to INCOMPLETE on
   missing row or error (so a brand-new tenant still sees the ribbon):

```ts
let onboardingComplete = false;
try {
  const rows = await prisma.$queryRaw<{ isActivated: boolean }[]>`
    SELECT "isActivated" FROM "ActivationProgress" WHERE "tenantId" = ${session.tenantId}::uuid LIMIT 1
  `;
  onboardingComplete = rows[0]?.isActivated ?? false;
} catch {
  // Non-fatal — default to showing the ribbon (treat as incomplete)
  onboardingComplete = false;
}
```

3. Mount the ribbon inside the existing `<TRPCReactProvider>` return, as a sibling BEFORE
   `<OwnerShell>` (fixed positioning means tree location doesn't matter, but keep it tidy):

```tsx
return (
  <TRPCReactProvider>
    <OnboardingReminderRibbon onboardingComplete={onboardingComplete} />
    <OwnerShell tenantName={tenantName}>
      {children}
    </OwnerShell>
  </TRPCReactProvider>
);
```

Do not change `export const dynamic = 'force-dynamic'`, the auth checks, or the tenant-name logic.
  </action>
  <verify>
`npx tsc --noEmit` (from apps/web) reports no NEW type errors.
Read the resulting layout.tsx and confirm: (a) the ActivationProgress query is scoped to `session.tenantId`, (b) the catch defaults `onboardingComplete` to false, (c) `<OnboardingReminderRibbon onboardingComplete={onboardingComplete} />` is mounted inside the provider.
  </verify>
  <done>
Owner layout fetches `ActivationProgress.isActivated` for the current tenant (defaulting to false/incomplete on missing row or error) and renders `<OnboardingReminderRibbon onboardingComplete={...} />`. Auth, tenant-name, and force-dynamic behavior unchanged.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` from apps/web shows no new errors in touched files.
- Manual reasoning check: a tenant with `isActivated=false` (or no ActivationProgress row) shows the ribbon; a tenant with `isActivated=true` shows nothing.
- Ribbon links to `/onboarding/welcome` and has no dismiss button.
- No changes outside the two listed files; Prisma schema, API/auth layer, and onboarding screens untouched.
</verification>

<success_criteria>
- New `OnboardingReminderRibbon.tsx` exists and is non-dismissible, fixed top-right, link to /onboarding/welcome, renders null when complete.
- Owner layout reads real completion status from `ActivationProgress.isActivated` scoped to the tenant and mounts the ribbon.
- TypeScript strict mode passes (no new errors).
- Existing Tailwind tokens used; no new CSS or design system additions.
</success_criteria>

<output>
After completion, create `.planning/quick/427-add-persistent-onboarding-completion-rem/427-SUMMARY.md`
</output>
