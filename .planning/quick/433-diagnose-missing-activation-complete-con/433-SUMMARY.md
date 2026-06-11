# Quick-433 Summary: Diagnose Missing Activation-Complete Congrats Moment

**Date:** 2026-06-11
**Status:** Complete (read-only diagnosis)

---

## Verdict: (b) Never Built

No congrats UI was ever built for the activation completion moment. The banner silently unmounts on the next navigation — no modal, toast, confetti, or positive signal has ever been wired to fire when `isActivated` flips to `true`.

---

## Evidence

### Task 1 — Hunt for Existing Activation-Completion UI

**`checklist.tsx` (the only congratulatory content found):**
`apps/web/src/app/onboarding/welcome/checklist.tsx` lines 28–39 has a `if (completionPct === 100)` branch that renders:
```tsx
<CheckCircle2 className="h-12 w-12 text-emerald-500" />
<h2>You're all set!</h2>
<p>Your fleet is ready to roll.</p>
<Button asChild><Link href="/carrier/dashboard">Go to Dashboard</Link></Button>
```
This is **only visible if the user manually navigates back to `/onboarding/welcome`** after completing all steps — passive/pull-based, not push. It does not surface proactively.

**`OnboardingReminderRibbon.tsx`:**
Returns `null` when `onboardingComplete === true`. No done-state branch. Banner silently disappears on next page load. No celebration, no message.

**Broad grep:** `congratsShownAt`, `confetti`, `all set`, `setup complete`, `welcome aboard`, `activated.*modal` — 5 files returned; none contain activation-completion UI outside `checklist.tsx`.

### Task 2 — Signal Path and Once-Only Mechanics

**Where `isActivated` flips:**
`apps/web/src/lib/onboarding/activation-tracker.ts` `recordActivationEvent()` — runs **entirely server-side** inside a Prisma transaction in a `next/server after()` background task. Nothing from this function reaches the client.

**Two final-step trigger paths, both server-only:**
1. `apps/web/src/app/(owner)/actions/loads.ts` lines 605–612: `updateLoadStatus()` → `recordActivationEvent(...)` called synchronously. Returns `{ success: true }` — no `isActivated`, no `justActivated` in the response.
2. `apps/web/src/lib/carrier/trips.ts` lines 614–627: `transitionTripStatus()` → `recordActivationEvent(...)` in `after()` callback, after the HTTP response is already sent.

**`ActivationProgress` schema — no acknowledgment field exists:**
```
id, tenantId, accountCreatedAt, firstRealTruckAt, firstRealDriverAt,
firstRealClientAt, firstRealLoadCreatedAt, firstLoadInTransitAt,
firstLoadDeliveredAt, completionPct, isActivated, createdAt, updatedAt
```
No `congratsShownAt`, no `activatedAcknowledgedAt`, no `seenAt`. The only once-only guard is `!current.isActivated` — used to prevent the `tenant.activated` AppEvent from firing twice, not to control UI display.

### Task 3 — Reusable Infra Inventory

**Toast system — sonner (globally mounted):**
- `apps/web/src/app/layout.tsx` line 59: `<Toaster richColors position="top-right" />` — available on all pages.
- 84 files import from `sonner` — the standard mechanism throughout the app.
- Pattern: `toast.success('message')`.

**Modal/dialog pattern:**
- `shadcn/ui AlertDialog` used in `TripSuccessBanner`, `CancelLoadModal`, `DispatchLoadModal`.
- Pattern: `AlertDialogContent` + `AlertDialogHeader` + `AlertDialogFooter`.

**`TripSuccessBanner` one-time-show pattern:**
- Trigger: `useSearchParams().get('showSuccess') === 'true'`
- `useEffect` reads the param, sets `visible = true`, then strips param via `window.history.replaceState` (no re-render, no loop).
- This is the existing URL-param-based one-time-show pattern.

---

## Root Cause — Three Gaps

1. **No acknowledgment flag** — `isActivated` is a business fact, not a UI state. Nothing on the client knows "this just completed and hasn't been shown yet."
2. **Activation fires in a background task server-side** — `recordActivationEvent` runs in `after()` after the HTTP response is sent; neither `updateLoadStatus` nor `transitionTripStatus` return a `justActivated` flag.
3. **Layout re-fetches `isActivated` only on full page navigation** — the ribbon disappears on next nav, not at the moment of completion.

---

## Recommendation

### One-Time-Trigger: Add `congratsShownAt DateTime?` to `ActivationProgress`

Presence of the timestamp = "already shown." Decouples "tenant is activated" from "tenant has seen the congrats."

### Hook-In Point: `OwnerShell` (client component, already receives `onboardingComplete`)

The `(owner)/layout.tsx` already fetches `isActivated`. Add `congratsShownAt` to the select, pass `isActivated` + `congratsShownAtNull: congratsShownAt === null` to `OwnerShell`. Add a `useEffect`:

```tsx
useEffect(() => {
  if (isActivated && congratsShownAtNull) {
    toast.success("Your fleet is all set! You've completed onboarding.", { duration: 6000 });
    fetch('/api/v1/carrier/activation/mark-congrats-shown', { method: 'POST' });
  }
}, [isActivated, congratsShownAtNull]);
```

The API endpoint sets `congratsShownAt = now`. On subsequent navigations: non-null → no-op.

### Alternative (no new DB column)

Return `justActivated: true` from `transitionTripStatus` / `updateLoadStatus` and fire `toast.success` in the client caller immediately. Not replay-safe (lost on hard-refresh before the user sees it). Simpler but weaker.

### Infra to Reuse

| Option | Complexity | Notes |
|--------|-----------|-------|
| `toast.success` (sonner) | Lowest | Already globally mounted, zero new components |
| `TripSuccessBanner` clone | Low | URL param `?activated=true` → redirect to dashboard |
| `AlertDialog` modal | Medium | Richer moment, matches existing modal patterns |

**Recommendation:** `toast.success` from sonner + `congratsShownAt` DB flag. Minimal new infrastructure, replay-safe, reuses global toast already mounted in root layout.
