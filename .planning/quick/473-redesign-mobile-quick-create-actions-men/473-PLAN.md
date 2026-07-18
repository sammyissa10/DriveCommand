---
phase: quick-473
plan: 473
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/quick-actions/QuickActionsMenu.tsx
  - apps/web/src/components/navigation/owner-shell.tsx
autonomous: true

must_haves:
  truths:
    - "On a mobile viewport, the top-bar '+' opens a design-system bottom sheet (grabber, Cancel, centered 'Create' title, subtitle)"
    - "The sheet shows two grouped ds-card sections (Quick Create / Quick Actions) with rows using ds tokens, muted icons, chevrons, and inset hairlines"
    - "Tapping a row closes the sheet and navigates to the item's href"
    - "The desktop Create dropdown is visually and behaviorally unchanged"
  artifacts:
    - path: "apps/web/src/components/quick-actions/QuickActionsMenu.tsx"
      provides: "QuickActionsMenu with variant prop; mobile bottom-sheet variant + unchanged desktop dropdown"
      contains: "variant"
    - path: "apps/web/src/components/navigation/owner-shell.tsx"
      provides: "Mobile call site passes variant=\"mobile\""
      contains: "variant=\"mobile\""
  key_links:
    - from: "apps/web/src/components/navigation/owner-shell.tsx (mobile topbar ~line 126)"
      to: "QuickActionsMenu variant=\"mobile\""
      via: "prop"
      pattern: "QuickActionsMenu variant=\"mobile\""
    - from: "QuickActionsMenu mobile variant"
      to: "@/components/ui/ds (AddButton, SheetContainer, SectionHeader)"
      via: "import + render"
      pattern: "SheetContainer|AddButton|SectionHeader"
---

<objective>
Apply the DriveCommand mobile design system to the "Quick Create / Quick Actions" menu so it matches the other mobile-web pages. On mobile, replace the Linear-style shadcn dropdown (which uses hardcoded hsl() colors) with a ds bottom sheet built from the existing ds kit. Desktop stays exactly as-is.

Purpose: The Quick Actions menu is the only top-bar control on mobile that still uses hardcoded colors and a desktop dropdown pattern — it visually breaks from the rest of the mobile app.
Output: `QuickActionsMenu` gains a `variant?: 'desktop' | 'mobile'` prop; the mobile variant renders an `AddButton` trigger + `SheetContainer` bottom sheet; the mobile owner-shell call site passes `variant="mobile"`.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/mobile-design-system.md

@apps/web/src/components/quick-actions/QuickActionsMenu.tsx
@apps/web/src/components/quick-actions/quickActions.config.ts
@apps/web/src/components/ui/ds/index.ts
@apps/web/src/components/navigation/owner-shell.tsx

AUTHORITATIVE SPEC: docs/specs/DriveCommand-Mobile-Design-System.pdf
(extract with: pdftotext -layout docs/specs/DriveCommand-Mobile-Design-System.pdf out.txt)
If the built screen and the spec disagree, the spec wins.

Verified facts (do NOT re-derive):
- Only TWO consumers of <QuickActionsMenu, both in owner-shell.tsx: line ~91 (desktop, inside `hidden lg:flex`) and line ~126 (mobile, inside `lg:hidden` `dark bg-ds-bg` bar). index.ts re-exports it; searchProviders.ts only imports the config, not the component.
- ds kit exports AddButton, SheetContainer, SectionHeader from `@/components/ui/ds`.
- `AddButton` signature: `{ onClick: () => void; label: string }` — h-8 w-8 accent-tinted circle with Plus glyph and aria-label; it IS the ds "Add action".
- `SheetContainer` signature: `{ open, onCancel, title, subtitle?, cancelLabel?, children }` — handles backdrop, bg-ds-sheet, top radius 24, grabber, Cancel top-left, centered title, portal + Escape + body-scroll-lock.
- `SectionHeader` signature: `{ title, action? }` — 12px Semibold UPPERCASE tracked text-ds-txt2.
- Config `QUICK_ACTION_SECTIONS` (two sections; each item has id, label, icon, href, optional shortcut) — reuse as-is, do NOT restructure.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add mobile bottom-sheet variant to QuickActionsMenu and wire the mobile call site</name>
  <files>
    apps/web/src/components/quick-actions/QuickActionsMenu.tsx
    apps/web/src/components/navigation/owner-shell.tsx
  </files>
  <action>
In `QuickActionsMenu.tsx`:

1. Add a prop: `export function QuickActionsMenu({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' })`. Mirror how `NotificationBell` already takes `variant="mobile"`.

2. Keep the entire EXISTING desktop dropdown markup/behavior UNCHANGED. When `variant === 'desktop'`, return the current `DropdownMenu` tree exactly as-is (hardcoded hsl() colors, shortcut hints, everything). Do NOT touch it.

3. When `variant === 'mobile'`, render the ds bottom-sheet version instead:
   - Import `AddButton`, `SheetContainer`, `SectionHeader` from `@/components/ui/ds`, and `ChevronRight` from `lucide-react`.
   - Local open state: `const [open, setOpen] = useState(false)`.
   - Trigger: `<AddButton label="Create" onClick={() => setOpen(true)} />` (replaces the blue "+ ⌄" pill; it sits among the other mobile top-bar icon buttons on the dark `bg-ds-bg` bar).
   - Sheet: `<SheetContainer open={open} onCancel={() => setOpen(false)} title="Create" subtitle="Create a record or run a quick action">`.
   - Sheet body: wrap sections in a `<div className="space-y-6">`. For each `section` in `QUICK_ACTION_SECTIONS`, render:
       * `<SectionHeader title={section.label} />`
       * then a grouped card: `<div className="mt-2 overflow-hidden rounded-[20px] bg-ds-card">` containing the rows.
   - Each row: a real `<button type="button" className="flex w-full items-center gap-3 px-4 min-h-[52px] text-left transition active:opacity-75" onClick={() => handleSelect(item.href)}>` with:
       * `<item.icon className="h-5 w-5 shrink-0 text-ds-txt2" />`
       * `<span className="flex-1 text-[17px] text-ds-txt">{item.label}</span>`
       * `<ChevronRight className="h-5 w-5 shrink-0 text-ds-txt3" />`
     DROP the keyboard `shortcut` hint on mobile (touch device; other mobile pages don't show shortcuts).
   - Inset hairline between rows only — render a `<div className="ml-12 h-px bg-ds-hairline" />` AFTER each row EXCEPT the last (ml-12 = 48px = px-4 16 + icon 20 + gap 12 aligns the divider under the label). No divider before the first row or after the last.
   - `handleSelect(href)`: `setOpen(false); router.push(href)`.
   - Use ONLY ds tokens in the mobile variant — no hardcoded hsl()/hex. Use only user-facing copy.

4. Do NOT restructure or edit `quickActions.config.ts`.

In `owner-shell.tsx`:
5. At the MOBILE call site (~line 126, inside the `lg:hidden` `dark bg-ds-bg` header), change `<QuickActionsMenu />` to `<QuickActionsMenu variant="mobile" />`.
6. Leave the DESKTOP call site (~line 91) as `<QuickActionsMenu />` — unchanged.
  </action>
  <verify>
- `pdftotext -layout docs/specs/DriveCommand-Mobile-Design-System.pdf` sanity-check that the mobile variant matches the ds sheet/row spec (grouped 20px card, muted icons, inset hairlines, one accent).
- Confirm only two `<QuickActionsMenu` call sites exist and only the mobile one now passes `variant="mobile"` (grep).
- From repo root: `cd apps/web && npx tsc --noEmit` — no NEW errors in the two touched files (repo has ~35 baseline errors; only regressions in touched files count).
- Visual check at a mobile viewport: tapping the top-bar "+" opens a bottom sheet (grabber, Cancel, centered "Create" title, subtitle) with two grouped ds-card sections (Quick Create / Quick Actions); rows use ds tokens, muted icons, chevrons, inset hairlines; tapping a row closes the sheet and navigates. Desktop Create dropdown unchanged.
  </verify>
  <done>
- `QuickActionsMenu` accepts `variant?: 'desktop' | 'mobile'` (default 'desktop'); desktop dropdown markup/behavior byte-for-byte unchanged.
- Mobile variant renders `AddButton` trigger + `SheetContainer` sheet built from `SectionHeader` + grouped `rounded-[20px] bg-ds-card` rows with muted icons, chevrons, inset `ml-12` hairlines, no shortcuts, and closes-then-navigates on tap.
- Mobile owner-shell call site passes `variant="mobile"`; desktop call site unchanged.
- No hardcoded hsl()/hex in the mobile variant; no new tsc errors in touched files.
  </done>
</task>

</tasks>

<verification>
- Two call sites confirmed; only the mobile one carries `variant="mobile"`.
- Mobile variant uses only ds tokens (bg-ds-card, bg-ds-hairline, text-ds-txt, text-ds-txt2, text-ds-txt3) and ds components (AddButton, SheetContainer, SectionHeader) — no new sheet/menu pattern introduced.
- Config untouched; no schema/migration.
- `npx tsc --noEmit` shows no regression in QuickActionsMenu.tsx or owner-shell.tsx.
</verification>

<success_criteria>
- Mobile: top-bar "+" opens a ds bottom sheet titled "Create" with subtitle, two grouped ds-card sections, muted-icon rows with chevrons and inset hairlines; row tap closes sheet + navigates.
- Desktop: Create dropdown visually and behaviorally identical to before.
- Design-task constraints met: ds tokens only, user-facing copy only, reused ds kit, ~48px+ touch targets, AddButton aria-label present.
</success_criteria>

<output>
After completion, create `.planning/quick/473-redesign-mobile-quick-create-actions-men/473-SUMMARY.md`.
Executor commits only — NO git push, NO deploy.
</output>
