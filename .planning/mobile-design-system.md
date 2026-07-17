# DriveCommand Mobile Design System

> Encoded from `docs/specs/DriveCommand-Mobile-Design-System.pdf` (v1.2, July 2026).
> Reference language: **iOS Health, Wallet, Things 3 (dark mode)** — depth instead of borders,
> restraint instead of decoration, one accent color used sparingly.
>
> **This file is the machine-readable contract.** If a built screen and its mockup disagree, the
> mockup wins; if a rule needs to change, it changes _here first_, then in the PDF, then in every
> affected screen. Rules never change on a single page.

---

## 0. How the tokens are wired (read this first)

The design-system tokens are namespaced under **`ds`** in `apps/mobile/tailwind.config.js`.
Use them as NativeWind classes:

| Token          | Class examples                                  |
| -------------- | ----------------------------------------------- |
| `ds.bg`        | `bg-ds-bg`                                       |
| `ds.card`      | `bg-ds-card`                                     |
| `ds.elevated`  | `bg-ds-elevated`                                 |
| `ds.input`     | `bg-ds-input`                                    |
| `ds.hairline`  | `bg-ds-hairline`                                 |
| `ds.txt`       | `text-ds-txt`                                    |
| `ds.txt2`      | `text-ds-txt2`                                   |
| `ds.txt3`      | `text-ds-txt3`                                   |
| `ds.accent`    | `text-ds-accent` / `bg-ds-accent`               |
| `ds.vip`       | `text-ds-vip` / `bg-ds-vip/15`                   |
| `ds.success`   | `text-ds-success` / `bg-ds-success/14`          |
| `ds.warning`   | `text-ds-warning` / `bg-ds-warning/14`          |
| `ds.danger`    | `text-ds-danger` / `bg-ds-danger/14`            |
| `ds.avatar`    | `bg-ds-avatar`                                   |

**Why the `ds` prefix (and not bare `bg`, `card`, `success`…):** the legacy token set already
defines `bg`, `success`, `warning`, `danger` with _different_ values and those classes are used by
existing screens. Redefining the bare names would silently restyle live screens. The `ds` namespace
adds the new Apple-language palette **without touching anything already shipped.** Translucent tints
use NativeWind opacity modifiers (`/14`, `/15`) so we never hard-code an rgba.

The new shared kit lives in **`apps/mobile/components/ui/ds/`** (its own `index.ts`), separate from
the legacy `components/ui/` kit so the redesign never clobbers a component a live screen imports.
Import from `@/components/ui/ds`.

### Web (mobile-web) port

The same design system is realized for the **web app** (`apps/web`, Next.js + Tailwind) so it can
render as the **mobile-web** experience. The `ds` tokens live in `apps/web/tailwind.config.ts` (same
hex, same `ds` namespace, non-colliding with the shadcn HSL theme), and a React-DOM mirror of the kit
lives in **`apps/web/src/components/ui/ds/`** (import from `@/components/ui/ds`). The web design is
applied **only at mobile/tablet widths** (`lg:hidden`); the desktop UI keeps its existing layout. A page
renders both: `<div className="lg:hidden">` for the mobile-web design and `<div className="hidden
lg:block">` for the desktop view, fed by the same server data.

---

## 1. Design principles

- **Depth, not borders.** Cards never have outlines, borders, or shadows on dark. They separate from
  the background purely through surface contrast (`ds.card #171E2E` on `ds.bg #0B1120`). If you are
  typing `borderWidth` on a card, stop.
- **One accent, spent carefully.** `#0A84FF` appears only on: the active tab, primary buttons,
  tappable text actions, and live/positive emphasis. Never on containers, never as decoration. If it
  appears more than ~4 times on a screen, something is decorated.
- **Status is a whisper.** States use translucent tints (color at **14–15% opacity**) with the color
  only in a small dot and the label text. No filled chips, no colored card borders — including VIP.
- **Continuous 20px corners.** Cards 20, inputs 12, sheets 24 on top. Everything soft. Nothing square.
- **Native iOS controls only.** Large-title headers, pill search fields, segmented controls, bottom
  sheets with grabbers, frosted tab bars. **No FAB anywhere** — add actions live top-right as a tinted
  circle, or as the primary button inside sheets.
- **People get circles, machines get squares.** Human entities (drivers, contacts) use circular
  monogram avatars. Vehicles use rounded-square unit chips. That is how users tell rows apart.
- **View and edit are the same page.** Same fields, same order, same sections in both modes. View
  reads label-left / value-right; edit stacks the label above a full-width input.
- **Real data rhythm.** Rows never repeat identical numbers. Empty states invite action in one line.
  Loading states are content-shaped skeletons, never spinners.

---

## 2. Color tokens

Hard-code nothing. Every value below is a named token; if a value is not in this table it does not
belong in the app.

| Token           | Hex       | Usage                                                         |
| --------------- | --------- | ------------------------------------------------------------ |
| `ds.bg`         | `#0B1120` | Screen background                                            |
| `ds.card`       | `#171E2E` | All cards and list rows — never with a border               |
| `ds.elevated`   | `#212A3D` | Segmented thumb, pressed states, skeleton fill              |
| `ds.input`      | `#1E2638` | Text field fill (edit mode and sheets)                      |
| `ds.hairline`   | `#232C40` | Dividers inside grouped rows only                           |
| `ds.txt`        | `#F5F7FA` | Titles, values (text.primary)                               |
| `ds.txt2`       | `#8B93A7` | Labels, sublines (text.secondary)                           |
| `ds.txt3`       | `#5B6478` | Meta lines, placeholders, inactive icons (text.muted)       |
| `ds.accent`     | `#0A84FF` | The only brand color in the UI                              |
| `ds.vip`        | `#FFB340` | VIP tag only, at 15% opacity fill                           |
| `ds.success`    | `#30D158` | Ready / on-duty / paid                                       |
| `ds.warning`    | `#FF9F0A` | Expiring docs, service due, in shop                         |
| `ds.danger`     | `#FF453A` | Destructive actions, overdue, HOS violation                 |
| `ds.avatar`     | `#2B3550` | Monogram and unit-chip fill                                 |

Monogram initials render in `#DDE3F0` (600 weight) — exposed as `ds.txt` on avatar fill is close
enough; the kit's `MonogramAvatar` uses a dedicated `initials` token class.

Status → token map (pills, KPI tints, timeline dots):

| State                         | Token        |
| ----------------------------- | ------------ |
| Ready / On Duty / Paid        | `ds.success` |
| On Load / Driving / Live      | `ds.accent`  |
| In Shop / Service due / <90d  | `ds.warning` |
| Expired / Overdue / Violation | `ds.danger`  |
| Off Duty / Invited / Neutral  | `ds.txt2`    |
| VIP                           | `ds.vip`     |

---

## 3. Spacing & radius

**Spacing scale — only these five values exist: `8, 12, 16, 20, 24`.**

| Purpose         | Value |
| --------------- | ----- |
| Screen margin   | 20    |
| Card gap        | 12    |
| Card padding    | 16    |
| Section spacing | 24    |

**Radii**

| Element                 | Radius |
| ----------------------- | ------ |
| Card                    | 20 (continuous) |
| Input (edit / sheet)    | 12     |
| Field-group edit input  | 10     |
| Sheet top               | 24     |
| KPI card                | 18     |
| Search field (pill)     | 13     |
| Parent chip             | 13     |
| Status pill             | 8      |
| VIP tag                 | 6.5    |
| Segmented track / thumb | 11 / 9 |

**Sizes**

| Element                    | Value |
| -------------------------- | ----- |
| Avatar — list / detail     | 44 / 72 |
| Unit chip                  | 44    |
| List row height            | 92–96 |
| Field row height (view)    | 52    |
| Field input height (edit)  | 44    |
| Sheet input height         | 46    |
| Status pill height         | 22    |
| KPI card height            | 74    |
| Primary button height      | 50    |
| Parent chip height         | 40    |
| Touch target minimum       | **48** |
| Sheet grabber              | 36 × 5 |
| Add button circle          | 32 (accent @ 16% fill) |

---

## 4. Typography (SF Pro on device — weights and sizes are the contract)

Exactly **nine** styles. No one-off sizes anywhere.

| Style                | Size / Weight                          | Used for                          |
| -------------------- | -------------------------------------- | --------------------------------- |
| Large title          | 34 / Bold                              | Overview page titles              |
| Page / Nav title     | 22 / Bold                              | Detail header entity name         |
| Nav / Row title      | 17 / Semibold                          | Row titles, centered stack-header |
| Body                 | 15–16 / Regular                        | Values, inputs, sublines          |
| Caption              | 13 / Regular                           | Meta lines, helper text           |
| Section label        | 12 / Semibold, UPPERCASE, +0.8 tracking| Group headers (RECENT LOADS)      |
| Tag                  | 11 / Bold                              | VIP and status pill labels        |
| KPI value            | 22 / Bold                              | Numbers inside KPI cards          |
| Monogram initials    | 15–16 / 600                            | Avatar / unit-chip glyphs         |

---

## 5. Component rules

- **Card** — fill `ds.card`, radius 20, no border, no shadow. Content padding 16–18. Whole card is
  tappable with pressed opacity `0.75` and a light haptic.
- **Monogram avatar** — circle, `ds.avatar` fill, two initials in 600 weight. No photos until uploaded.
- **Unit chip (vehicles)** — 44 rounded-square radius 12, `ds.avatar` fill, tiny `UNIT` eyebrow over
  the number.
- **Status pill** — translucent tint at 14%: 3px dot + 11.5 Semibold label in the status color.
  Height 22, radius 8.
- **VIP tag** — 11pt Bold amber text on `ds.vip` at 15% opacity, radius 6.5, sits right of the name.
  Never a border, never a filled badge.
- **KPI card** — value 22 Bold (tinted only when it maps to a status), label 12 secondary below. 2–3
  across, height 74, radius 18. Tapping a KPI applies that filter to the list below.
- **Entity list row** — left avatar/chip 44; middle title 17 Semibold, subline 14–15 secondary, meta
  13 muted; right status pill top-right OR chevron centered. **Pill pages drop the chevron** (whole
  card is the tap target).
- **Search field** — pill radius 13, `ds.card` fill, magnifier + placeholder in muted. On every
  Overview.
- **Segmented control** — native iOS style: track = `ds.card`, selected thumb = `ds.elevated`, radius
  11/9. Used for list filters and detail tabs.
- **Sheet input** — 13 secondary label above the field; 46-high `ds.input` fill radius 12; `Required`
  hint spelled out in muted (never asterisks).
- **Field group (view)** — one card, 52-high rows: label left secondary, value right primary Medium.
  Hairline dividers inset 18, none under the last row. Status values get their tint.
- **Field group (edit)** — same card, same field order and sections. Each field: 13pt secondary label
  above a full-width 44-high input (`ds.input`, radius 10). No hairlines — the inputs separate the
  rows. Long values never truncate.
- **Parent strip (Belongs to)** — a `BELONGS TO` section label + tappable chips (40 high, radius 13,
  `ds.card` fill, accent entity icon, name, chevron) directly under the identity header and above the
  tabs. Parents live here only — never as field rows or inline sections.
- **Bottom sheet (Quick Create)** — dimmed 45% backdrop, sheet fill `#141B2B`, top radius 24, 36×5
  grabber, Cancel top-left, centered 17 Semibold title, one-line purpose subtitle.
- **Primary button** — full width, 50 high, radius 15, `ds.accent` fill, 17 Semibold white. Disabled =
  **35% opacity**. Exactly one per sheet.
- **Empty state** — centered icon in muted, one 15pt line, one 13pt secondary line inviting the add
  action. No illustrations.
- **Tab bar** — frosted (blur) over content, hairline top edge, 5 items, active = accent icon + label,
  inactive = muted. Labels always visible, 10pt.
- **Add action** — top-right of Overview: 32 circle, accent at 16% fill, accent plus glyph. Opens
  Quick Create. **No floating action button anywhere in the app.**
- **Skeleton loader** — content-shaped blocks in `ds.elevated` fill, shimmer 800ms. Never a spinner on
  data screens.

---

## 6. The four-page pattern

Every entity (Clients, Trucks, Drivers — and later Loads, Trips, Invoices) ships exactly four pages.
Learn one entity, know the whole app.

1. **Overview** — the list. Large title + count, add button top-right, KPI cards (tap = filter),
   search, segmented filter, entity rows. Answers "how is this part of my business doing?" in a glance.
2. **Quick Create** — a bottom sheet with only the required fields (3–4 max) and one button.
   Everything else is added later on Detail.
3. **Detail — View** — the full record. Identity header (avatar/chip, name, status), contact actions
   where the entity is a person/company, stat strip, segmented tabs for child records, then grouped
   field rows.
4. **Detail — Edit** — **THE SAME PAGE.** Nav swaps to Cancel / Save, contact actions hide, and the
   field group re-renders in edit mode: identical fields, order, and sections, each label stacked above
   a full-width input.

### View / Edit parity rules

- One screen component with an `isEditing` flag — **not two screens.** Layout is shared by construction.
- Field order, grouping, and vertical position are identical in both modes.
- Edit fields stack the label above a full-width input (`ds.input`, radius 10); section grouping
  identical to view mode.
- Save is disabled until something changed; Cancel with unsaved changes asks to discard (native alert).
- Success: save, light success haptic, return to view mode **in place** — no navigation, no reload.
- Hierarchy: parents in the Belongs-to strip above the tabs (navigate up); children as tabs (navigate
  down). **No third pattern.**

---

## 7. Form & Field Intelligence

The schema has more fields than any mockup shows, and it will keep growing. These rules take ANY set
of fields and organize them so users are never overwhelmed, always know what to enter next, and feel
progress. Every build prompt points here.

- **Discover, never assume.** Before building any page, read the Prisma schema for the entity, its
  relations, and the mobile API response types. List every available field. The mockups show
  representative fields — **the schema is the truth.**
- **Classify every field** into: **Identity** (names, numbers that identify), **Status** (computed
  states — display only, never editable), **Contact**, **Operational** (day-to-day working data),
  **Financial**, **Compliance/Legal**, **Metadata** (createdAt, ids — usually hidden). Unsure? Ask:
  "when does the owner need this?"
- **Three exposure tiers.**
  - _List row:_ max 3 lines — one title, one subline, one meta line with at most 2 stats.
  - _Quick Create:_ only the fields required to make the record real — **3–5 hard max**, required first.
  - _Detail page:_ everything, grouped.
  - A field missing from a row or sheet is not lost — it lives on Detail.
- **Group in cards of 3–7.** Detail fields render as grouped cards with section labels, never one
  endless list. Order groups by how often the owner reaches for them:
  **Identity+Contact → Operational → Financial → Compliance → Metadata (last or omitted).** A group
  over 7 fields splits or hides its long tail behind "Show more."
- **Order fields like a conversation.** Within a group, the field a human says first goes first (name
  before number, company before contact). Pairs stay adjacent (city/state, license/expiry). A field
  that depends on another comes after it. Required fields before optional in create flows.
- **Make progress visible.** Quick Create is one screen, one button — completing it must feel like an
  achievement, with the toast offering the next step ("View" the new record). Multi-section entry shows
  position ("2 of 4"). Detail may show a quiet completeness hint ("Profile 70% complete · Add license")
  — a next action, never a nag.
- **Never overwhelm.** Sensible defaults for everything that has one (status, dates, units, next unit
  number). Empty optional fields display as an **em dash** in view mode — calm, not demanding. Inputs
  appear only in edit mode or sheets. If in doubt, show less and make it one tap to see more.
- **Right input, right words.** Keyboard matches the field (phone pad, email, numeric). Enums and
  dates get native pickers, never free text. Money and distances format live. Labels use the owner's
  words, not column names — "DBA name", never "dba_name". Validate on submit only; errors inline under
  the field; scroll to the first error; input is never lost.

---

## 8. Extending the system

Loads, Trips, Invoices, and every future entity get the same four pages. To spec a new entity, answer
five questions and drop the answers into the four-page pattern — nothing else changes:

1. What one question does the Overview answer for the owner? (drives the KPI cards)
2. What 3–4 fields make the record real? (drives Quick Create)
3. Is the entity a person/company (circle avatar, contact actions) or a thing (square chip, no contact
   row)?
4. What are its child records? (drives the Detail tabs)
5. Which field states cost the owner money? (drives the warning/danger tints)

---

## 9. Global QA checklist — run on every page

**Look** — Zero borders/outlines on cards. Only `#0A84FF` as accent (count uses; >~4 = decorated).
Radii: cards 20, inputs 12, sheets 24; no square corners. Text uses only the 9 type styles. Every
color exists in the token table.

**States** — Loading = content-shaped skeleton (800ms). Empty = one inviting line + path to the add
action. Error = toast + input preserved (never a dead end). Offline = cached data + quiet "Updated Xm
ago".

**Feel** — Every tappable element 48pt with pressed opacity 0.75 + mapped haptic. Screen mounts with a
subtle fade; sheets spring; tab switches are instant. Scrolling 60fps with 50+ rows (FlashList,
memoized rows). Keyboard never covers a focused input. Pull-to-refresh on every list with a light
haptic on trigger.

**Consistency** — This page shares components with its siblings (sheet, inputs, field group, rows,
pills are imports, not copies). View and Edit are one component (diff the file to prove it). Wording
matches app vocabulary (button verb = toast verb). Accessibility: every icon-only control has an
`accessibilityLabel`; text respects Dynamic Type one step up.

---

## 10. Migration checklist — existing-screen violations (baseline)

> Generated by scanning `apps/mobile/app/**` + `apps/mobile/components/**` (excluding the new
> `components/ui/ds/` kit) on **2026-07-13**, before any screen was migrated. This is the debt the
> redesign pays down: as each entity's four pages are rebuilt on the `ds` kit, its files drop off
> these lists. Nothing here was changed by the Foundation build — the kit is additive and no existing
> screen was touched.

**Scope:** 73 screen files under `app/`, 74 component files under `components/` (excl. `ds/`).

| Violation                                | Files affected | Rule broken                                                    |
| ---------------------------------------- | -------------: | ------------------------------------------------------------- |
| Borders / outlines (`borderWidth`, `border-*`) | **98**   | §1 Depth, not borders — cards never have borders              |
| Hex color literals (`#RRGGBB` in JSX/styles)   | **100**  | §2 every color is a token; no hex outside `tailwind.config.js` |
| Spinners (`ActivityIndicator` / `LoadingSpinner`) | **41** | §5 loading = content-shaped skeleton, never a spinner        |
| Off-scale spacing (padding/margin ∉ {8,12,16,20,24}) | **89** | §3 the spacing scale has exactly five values             |
| FAB / SpeedDial patterns                 |          3 components + 7 screens | §5 no FAB anywhere — add = top-right tinted circle |

### Reproduce any list

```sh
cd apps/mobile
# borders
grep -rlE "borderWidth|borderTopWidth|borderBottomWidth|\bborder-\[|\bborder-t\b|\bborder-b\b|\bborder\b" app components --include=*.tsx | grep -v components/ui/ds/
# hex literals
grep -rlE "#[0-9A-Fa-f]{3,8}\b" app components --include=*.tsx | grep -v components/ui/ds/
# spinners
grep -rlE "ActivityIndicator|LoadingSpinner" app components --include=*.tsx | grep -v components/ui/ds/
# off-scale numeric spacing
grep -rlnE "(padding|margin)(Top|Bottom|Left|Right|Horizontal|Vertical)?: *(1|2|3|4|5|6|7|9|10|11|13|14|15|17|18|19|21|22|23|26|28|30|32|36|40|44|48)\b" app components --include=*.tsx | grep -v components/ui/ds/
```

### FABs to remove (finite — highest priority, they violate a hard rule)

Delete the pattern; move the create action to the Overview's top-right `AddButton` (opens Quick Create).

- **Components:** `components/ui/PageSpeedDial.tsx`, `components/owner/SpeedDial.tsx`,
  `components/shared/SupportTicketFAB.tsx`
- **Screens mounting a FAB/SpeedDial:** `app/(owner)/index.tsx`, `app/(owner)/loads/index.tsx`,
  `app/(owner)/drivers/index.tsx`, `app/(owner)/more/trucks/index.tsx`,
  `app/(owner)/more/crm/index.tsx`, `app/(owner)/more/invoices/index.tsx`,
  `app/(owner)/more/payroll.tsx`
- `app/(owner)/routes/index.tsx` uses an absolute bottom-positioned button (FAB-shaped) — same fix.

### Spinners to replace with content-shaped skeletons (41 files)

Data screens (`hos`, `loads/[id]`, `drivers/[id]`, `trucks/[id]`, `routes/[id]`, `crm/*`,
`invoices/*`, `payroll`, `maintenance`, `safety`, `pay/*`, `login`) and sheets/components
(`CreateLoadSheet`, `TruckPickerSheet`, `ScheduleServiceSheet`, `RecipientSelector`, `AddressInput`,
`DocumentUploadSheet`, `DocumentDetailSheet`, `StatusUpdateButton`, workflow screens). Swap each
`ActivityIndicator` for `EntityListSkeleton` / a content-shaped `Skeleton` from `@/components/ui/ds`.

### Notes on the pervasive categories

- **Borders (98) / hex (100) / off-scale spacing (89)** touch nearly every screen — expected for a
  ground-up restyle. These are cleared _per page_ as the four-page rebuilds land (Prompts 1–9), then
  swept globally by Prompt 10 (Global QA sweep). Do not attempt a blind find-replace: each screen
  moves to the `ds` kit, which removes borders, replaces hex with `ds.*` tokens, and snaps spacing to
  the five-value scale by construction.
- **Legacy kit vs `ds` kit:** the old `components/ui/*` (Button, Card, Badge, Input, Skeleton,
  EmptyState, SectionHeader, …) uses `StyleSheet` + `constants/tokens` hex and is what most of the
  debt above flows through. It stays in place (live screens import it) until each screen migrates to
  `@/components/ui/ds`. Retire a legacy component only once no screen imports it.

### Foundation build — infra fix applied (no screens touched)

- Added `apps/mobile/types/lucide-react-native.d.ts`: the installed `react-native-svg` `SvgProps`
  resolved nearly empty, so **every** lucide icon usage app-wide (281 call sites) failed
  `tsc --noEmit` on `color` / `strokeWidth` / `style` / `className`. The shim restores those (all
  runtime-valid) prop types. Result: `npx tsc --noEmit` went from **284 errors → 0**. Purely
  additive types; no component changed.

---

## 11. Prompt 10 — Global QA sweep (carrier-fleet mobile-web) · 2026-07-14

Reviewer sweep of the `apps/web` carrier-fleet mobile-web surface (the `lg:hidden` branch of each
`page.tsx` + its `*Mobile` components + `apps/web/src/components/ui/ds/`). Scope note: the Prompts 1–9
four-page rebuilds landed **here**, not in `apps/mobile` (whose §10 baseline is a separate, not-yet-run
track). Files swept: `drivers/DriversMobile.tsx`, `drivers/InviteDriverSheet.tsx`,
`drivers/[id]/DriverDetailMobile.tsx`, `drivers/[id]/DriverHoursTab.tsx`, `trucks/TrucksMobile.tsx`,
`trucks/NewTruckSheet.tsx`, `trucks/[id]/TruckDetailMobile.tsx`, and the shared `ds/` kit.

**Result: compliant on all eight dimensions — zero code fixes required.**

- **Spacing:** layout spacing exact — screen margin `px-5`=20 (`MobileScreen`), card gap `space-y-3`=12,
  card padding `p-4`=16, section `space-y-6`=24. Sub-8px values (`gap-1.5`, `p-1`, `py-2.5`, `mt-1`) are
  component-internal geometry in the `ds/` kit, governed by §3's Sizes/Radii tables (52px field row,
  22px pill, 9px segmented thumb), not the layout scale — left as-is by design.
- **Borders:** zero on cards/rows in the mobile branch; the `ds/` kit is border-free by construction.
  The 7 `border` hits in `page.tsx` files are all in the `hidden lg:block` desktop branch (legitimate).
- **Accent / States / Interaction / Parity / Hierarchy / Forms:** all pass — single `isEditing` detail
  component with shared field defs; `ParentStrip` above tabs, children as tabs; content-shaped
  `Skeleton` + `EmptyState` + input-preserving errors, no spinners in the mobile branch; ≥44px targets +
  `active:opacity-75` + `navigator.vibrate` + `aria-label` on icon-only controls; Quick-Create sheets
  follow Form & Field Intelligence (3–5 required-first fields, native pickers, inline validation).
- **Gate:** `npx tsc --noEmit` in `apps/web` → **exit 0**.

**Flags raised:**

1. **Trip vs Loads vocabulary** — ✅ FIXED. `DriverDetailMobile.tsx` driver tab renamed `Loads` → `Trips`
   (label + internal `Tab` value `'loads'`→`'trips'`) to match the row wording ("Trip …", "No trips yet")
   and `TruckDetailMobile.tsx`.
2. **Breakpoint drift** — ✅ RESOLVED. §0 web-port note updated to `lg:hidden` / `hidden lg:block` to match
   the shipped pages (the established pattern).
3. **Stray FAB** — ✅ IDENTIFIED (leave as-is, per owner). The blue crosshair is the global
   `SupportTicketModal`'s draggable `SupportFAB` (LifeBuoy icon, `components/support/support-ticket-modal.tsx`),
   mounted in `app/layout.tsx` for authenticated users. Intentional; kept.

---

## 12. Screen rebuild log (post-mockup pages, built from §1–8 principles)

The mockup deck (`docs/specs/DriveCommand-Mobile-Design-System.pdf`) covers only Clients, Trucks, Drivers.
Remaining carrier pages are rebuilt on the ds kit from the principles + the four-page pattern, in order:
**Dashboard → Trips → Live Map → More-tab pages.** Each: `page.tsx` renders `lg:hidden <XMobile>` +
`hidden lg:block` desktop; the mobile branch reuses the desktop data sources.

- **Dashboard** · 2026-07-14 · `carrier/dashboard/DashboardMobile.tsx`. Client component reusing the five
  desktop widget endpoints (`/dashboard/kpi|alerts|drivers-status|activity`, `/dispatches`). Sections:
  LargeTitleHeader → 2×2 KPI grid (revenue=success, pending-pay=warning, open-invoices=accent, tap →
  navigate) → compliance alerts (tinted cards, or "All clear" success line) → on-duty driver strip
  (horizontal MonogramAvatar chips) → today's dispatches (`DocumentRow` + status pill / EmptyState) →
  recent activity (`DocumentRow` / EmptyState) → quick actions (New dispatch/load/client). Content-shaped
  skeletons per section; all spacing on-scale; `tsc --noEmit` → exit 0.
- **Trips (Overview)** · 2026-07-14 · `carrier/trips/TripsMobile.tsx`. Client component on the dispatches
  API (`/api/v1/carrier/dispatches`), driver/truck maps + `canCreate` passed from the server page.
  Standard Overview: LargeTitleHeader (+ count, `onAdd` → `/carrier/trips/new`) → tappable status KPIs
  (Planned / In progress / Completed) → SearchField (trip #/driver/unit) → scope SegmentedControl
  (All / Today / Upcoming) → `EntityRow` list (square Route tile — a trip is a "thing", subline
  driver·unit, meta day·loads, status pill → `/carrier/trips/[id]`). Skeleton + filter/empty states;
  `tsc --noEmit` → exit 0.
- **Trips (Create)** · 2026-07-14 · `carrier/trips/new/NewTripMobile.tsx`. Full ds create page (kept as a
  page, not a sheet — 7 fields + readiness gate exceed quick-create). Ports the desktop `NewDispatchForm`
  logic verbatim: route-template fetch + prefill (with a ds stop-preview card), driver/truck/co-driver
  selects, `datetime-local` departure, planned miles, notes — all via `FieldGroup` edit mode grouped by
  Route/Assignment/Schedule/Notes. Driver-readiness tRPC check → "Dispatch ready" badge; not-ready or 409
  opens a `SheetContainer` block sheet with the blocker list, View-checklist, and admin Override→reason→
  "Create anyway". `tsc --noEmit` → exit 0.
- **Trips (Detail/Edit — pass 1 of 2)** · 2026-07-14 · `carrier/trips/[id]/TripDetailMobile.tsx`. The desktop
  page stacks 6 child panels inline; the ds rebuild follows §6 (children as tabs, no inline child sections).
  Pass 1 ships the shell + **Details** + **Stops** tabs: identity (trip #, status pill, Recurring pill,
  recurrence summary), `ParentStrip` → route template, contextual primary action (Start Trip when planned /
  Complete Trip when in-progress, gated on `allStopsDone`), `SheetContainer` for Cancel / Mark TONU, and
  `Edit` (planned only, matching desktop) driving a single `isEditing` component — assignment/schedule/notes
  via `FieldGroup`, with the desktop's notes-tag preservation (`[DISPATCH_NUMBER=…]`, `[AUTO-GENERATED]`)
  and co-driver≠primary validation ported verbatim. **Odometer stays inline-editable** (`FieldGroup`
  `isEditing` + `onBlur` save) because Edit locks once a trip is in progress — exactly when the end reading
  is recorded. Stops tab renders a ds dot timeline (sequence, type, facility·city, window, status pill) with
  Manage → `/carrier/trips/[id]/stops`. `tsc --noEmit` → exit 0.
  **Pass 2 (pending):** Loads / Expenses / Messages tabs (+ Pay when completed) and the audit footer.
- **Trips (Stops, inline)** · 2026-07-14 · Manage used to hand off to the white desktop stops table, so
  stops are now managed in the Stops tab itself: an `Add Stop` `SheetContainer` (facility picker, type,
  appointment, contact, commodity, instructions → `POST /api/v1/carrier/stops`) and per-stop
  **Arrive / Complete / Skip** ported from `StopTimelineCard` with identical gating + the BOL/POD guard.
  This closed a real hole: without stop actions on mobile, `allStopsDone` could never be satisfied and
  **Complete Trip was unreachable**.
- **Trips (edit while running)** · 2026-07-14 · The desktop hides Edit whenever a trip is in progress, but
  `updateTrip()` only hard-blocks a *completed* trip — for `in_progress` it strips driver/truck itself and
  applies the rest. Mobile follows the server: Edit is available on planned + in-progress (locked only on
  completed/cancelled/tonu), and edit mode states which fields are locked instead of dropping them silently.
- **Route Templates (Overview + Edit — phase 1 of 2)** · 2026-07-14 ·
  `carrier/templates/TemplatesMobile.tsx` + `carrier/templates/[id]/TemplateEditMobile.tsx`. Reached from
  a trip's Belongs-to chip, so it was a white desktop page inside a ds flow. Overview: LargeTitleHeader
  (+ count, add → `/new`), search, Active/All segmented, `EntityRow` (square RefreshCw tile, client
  subline, recurrence + stop-count meta, Inactive pill). Edit: ds form on the same `saveRouteTemplate`
  action — Details / Schedule (RRULE builder: frequency, tappable day toggles, departs-at, timezone,
  generate-days-ahead) / Equipment (temp fields only for reefer) / Defaults / Notes, plus a tap-to-toggle
  Active pill (optimistic, rolls back on failure) and the "future trips only" warning.
  **Stops are passed through untouched** — `validate()` requires `stops.length > 0`, so dropping them
  would fail every save. `tsc --noEmit` → exit 0.
- **Route Templates (Create + stop editor — phase 2)** · 2026-07-15 · `templates/TemplateStopsEditor.tsx`
  + `templates/new/NewTemplateMobile.tsx`. The create page could not be re-skinned alone: `validate()`
  requires `stops.length > 0` and a create inherits none, so the ds stop editor was a prerequisite. Built
  once, used by create **and** edit (the edit page's "stops are desktop-only" placeholder is gone).
  Editor mints stops exactly like `StopBuilderAddModal` (`crypto.randomUUID`, same shape, pickup→BOL /
  delivery→BOL+POD defaults). **Reorder is ↑/↓ buttons, not the desktop's dnd-kit drag** — drag fights
  page scroll on touch; sequence is recomputed from array order either way. `tsc --noEmit` → exit 0.
- **Back navigation** · 2026-07-15 · `LargeTitleHeader` gained an optional `onBack` (accent chevron above
  the large title). The overviews reached from the **More** sheet — Templates, Clients, Drivers, Trucks —
  were dead ends. Tab roots (Dashboard/Trips/Loads/Live Map) omit it. More is an overlay, not a route, so
  `router.back()` is the destination.
- **Live Map** · 2026-07-15 · `app/(owner)/live-map/LiveMapMobile.tsx`. Note this route lives **outside**
  `/carrier` and is one responsive component (not page + `XMobile`), so the mobile branch is additive and
  the desktop `LiveMapWrapper` is untouched. The real mismatch was the basemap: light OSM tiles read as a
  glowing panel inside the dark shell, so `live-map.tsx` gained an opt-in `dark` prop switching to **CARTO
  dark_matter** (no API key, attribution kept; desktop still light until asked). ds chrome: floating status
  filter chips with counts, a freshness/refresh pill, and an Apple-Maps-style bottom bar opening the truck
  list as a `SheetContainer` of `EntityRow`s (tap → flyTo) — a sheet, not a FAB (§5). Leaflet's loading
  state is a ds `Skeleton`, not the old spinner. 15s polling paused while the tab is hidden.
  Follow-ups from device review: Leaflet's default zoom control was an unstyled white box colliding with
  the chips (`showZoomControl={false}` on touch); the bottom bar sat on the tab bar because the shell
  renders `OnboardingReminderRibbon` **in flow** above page content, so no viewport calc can be right —
  the map is now `fixed top-14 bottom-[72px] z-0`; chip tones were realigned to `STATUS_COLORS` so the
  chip you tap matches the dot you see; the marker's shadcn `VehicleDetailsSheet` was replaced with a ds
  sheet (`hideDetailsSheet`); and CARTO's roads needed `brightness(1.9) contrast(1.12)` on the tile pane
  (multiplicative, so the base stays dark while roads/labels lift) — tunable in one place.
- **Loads (Overview)** · 2026-07-15 · `carrier/loads/LoadsMobile.tsx`. Same `/api/v1/carrier/loads`
  endpoint as the desktop grid. Standard Overview, but **no back chevron** — Loads is a bottom-tab root,
  unlike the More sub-pages. Tappable status KPIs (Active/Delivered/Invoiced), search (ref #/client/trip #),
  All/Active/Delivered segmented, `EntityRow` (square Package tile, client subline, type·revenue·trip meta).
  Status tones: pending=neutral, in_transit=accent, delivered=success, cancelled=danger. The desktop paints
  **invoiced purple**, which the ds has no equivalent for (`vip` amber is reserved for VIP tags), so invoiced
  reads success like delivered — the label carries the difference, and tinting it warning would imply being
  billed is a problem. `tsc --noEmit` → exit 0.
  **Create** (`carrier/loads/new/NewLoadMobile.tsx`) and **Detail** (below) are both done — the Loads
  four-page set is complete.
- **Loads (Detail)** · 2026-07-15 · `carrier/loads/[id]/LoadDetailMobile.tsx`. Closed the last hole in the
  Loads set: the post-create redirect used to drop the owner onto the old white desktop page. Shipped
  alongside an independent bug fix — the PATCH `LoadUpdateSchema` (`loads/[id]/route.ts`) was stale at 6
  rate types while POST and contracts carried 8, so a `per_load`/`per_hour` load saved fine at creation but
  could never be edited again (400 Zod error). A shared `RATE_TYPES` tuple
  (`src/lib/carrier/rate-types.ts`) now backs all three carrier Zod schemas.
  Structure follows `TripDetailMobile.tsx`'s shape but diverges on one point: **tabs (Details/Stops/
  Assignments) stay visible through Edit** rather than swapping to one big edit-mode form — each tab
  internally flips between its view and edit content off the same `isEditing` flag, since the Stops tab's
  editor (`MobileStopsEditor`, reused from `NewLoadMobile`) feeds the same save payload as Details, not a
  separate save path. Identity + `StatusPill` (tones locked to `LoadsMobile`'s STATUS_META — invoiced reads
  success like delivered) and `ParentStrip` → the trip stay mounted in both modes. Decisions: **all select
  options are server-derived** in `page.tsx` (contracts for `load.clientId`, facilities) — a native
  `<select>` with no matching `<option>` on first paint silently reads its first option, which was the
  reported "Select a client…" bug on a load with a real client; the `ParentStrip` chip links to
  `/carrier/trips/[dispatchId]`, not `/carrier/dispatches/...` (commit 4986a301 removed that 308 redirect
  hop); Add to Trip deliberately omits route-template prefill and co-driver (desktop-only conveniences, not
  required to put a load on a trip — the desktop modal stays available at lg+); driver-pay Assignments are
  **read-only** on mobile (`listAssignmentsForLoad`, ported vocabulary from `assignment-card.tsx`) —
  creating/editing assignments stays desktop-only. `tsc --noEmit` → exit 0.
- **Loads (Detail — destructive action prominence)** · 2026-07-15 · Device review: on a load already on a
  trip, `showAddToTrip` is false, so the danger-tinted **Cancel Load** trigger inherited the whole action
  slot and led the page as a red slab. The trigger now carries the neutral card fill (`bg-ds-card` /
  `text-ds-txt`) like `TripDetailMobile`'s "More actions"; the sheet it opens is unchanged and its confirm
  keeps solid `bg-ds-danger`. **Principle: the page body never leads with a destructive action — the danger
  colour belongs at the point of no return, inside the sheet.** No intermediate "Load actions" sheet was
  added: the trip has one because it holds Cancel + TONU together, but a load has a single action, so a
  middle layer would cost a tap to hold one row. `tsc --noEmit` → exit 0.
- **Notifications (bell panel)** · 2026-07-16 · Device review: the top-bar bell shares
  `NotificationBell`/`NotificationCenter` across the desktop sidebar and the mobile top bar. On mobile the
  panel was a desktop dropdown anchored `absolute right-0` to the far-right bell, so its `100vw`-wide body
  was shoved off the left edge — the title clipped to "…FICATIONS" and it overflowed the viewport.
  `NotificationBell` gained a `variant`: `desktop` keeps the anchored dropdown byte-for-byte; `mobile` opens
  the list in the ds `SheetContainer` (backdrop, `ds.sheet` fill, grabber, Cancel, centred "Notifications"
  title) — same primitive as the Live Map truck list and Trip actions. Because the shell already mounts each
  variant in its own responsive (`lg:hidden` / `hidden lg:*`) branch, this is a **prop, not a
  `useBreakpoint()`** — no SSR hydration mismatch (the trap the grid `MobileToolbar` still falls into).
  `NotificationCenter` got a matching variant: dropdown branch unchanged, sheet branch renders the same rows
  on `ds` tokens at mobile touch sizes; fetch/mark-read/navigation shared. The mobile click-outside listener
  is dropped — the sheet renders in a portal (outside the bell's `containerRef`) and owns its own
  backdrop/Escape close, so the old `mousedown` handler would have self-closed it on the first tap.
  `tsc --noEmit` → exit 0.
- **Contracts (Overview)** · 2026-07-16 · `carrier/contracts/ContractsMobile.tsx`. Was still the desktop
  DataGrid crammed into the phone (white page, Cards/Table + Filter/Sort/Export). Standard Overview on the
  `ContractRow` data the server page already builds: LargeTitleHeader (+ count, `onBack` — a More sub-page,
  `onAdd` → `/carrier/contracts/new` which is a **page, not a sheet**, gated by `canCreate`) → Total / Active /
  Expiring KPIs (Active + Expiring double as tap-filters, sharing the segmented state) → SearchField (contract
  # / client) → All/Active/Expiring `SegmentedControl` → `EntityRow` list (**square FileText tile** — a
  contract is a "thing", not a person, so no monogram; client subline; meta `"rate · exp date"` tinted
  **warning** when `isExpiringSoon`, mirroring the driver CDL-expiry signal; status pill active=success /
  pending=warning / expired=danger / terminated=neutral). Renewals sort to the top, then newest contract #.
  Rate/date formatting ported from the grid's `columns.tsx` so both views agree. Chrome hidden until ≥1 row.
  `tsc --noEmit` → exit 0.
- **Contracts (Detail / Edit + Create)** · 2026-07-16 · `contracts/[id]/ContractDetailMobile.tsx` +
  `contracts/new/NewContractMobile.tsx` + `contracts/contract-options.ts`. Tapping a contract had landed on
  the 507-line desktop `ContractDetail` (white). Detail: identity (name/number + status pill) → `ParentStrip`
  to the client → `NavHeader` Edit toggle over one `isEditing` flag. View = Terms + Rate & accessorials
  `FieldGroup`s + a Loads-summary tile grid (loads/revenue/invoiced/paid/avg rate/route templates) + notes;
  Edit = the 16 fields as `FieldGroup` selects/inputs, PATCH `/api/v1/carrier/contracts/[id]` with the body
  shape **ported verbatim from `ContractForm.handleSubmit`**, then stay-and-`router.refresh()` (don't bounce
  to the list). Create: full ds page (not a sheet — 16 fields), same field set, POST. **Client `<select>`
  server-fetched** in both `page.tsx` files (client-fetching flashes "Select a client"). Status tones span
  both vocabularies (grid pending/terminated + form draft/cancelled). The six option sets live once in
  `contract-options.ts` — a third divergent copy is how the loads rate-type enum drifted. **Documents stay on
  desktop** (`DocumentUploadModal` is shadcn) — flagged inline as the follow-up. `tsc --noEmit` → exit 0.
- **Facilities (Overview + Edit + Create)** · 2026-07-16 · `facilities/FacilitiesMobile.tsx` +
  `facilities/[id]/FacilityEditMobile.tsx` + `facilities/new/FacilityCreateMobile.tsx` +
  `lib/carrier/facility-type.ts`. All three landed on white desktop pages before. Overview: server-derived
  rows (location/contact+dock-flag meta, type label/tone) → KPIRow of the 3 headline types
  (Terminal/Warehouse/Yard, tap-to-filter) + **a horizontally scrollable filter-chip row** (All + every type
  present) added after Sammy flagged the KPIs alone weren't a discoverable filter and left drop_yard /
  customer_site unreachable; both drive one `typeFilter`. Every row carries its own type `StatusPill` so all
  5 types stay labeled. Square icon tile per type (places, not people). Edit/Create: `NavHeader` + `FieldGroup`
  sections (Details/Address/Coordinates/Notes) + two `Toggle` requirements (Appointment/Lumper) + an
  add/remove Contacts editor (`SheetInput` cards). **PATCH/POST body + validation ported verbatim from
  `FacilityForm`** (incl. its conditional-spread semantics — clearing a set field doesn't persist, matching
  desktop; don't "fix" without an API that accepts nulls). Edit has a ds delete-confirm `SheetContainer`
  (replacing the shadcn `Dialog` on mobile) + a discard-guard on back; audit footer stays desktop-only.
  Facility type label/tone/**option set** centralized in `facility-type.ts` (shared by all three). Authoritative
  types come from `FacilityForm` (terminal/yard/warehouse/drop_yard/customer_site) — the grid `columns.tsx`
  labels (shipper/receiver/fuel_stop) are stale; left untouched. **No address autocomplete** (no ds equivalent;
  every mobile ds form uses plain fields — lat/lng stay manually editable). `tsc --noEmit` → exit 0.
- **Payroll (Create + Edit)** · 2026-07-17 · `payroll/PayrollFormMobile.tsx` + wired into `payroll/new/page.tsx`
  and `payroll/[id]/edit/page.tsx`. Both create and edit had fallen back to the **white desktop `PayrollForm`**
  on mobile (the same gap the invoice edit page had). New ds form mirrors `InvoiceFormMobile`'s structure and
  its submission fix — **explicit `preventDefault` + `startTransition`** calling the action directly, because
  React's `<form action>` doesn't fire reliably in the mobile webview (it did a native reload). Sections:
  Driver select (required) → Pay period start/end → Compensation (an **hourly-rate × hours calculator** that
  sets Base Pay, then base/bonuses/deductions) with a live total-breakdown card (base → +bonuses → −deductions →
  total) styled like `PayrollDetailMobile` → Performance (miles/loads that **auto-populate** from
  delivered/invoiced loads in the period via `getDriverPayPeriodStats`, Loading/Auto-filled indicator, still
  manually editable) → Status → Notes. **Catch-all error banner** surfaces any field error not shown inline, so
  a rejected save is never a silent scroll-to-top (the bug that first hid the invoice save failure). Shared
  `initialData` between mobile + desktop with Prisma Decimals (`basePay/bonuses/deductions`) converted to numbers
  at the page. Base Pay keeps desktop's `required` (a genuine $0 base is blocked at both — noted follow-up).
  `tsc --noEmit` → exit 0.
