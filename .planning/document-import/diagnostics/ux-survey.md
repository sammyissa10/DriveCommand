# UX survey — the Document Import module's screens

**quick-560 · 2026-08-27 · SURVEY ONLY. No code, CSS, or screenshots changed or committed.**

Source-read against `feature/document-import` at `1380d80c`, with two production
queries for notification volume. Every claim below cites a file and line or a
query result; where something could not be established it says so.

**Headline:** the empty middle is **one string copy-pasted five times**, not four
designs — and it has already caused a shipped bug. The assignment screen's every
complaint is a feature of a component this repo already owns and uses in exactly
one place. Two of the ten items should not be fixed as reported.

---

## Scope notes, stated up front

**The brief says "ten screens" and lists eight.** Counting the inspection route's
distinct states separately (intro · walkaround · outcome · blocked) gives nine.
This survey covers the eight numbered items plus the inspection *outcome* screen,
which shares the defect in items 3 and 5 and would otherwise be missed. If there
is a tenth screen intended, it is not in the brief and is not covered here.

**Item 8, `/carrier/trips/[id]`, arrived with "specifics not captured."** It is
surveyed structurally below, and one finding is reported — but no user-observed
complaint is being confirmed or denied for it.

**The `ui-ux-pro-max` design-system generator was deliberately not run.** Its
output is palettes, font pairings and stack guidance — a *proposal for* a design
system, which this task explicitly excludes. This app has a documented one
(below); the question asked is compliance, so the survey reads the repo's own
contract instead. Flagged rather than silently skipped, because `CLAUDE.md` sets
that generator as an auto-trigger for design work.

---

## Q1 — What layout conventions already exist?

They exist, they are written down, and **most of these screens predate or ignore
them.** Nothing here needs inventing.

### The documented contract

`.planning/mobile-design-system.md` — self-described as *"the machine-readable
contract. If a built screen and its mockup disagree, the mockup wins."* It
carries:

- **§3 a spacing scale, closed:** *"only these five values exist: 8, 12, 16, 20,
  24"* — screen margin 20, card gap 12, card padding 16, section spacing 24.
- **§3 radii and sizes:** cards 20, inputs 12, sheets 24; **touch target minimum
  48**; list row 92–96; primary button 50.
- **§6 a four-page pattern** every entity ships (Overview · Quick Create · Detail
  View · Detail Edit).
- **§9 a per-page QA checklist** covering states, feel and consistency.
- **§1 principles**, including one directly relevant below: **"No FAB anywhere."**

Its scope is explicit and matters for this survey: the `ds` kit renders **only at
mobile/tablet widths**; *"the desktop UI keeps its existing layout."* So the
contract governs the driver-facing screens and the mobile lanes, and **does not
govern** the desktop assignment screen, `/help`, or the trips detail desktop view.

### The shells

| Shell | File | Content wrapper |
|---|---|---|
| Owner portal | `components/navigation/owner-shell.tsx:118` | `<main class="flex-1 overflow-y-auto bg-white rounded-2xl m-3">` + inner `p-6` |
| Driver portal | `app/(driver)/layout.tsx` | `<main class="p-4 pb-24 sm:p-6 lg:pb-6">` + header + `DriverBottomNav` |
| Driver takeover | `app/(driver-fullscreen)/layout.tsx` | `min-h-dvh`, **no chrome, no padding** — deliberate, documented |

**The owner shell sets no max-width.** Its content area is full-width with `p-6`.
That matters for Q5: the assignment screen's ~500 px column on a 1568 px screen
is **the page's own `max-w-2xl`**, not something the shell imposes
(`AssignmentScreen.tsx:172`).

### The convention these screens are ignoring

`components/ui/ResponsiveSwitch.tsx` — mounts exactly one breakpoint variant.
Its header documents why: rendering both and toggling with CSS leaves two live
trees in the DOM. Adoption:

```
pages using ResponsiveSwitch : 13
pages using lg:hidden dual mount : 28
```

`/carrier/trips/[id]` is in the second group (`page.tsx:300,336`). quick-559 has
just established that the CSS pattern is not cosmetic — on `/live-map` it was
running a whole second set of pollers. The trips detail mobile lane contains no
timers (grep: 0 `setInterval`), so the cost there is DOM and state, not traffic.

**Verdict: the fix is compliance, not invention**, for the dual mount, for
`SearchableSelect` (Q3), and for the spacing scale on the driver screens. The
one genuine gap is that **no shared page-shell component exists for the
takeover group** — which is precisely how Q2 happened.

---

## Q2 — Is the empty middle one component or four implementations?

**Neither. It is one string, copy-pasted five times across three files.**

```
flex min-h-dvh flex-col justify-between px-5 py-8
```

| File | Line | Screen |
|---|---|---|
| `InspectionClient.tsx` | 122 | intro (item 3) |
| `InspectionClient.tsx` | 200 | outcome — passed / passed-with-defects |
| `blocked/page.tsx` | 123 | blocked (item 5) |
| `blocked/page.tsx` | 217 | blocked, second variant |
| `page.tsx` | 194 | server-rendered gate screen |

Grep across `src/app` and `src/components` finds **no other use of this
combination anywhere in the app.** It is local to the inspection takeover route
and it is a duplicated literal, not an import. There is no component to fix; there
are five call sites, and **no shared wrapper exists for this route group to put
one in.**

`min-h-dvh` + `justify-between` is the mechanism: two children, pushed to
opposite ends of a full viewport. On a screen with a heading and two buttons, the
gap between them *is* the viewport minus the content — the observed ~60%.

### This has already produced a shipped bug

`InspectionClient.tsx:137`, in the code, from quick-546:

> *"this banner used to live in the TOP block, above. The layout is `min-h-dvh …
> justify-between`, so on a phone it rendered roughly a screen-height away from
> the button being tapped — the feedback existed and was off-screen, which is why
> the failure was reported as 'nothing happens'."*

That is the same layout, already responsible for one investigation that
misdiagnosed a working error path as a dead button. **The empty middle is not
only an aesthetic complaint; it is a known source of "the control did nothing".**

---

## Q3 — The assignment screen, against the app's other pickers

### What the screen does

`AssignmentScreen.tsx:172` — `mx-auto w-full max-w-2xl` (672 px cap, self-imposed).
Drivers at `:199`, trucks at `:216`, trailers at `:228` are each a bare `.map()`
over the full array. Grep for `SearchField|search|filter|sort|group` in that file:
**no matches.** No virtualisation. Both lists are full-height and stacked, so with
15 trucks the two choices cannot be on screen together.

A blocked option (`PickerRow`, `:374-393`) renders with the **same background,
same `text-foreground` label, same weight** as an available one. The only
difference is a 16 px `AlertTriangle` on the right. It is also **not disabled** —
`onClick={onSelect}` fires unconditionally, so a dispatcher can select an
insurance-expired truck and only learn it is refused from the disabled Create
button and `blockedReason` further down (`:150`, `:347`).

### The screen's own header contradicts the build

`AssignmentScreen.tsx:5-21` draws the intended design as a compact
label-left/value-right form — **two driver rows**, one truck row, one trailer row:

```
| Driver    Marcus Webb    Available · 6h 30m left |
|           Dana Okoro     On a trip that day      |  <- blocked
| Truck     104            Ready                   |
```

What shipped is an exhaustive scrolling list of every driver and every truck.
**The mockup in the file and the code beneath it disagree**, and the contract
(§ "if a built screen and its mockup disagree, the mockup wins") says which one is
right.

### There is an existing searchable picker, and this screen declined it

`components/ui/searchable-select.tsx` — `SearchableSelect`, built on `cmdk`
(`Command` + `CommandInput` + `Popover`). Its option type:

```ts
export interface SearchableSelectOption {
  value: string; label: string;
  status?: string;          // 'available' | 'on_trip' | 'off_duty' | 'inactive' | …
  secondaryLabel?: string;
  disabled?: boolean;
  sortPriority?: number;
}
// props: showStatus, sortByStatus — "Auto-sort options by status (available first)"
```

It ships a `STATUS_CONFIG` priority table: `available: 100`, `on_trip: 50`,
`off_duty: 30`, `not_ready: 20`, `inactive: 10`, plus truck statuses including
`in_maintenance: 20` and `expired_docs`.

**Every complaint about the assignment screen is a feature this component already
has**: search, sort-available-first, per-option disabled, status badges.

Consumers: **exactly one.** `DispatchLoadModal.tsx` uses it four times — for the
driver, co-driver, truck and existing-trip pickers, i.e. *the same job the
assignment screen does*. The assignment screen is the second place in the app
that needs it and is the one that did not use it.

### The other pickers, for completeness

| Picker | Control |
|---|---|
| `DispatchLoadModal` — driver / co-driver / truck / trip | **`SearchableSelect`**, with `showStatus` and `sortByStatus` |
| `NewDispatchForm` — driver, truck (`:256`, `:305`) | **native `<select>`** with `<option>` rows |
| Grid column filters (`SelectFilter.tsx:124`) | `cmdk` `CommandInput` — searchable |
| Import assignment | **bare `.map()`** — no control at all |

So the app has three answers to "pick one of many" and the assignment screen uses
the only one that is not a control. Native `<select>` is the weakest of the three
but still beats a flat list: it collapses, and browsers type-ahead it for free.

**One constraint on any fix, from the file's own header (`:33-40`):** the pickers
re-fetch on every change, because availability is a function of the planned day.
A search must therefore filter the returned set client-side, or be wired to that
same round trip — it cannot be a naive client-side cache of a list fetched once.

---

## Q4 — Driver-facing vs owner-facing

The split is not a judgement call here; it is the route group, and the route
group determines the shell, the chrome and whether the `ds` contract applies.

### Driver-facing — phone, in a yard, possibly gloved

| # | Screen | Group | Governed by the ds contract |
|---|---|---|---|
| 2 | `/home` driver dashboard | `(driver)` | yes (mobile widths) |
| 3 | `/inspection/[id]` intro | `(driver-fullscreen)` | yes |
| 4 | `/inspection/[id]` walkaround | `(driver-fullscreen)` | yes |
| — | `/inspection/[id]` outcome | `(driver-fullscreen)` | yes |
| 5 | `/inspection/[id]/blocked` | `(driver-fullscreen)` | yes |

These already respect the one rule that matters most for gloves: **every control
is `min-h-[56px]`**, above the contract's 48 minimum (`AnswerButton:233`,
`InspectionClient:171,178`, footer `:856,866`). Touch target is not a finding.

### Owner-facing — desk, wide screen

| # | Screen | Group | Governed by the ds contract |
|---|---|---|---|
| 1 | `/carrier/imports/[id]/assign` | `(owner)` desktop | **no** — desktop keeps its own layout |
| 7 | `/help` | `(owner)` | **no** |
| 8 | `/carrier/trips/[id]` | `(owner)`, dual-mount | mobile lane yes, desktop no |

### Both

| # | Screen | Note |
|---|---|---|
| 6 | Notification panel | Two renderings from one component: `SheetContainer` (ds, mobile) and a `380px` dropdown (desktop). `notification-bell.tsx:77-93`. Owner shell **and** driver header both mount a bell. |

**Note for item 7:** `/help` lives in the `(owner)` route group, so a **driver is
redirected to `/unauthorized`** — a pre-existing condition recorded at Phase 12,
not introduced here. The nine driver-facing help articles are readable only by
owners. That is worth knowing before anyone redesigns `/help` "for drivers".

**Why the groups need different answers:** the driver screens have no chrome by
design and one task each, so their problem is *vertical rhythm* — content
stranded at the ends of a viewport. The owner screens sit in a full-width shell
with a sidebar and a breadcrumb, and their problem is the opposite — *density*:
a 672 px column and a flat list where the shell offers 1500 px and the app owns a
search control. Redesigning them as one set would apply the wrong medicine to
each.

---

## Q5 — Cheap vs structural

"Cheap" here means: one file, no new component, no data change, no new query.

### Could ship today

| # | Item | Change | Why it is cheap |
|---|---|---|---|
| 7 | `/help` stubs above real content | **Move one JSX line.** `<HelpGuides />` above `<HelpCategoryGrid />` in `help/page.tsx:37-46` | Two sibling elements. The file's own comment already says the grid points only at stubs. |
| 4 | "Change to fail" louder than Pass/Fail | **One class.** `AnswerButton` is `flex-1`; when answered it is the *only* button in the row, so it goes full width — 3× the unanswered buttons, same solid red | Same component, same height. Constrain the width or give the corrective state a quieter tone. No logic touched. |
| 2 | Trip card does not say where the day ends | **Read `stops[last]`.** `driver-dispatch-card.tsx:121` already has the full `stops` array with `sequenceOrder` and `facility.name/city/state` | Phase 7 materialises the end stop as a real `CarrierStop`, sequence last. Data is already on the client; no query. |
| 6 | Notification panel buried | **Use the flag that exists.** The API already supports `?unread=true` (`notifications/route.ts:24`) and the bell already calls it for the count | Panel fetches `?limit=20` with no unread filter. A toggle — or defaulting to unread — is a query-string change. |
| 1 | Assignment blocked rows selectable | **Add `disabled`.** `PickerRow:376` fires `onSelect` unconditionally | The server verdict is already on each row as `blocked`. |

### Structural

| # | Item | Why it is not cheap |
|---|---|---|
| 3, 4, 5 | Empty middle | **Five call sites and nowhere to put a fix.** The takeover group has no shared page shell, so this is either five edits or a new component plus five edits. The right answer is one wrapper in `(driver-fullscreen)/`, which is new surface area. |
| 1 | Assignment picker | **A rewrite of the screen's core.** Swapping to `SearchableSelect` changes the layout, the selection model, and interacts with the every-change re-fetch (Q3). Cheap in the sense that the component exists; structural in that the screen is currently *made of* the lists. |
| 1 | 672 px column on 1568 px | Depends on the picker decision — with `SearchableSelect` the narrow column stops being a problem, so **do not fix it first.** |
| 8 | Trips detail dual mount | One of 28 pages. Should follow a decision about the pattern app-wide (quick-559 fixed one page), not be done in isolation here. |

### Ordering, if it were mine

1. `/help` line move — minutes, and it un-buries content that already exists.
2. Notification unread filter — the production data below makes this the highest
   real-world value on the list.
3. "Change to fail" width, and `disabled` on blocked picker rows.
4. Trip card end stop.
5. Then decide the inspection wrapper and the assignment picker together — both
   are structural, both are worth doing, neither is urgent.

---

## Q6 — What is *not* worth fixing

Four items. Two are wrong as reported; two are right about the symptom and wrong
about the fix.

### 1. "Quick Action tiles clipped at both edges" — **working as designed**

`driver-quick-actions.tsx:76` carries the comment:

> *"CSS scroll-snap carousel — one tile centered, adjacent tiles peek 20px"*

with `paddingInline: calc(50% - 80px)` centring a 160 px tile. The neighbouring
tiles are not clipped; **they are peeking, which is the scroll affordance.**
Removing it would leave a horizontally-scrolling row with no cue that it scrolls.

The honest caveat: at 390 px the peek computes to ~99 px, not the 20 px the
comment claims, so two-thirds of a tile shows on each side — which is a fair
reason to read it as "clipped". So there is a real tuning question. But the
finding as filed ("clipped") points at the wrong thing, and acting on it would
remove a working affordance.

### 2. "The Save & exit control is overlapped by the floating support button" — **real, but not a layout bug**

The overlapping element is `SupportTicketModal`'s FAB — `fixed z-50 h-12 w-12
rounded-full` (`support-ticket-modal.tsx:267`), mounted in the **root layout**
(`app/layout.tsx:58`), so it renders on every page including the takeover group
that otherwise has no chrome.

It is **draggable to any of four corners and its corner is persisted**
(`FAB_VALID_CORNERS`, `cornerRef`, default `bottom-left`, `:110-129`). `Save &
exit` is in the walkaround's **top-right** header (`InspectionRunner.tsx:781-789`).

So this overlap only exists **because somebody dragged the FAB to `top-right`**,
and it will not reproduce for a user who has not. It is not a fixed collision to
nudge — the FAB's position is user state. Adding a `top-right` exclusion, or
offsetting the header, would be tuning against one tester's stored preference.

Two things that *are* worth recording from it: the FAB is `z-50` against the
inspection header's `z-10`, so it wins over any takeover screen at any corner;
and **the design system says "No FAB anywhere" (§1)**, so the FAB itself is the
contract violation — global and pre-existing, not a Document Import screen's
doing. That is a separate decision about a global component, not a fix to item 4.

### 3. "The notification panel has no cap" — **it has one; the cap is not the problem**

`notification-center.tsx:178` fetches `?limit=20`. The complaint's premise is
wrong. What the production data shows is more useful:

```
dispatch_generated  "Dispatch Generated"                46   unread 0   Apr 21 – Jun 16
dispatch_assigned   "Dispatch Assigned"                 12   unread 0   Apr 17 – Apr 28
pay_record_ready / load_delivered / stop_completed       8   unread 0   Apr 17 – Apr 21
dispatch_assigned   "Trip blocked — inspection failed"   2   unread 2   Aug 26 – Aug 27
compliance_alert    "Trip blocked — TX-1001 failed …"    1   unread 1   Aug 26
compliance_alert    "New trip 45a84a80 — BOUCHER KIA…"   1   unread 1   Aug 27
fleet_message       "New message from Demo User"         1   unread 1   Apr 23
```

**71 notifications, 5 unread — and every unread one is operational or safety.**
The 46 read `Dispatch Generated` rows, none newer than 16 June, consume the
20-item budget by recency and bury all five.

So a lower cap would not help, and grouping would help only a little. **The
single change that fixes this is showing unread first or by default** — and the
server already supports it. Grouping and a per-type cap are worth having later;
they are not the fix.

### 4. "Duty status occupies a lot of vertical space for something touched twice a day" — **already ranked correctly; the space is the point**

`driver-dashboard.tsx:85-103` orders the page: greeting · **active trip card** ·
quick actions · HOS widget · messages. The duty block is already fourth of five,
below the trip and the actions. The widget itself is a single `p-4` card of 117
lines, whose height comes mostly from four `h-10` status buttons — and those are
the twice-a-day interaction. Shrinking them to reclaim vertical space would make
the one control a driver taps with gloves on smaller than the 48 pt minimum §3
sets.

If the complaint is that it draws the eye, that is a weight question, not a size
one. There is nothing above it that has been displaced.

### Where the survey agrees the complaint is exactly right

For balance: items 3/5 (empty middle), 7 (`/help` ordering), the assignment
screen's missing search/sort/grouping, and the blocked-option weight are all
confirmed, reproduced in source, and understated if anything — the empty middle
has already cost one investigation, and `/help`'s search box above the dead
category cards is itself a **visual stub** (`help/page.tsx:33`) that does not
search.

---

## Ambiguities, stated rather than inferred

- **"Ten screens" vs eight listed** — see Scope notes. Not resolved.
- **Item 8 has no captured complaint.** The structural finding (CSS dual mount,
  `page.tsx:300,336`) is mine, not a confirmation of anything observed.
- **The trip card's end stop under a `DRIVER_RESIDENCE` policy** — Phase 7 masks
  a residence to "Driver's home" with coordinates nulled at 14 read sites. Whether
  `getMyActiveDispatch` is one of them was **not checked**, so "show the last
  stop" may need the mask applied. Verify before building it.
- **The `~99 px` peek figure** is computed from `calc(50% - 80px)` at a 390 px
  viewport, not measured in a browser. The mechanism is certain; the number is
  arithmetic.
- **No screen was opened in a browser for this survey.** Driver-portal
  credentials are not available in this environment (`TEST_DRIVER_EMAIL` is not
  set), so the five driver-facing screens are read from source only. Every claim
  about them is a source claim; none is a rendering claim.

---

## Per-item audit

| # | Question | Status |
|---|---|---|
| 1 | Existing layout conventions; is the fix compliance? | **ANSWERED** — the `ds` contract (§3 spacing scale, §6 pattern, §9 QA) with its stated mobile-only scope; the three shells and the owner shell's *lack* of a max-width; `ResponsiveSwitch` at 13 pages vs 28 on the old pattern. Fix is compliance, with one genuine gap named (no shared shell for the takeover group). |
| 2 | One component or four implementations? | **ANSWERED** — neither: one literal, `flex min-h-dvh flex-col justify-between px-5 py-8`, at five sites across three files, used nowhere else in the app. Quoted with line numbers, plus the quick-546 bug it already caused. |
| 3 | How other pickers handle long lists; is there a component this declined? | **ANSWERED** — yes, `SearchableSelect`, with search, `disabled`, `sortByStatus` and a status-priority table covering the exact cases complained about; **one consumer**, `DispatchLoadModal`, doing the same job. All four pickers tabulated, plus the re-fetch constraint any fix must respect. |
| 4 | Driver-facing vs owner-facing | **ANSWERED** — split by route group with the ds contract's applicability per screen, the notification panel identified as both, and `/help`'s owner-only access flagged. |
| 5 | Cheap vs structural | **ANSWERED** — five cheap with the specific change named, four structural with the reason, and a suggested order. |
| 6 | What is not worth fixing | **ANSWERED** — four items: the carousel peek (working as designed), the FAB overlap (user-dragged position, not a collision), the "no cap" premise (there is one; production data shows the real cause), and the duty block (already correctly ranked; shrinking it breaks the 48 pt minimum). Balanced with the four complaints confirmed as correct. |

**Constraints honoured:** read-only — no source, CSS, or configuration file was
modified; no screenshots taken or committed; the two database queries were
`SELECT`s. No design system or component library is proposed — every
recommendation names a component or a contract this repo already owns.
