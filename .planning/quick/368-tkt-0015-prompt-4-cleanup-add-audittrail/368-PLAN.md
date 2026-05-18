---
phase: quick-368
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/carrier/driver-pay/settlements/[settlementId]/page.tsx
  - apps/web/src/app/(driver)/pay/settlements/[id]/page.tsx
autonomous: true

must_haves:
  truths:
    - "Owner settlement detail page shows AuditTrailFooter with created/updated by names + timestamps"
    - "Driver settlement detail page shows AuditTrailFooter with created/updated by names + timestamps"
    - "TypeScript compiles clean (tsc --noEmit exit 0) after both edits"
  artifacts:
    - path: "apps/web/src/app/(owner)/carrier/driver-pay/settlements/[settlementId]/page.tsx"
      provides: "Owner settlement detail page with AuditTrailFooter rendered"
      contains: "<AuditTrailFooter"
    - path: "apps/web/src/app/(driver)/pay/settlements/[id]/page.tsx"
      provides: "Driver settlement detail page with AuditTrailFooter rendered"
      contains: "<AuditTrailFooter"
  key_links:
    - from: "owner settlement page"
      to: "AuditTrailFooter component"
      via: "import from @/components/audit-trail-footer"
      pattern: "AuditTrailFooter"
    - from: "driver settlement page"
      to: "AuditTrailFooter component"
      via: "import from @/components/audit-trail-footer"
      pattern: "AuditTrailFooter"
    - from: "prisma.driverSettlement.findFirst include"
      to: "creator/updater relations"
      via: "Prisma relation names (creator, updater)"
      pattern: "creator:.*select.*firstName"
---

<objective>
Integrate AuditTrailFooter into the two DriverSettlement detail pages that were incorrectly skipped during TKT-0015 Prompt 4.

Purpose: Close the cleanup gap so all 23 detail pages (21 already done + these 2) show consistent audit info (created by / updated by / timestamps).

Output:
- Updated owner settlement detail page with creator + updater includes and footer
- Updated driver settlement detail page with creator + updater includes and footer
- Clean tsc, committed and pushed
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

# Reference: a page already using creator/updater pattern in include + footer
@apps/web/src/app/(owner)/checklists/instances/[id]/page.tsx

# The two pages to modify
@apps/web/src/app/(owner)/carrier/driver-pay/settlements/[settlementId]/page.tsx
@apps/web/src/app/(driver)/pay/settlements/[id]/page.tsx

# Schema confirms DriverSettlement has `creator` and `updater` relations (lines 3146–3147)
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add AuditTrailFooter to owner settlement detail page</name>
  <files>apps/web/src/app/(owner)/carrier/driver-pay/settlements/[settlementId]/page.tsx</files>
  <action>
1. Add import at top of file (alongside existing imports):
     import { AuditTrailFooter } from '@/components/audit-trail-footer';

2. Extend the existing `prisma.driverSettlement.findFirst` `include` block (currently has driver, assignments, bonuses) to also pull the audit relations. Add these two keys to the existing include object (do NOT add a second query, do NOT change existing keys):
     creator: { select: { firstName: true, lastName: true, email: true } },
     updater: { select: { firstName: true, lastName: true, email: true } },

3. Inside the JSX returned by the page, immediately after the closing `</SettlementDetailView>` tag and BEFORE the closing `</div>` of the outer wrapper `<div className="flex h-full flex-col p-6">`, add:
     <AuditTrailFooter
       createdAt={settlement.createdAt}
       createdByName={settlement.creator ? `${settlement.creator.firstName ?? ''} ${settlement.creator.lastName ?? ''}`.trim() || null : null}
       createdByEmail={settlement.creator?.email ?? null}
       updatedAt={settlement.updatedAt}
       updatedByName={settlement.updater ? `${settlement.updater.firstName ?? ''} ${settlement.updater.lastName ?? ''}`.trim() || null : null}
       updatedByEmail={settlement.updater?.email ?? null}
     />

Constraints:
- Do NOT modify the AuditTrailFooter component itself.
- Do NOT modify prisma/schema.prisma — the `creator` and `updater` relations already exist on DriverSettlement.
- Do NOT add a new query; extend the existing include only.
- Match exactly the prop-resolution pattern used on the 21 integrated pages (see checklists/instances/[id]/page.tsx for the reference template — note that page uses `createdBy`/`updatedBy` relation names, but DriverSettlement uses `creator`/`updater`, so the pattern is the same but the relation accessor names differ).
- Do NOT touch any other page, route, or component.
  </action>
  <verify>
- File compiles: `cd apps/web && npx tsc --noEmit` exits 0
- `grep -n "AuditTrailFooter" apps/web/src/app/(owner)/carrier/driver-pay/settlements/\[settlementId\]/page.tsx` shows import + JSX usage
- `grep -n "creator:" apps/web/src/app/(owner)/carrier/driver-pay/settlements/\[settlementId\]/page.tsx` shows the include addition
  </verify>
  <done>
- Import added
- Include extended with `creator` + `updater` selecting firstName/lastName/email
- `<AuditTrailFooter>` rendered inside outer wrapper div, using exact 6-prop shape
- tsc --noEmit exit 0
  </done>
</task>

<task type="auto">
  <name>Task 2: Add AuditTrailFooter to driver settlement detail page</name>
  <files>apps/web/src/app/(driver)/pay/settlements/[id]/page.tsx</files>
  <action>
Note: The actual driver page is at `apps/web/src/app/(driver)/pay/settlements/[id]/page.tsx` (the planning context listed `/driver/pay/...` but the route group `(driver)` already provides the segment — confirmed by Glob). Use this corrected path.

1. Add import at top of file (alongside existing imports):
     import { AuditTrailFooter } from '@/components/audit-trail-footer';

2. Extend the existing `prisma.driverSettlement.findFirst` `include` block (currently has assignments, bonuses) to also pull the audit relations. Add these two keys to the existing include object:
     creator: { select: { firstName: true, lastName: true, email: true } },
     updater: { select: { firstName: true, lastName: true, email: true } },

3. Replace the current final `return <DriverSettlementDetailView settlement={serialized} />;` with a Fragment that renders the detail view followed by the footer:
     return (
       <>
         <DriverSettlementDetailView settlement={serialized} />
         <AuditTrailFooter
           createdAt={settlement.createdAt}
           createdByName={settlement.creator ? `${settlement.creator.firstName ?? ''} ${settlement.creator.lastName ?? ''}`.trim() || null : null}
           createdByEmail={settlement.creator?.email ?? null}
           updatedAt={settlement.updatedAt}
           updatedByName={settlement.updater ? `${settlement.updater.firstName ?? ''} ${settlement.updater.lastName ?? ''}`.trim() || null : null}
           updatedByEmail={settlement.updater?.email ?? null}
         />
       </>
     );

Constraints:
- Do NOT modify the AuditTrailFooter component itself.
- Do NOT modify prisma/schema.prisma.
- Do NOT add a new query; extend the existing include only.
- Do NOT touch any other page.
- Match the same prop-resolution pattern used in Task 1 (and on the 21 integrated pages).
  </action>
  <verify>
- File compiles: `cd apps/web && npx tsc --noEmit` exits 0
- `grep -n "AuditTrailFooter" apps/web/src/app/(driver)/pay/settlements/\[id\]/page.tsx` shows import + JSX usage
- `grep -n "creator:" apps/web/src/app/(driver)/pay/settlements/\[id\]/page.tsx` shows the include addition
  </verify>
  <done>
- Import added
- Include extended with `creator` + `updater`
- Page returns Fragment with DriverSettlementDetailView + AuditTrailFooter
- tsc --noEmit exit 0
  </done>
</task>

<task type="auto">
  <name>Task 3: Type-check, commit, push</name>
  <files>(no new files; commits the two modified pages)</files>
  <action>
1. From `apps/web`, run full type check:
     cd apps/web && npx tsc --noEmit
   Must exit 0. If it errors, fix the specific type error introduced by Tasks 1 or 2 (most likely a missing import, mismatched include shape, or a stale `settlement.creator` reference) and re-run.

2. Stage only the two modified files:
     git add apps/web/src/app/\(owner\)/carrier/driver-pay/settlements/\[settlementId\]/page.tsx apps/web/src/app/\(driver\)/pay/settlements/\[id\]/page.tsx

3. Commit with the exact message:
     feat(audit-footer): integrate AuditTrailFooter into DriverSettlement owner + driver detail pages [TKT-0015 Prompt 4 cleanup]

4. Push:
     git push origin master

Constraints:
- Do NOT include any other files in the commit.
- Do NOT amend prior commits.
- Do NOT use --no-verify.
  </action>
  <verify>
- `npx tsc --noEmit` (from apps/web) exits 0
- `git log -1 --name-only` shows the commit with exactly those two files
- `git status` shows clean working tree afterward
- `git push` reports "Everything up-to-date" or a successful push to origin/master
  </verify>
  <done>
- Clean tsc
- Single commit containing only the two settlement detail pages
- Commit pushed to origin/master
  </done>
</task>

</tasks>

<verification>
- Owner settlement page renders AuditTrailFooter at the bottom of the detail view with creator + updater info populated when present
- Driver settlement page renders AuditTrailFooter at the bottom of the detail view with creator + updater info populated when present
- `npx tsc --noEmit` from `apps/web` exits 0
- Exactly one new commit on master containing only the two modified pages
- Commit pushed to origin/master
</verification>

<success_criteria>
- Both DriverSettlement detail pages (owner + driver) show the AuditTrailFooter
- The Prisma `include` is extended (not duplicated) with `creator` and `updater` on both pages
- Prop-resolution matches the 21 integrated pages exactly (same `${first ?? ''} ${last ?? ''}`.trim() || null pattern)
- Zero TypeScript errors
- Commit message matches: `feat(audit-footer): integrate AuditTrailFooter into DriverSettlement owner + driver detail pages [TKT-0015 Prompt 4 cleanup]`
- Pushed to origin/master
- No other files modified
</success_criteria>

<output>
After completion, create `.planning/quick/368-tkt-0015-prompt-4-cleanup-add-audittrail/368-SUMMARY.md` capturing:
- Two files modified (exact paths)
- The exact include keys added (creator, updater with firstName/lastName/email)
- The AuditTrailFooter JSX added on each page
- tsc result
- Commit SHA + push confirmation
</output>
