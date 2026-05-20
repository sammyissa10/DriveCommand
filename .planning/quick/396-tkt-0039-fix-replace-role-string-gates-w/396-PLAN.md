---
phase: quick-396
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/carrier/clients/ClientList.tsx
  - apps/web/src/components/carrier/contracts/ContractList.tsx
  - apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx
  - apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
  - apps/web/src/components/carrier/dispatches/StopDocumentList.tsx
  - apps/web/src/components/carrier/dispatches/StopTimeline.tsx
  - apps/web/src/app/(owner)/carrier/clients/page.tsx
  - apps/web/src/app/(owner)/carrier/contracts/page.tsx
  - apps/web/src/app/(owner)/carrier/clients/[id]/page.tsx
  - apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
autonomous: true

must_haves:
  truths:
    - "MANAGER user with permissions.clients=true sees 'New Client' button on /carrier/clients"
    - "MANAGER user with permissions.contracts=true sees 'New Contract' button on /carrier/contracts and on the client detail Contracts tab"
    - "MANAGER user with permissions.dispatches=true sees Skip Stop action and Delete Document button on dispatch pages"
    - "MANAGER user with permissions.clients=false does NOT see 'New Client' button"
    - "OWNER user always sees all gated UI (hasPermission returns true unconditionally)"
    - "DRIVER user never sees any of these gated controls"
    - "No client component imports getSession or computes permissions client-side — all checks are server-derived and passed as props"
  artifacts:
    - path: "apps/web/src/components/carrier/clients/ClientList.tsx"
      provides: "Client list with canCreate-gated New Client button"
      contains: "canCreate"
    - path: "apps/web/src/components/carrier/contracts/ContractList.tsx"
      provides: "Contract list with canCreate-gated New Contract button"
      contains: "canCreate"
    - path: "apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx"
      provides: "Client detail with canCreateContract-gated New Contract link"
      contains: "canCreateContract"
    - path: "apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx"
      provides: "Stop card with canManage-gated Skip action"
      contains: "canManage"
    - path: "apps/web/src/components/carrier/dispatches/StopDocumentList.tsx"
      provides: "Stop documents with canManage-gated Delete button"
      contains: "canManage"
  key_links:
    - from: "apps/web/src/app/(owner)/carrier/clients/page.tsx"
      to: "apps/web/src/components/carrier/clients/ClientList.tsx"
      via: "canCreate prop computed via hasPermission(session.permissions, 'clients', session.role)"
      pattern: "hasPermission\\(.*'clients'"
    - from: "apps/web/src/app/(owner)/carrier/contracts/page.tsx"
      to: "apps/web/src/components/carrier/contracts/ContractList.tsx"
      via: "canCreate prop computed via hasPermission(session.permissions, 'contracts', session.role)"
      pattern: "hasPermission\\(.*'contracts'"
    - from: "apps/web/src/app/(owner)/carrier/clients/[id]/page.tsx"
      to: "apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx"
      via: "canCreateContract prop computed via hasPermission(session.permissions, 'contracts', session.role)"
      pattern: "canCreateContract"
    - from: "apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx"
      to: "apps/web/src/components/carrier/dispatches/StopTimeline.tsx"
      via: "canManage prop computed via hasPermission(session.permissions, 'dispatches', session.role), threaded into StopTimelineCard and StopDocumentList"
      pattern: "hasPermission\\(.*'dispatches'"
---

<objective>
Replace 5 blanket role-string permission gates in carrier UI with proper hasPermission(permissions, key, role) checks that respect the User.permissions JSON.

**Why it matters:** A MANAGER (noorshadeed25@gmail.com on Nadeem's Testing tenant) with `clients: true` and `fullAccess: true` in the DB does NOT see "New Client" — the UI ignores their granted permissions because gates only check `role !== 'MANAGER'`. The DB explicitly grants access; the UI silently denies it. This is a permissions bug, not a UX preference.

**Pattern (gold standard from audit):**
1. Server page (server component) computes `canCreate = hasPermission(session.permissions ?? null, 'clients', session.role)`
2. Server page passes `canCreate` as a prop to the client component
3. Client component renders the gated UI using `canCreate` (not role)
4. The `role` prop and `userRole` prop are removed from gating decisions (kept only if used elsewhere)

**Output:** All 5 flagged gates now respect User.permissions. OWNERs are unaffected (hasPermission always returns true for OWNER). MANAGERs with the permission see the UI. MANAGERs without it don't. DRIVERs continue to see nothing.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/debug/tkt-0039-carrier-role-gate-audit.md
@.planning/debug/tkt-0039-new-client-button-missing.md
@apps/web/src/lib/auth/permissions.ts
@apps/web/src/lib/auth/supabase.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix Clients list — add canCreate prop computed server-side</name>
  <files>
    apps/web/src/app/(owner)/carrier/clients/page.tsx
    apps/web/src/components/carrier/clients/ClientList.tsx
  </files>
  <action>
**Server page** — `apps/web/src/app/(owner)/carrier/clients/page.tsx`:

1. Add import at top: `import { hasPermission } from '@/lib/auth/permissions';`
2. After the `if (!session) redirect('/login');` line (currently line 9), compute:
   ```ts
   const canCreate = hasPermission(session.permissions ?? null, 'clients', session.role);
   ```
3. In the `<ClientList ... />` JSX (currently around line 71), add the `canCreate={canCreate}` prop. Keep the existing `role={session.role ?? undefined}` prop for now (it's harmless and may be used by other code paths in the component — do NOT remove it, just stop using it for gating).

**Client component** — `apps/web/src/components/carrier/clients/ClientList.tsx`:

1. Update the component signature from:
   ```tsx
   export function ClientList({ clients, role }: { clients: ClientItem[]; role?: string }) {
   ```
   to:
   ```tsx
   export function ClientList({ clients, role, canCreate }: { clients: ClientItem[]; role?: string; canCreate?: boolean }) {
   ```
2. Replace the gate at line 72:
   ```tsx
   {role !== 'MANAGER' && (
   ```
   with:
   ```tsx
   {canCreate && (
   ```
3. Leave the rest of the file untouched. `role` stays in the props because removing it would require touching the parent and other consumers — keep change minimal.

**Why canCreate not canCreateClient:** The component is `ClientList`, so `canCreate` is unambiguous within the scope of that file. Matches the audit's gold-standard pattern.
  </action>
  <verify>
- `cd apps/web && npx tsc --noEmit` produces no new errors related to ClientList or clients/page.tsx
- Grep confirms `role !== 'MANAGER'` is GONE from `apps/web/src/components/carrier/clients/ClientList.tsx`
- Grep confirms `canCreate` IS present in both `ClientList.tsx` and `app/(owner)/carrier/clients/page.tsx`
- Grep confirms `hasPermission(.*'clients'` matches in `app/(owner)/carrier/clients/page.tsx`
  </verify>
  <done>
- ClientList renders New Client button when `canCreate=true`, hides it when `canCreate=false`
- Server page computes canCreate via hasPermission helper, not via role string compare
- TypeScript still compiles clean
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix Contracts list — add canCreate prop computed server-side</name>
  <files>
    apps/web/src/app/(owner)/carrier/contracts/page.tsx
    apps/web/src/components/carrier/contracts/ContractList.tsx
  </files>
  <action>
**Server page** — `apps/web/src/app/(owner)/carrier/contracts/page.tsx`:

1. Add import at top: `import { hasPermission } from '@/lib/auth/permissions';`
2. After the `if (!session) redirect('/login');` line (currently line 9), compute:
   ```ts
   const canCreate = hasPermission(session.permissions ?? null, 'contracts', session.role);
   ```
3. In the `<ContractList ... />` JSX (currently around line 72), add the `canCreate={canCreate}` prop. Keep existing `role={session.role ?? undefined}`.

**Client component** — `apps/web/src/components/carrier/contracts/ContractList.tsx`:

1. Update the component signature from:
   ```tsx
   export function ContractList({ contracts, role }: { contracts: ContractItem[]; role?: string }) {
   ```
   to:
   ```tsx
   export function ContractList({ contracts, role, canCreate }: { contracts: ContractItem[]; role?: string; canCreate?: boolean }) {
   ```
2. Replace the gate at line 105:
   ```tsx
   {role !== 'MANAGER' && (
   ```
   with:
   ```tsx
   {canCreate && (
   ```
3. Leave everything else untouched.
  </action>
  <verify>
- `cd apps/web && npx tsc --noEmit` produces no new errors
- Grep confirms `role !== 'MANAGER'` is GONE from `apps/web/src/components/carrier/contracts/ContractList.tsx`
- Grep confirms `canCreate` IS present in both `ContractList.tsx` and `app/(owner)/carrier/contracts/page.tsx`
- Grep confirms `hasPermission(.*'contracts'` matches in `app/(owner)/carrier/contracts/page.tsx`
  </verify>
  <done>
- ContractList renders New Contract button only when `canCreate=true`
- Server page computes canCreate via hasPermission against 'contracts' key
  </done>
</task>

<task type="auto">
  <name>Task 3: Fix Client Detail Contracts tab — add canCreateContract prop</name>
  <files>
    apps/web/src/app/(owner)/carrier/clients/[id]/page.tsx
    apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx
  </files>
  <action>
**Server page** — `apps/web/src/app/(owner)/carrier/clients/[id]/page.tsx`:

1. Add import at top: `import { hasPermission } from '@/lib/auth/permissions';`
2. After the `if (!session) redirect('/login');` line (currently line 15), compute:
   ```ts
   const canCreateContract = hasPermission(session.permissions ?? null, 'contracts', session.role);
   ```
3. In the `<ClientDetail ... />` JSX (currently around line 63), add the `canCreateContract={canCreateContract}` prop. Keep existing `role={session.role ?? undefined}` prop.

**Client component** — `apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx`:

1. Update the component signature (currently lines 143–151):
   ```tsx
   export function ClientDetail({
     client,
     initialEdit,
     role,
   }: {
     client: ClientSerialized;
     initialEdit: boolean;
     role?: string;
   }) {
   ```
   to:
   ```tsx
   export function ClientDetail({
     client,
     initialEdit,
     role,
     canCreateContract,
   }: {
     client: ClientSerialized;
     initialEdit: boolean;
     role?: string;
     canCreateContract?: boolean;
   }) {
   ```
2. Replace the gate at line 495:
   ```tsx
   {role !== 'MANAGER' && (
   ```
   with:
   ```tsx
   {canCreateContract && (
   ```
3. Use the more specific name `canCreateContract` (not `canCreate`) here because this is a tab inside the Client detail — `canCreate` would be ambiguous (create a client? contract? document?). Be explicit.
4. Leave everything else untouched.
  </action>
  <verify>
- `cd apps/web && npx tsc --noEmit` produces no new errors
- Grep confirms `role !== 'MANAGER'` is GONE from `app/(owner)/carrier/clients/[id]/ClientDetail.tsx`
- Grep confirms `canCreateContract` IS present in both the page and the ClientDetail component
- Grep confirms `hasPermission(.*'contracts'` matches in `app/(owner)/carrier/clients/[id]/page.tsx`
  </verify>
  <done>
- Client detail Contracts tab renders New Contract link only when `canCreateContract=true`
- Server page computes canCreateContract via hasPermission against 'contracts' key
  </done>
</task>

<task type="auto">
  <name>Task 4: Fix Stop Timeline + Document List — thread canManage from dispatch page</name>
  <files>
    apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
    apps/web/src/components/carrier/dispatches/StopTimeline.tsx
    apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
    apps/web/src/components/carrier/dispatches/StopDocumentList.tsx
  </files>
  <action>
This task threads a single `canManage` prop from the dispatch detail page → StopTimeline → StopTimelineCard → StopDocumentList. The permission key is `'dispatches'`.

**Server page** — `apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx`:

1. Add import at top: `import { hasPermission } from '@/lib/auth/permissions';`
2. After the `if (!session) redirect('/login');` line, compute:
   ```ts
   const canManage = hasPermission(session.permissions ?? null, 'dispatches', session.role);
   ```
3. In the `<StopTimeline ... />` JSX (currently around line 280), add `canManage={canManage}`. Keep existing `userRole={session.role}` for now (other components inside may still use it for non-gating display logic — leaving it untouched keeps the diff minimal).

**StopTimeline** — `apps/web/src/components/carrier/dispatches/StopTimeline.tsx`:

1. Update the `StopTimelineProps` interface (around line 28) to add `canManage: boolean;`:
   ```ts
   interface StopTimelineProps {
     stops: StopItem[];
     routeTemplateStopMap: Record<number, { bolRequired: boolean; podRequired: boolean }>;
     stopDocCounts: Record<string, { bolCount: number; podCount: number }>;
     facilityMap: Record<string, { name: string; addressLine1: string | null; city: string | null; state: string | null }>;
     dispatchStatus: string;
     userRole: string;
     canManage: boolean;
     messageCountMap?: Record<string, number>;
   }
   ```
2. Destructure `canManage` in the function params (around line 42).
3. Pass `canManage={canManage}` to `<StopTimelineCard ... />` (around line 73, alongside the existing `userRole={userRole}` line).

**StopTimelineCard** — `apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx`:

1. Add `canManage: boolean;` to `StopTimelineCardProps` (around line 107):
   ```ts
   interface StopTimelineCardProps {
     stop: StopItem;
     sequenceNumber: number;
     bolRequired: boolean;
     podRequired: boolean;
     bolUploaded: boolean;
     podUploaded: boolean;
     facility: ...;
     dispatchStatus: string;
     userRole: string;
     canManage: boolean;
     dispatchId?: string;
     loadId?: string;
     onStopUpdated?: () => void;
     messageCount?: number;
     docCount?: number;
   }
   ```
2. Destructure `canManage` in the function params (around line 128).
3. **Replace** lines 173–179:
   ```tsx
   const isOwnerOrManager =
     userRole === 'owner' ||
     userRole === 'OWNER' ||
     userRole === 'manager' ||
     userRole === 'MANAGER';

   const canSkip = (isStopPending || isStopArrived) && isOwnerOrManager;
   ```
   with:
   ```tsx
   const canSkip = (isStopPending || isStopArrived) && canManage;
   ```
4. In the `<StopDocumentList ... />` JSX (around line 464), replace `userRole={userRole}` with `canManage={canManage}`. (StopDocumentList is being refactored next to use canManage instead of userRole.)

**StopDocumentList** — `apps/web/src/components/carrier/dispatches/StopDocumentList.tsx`:

1. Update `StopDocumentListProps` (line 24):
   ```ts
   interface StopDocumentListProps {
     stopId: string;
     canManage: boolean;
     refreshKey?: number;
     onDeleted?: () => void;
   }
   ```
   Note: We are REMOVING `userRole` from this component because it is only used for gating here. If `npx tsc --noEmit` shows the `userRole` prop is referenced anywhere else (e.g., other call sites), restore it as optional — but per the grep above, this is the only consumer.
2. Destructure `canManage` instead of `userRole` (line 61–66):
   ```tsx
   export function StopDocumentList({
     stopId,
     canManage,
     refreshKey,
     onDeleted,
   }: StopDocumentListProps) {
   ```
3. **Replace** lines 72–76:
   ```tsx
   const isOwnerOrManager =
     userRole === 'owner' ||
     userRole === 'OWNER' ||
     userRole === 'manager' ||
     userRole === 'MANAGER';
   ```
   with: (delete the block entirely — use `canManage` directly below)
4. Replace the usage at line 183:
   ```tsx
   {isOwnerOrManager && (
   ```
   with:
   ```tsx
   {canManage && (
   ```

**Avoidance notes:**
- Do NOT modify the API route guards on `/api/v1/carrier/stops/[id]/messages/route.ts` or `/api/v1/messages/*` — those use `session.role !== 'OWNER' && session.role !== 'MANAGER'` correctly (they are checking role at the API layer, not granular permission, which is appropriate because the API endpoints themselves are role-gated, not permission-gated per the audit).
- Do NOT modify `apps/web/src/app/(owner)/carrier/stops/[id]/page.tsx` line 64 — that role-string check is the page-level access gate (correct as-is per audit).
- Do NOT touch `StopDocumentsSection` or other stop-related components outside the 4 files listed.
  </action>
  <verify>
- `cd apps/web && npx tsc --noEmit` produces no new errors (in particular, no "Property 'userRole' is missing" or "Property 'canManage' is missing" errors)
- Grep confirms `isOwnerOrManager` is GONE from `StopTimelineCard.tsx` and `StopDocumentList.tsx`
- Grep confirms `canManage` IS present in `dispatches/[id]/page.tsx`, `StopTimeline.tsx`, `StopTimelineCard.tsx`, and `StopDocumentList.tsx`
- Grep confirms `hasPermission(.*'dispatches'` matches in `dispatches/[id]/page.tsx`
  </verify>
  <done>
- Skip Stop dialog trigger renders only when `canManage=true`
- Delete document button renders only when `canManage=true`
- Both checks derive from `hasPermission(session.permissions, 'dispatches', session.role)` computed in the server page
  </done>
</task>

<task type="auto">
  <name>Task 5: Manual smoke test — verify against actual DB user</name>
  <files>
    (manual verification, no code changes)
  </files>
  <action>
Run the dev server (if not already running) and verify the fix against the reporter's actual account.

**Recommended order:**

1. Run `cd apps/web && npx tsc --noEmit` one more time across the whole web app and confirm zero errors.
2. Start dev server: `cd apps/web && npm run dev` (skip if user already has it running)
3. As the OWNER of Nadeem's Testing tenant:
   - Visit `/carrier/clients` — should still see New Client button (regression check)
   - Visit `/carrier/contracts` — should still see New Contract button
   - Visit a dispatch detail page → confirm Skip Stop AlertDialog trigger renders on pending/arrived stops
4. Log in as noorshadeed25@gmail.com (MANAGER with clients/contracts/dispatches=true, fullAccess=true):
   - Visit `/carrier/clients` — **should NOW see New Client button** (the bug fix)
   - Visit `/carrier/contracts` — should see New Contract button
   - Visit a client detail → Contracts tab → should see New Contract link
   - Visit a dispatch detail → should see Skip Stop on pending/arrived stops
   - Visit a stop detail with an uploaded doc → should see Delete (trash) icon

If the user cannot test as the MANAGER right now, that's fine — the code fix is verifiable via grep + tsc. Skip step 4 and confirm code-level changes only.

**Do not commit until verification passes.** If anything regresses, fix in-place and re-verify.
  </action>
  <verify>
- `npx tsc --noEmit` exits 0
- Grep over the 5 modified component files shows `role !== 'MANAGER'` and `isOwnerOrManager` are both GONE
- Grep over the 4 modified server pages shows `hasPermission(` is present in each
  </verify>
  <done>
- All TypeScript clean
- MANAGER noorshadeed25@gmail.com now sees gated UI (or verification deferred to user if account access is unavailable)
- OWNER user sees no regression
  </done>
</task>

</tasks>

<verification>
**Code-level verification (run from `apps/web`):**

```bash
# 1. TypeScript clean
npx tsc --noEmit

# 2. The 5 flagged gates are gone
grep -n "role !== 'MANAGER'" src/components/carrier/clients/ClientList.tsx          # 0 matches
grep -n "role !== 'MANAGER'" src/components/carrier/contracts/ContractList.tsx      # 0 matches
grep -n "role !== 'MANAGER'" "src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx" # 0 matches
grep -n "isOwnerOrManager" src/components/carrier/dispatches/StopTimelineCard.tsx   # 0 matches
grep -n "isOwnerOrManager" src/components/carrier/dispatches/StopDocumentList.tsx   # 0 matches

# 3. hasPermission wired in the 4 server pages
grep -n "hasPermission" "src/app/(owner)/carrier/clients/page.tsx"           # >= 1 match
grep -n "hasPermission" "src/app/(owner)/carrier/contracts/page.tsx"         # >= 1 match
grep -n "hasPermission" "src/app/(owner)/carrier/clients/[id]/page.tsx"      # >= 1 match
grep -n "hasPermission" "src/app/(owner)/carrier/dispatches/[id]/page.tsx"   # >= 1 match

# 4. The 10 intentional role-string gates listed in the audit are UNCHANGED
grep -n "role !== 'OWNER' && session.role !== 'MANAGER'" src/app/api/v1/carrier/stops/[id]/messages/route.ts  # still present
grep -n "session.role !== 'OWNER' && session.role !== 'MANAGER'" "src/app/(owner)/carrier/stops/[id]/page.tsx"  # still present
```

**Behavioral verification (manual, deferred to user if needed):**
- Login as noorshadeed25@gmail.com → "New Client" button now visible.
- Login as OWNER → no regression on any of the 5 gated UI elements.
- Login as DRIVER → continues to not see any of the gated UI (DRIVER role is blocked at the route guard layer; this fix is downstream of that).
</verification>

<success_criteria>
1. Five role-string gates in carrier UI replaced with hasPermission-derived props.
2. No client component computes permission state — all checks done in server components.
3. TypeScript compiles clean (`npx tsc --noEmit` in `apps/web` exits 0).
4. The 10 intentional role-string gates (per the audit) are untouched.
5. hasPermission helper signature unchanged.
6. No DB schema changes, no new permission keys added.
7. Prop naming: `canCreate` for ClientList + ContractList; `canCreateContract` for ClientDetail; `canManage` for stops components.
</success_criteria>

<output>
After completion, create `.planning/quick/396-tkt-0039-fix-replace-role-string-gates-w/396-SUMMARY.md` documenting:
- Files modified (all 10)
- What changed in each
- Verification commands run and their results
- Any deviations from the plan and why
- Whether manual smoke test was performed and the outcome
</output>
