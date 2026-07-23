# Quick-499: Surface driver dispatch-readiness in New Load — Summary

**One-liner:** New Load's Primary/Co-Driver dropdowns now tag drivers whose CDL onboarding isn't complete ("Not dispatch-ready"), an amber inline warning appears with a link to the driver when a not-ready primary driver is selected (submit stays enabled), and both Create & Dispatch failure paths now redirect to the created load's detail page — which shows a dismissible amber banner — instead of the loads list.

## What was broken

Today, Create & Dispatch saves the load, POSTs to `/api/v1/carrier/dispatches`, and the Phase 45 readiness gate (`trips.ts:198-208`) returns 409 `DRIVER_NOT_DISPATCH_READY` for any driver still mid-onboarding. The only feedback was a 6s toast before redirecting to the loads list — the customer's driver/truck/departure inputs vanished with no trail, and there was no pre-flight signal in the New Load form about which drivers weren't ready yet.

## What changed (2 commits)

### Task 1 — `36455135` — Thread readiness into New Load + pre-flight UI + redirect-to-detail
- **`new/page.tsx`**: `prisma.carrierDriver.findMany` now selects `user: { select: { isDispatchReady: true } }`; `driverOptions` derives `isDispatchReady: d.user?.isDispatchReady ?? false` (a driver with no linked User — pre-invite-acceptance — is treated as NOT ready).
- **`LoadForm.tsx`**:
  - `DriverOption` type gained an optional `isDispatchReady?: boolean`.
  - Primary Driver and Co-Driver `<option>` labels append `" - Not dispatch-ready"` (text-only tag, native `<option>` can't be styled) when `isDispatchReady === false`.
  - A new `selectedPrimaryDriver` derivation plus an amber inline warning box (`bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800`, text `text-amber-800 dark:text-amber-300`) renders under the Primary Driver field when the selected driver isn't ready, with copy: "This driver hasn't completed onboarding requirements yet. The load will be saved, but the trip can't start until they're ready." plus a "View driver" link to `/carrier/fleet/drivers/[id]` (added `next/link` import). Submit button logic is untouched — stays enabled.
  - Both dispatch-failure branches (`DRIVER_NOT_DISPATCH_READY` and the generic else) now keep their existing toasts but redirect to `` `/carrier/loads/${savedId}?dispatch_failed=not_ready&driver=${encodeURIComponent(driverName)}` `` or `` `/carrier/loads/${savedId}?dispatch_failed=other` `` instead of `router.push('/carrier/loads')`.

### Task 2 — `48768af9` — Dismissible dispatch-failed banner on load detail page
- **New `DispatchFailedBanner.tsx`** (client component): reads `dispatch_failed`/`driver` from `useSearchParams()`; renders `null` if the param is absent or locally dismissed. Composes reason-specific copy — `not_ready` names the driver (falling back to "the selected driver" when the name is empty) and points at "Complete their onboarding checklist, then use Add to Trip"; `other` says the trip couldn't be started and to use Add to Trip later. Styled as an amber box matching the constraint tokens, with an `aria-label="Dismiss"` button (X icon) that sets local `dismissed` state AND strips `dispatch_failed`/`driver` from the URL via `router.replace(pathname + ...)` built from `usePathname()`/`useRouter()`.
- **`[id]/page.tsx`**: imports and renders `<DispatchFailedBanner />` above `<ResponsiveSwitch>` (wrapped return in a fragment) so it shows on both mobile and desktop branches without touching `LoadDetailMobile` internals. Also threaded `isDispatchReady` into this page's `rawDrivers` query/`driverOptions` (optional item from the plan) for future reuse by an Add-to-Trip picker — no other behavior changed.

## Verification results

- `npx tsc --noEmit` from `apps/web` — 0 errors (clean, no output).
- `npx next build` from `apps/web` — `✓ Compiled successfully in 28.7s`; only the pre-existing, unrelated Turbopack NFT-trace warning on `next.config.ts` (documented baseline noise, present regardless of this change).
- Grep confirms readiness threaded query → `DriverOption` → label + warning (`isDispatchReady` in `new/page.tsx` select + `driverOptions`; tag/warning/both redirects in `LoadForm.tsx`).
- `git diff --name-only` across both commits shows no `lib/carrier/trips.ts` change and no `schema.prisma`/migration change.
- Driver link confirmed as `/carrier/fleet/drivers/[id]` (not `/carrier/drivers/[id]`).

### Reasoned-through scenarios (per constraints)
- **Ready-driver happy path**: `isDispatchReady !== false` (true) → no dropdown tag, no inline warning; successful dispatch still redirects to `/carrier/dispatches/{newDispatchId}` exactly as before — unchanged.
- **Not-ready driver selected**: dropdown option shows "- Not dispatch-ready"; `selectedPrimaryDriver.isDispatchReady === false` renders the amber warning with a working "View driver" link; the submit button has no dependency on `isDispatchReady` anywhere in its `disabled` logic, so it remains enabled and the load still saves normally.
- **Not-ready dispatch 409**: `dispatchJson.error === 'DRIVER_NOT_DISPATCH_READY'` branch fires the existing toast, then `router.push` lands on `/carrier/loads/{savedId}?dispatch_failed=not_ready&driver=<name>` — the detail page renders `DispatchFailedBanner`, which decodes the driver param and shows the not-ready copy naming them (or "the selected driver" if the name somehow came through empty).
- **Other dispatch failure**: the `else` branch keeps its existing toast and pushes to `/carrier/loads/{savedId}?dispatch_failed=other` — the banner shows the generic "couldn't be started" copy. Dismissing either banner sets local state to hide it immediately and strips both query params via `router.replace`, so a refresh or back-navigation doesn't resurrect it.

## Deviations from plan

None — plan executed exactly as written, including the optional `isDispatchReady` threading into `[id]/page.tsx`'s `driverOptions` (assessed as low-risk/additive and shipped).

## Not done (explicitly out of scope per plan)

- `trips.ts` readiness gate logic — untouched, no override/bypass added.
- No Prisma schema or migration change — the banner is derived entirely from the URL query param plus local component state.
- `NewLoadMobile` / `LoadDetailMobile` internals — untouched; the banner is a separate shared component rendered above `ResponsiveSwitch` so it applies to both branches without modifying mobile component code.
- Dispatches API contract (`/api/v1/carrier/dispatches`) — unchanged.
- Not deployed, not pushed — commits only (orchestrator handles the final push/deploy decision).

## Files changed

- `apps/web/src/app/(owner)/carrier/loads/new/page.tsx`
- `apps/web/src/components/carrier/loads/LoadForm.tsx`
- `apps/web/src/components/carrier/loads/DispatchFailedBanner.tsx` (new)
- `apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx`

## Commits

- `36455135` feat(quick-499): thread driver dispatch-readiness into New Load section
- `48768af9` feat(quick-499): dismissible dispatch-failed banner on load detail page

## Self-Check: PASSED

- `apps/web/src/app/(owner)/carrier/loads/new/page.tsx` — FOUND
- `apps/web/src/components/carrier/loads/LoadForm.tsx` — FOUND
- `apps/web/src/components/carrier/loads/DispatchFailedBanner.tsx` — FOUND
- `apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx` — FOUND
- Commit `36455135` — FOUND
- Commit `48768af9` — FOUND
