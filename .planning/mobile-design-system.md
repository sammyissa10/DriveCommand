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
