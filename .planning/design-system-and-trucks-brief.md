# DriveCommand — Design System Consolidation + Trucks Rebuild

**For: Claude Code (GSD workflow)**
**From: product/design**
**Goal: First make our design system real and documented. Then rebuild the Trucks pages on top of it so they look and behave like one intentional product.**

---

## How to use this document

Work in two passes. **Do not start building in pass 2 until pass 1 is reviewed and agreed.**

- **Pass 1 — Audit & propose.** Review what we already have, tell us what exists, what's inconsistent, and what's missing. Produce a short written proposal. Stop and wait for sign-off.
- **Pass 2 — Build.** Once the proposal is approved, consolidate the design system, then rebuild the Trucks pages.

A reference prototype accompanies this brief (an HTML mockup of the Trucks overview, create form, and view/edit page). Treat it as the **intended look and behavior**, not as code to copy. Our real components and tokens win over anything in the mockup.

---

## Important context (read before doing anything)

We are NOT starting from scratch. We already have a lot. The biggest risk here is that you build a second, parallel design system next to the one we already have. Don't. The job is to consolidate and extend what exists.

What we believe is already in the project (verify this yourself, don't trust this list blindly):
- shadcn/ui is installed (New York style, CSS variables).
- A `cn()` helper exists for class merging.
- `src/components/ui/` already has primitives (button, input, card, dialog, tabs, sidebar, tooltip, etc.).
- `tailwind.config.ts` has a semantic color system, plus brand tokens (sky blue `#0ea5e9`, Poppins for headings).
- `globals.css` defines color variables for light and dark.
- It's a monorepo: `apps/web` (Next.js) and `apps/mobile` (Expo + NativeWind).
- We follow the GSD workflow with plans under `.planning/`.

Because of this, your first job is to look, not to build.

---

## PASS 1 — Audit & propose (do this first, then stop)

### Step 1: Review what we have
Look through the codebase and report back, in plain language:
- What UI primitives already exist in `src/components/ui/` and which are actually used vs. orphaned.
- Where design tokens live (colors, spacing, radius, typography) and whether they're used consistently or hardcoded in places.
- How forms are currently built (what library, how validation and errors are handled, whether labels/help text are consistent).
- How tables/lists are currently built and whether there's any shared table component.
- Anything that's clearly inconsistent (three different button styles, ad-hoc colors, one-off spacing, etc.).
- What's shared between `apps/web` and `apps/mobile` and what's duplicated.

### Step 2: Tell us the gaps
Based on the reference prototype, we want these patterns to exist as reusable pieces. Tell us which already exist, which need extending, and which are missing:
- **Form field** — label always above the input, optional helper text, clear error state. Required marked with `*`. Never use placeholder as the only label.
- **Form section** — a titled group of fields with consistent spacing (e.g. "Identity", "Weight & capacity").
- **Status chip** — small colored pill for states like Active / In shop / Out of service.
- **Alert/compliance badge** — for things like "Insurance expiring in 3 days." Must use icon + text, never color alone.
- **KPI card** — a number, a label, an icon, optional trend.
- **Data table** — sortable columns, row selection, clickable rows, pagination.
- **Type-aware column filter** — a filter that changes shape based on the field's data type:
  - text → "contains" box
  - enum/status → multi-select checklist
  - number → min/max range
  - date → range with quick presets (Today, 7 days, 30 days, This year)
  - relation (e.g. driver) → searchable list
- **Search bar** — one wide, generous search field with an inline button at the right edge to open advanced/saved filters (mirrors the inspiration we liked).
- **Detail/record layout** — a page that shows a record's fields in sections, with a right-hand rail for summary info.

### Step 3: Decide where shared things live
Recommend where reusable, app-agnostic pieces should live (e.g. a shared package vs. `apps/web` only for now), and be honest about the tradeoff. We don't want over-engineering — if web-only is the pragmatic call for now, say so and explain how mobile reuses the tokens.

### Step 4: Write the proposal, then stop
Produce a short proposal document (1-2 pages) covering: what exists, what you'll consolidate, what you'll add, where things will live, and the order you'll build in. **Do not write feature code yet. Wait for sign-off.**

---

## PASS 2 — Build (only after the proposal is approved)

### Phase A: Consolidate and document the design system
1. Make the tokens the single source of truth. Colors, spacing, radius, and typography should come from tokens, not hardcoded values. Fix obvious one-off hardcoded values you find.
2. Fill the missing reusable pieces from the gap list above. Build them on top of existing shadcn primitives — don't reinvent things shadcn already gives us (use Popover + Checkbox for the multi-select filter, Tailwind responsive utilities for layout, etc.).
3. Each reusable piece should be: presentational (no data fetching inside it), typed, and documented with a one-line description and a usage example.
4. Write a short, human-readable design system reference (a markdown file in the repo) that lists every reusable piece, what it's for, and the rules below. This is what future pages get checked against.

**Design rules to encode and enforce:**
- Labels go above inputs, always. Required fields marked with `*`. Helper text in muted color below the field.
- Red is only ever used for errors and destructive actions. Never decorative.
- Status and alerts always pair color with an icon and/or text, so they pass accessibility (target WCAG AA).
- **Text must never overflow or clip.** Long values (unit names, VINs, customer names) must truncate cleanly with an ellipsis or wrap gracefully — pick the right one per context and make it the default in the shared components. The search field should be generously sized with comfortably large, readable text.
- Touch targets on mobile are at least 44px.
- Spacing and radius come from the scale, not arbitrary numbers.

### Phase B: Rebuild the Trucks pages on the system
Rebuild these three, using only the consolidated design system pieces. If a page needs something the system doesn't have, add it to the system first, then use it — don't make a one-off.

1. **Trucks overview**
   - KPI cards at top (total fleet, active & compliant, expiring soon, needs action). If a trend line can't be backed by real data yet, omit it rather than fake it.
   - Segmented tabs with counts (All / Active / In shop / Out of service).
   - One wide search field with the inline filter-config button.
   - Sortable table with the type-aware column filters described above.
   - Active filters shown as removable pills with a "Clear all".
   - Whole row opens the record; an explicit "Manage" affordance too. Quiet bulk-select checkboxes.
   - Desktop = table. Mobile = cards carrying the same information priority (compliance alerts most prominent, driver as secondary line). KPIs become a swipeable strip on mobile.

2. **Truck quick-create**
   - Single smart page, three sections (Identity / Weight & capacity / Registration & compliance).
   - Only Unit Number required. Everything else optional with helpful text.
   - VIN field with a "Lookup" action that decodes and auto-fills Year/Make/Model/GVWR. On failure, show a non-blocking inline message and let the user type manually — never block the save.
   - A completeness indicator that rewards progress (optional/dismissible — don't let it nag).

3. **Truck view / edit** — one component, two routes
   - `/trucks/[id]` shows the record read-only; `/trucks/[id]/edit` is the same layout with fields unlocked.
   - View and edit must look identical (same component, mode switch), so they can never visually drift. Read-only fields render in a clean, non-interactive style.
   - Edit mode has Save and Cancel, an "unsaved changes" indicator, and guards against navigating away with unsaved changes.
   - Right rail shows summary info (compliance health, current driver assignment).

**Why one component, two routes (not an in-place toggle):** separate URLs give us deep links to edit, clean browser-back-to-cancel, and simpler unsaved-change handling, while one shared component keeps view and edit pixel-identical.

---

## Things to actively avoid
- Building a second design system parallel to the existing one.
- Reinventing primitives shadcn already provides.
- Hardcoded colors, spacing, or font sizes in page code.
- Red used for anything but errors/destructive actions.
- Text that clips or overflows its container.
- A completeness/progress indicator that blocks saving or nags.
- Faking data (e.g. trend sparklines) that isn't really there.

## How we'll know it's good
- A new page built later can be assembled almost entirely from documented system pieces.
- View and edit are provably the same component.
- Every status/alert is readable without relying on color.
- Nothing clips or overflows at long values or small screens.
- `npm run build` passes and existing pages still work.

## Rollback awareness
If any part of the approach doesn't work (a shared package causes monorepo friction, a shadcn component fights a requirement, etc.), stop, note what failed and why, and propose an alternative before continuing. Don't force it.
