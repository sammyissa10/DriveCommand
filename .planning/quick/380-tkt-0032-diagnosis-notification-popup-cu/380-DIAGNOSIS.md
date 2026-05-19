# TKT-0032 Diagnosis — Notification Popup Cut Off on /my-load

**Ticket:** TKT-0032
**Reporter:** hazemojel02@gmail.com
**Filed:** Apr 19, 2026
**Platform:** Mobile Web (apps/web in a phone browser — NOT React Native)
**Symptom:** Notification popup gets cut off on the /my-load page

---

## 1. /my-load Page Location

| File | Route |
|---|---|
| `apps/web/src/app/(driver)/my-load/page.tsx` | `/my-load` |
| `apps/web/src/app/(driver)/my-load/loading.tsx` | (skeleton loader) |
| `apps/web/src/app/(driver)/layout.tsx` | Wrapping layout — provides header, bottom nav, main padding |
| `apps/web/src/app/layout.tsx` | Root layout — provides Toaster, SupportTicketModal |

The page itself (`page.tsx`) is a thin server component: it calls `getMyLoads()` and renders `<CompletedLoadHistory loads={loads} />`. No toast triggers exist in the page file or the `CompletedLoadHistory` component.

---

## 2. Notification Popup Candidates

| # | Candidate | File:Line | Type | Notes |
|---|---|---|---|---|
| A | **DriverNotificationBell + DriverNotificationPanel** | `apps/web/src/components/driver/driver-notification-bell.tsx:53–77` / `apps/web/src/components/driver/driver-notification-panel.tsx:117` | Bell-icon dropdown in header | Active on all driver portal pages including /my-load. Panel is `absolute right-0 top-full`. **Primary suspect.** |
| B | **Global Toaster (sonner)** | `apps/web/src/app/layout.tsx:59` | Floating toast | `position="top-right"`, `richColors`. No toast calls originate from /my-load page or CompletedLoadHistory. No toast triggered here in normal flow. |
| C | **NotificationBell + NotificationCenter (owner)** | `apps/web/src/components/navigation/notification-bell.tsx:67–74` / `apps/web/src/components/navigation/notification-center.tsx:147` | Bell-icon dropdown in header | Owner portal only — NOT rendered on driver pages. Excluded. |
| D | **stop-messages.tsx toast** | `apps/web/src/components/driver/stop-messages.tsx:107,114` | Toast (sonner) | Fires on message-send errors — only on pages that mount StopMessages, not /my-load. |
| E | **messaging-panel.tsx toast** | `apps/web/src/components/driver/messaging-panel.tsx:72` | Toast (sonner) | Voice message error — only on messages page. Not /my-load. |

**Primary candidate: Candidate A** — The `DriverNotificationBell` + `DriverNotificationPanel` dropdown is mounted on every driver page via `apps/web/src/app/(driver)/layout.tsx:49`. This is the notification popup that can be triggered from /my-load.

**Secondary candidate: Candidate B** — The global Toaster at `position="top-right"` is mounted globally and could show toasts triggered by other components. However, the /my-load page and CompletedLoadHistory fire no toasts in the happy path. The Toaster is the more likely candidate on other driver pages (tasks, messages, pay) but is lower priority for /my-load specifically.

---

## 3. CSS Positioning Analysis Per Candidate

### Candidate A — DriverNotificationBell + DriverNotificationPanel

**Bell button container** (`driver-notification-bell.tsx:53`):
```
<div ref={containerRef} className="relative">
```
- `position: relative` — establishes containing block for the dropdown

**Bell button** (`driver-notification-bell.tsx:54–65`):
```
className="relative flex items-center justify-center h-8 w-8 rounded-md ..."
```
- Sitting inside `<header>` in the driver layout, on the right side: `flex items-center gap-2` at the end of the header flex row

**Dropdown wrapper** (`driver-notification-bell.tsx:68`):
```
<div className="absolute right-0 top-full mt-2 z-50">
```
- `position: absolute`
- `right: 0` — anchored to the right edge of the bell's `relative` container
- `top: 100% + 8px` (`top-full mt-2`) — positioned below the bell button
- `z-index: 50`
- **No `left` constraint** — the panel expands leftward from `right-0`

**Panel** (`driver-notification-panel.tsx:117`):
```
<div className="w-[calc(100vw-2rem)] sm:w-[380px] max-h-[480px] overflow-y-auto ...">
```
- `width: calc(100vw - 2rem)` on mobile (< 640px) — this equals `343px` on a 375px viewport
- `max-height: 480px`
- `overflow-y: auto`
- **No `max-width`** — the panel width alone is `calc(100vw - 2rem)`
- **No safe-area-inset** handling
- `z-index: 50` (set by z-50 class on the panel div)

**The critical geometry problem:**
The bell button sits at the far right of the header. The panel is `absolute right-0` (flush with the bell's right edge). The panel is `calc(100vw - 2rem)` = ~343px wide on a 375px viewport. Since it anchors `right-0` to the bell's right edge, the panel extends 343px to the LEFT from there. The bell is positioned roughly 16–24px from the right edge of the screen (inside `px-4` header padding). This means the LEFT edge of the panel can overflow outside the viewport's left edge:

- Bell right edge ≈ 4px from screen right (px-4 padding: 16px from left edge of bell + 8px gap + 8px button → rough right-edge = viewport - 16px - 8px - 32px = viewport - 56px; bell left edge ~= viewport - 88px, bell right edge ≈ viewport - 56px)
- Panel left edge = bell's right edge - panel width = (viewport - 56px) - (viewport - 32px) = **-24px** — overflowing LEFT

This means on a 375px mobile viewport the panel's left edge is clipped or the page scrolls horizontally, cutting off the left portion of the panel. This is the **horizontal cutoff** reported in TKT-0032.

### Candidate B — Global Toaster (sonner)

**Config** (`apps/web/src/app/layout.tsx:59`):
```tsx
<Toaster richColors position="top-right" />
```
- `position: top-right`
- Sonner default: the toast container is `position: fixed; right: max(var(--offset), env(safe-area-inset-right, 0px)); top: max(var(--offset), env(safe-area-inset-top, 0px));`
- Sonner default `--offset` is `32px`
- Sonner default toast width: `356px` (hard-coded in Sonner internals)
- On a 375px wide mobile viewport: `356px` toast + `16px` right offset = `372px` total from right. The toast fits, but barely. On a 360px viewport (older Android), it overflows by `356 - (360 - 16) = 12px`.
- No `toastOptions`, no `offset` prop, no mobile-specific overrides
- No `env(safe-area-inset-*)` in viewport meta (missing `viewport-fit=cover`) — safe-area inset for Toaster is `0px` effective
- **No toast triggered from /my-load page in normal flow** — this candidate is relevant to OTHER driver pages with toast calls, not /my-load specifically

---

## 4. /my-load Mobile Layout Obstructions

### Sticky Bottom Nav

**File:** `apps/web/src/components/driver/driver-bottom-nav.tsx:19–21`

```tsx
<nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-card border-t border-border ...
  pb-[env(safe-area-inset-bottom)]">
  <div className="flex items-stretch">
    {navItems.map(...)}  {/* each item: min-h-[60px] */}
```

- **Position:** `fixed bottom-0 left-0 right-0`
- **z-index:** `z-50` (50)
- **Visible on:** mobile only (`lg:hidden` — hidden on lg breakpoint and above)
- **Height:** `min-h-[60px]` per nav item = **60px minimum**, plus `pb-[env(safe-area-inset-bottom)]`
- On iPhone with home bar: `env(safe-area-inset-bottom)` adds ~34px → **~94px total nav height**
- **BUT** `viewport-fit=cover` is NOT set in `apps/web/src/app/layout.tsx` (only `width: device-width, initialScale: 1`) — so `env(safe-area-inset-bottom)` resolves to 0px in practice in a browser, meaning the bottom nav is **60px** visible and may overlap the device's native bottom chrome

**Content padding:** `apps/web/src/app/(driver)/layout.tsx:62`:
```tsx
<main className="p-4 pb-24 sm:p-6 lg:pb-6">{children}</main>
```
- `pb-24` = 96px bottom padding on mobile — **correctly accounts for the 60px bottom nav**, provides clearance. Content is not hidden behind the nav.

**Does bottom nav interfere with toast?** The Toaster is `position: fixed; top-right`, not bottom-positioned. The bottom nav does NOT obstruct the top-right toast. However, if Toaster were ever changed to `bottom-right` (Sonner default), the 60px bottom nav would fully obscure bottom-right toasts.

**Does bottom nav interfere with the notification dropdown?** The dropdown is `absolute top-full` (below the header) at the top of the page — the bottom nav at the bottom does not clip it. However, on a short mobile viewport with many notifications the `max-h-[480px]` panel can push DOWN toward the bottom nav. The panel has `overflow-y-auto`, so content scrolls inside. This should not cause visible cutoff of the panel container itself.

### Sticky Header

**File:** `apps/web/src/app/(driver)/layout.tsx:41–57`

```tsx
<header className="bg-slate-900 text-white border-b border-slate-800">
  <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
```

- **Position:** NOT sticky, NOT fixed — it is normal document flow (`static`)
- **Height:** `py-3` (12px top + 12px bottom) + icon height (~32px) = **~56px**
- Since the header is static (not fixed), it does NOT obscure top-positioned toasts
- The Toaster's `fixed top-right` with 32px offset could overlap with the header if the header is static and the user scrolls — but the header stays at the top of the document, not the viewport

**Conclusion:** No sticky/fixed header obstruction for toasts.

---

## 5. Global Toaster (sonner) Configuration

**File:** `apps/web/src/app/layout.tsx:59`

```tsx
<Toaster richColors position="top-right" />
```

| Property | Value | Notes |
|---|---|---|
| `position` | `"top-right"` | Overrides Sonner default (`bottom-right`) |
| `richColors` | `true` | Colored backgrounds per toast type |
| `closeButton` | not set | Default: no close button |
| `offset` | not set | Sonner default: 32px |
| `toastOptions` | not set | No custom styles |
| Mobile overrides | none | No `useMediaQuery`, no conditional position |
| `expand` | not set | Default: collapsed (single toast visible) |

**Sonner internals for `top-right`:**
- Container: `position: fixed; top: 0; right: 0;`
- Toast: offset from edge = `max(var(--offset, 32px), env(safe-area-inset-right, 0px))` 
- Default toast width: `356px` (set by Sonner's CSS variable `--width`)
- No `viewport-fit=cover` in meta → `env(safe-area-inset-*)` = 0px effective in standard browser

**Mobile width concern:** On a 360px Android viewport, `356px` toast + 32px right padding is not physically possible — the toast fills the viewport with a tiny right margin. Sonner does apply `max-width: calc(100vw - var(--offset) * 2)` by default so on 360px it would be `360px - 64px = 296px`, which is fine. The Sonner `top-right` toasts should render correctly in most cases.

---

## 6. Hypothesis Table

Ranked by plausibility based on above findings:

| # | Hypothesis | Plausibility | Evidence |
|---|---|---|---|
| 1 | **DriverNotificationPanel anchored `right-0` to bell overflows LEFT viewport edge** — panel is `calc(100vw-2rem)` wide but the bell is not at the viewport's left edge, so the left side of the panel is cut off | **HIGH** | `driver-notification-bell.tsx:68` (`absolute right-0 top-full`); `driver-notification-panel.tsx:117` (`w-[calc(100vw-2rem)]`). Bell sits ~56–88px from right edge, giving panel left edge a negative x-position. Fixed by quick-235 for panel WIDTH, but the anchoring problem (`right-0` on a container that is itself NOT `right-0` relative to the viewport) was NOT fixed. |
| 2 | **DriverNotificationPanel max-height (480px) combined with top-of-header position causes bottom cutoff on short phones** — on a 568px iPhone SE (landscape) or short viewport, the panel extends below the fold and the bottom is clipped by the viewport | **MEDIUM** | `driver-notification-panel.tsx:117` (`max-h-[480px]`). Header ~56px + panel top offset 8px = 64px from top; 64px + 480px = 544px. iPhone SE (1st gen) portrait = 568px — barely fits. Any shorter device or OS chrome reduction clips the bottom. |
| 3 | **Sonner Toaster `top-right` at 32px offset collides with driver header on scroll** — since the header is `position: static`, on scroll the header moves up and the fixed toast overlaps the top content | **MEDIUM** | `layout.tsx:59` (`position="top-right"`); `(driver)/layout.tsx:41` (header is `static`). However, there are no toast triggers on /my-load in normal flow — this hypothesis only applies when a toast is fired from another action (edge case). |
| 4 | **DriverNotificationPanel `absolute` positioned inside a `relative` container within a non-overflow-visible ancestor** — if any ancestor has `overflow: hidden`, the absolutely-positioned panel would be clipped | **LOW** | The header is `<header className="bg-slate-900 ...">` with no overflow class. The `relative` container is `<div ref={containerRef} className="relative">` in the bell. No `overflow: hidden` found in the layout chain. CSS inspection shows no clipping ancestors. |
| 5 | **Toast max-width exceeds 375px mobile viewport causing horizontal scroll/cutoff** | **LOW** | Sonner's `top-right` applies `max-width: calc(100vw - var(--offset) * 2)` which constrains the toast. Width is not a primary cutoff issue for the Toaster. |
| 6 | **DriverNotificationPanel `z-index: 50` conflict hidden under another z-50 element (bottom nav)** | **LOW** | Bottom nav is also `z-50` but is at the bottom of the screen; the panel is near the top. No spatial conflict. The panel renders ABOVE content (not behind nav). |

**Primary root cause (highest confidence):** Hypothesis #1. The `DriverNotificationPanel` is positioned `absolute right-0` relative to the bell button's `relative` container. The bell is placed far to the right of the header but the `relative` container is only as wide as the bell button (32px = `w-8`). The panel is `calc(100vw - 2rem)` wide (≈343px on 375px). Since the container's `right-0` aligns the panel's right edge with the bell's right edge (which is ~16–20px from the viewport right), the panel extends 343px to the LEFT but starts only ~20px from the right edge — putting its left edge at approximately `20px - 343px = -323px` from the viewport left edge ... wait, let me recalculate:

- Panel `right-0` means the panel's RIGHT edge aligns with the container (bell button)'s RIGHT edge
- Bell button right edge from viewport right: header has `px-4` (16px), the flex row is `justify-between`, the right group is `flex items-center gap-2` with UserMenu + bell. The bell button is `w-8` (32px). So bell right edge is roughly at viewport right - 16px = 359px from left (on 375px screen). Bell left edge = 359 - 32 = 327px.
- Panel right edge = 359px from left (aligns with bell right)
- Panel width = `calc(100vw - 2rem)` = 375 - 32 = **343px**
- Panel left edge = 359 - 343 = **16px from left** of viewport

So the panel's left edge is at ~16px from the left — it fits within the viewport width! The panel IS within bounds. This means quick-235 did properly fix the horizontal overflow. The remaining question is: what exactly is being "cut off"?

**Revised analysis:** The width fix in quick-235 did address left overflow. The remaining plausible causes are:

- The panel overflows the **bottom** of the viewport on short devices (Hypothesis #2 — still high)
- The panel visually appears "cut off" due to the **header being static** (not fixed) and the user having scrolled slightly — the header scrolls away and the bell disappears but the panel was already open, then the bell's `relative` container moves out of viewport, making the panel scroll off the top
- On very small screens (< 375px, e.g., 320px iPhone SE 1st gen): `calc(100vw - 2rem)` = 288px — a narrower panel that may look cut off if content wraps oddly

---

## 7. Recent Git History on Candidate Files

### `apps/web/src/components/driver/driver-notification-bell.tsx`
| Commit | Date | Message |
|---|---|---|
| `db105528` | Mar 2026 | `feat(quick-232): complete driver portal redesign with dashboard and 5-tab nav` |

Only 1 commit. The bell component has not changed since quick-232.

### `apps/web/src/components/driver/driver-notification-panel.tsx`
| Commit | Date | Message |
|---|---|---|
| `23a552c6` | Apr 16, 2026 | `fix(quick-235): make notification dropdowns responsive on mobile` — changed `w-[340px]` → `w-[calc(100vw-2rem)] sm:w-[380px]` |
| `db105528` | Mar 2026 | `feat(quick-232): complete driver portal redesign` |

The quick-235 fix targeted horizontal overflow. The ticket TKT-0032 was filed **Apr 19, 2026** — 3 days AFTER quick-235. This confirms that quick-235 did not fully resolve the cutoff issue (or a new symptom emerged after the fix).

### `apps/web/src/app/layout.tsx` (Toaster)
| Commit | Date | Message |
|---|---|---|
| `513dca43` | May 2026 | `feat: modernize favicon system with SVG and dark mode support` |
| `714f7292` | Prior | `feat(design-system): Phase 2 component migration + new 3D logo` |
| `e3435ba6` | Prior | `chore(29-01): convert to Turborepo monorepo` |

Toaster configuration has not changed recently.

### `apps/web/src/app/(driver)/layout.tsx`
| Commit | Date | Message |
|---|---|---|
| `1a223ad5` | Apr 2026 | `feat(quick-252): driver carousel with badges + GPS pill reposition` |
| `55d95cbc` | Prior | `feat(quick-246): move GPS ping to layout` |
| `db105528` | Prior | `feat(quick-232): complete driver portal redesign` |

### `apps/web/src/components/driver/driver-bottom-nav.tsx`
| Commit | Date | Message |
|---|---|---|
| `624a6e92` | Recent | `feat(driver-pay): add web driver pay portal + nav links` |
| `91aa5f54` | Prior | `feat(driver): replace Load tab with Tasks in bottom nav` |
| `d06ffbc0` | Prior | `feat(quick-235): change driver default landing from /my-route to /home` |
| `db105528` | Prior | `feat(quick-232): complete driver portal redesign` |

Bottom nav has been modified recently (driver-pay addition). The nav items changed but not the positioning/height.

### `apps/web/src/components/navigation/notification-center.tsx` (owner, for reference)
| Commit | Date | Message |
|---|---|---|
| `e71a0cfc` | May 17, 2026 | `fix: restyle notifications dropdown to match Quick Create design system` — purely cosmetic, no layout change |
| `7ff4a453` | Prior | `fix: improve notification dropdown text contrast for WCAG AA compliance` |
| `ad48a297` | Apr 19, 2026 | `fix(quick-259): add z-[1001] to header and notification dropdown panel` |
| `23a552c6` | Apr 16, 2026 | `fix(quick-235): make notification dropdowns responsive on mobile` |

**Key timeline:** TKT-0032 filed Apr 19 (same day as quick-259). The z-index fix was applied to the owner notification center but was it also needed for the driver notification panel? The driver panel is `z-50`, not `z-[1001]`.

---

## 8. Recommended Next Steps

### Priority 1 — Reproduce the exact cutoff in Chrome DevTools 375x667

Open Chrome DevTools → device emulation → iPhone SE → navigate to `/my-load` → click the bell icon. Observe:
1. Does the panel overflow the bottom of the viewport? (Hypothesis #2)
2. Does the panel's left edge appear clipped? (Hypothesis #1 — potentially still occurring on 320px devices)
3. Does the panel appear partially behind the bottom nav? (This would only occur if z-index breaks)

### Priority 2 — Check bottom-cutoff (480px max-height)

On iPhone SE (375x667px portrait):
- Header: ~56px
- Panel opens below: 56px + 8px (mt-2) = 64px from top
- Panel max-height: 480px
- Bottom of panel: 64 + 480 = 544px
- Viewport height: 667px — panel fits. BUT if bottom nav is visible (60px), effective usable height = 607px. Panel bottom = 544px — still fits. **This is fine on SE.**

On iPhone 5 (320x568px):
- Panel bottom = 64 + 480 = 544px > 568px available (before nav). With 60px nav = 508px usable. Panel extends to 544px — **overflows 36px**. Bottom of panel is cut off.

### Priority 3 — Verify fix needed for 320px-wide devices

`w-[calc(100vw-2rem)]` on 320px = 288px. The panel renders at 288px wide. This is usable but some content may appear cramped.

### Fix recommendation (for follow-up ticket)

In `driver-notification-bell.tsx`, change the dropdown wrapper to use `max-h` based on viewport height rather than fixed 480px, and ensure `bottom` is constrained when near viewport edge:

```tsx
{/* Current — potentially clips on short viewports */}
<div className="absolute right-0 top-full mt-2 z-50">

{/* Recommended fix — constrain to available viewport height */}
<div className="absolute right-0 top-full mt-2 z-50 max-h-[calc(100vh-80px)]">
```

And in `driver-notification-panel.tsx`, change `max-h-[480px]` to a viewport-relative value:
```tsx
{/* Current */}
<div className="w-[calc(100vw-2rem)] sm:w-[380px] max-h-[480px] overflow-y-auto ...">

{/* Recommended */}
<div className="w-[calc(100vw-2rem)] sm:w-[380px] max-h-[calc(100dvh-140px)] overflow-y-auto ...">
```

Using `dvh` (dynamic viewport height) correctly accounts for mobile browser chrome (address bar, bottom bar).

---

## 9. Reproduction Recommendation

**Setup:** Chrome DevTools, device emulation

**Step-by-step:**
1. Open `https://drivecommand.vercel.app` (or local dev at `localhost:3000`)
2. Sign in as a driver account
3. Open Chrome DevTools → Toggle device toolbar → Select **iPhone SE** (375x667)
4. Navigate to `/my-load`
5. Click the bell icon in the header
6. Observe the notification panel:
   - Does the BOTTOM of the panel get cut off?
   - Does the panel overflow below the visible viewport?
7. Repeat with **Galaxy S8+** (360x740) and **iPhone 5/SE 1st gen** (320x568) to see cutoff on shorter/narrower devices
8. Also test with mobile browser chrome visible (address bar + bottom bar) which reduces available viewport by ~100-130px

**Expected cutoff pattern based on analysis:** Short viewports (568px height or less) will show the bottom of the notification panel cut off because the fixed `max-h-[480px]` + 64px header offset = 544px, exceeding the usable viewport height on those devices.

---

Diagnosis complete. Recommend reproducing in mobile viewport (Chrome DevTools 375x667 iPhone SE).
