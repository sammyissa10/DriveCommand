---
phase: quick-551
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/maps/live-map-wrapper.tsx
  - apps/web/src/components/tracking/LiveBoard.tsx
  - apps/web/src/app/(owner)/live-map/page.tsx
  - apps/web/src/components/navigation/sidebar.tsx
  - apps/web/tests/carrier/document-import-commit-rollback.test.ts
  - apps/web/tests/carrier/document-import-commit-windows.test.ts
  - apps/web/tests/carrier/document-import-commit-notification-isolation.test.ts
autonomous: true

must_haves:
  truths:
    - "An owner opening /live-map from a cold start sees the Drivers | Trucks control in the header row beside Map | List, without having to switch to List first."
    - "The map is still what renders on a cold start — viewMode's initial value is unchanged."
    - "Tapping Drivers or Trucks reveals the board (viewMode switches to 'list') and selects that projection."
    - "A long FilterChips row scrolls inside its own track instead of pushing the two toggles off the right edge."
    - "When the board's FIRST fetch fails, the panel says so and offers a retry — it is not a bare banner over an empty body."
    - "A 'Live Board' entry exists in the sidebar's Intelligence group and lands on /live-map?view=board, which opens with the board showing."
    - "The three document-import commit suites delete their NotificationLog rows before deleting the tenant, and re-count them in `survivors`."
  artifacts:
    - path: "apps/web/src/components/maps/live-map-wrapper.tsx"
      provides: "The single control row holding FilterChips + BoardToggle + ViewToggle; owns boardView state; accepts initialViewMode."
      contains: "BoardToggle"
    - path: "apps/web/src/components/tracking/LiveBoard.tsx"
      provides: "Controlled board (view arrives as a prop) with an explicit first-load-failed state."
      contains: "view: BoardView"
    - path: "apps/web/src/app/(owner)/live-map/page.tsx"
      provides: "?view=board -> initialViewMode='list'"
      contains: "searchParams"
    - path: "apps/web/src/components/navigation/sidebar.tsx"
      provides: "Live Board nav entry inside the existing liveMap PermissionGuard"
      contains: "/live-map?view=board"
  key_links:
    - from: "apps/web/src/components/maps/live-map-wrapper.tsx"
      to: "apps/web/src/components/tracking/LiveBoard.tsx"
      via: "view prop"
      pattern: "<LiveBoard view=\\{boardView\\}"
    - from: "apps/web/src/app/(owner)/live-map/page.tsx"
      to: "apps/web/src/components/maps/live-map-wrapper.tsx"
      via: "initialViewMode prop"
      pattern: "initialViewMode="
---

<objective>
Surface the Phase 11 live board. Today the Drivers | Trucks control is buried inside `LiveBoard`,
which only mounts after someone finds and presses `List` — so from a cold start the board is
invisible and nothing on screen suggests it exists. This plan lifts that control into the KPI header
row so it sits beside `Map | List`, gives the board a real navigation entry, fixes the blank body
`LiveBoard` renders when its first fetch fails, fixes the `FilterChips` overflow in the same row, and
closes a `NotificationLog` teardown hole that recreates the orphan-tenant bug.

Purpose: a feature nobody can find is a feature nobody has.
Output: 4 source files changed, 3 test files hardened. No DDL. No new dependencies.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/document-import/11-SUMMARY.md
@apps/web/src/components/maps/live-map-wrapper.tsx
@apps/web/src/components/tracking/LiveBoard.tsx
@apps/web/src/components/tracking/BoardToggle.tsx
@apps/web/src/components/tracking/ViewToggle.tsx
@apps/web/src/components/tracking/FilterChips.tsx
</context>

<decisions_locked>
These are decided. Implement them; do not re-litigate them.

- **Map stays the default.** `viewMode`'s default value stays `'map'`. Only an explicit
  `?view=board` in the URL changes it.
- **The board is a PEER of the map, not a replacement.**
- **Do NOT modify** `board-lookup.ts`, `board-view.ts`, `board-status.ts`, `board-constants.ts`,
  `BoardRow.tsx`, `BoardToggle.tsx`, `ViewToggle.tsx`, or `FilterChips.tsx`. The overflow fix goes on
  the CONSUMER (`live-map-wrapper.tsx`), per the quick-519 rule: fix layout on the consumer, never on
  a shared component other pages also render.
- **`layoutId` must stay distinct.** `BoardToggle` uses `layoutId="board-toggle-indicator"` and
  `ViewToggle` uses `layoutId="view-toggle-indicator"`. Framer Motion matches `layoutId` GLOBALLY, so
  putting these two controls in the same row is only safe because the ids differ. Do not unify them.
- **No `useSearchParams` in `sidebar.tsx`.** The sidebar renders on every owner page; adding
  `useSearchParams` to it risks a Next 16 "should be wrapped in a suspense boundary" build failure
  across the whole app. The board entry therefore gets no `isActive` prop and the existing
  `Live Map` entry keeps its `pathname.startsWith("/live-map")` highlight — which is honest, since
  the board IS that page.
- **No `owner-more-menu.tsx` entry.** Verified: `app/(owner)/live-map/LiveMapMobile.tsx` does not
  import or render `LiveBoard` at all — the board is desktop-only (`hidden lg:block`). A mobile menu
  item pointing at a board that cannot render there is the "screen states something it cannot
  deliver" class this codebase keeps having to retract. If the board is wanted on mobile, that is a
  separate task that builds it.
</decisions_locked>

<tasks>

<task type="auto">
  <name>Task 1: Lift the board toggle into the KPI control row, make LiveBoard controlled, and fix its first-load-failed state</name>
  <files>
apps/web/src/components/maps/live-map-wrapper.tsx
apps/web/src/components/tracking/LiveBoard.tsx
  </files>
  <action>
Two files, one change — `LiveBoard` becomes controlled, so both must move together or `tsc` fails.

**A. `apps/web/src/components/tracking/LiveBoard.tsx`**

A1. Add three copy constants directly below the existing `const POLL_INTERVAL_MS = 15_000;` line
(NOT in `board-constants.ts`, which is out of scope):

```ts
/**
 * Two sentences, deliberately, because there are two situations.
 *
 * A poll that fails while rows are already on screen is a REFRESH failure — the
 * board is stale but usable. A first fetch that fails means nothing has ever
 * loaded, and telling that person "we could not refresh" describes a state they
 * have never been in. quick-550's collapse in one line: one string standing for
 * two facts.
 */
const BOARD_REFRESH_FAILED_COPY = 'We could not refresh the board.';
const BOARD_LOAD_FAILED_TITLE = 'We could not load the board.';
const BOARD_LOAD_FAILED_BODY =
  'Nothing has loaded yet. Check your connection, then try again.';
```

A2. Replace the `error` string state with a boolean. Change
`const [error, setError] = useState<string | null>(null);`
to
`const [failed, setFailed] = useState(false);`
In `fetchBoard`'s success path change `setError(null);` to `setFailed(false);`.
In `fetchBoard`'s catch change `setError('We could not refresh the board.');` to `setFailed(true);`.
Keep the existing comment above it about keeping the last good payload on screen.

A3. Delete the local `view` state and take it as a prop. Remove
`const [view, setView] = useState<BoardView>('drivers');` and change the signature from
`export function LiveBoard() {` to:

```tsx
/**
 * `view` is a PROP, not state. It is owned by `live-map-wrapper.tsx` so that the
 * Drivers | Trucks control can live in the KPI header row beside Map | List and
 * be visible from a cold start — which is the whole point: this board used to be
 * unreachable until someone found `List` first.
 *
 * The "toggle must not refetch" property in this file's header is unaffected:
 * `/live-board` still returns BOTH projections in one response, and selecting a
 * projection is still an array pick over state that is already in memory.
 * Lifting the control did not add a fetch to that path.
 */
export function LiveBoard({ view }: { view: BoardView }) {
```

A4. Remove the now-duplicated `<BoardToggle ... />` from this component's header bar and remove the
`counts` variable that only fed it. Replace the header bar's left-hand side with a label built as a
SINGLE string (per the quick-517 rule — a sentence containing a count goes through one string, never
inline JSX with sibling text nodes). Add this helper directly above `export function LiveBoard`:

```ts
function rowCountLabel(view: BoardView, count: number): string {
  const noun = view === 'drivers' ? 'driver' : 'truck';
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
```

The header bar (currently lines ~124-136) becomes:

```tsx
      <div className="flex shrink-0 items-center justify-between gap-4 border-b px-4 py-3">
        <p className="text-sm font-medium text-muted-foreground">
          {rows === null ? '' : rowCountLabel(view, rows.length)}
        </p>
        <button
          type="button"
          onClick={manualRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          aria-label="Refresh the board"
        >
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </button>
      </div>
```

Note this must be placed AFTER the `rows` const if `rows` is not in scope there — it already is,
because `rows` is computed above the `return`. Leave that computation where it is.

A5. Update the stale-banner block. It currently reads `{error && (...)}` and interpolates `error`.
It becomes (banner only when there IS a payload — a first-load failure gets the full panel in A6,
not a banner over nothing):

```tsx
      {failed && payload && (
        <div
          role="status"
          className="flex shrink-0 items-center gap-2 border-b bg-status-warning-bg px-4 py-2 text-xs text-status-warning-foreground"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {`${BOARD_REFRESH_FAILED_COPY} These rows were last updated at ${new Date(payload.computedAt).toLocaleTimeString()}.`}
        </div>
      )}
```

A6. Fix the bare error state. Replace the whole `rows === null ? ( !error ? (...) : null )` head of
the body block. The `: null` is the bug — a first fetch that fails renders an empty scroll area. New
shape for the body div's first two branches (the `rows.length === 0` EmptyState branch and the
`rows.map(...)` branch below are UNCHANGED):

```tsx
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows === null ? (
          failed ? (
            <div className="flex h-64 flex-col items-center justify-center px-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-status-warning-bg">
                <AlertCircle
                  className="h-6 w-6 text-status-warning-foreground"
                  aria-hidden="true"
                />
              </span>
              <p className="mt-3 text-sm font-semibold">{BOARD_LOAD_FAILED_TITLE}</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {BOARD_LOAD_FAILED_BODY}
              </p>
              <button
                type="button"
                onClick={manualRefresh}
                disabled={refreshing}
                className="mt-4 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                Try again
              </button>
            </div>
          ) : (
            <>
              <RowSkeleton />
              <RowSkeleton />
              <RowSkeleton />
            </>
          )
        ) : rows.length === 0 ? (
```

A7. Clean the imports. `BoardToggle` is no longer used here; the TYPE still is. Change
`import { BoardToggle, type BoardView } from './BoardToggle';`
to
`import type { BoardView } from './BoardToggle';`
`AlertCircle`, `RotateCw`, `Truck`, `Users` all remain in use — do not remove them.

**B. `apps/web/src/components/maps/live-map-wrapper.tsx`**

B1. Add the import beside the existing tracking imports (after the `LiveBoard` import on line 16):

```ts
import { BoardToggle, type BoardView } from '@/components/tracking/BoardToggle';
```

B2. Add state next to the existing `viewMode` state (around line 61-62). Leave line 61 EXACTLY as it
is — `useState<'map' | 'list'>('map')` — Task 2 is the only thing that touches it:

```ts
  const [boardView, setBoardView] = useState<BoardView>('drivers');
```

B3. Add a handler next to the other `useCallback`s (e.g. below `handleViewTrip`):

```ts
  /**
   * Choosing a projection also REVEALS the board. The Drivers | Trucks control is
   * the affordance that tells an owner the board exists, so a tap that selects a
   * projection while the map stays up would be a control that appears to do
   * nothing — quick-546's "a tap must produce visible feedback" in another shape.
   */
  const handleBoardViewChange = useCallback((next: BoardView) => {
    setBoardView(next);
    setViewMode('list');
  }, []);
```

B4. Rewrite the control row (currently lines 169-176). Before:

```tsx
          <div className="flex items-center justify-between gap-4">
            <FilterChips ... />
            <ViewToggle view={viewMode} onViewChange={setViewMode} />
          </div>
```

After — the `min-w-0 flex-1` wrapper is the documented flex lesson: `FilterChips`'s root is
`flex ... overflow-x-auto` with no `min-w-0` and no `flex-1`, so inside a `justify-between` parent it
sizes to its content and squeezes the toggles off the right edge. Giving it a zero-minimum track lets
its own `overflow-x-auto` do the job it was written to do:

```tsx
          <div className="flex items-center justify-between gap-4">
            {/*
              min-w-0 + flex-1: FilterChips already carries `overflow-x-auto`, but a
              flex item's default min-width is `auto`, so it grows to content width
              and pushes the controls out instead of scrolling. The zero-minimum
              track is what makes the overflow rule take effect.
            */}
            <div className="min-w-0 flex-1">
              <FilterChips
                statusCounts={statusCounts}
                activeStatus={activeStatusFilter}
                onStatusChange={setActiveStatusFilter}
              />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {/*
                Dimmed while the map is up: the board's projection is selected but
                not in effect, and a fully-lit segmented control beside a map reads
                as "the map is filtered to drivers", which it is not.
              */}
              <div
                className={`transition-opacity ${viewMode === 'map' ? 'opacity-60' : ''}`}
              >
                <BoardToggle view={boardView} onViewChange={handleBoardViewChange} />
              </div>
              <ViewToggle view={viewMode} onViewChange={setViewMode} />
            </div>
          </div>
```

B5. Pass the projection down. Change `<LiveBoard />` (line ~291) to `<LiveBoard view={boardView} />`.
Leave the long comment block above it untouched.

**Accepted trade, stated rather than hidden:** the header `BoardToggle` renders WITHOUT `counts`.
Counts live in the board's payload, which does not exist until the board mounts, so a header control
would show counts only after you had already opened the board — a control that is sometimes annotated
and sometimes not is worse than one that never is. A4 recovers the information in a better place: a
`3 drivers` label above the list that reflects what is actually rendered.
  </action>
  <verify>
1. `cd apps/web && npx tsc --noEmit` — must be 0 errors.
   **Check the gate is not blind (CLAUDE.md):** if every reported error is a SYNTAX error, or every
   error is in a file you did not touch (especially under `.next/`), tsc has skipped semantic
   checking. In that case delete `apps/web/.next/dev/types/validator.ts` and
   `apps/web/tsconfig.tsbuildinfo` and re-run. Then PROBE: temporarily add
   `const __probe: number = 'x';` to `LiveBoard.tsx`, confirm tsc reports THAT error, and delete the
   probe before committing.
2. `grep -n "BoardToggle" apps/web/src/components/tracking/LiveBoard.tsx` — must show only the
   `import type { BoardView }` line, i.e. no `<BoardToggle` JSX remains in that file.
3. `grep -n "layoutId" apps/web/src/components/tracking/BoardToggle.tsx apps/web/src/components/tracking/ViewToggle.tsx`
   — must still print two DIFFERENT ids.
4. `grep -n ": null" apps/web/src/components/tracking/LiveBoard.tsx` — the old bare-error branch must
   be gone.
5. `grep -n "useState<'map' | 'list'>('map')" apps/web/src/components/maps/live-map-wrapper.tsx` —
   must still match. The map is still the default.
  </verify>
  <done>
`tsc` is clean and probed. The KPI header row renders FilterChips (scrollable, in a `min-w-0 flex-1`
track), then `Drivers | Trucks`, then `Map | List`. `LiveBoard` takes `view` as a prop, has no toggle
of its own, and renders an explicit titled + retryable panel when its first fetch fails instead of an
empty body under a banner. Two distinct failure sentences exist for the two distinct failures.
  </done>
</task>

<task type="auto">
  <name>Task 2: Give the board a URL and a sidebar entry</name>
  <files>
apps/web/src/app/(owner)/live-map/page.tsx
apps/web/src/components/maps/live-map-wrapper.tsx
apps/web/src/components/navigation/sidebar.tsx
  </files>
  <action>
A nav entry needs somewhere to point. `/live-map?view=board` is read on the SERVER and passed down as
an initial prop — deliberately not `useSearchParams()` in the client wrapper, which would drag a
Suspense requirement into a component tree that does not need one.

**A. `apps/web/src/app/(owner)/live-map/page.tsx`**

A1. Give the page a props argument. The repo's Next 16 convention (see
`app/(admin)/notifications/page.tsx:30`) is an awaited Promise. Change:

```ts
export default async function LiveMapPage() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);
```

to:

```ts
export default async function LiveMapPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  /**
   * `?view=board` is how the sidebar's Live Board entry lands on the board. It is
   * read here rather than with `useSearchParams()` in the client wrapper so that
   * no component in this tree acquires a Suspense requirement. Anything other than
   * the literal 'board' falls through to the map, which stays the default.
   */
  const { view } = await searchParams;
  const initialViewMode = view === 'board' ? ('list' as const) : ('map' as const);
```

A2. Pass it to the DESKTOP wrapper only. Change
`<LiveMapWrapper initialVehicles={vehicles} />`
to
`<LiveMapWrapper initialVehicles={vehicles} initialViewMode={initialViewMode} />`.
Leave the `<LiveMapMobile ... />` line completely untouched — that component has no board.

**B. `apps/web/src/components/maps/live-map-wrapper.tsx`**

B1. Extend the props interface (currently lines 39-41):

```ts
interface LiveMapWrapperProps {
  initialVehicles: VehicleLocation[];
  /** 'list' only when the URL asked for the board. Defaults to 'map'. */
  initialViewMode?: 'map' | 'list';
}
```

B2. Change the signature from
`export default function LiveMapWrapper({ initialVehicles }: LiveMapWrapperProps) {`
to
`export default function LiveMapWrapper({ initialVehicles, initialViewMode = 'map' }: LiveMapWrapperProps) {`

B3. Change line ~61 from
`const [viewMode, setViewMode] = useState<'map' | 'list'>('map');`
to
`const [viewMode, setViewMode] = useState<'map' | 'list'>(initialViewMode);`
The default parameter in B2 is what preserves "map is the default" — every caller that does not
explicitly ask for the board still gets the map.

**C. `apps/web/src/components/navigation/sidebar.tsx`**

C1. Add a second `SidebarMenuItem` immediately after the existing Live Map item, INSIDE the same
`<SidebarMenu>` and therefore inside the same `<PermissionGuard permission="liveMap">` (the block
starts at line ~114). The closing `</SidebarMenuItem>` of the Live Map entry is the anchor:

```tsx
                  {/*
                    quick-551. The board is a view of this same page, reached with
                    ?view=board. No `isActive` prop: resolving it would need
                    `useSearchParams`, and this sidebar renders on every owner page,
                    where that hook risks a Next 16 prerender/Suspense build failure.
                    `Live Map` staying lit while the board is open is honest — it is
                    that page.
                  */}
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Live Board">
                      <Link href="/live-map?view=board" onClick={handleNavClick}>
                        <ListChecks />
                        <span>Live Board</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
```

`ListChecks` is ALREADY imported from `lucide-react` at the top of this file — do not add an import.
Do not change the existing Live Map item's `isActive={pathname.startsWith("/live-map")}`.

C2. Do NOT touch `owner-more-menu.tsx`. See `<decisions_locked>` — `LiveMapMobile` does not render
the board, so a mobile entry would point at a screen that cannot show it.
  </action>
  <verify>
1. `cd apps/web && npx tsc --noEmit` — 0 errors, with the same blind-gate check and probe as Task 1
   (probe `page.tsx` this time).
2. `grep -n "initialViewMode" apps/web/src/app/\(owner\)/live-map/page.tsx apps/web/src/components/maps/live-map-wrapper.tsx`
   — must show the derivation, the pass-down, the interface field, the defaulted parameter and the
   `useState` seed.
3. `grep -n "LiveMapMobile" apps/web/src/app/\(owner\)/live-map/page.tsx` — the mobile line must be
   unchanged (no `initialViewMode` on it).
4. `grep -n "live-map?view=board" apps/web/src/components/navigation/sidebar.tsx` — exactly one hit.
5. `grep -rn "live-map" apps/web/src/components/navigation/owner-more-menu.tsx` — must return NOTHING.
6. `grep -n "useSearchParams" apps/web/src/components/navigation/sidebar.tsx` — must return NOTHING.
  </verify>
  <done>
`/live-map` still opens on the map. `/live-map?view=board` opens with the board showing. A
`Live Board` entry sits under `Live Map` in the sidebar's Intelligence group, behind the same
`liveMap` permission. The mobile menu is untouched.
  </done>
</task>

<task type="auto">
  <name>Task 3: Delete NotificationLog rows in the three commit suites' teardown</name>
  <files>
apps/web/tests/carrier/document-import-commit-rollback.test.ts
apps/web/tests/carrier/document-import-commit-windows.test.ts
apps/web/tests/carrier/document-import-commit-notification-isolation.test.ts
  </files>
  <action>
`NotificationLog` has `tenant Tenant @relation(fields: [tenantId], references: [id])` with no
`onDelete`, i.e. **RESTRICT** — the same shape as `in_app_notifications.org_id`. It is in none of the
three delete lists, and 2 rows exist live for the throwaway tenants these suites created. That is the
orphan-tenant bug the operator is cleaning up by hand right now, still armed.

Note the model is `NotificationLog` (no `@@map`) and its scope column is **`tenantId`**, not `orgId`
— unlike `InAppNotification`, which is `orgId`. Use `where: { tenantId }` for the former and leave
the latter's `where: { orgId: tenantId }` exactly as it is.

In EACH of the three files, make two edits.

**Edit 1 — the delete.** Find the existing `await tx.inAppNotification.deleteMany({ where: { orgId: tenantId } });`
inside `afterAll` (rollback line ~519, windows line ~474, notification-isolation line ~451). Insert
IMMEDIATELY ABOVE it, keeping the existing Phase 10 comment that sits above that line where it is
(the new comment goes between that comment and the `inAppNotification` call, or directly above the
new call — either is fine so long as the two deletes end up adjacent):

```ts
      // quick-551: `NotificationLog.tenantId` is a RESTRICT foreign key to Tenant,
      // exactly like `in_app_notifications.org_id` below it, and it was NOT in this
      // list. Rows landed here from the same Phase 10 emits. Omitting it re-creates
      // the failure the line below was added to fix — every assertion passes and the
      // FILE fails afterwards on a foreign-key violation, leaving an orphan tenant
      // in production. (`TenantNotificationSettings` is CASCADE and correctly absent.)
      await tx.notificationLog.deleteMany({ where: { tenantId } });
```

**Edit 2 — the re-count.** Each suite builds a `survivors` object right after the delete transaction
and throws on anything non-zero. Add a line to each so the verification actually covers the new
table. Insert it immediately after the `users: await tx.user.count({ where: { tenantId } }),` line in
all three files:

```ts
      notificationLogs: await tx.notificationLog.count({ where: { tenantId } }),
```

(In `document-import-commit-notification-isolation.test.ts` the `survivors` object is inside a
`bypass(async (tx) => ({ ... }))` at ~line 458; in `document-import-commit-windows.test.ts` at ~481;
in `document-import-commit-rollback.test.ts` at ~527. Same insertion point in each: after `users`.)

Make no other change to these files. In particular do NOT reorder the existing deletes, do NOT add
`tenantNotificationSettings`, and do NOT touch the second cleanup helpers further down the files
(e.g. rollback lines ~734-737) — those are per-test resets scoped to dispatch data, not tenant
teardown.
  </action>
  <verify>
1. `cd apps/web && npx tsc --noEmit` — 0 errors, same blind-gate check and probe as Task 1 (probe one
   of the three test files this time; they are inside the tsc program).
2. `grep -c "notificationLog" apps/web/tests/carrier/document-import-commit-rollback.test.ts apps/web/tests/carrier/document-import-commit-windows.test.ts apps/web/tests/carrier/document-import-commit-notification-isolation.test.ts`
   — each file must report **2** (one deleteMany, one count).
3. `grep -n "notificationLog.deleteMany" -A 1 apps/web/tests/carrier/*.test.ts` — the line after each
   must be the `inAppNotification.deleteMany` call, proving the ordering (both before
   `tenant.deleteMany`).
4. `grep -n "tenantNotificationSettings" apps/web/tests/carrier/` — must return NOTHING.

**Do NOT run these test files.** They point at PRODUCTION (there is no local database — DEC-3) and
each run creates and destroys a disposable tenant. The change is a teardown-only addition verified by
inspection and by `tsc`; running them is the operator's call, not the executor's.
  </verify>
  <done>
All three suites delete their `NotificationLog` rows before deleting the tenant, and all three
re-count `notificationLogs` in `survivors`, so a future regression fails loudly instead of leaving an
orphan tenant behind.
  </done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` → 0 errors, PROVEN non-blind by a probe that tsc reported and
   that was then deleted. Confirm no `__probe.ts` file survives anywhere
   (`git status --porcelain` must be clean of untracked probes).
2. `git status --porcelain` lists exactly the 7 files in `files_modified` and nothing else.
3. `grep -rn "board-lookup\|board-status\|board-constants\|BoardRow" --include=*.tsx --include=*.ts apps/web/src | git diff --stat` — the diff must not include
   `board-lookup.ts`, `board-view.ts`, `board-status.ts`, `board-constants.ts`, `BoardRow.tsx`,
   `BoardToggle.tsx`, `ViewToggle.tsx` or `FilterChips.tsx`. Verify with `git diff --name-only`.
4. No new dependency: `git diff --name-only` must not contain `package.json` or any lockfile.
5. No DDL: `git diff --name-only` must not contain `prisma/schema.prisma` or anything under
   `prisma/migrations/`.
</verification>

<success_criteria>
- `npx tsc --noEmit` in `apps/web` is clean and probed.
- `/live-map` cold start: the map renders, and the header row shows FilterChips · Drivers|Trucks ·
  Map|List. The Drivers|Trucks control is visible without any prior interaction.
- Clicking `Drivers` or `Trucks` switches the panel to the board and selects that projection.
- A long FilterChips row scrolls; the two toggles stay on screen.
- `LiveBoard`'s first-fetch failure renders a titled panel with a `Try again` button, not a blank body.
- `/live-map?view=board` opens on the board; a `Live Board` entry exists in the sidebar.
- The three commit suites delete and re-count `NotificationLog`.
- 3 commits, one per task.
</success_criteria>

<output>
Three commits, in task order:
1. `fix(quick-551): surface the board toggle in the live control row`
2. `feat(quick-551): give the live board a URL and a sidebar entry`
3. `fix(quick-551): delete NotificationLog rows in commit-suite teardown`

Do NOT push. The orchestrator pushes once at the end.

Then create `.planning/quick/551-surface-the-live-board-and-cleanup/551-SUMMARY.md`.
</output>
</content>
</invoke>
