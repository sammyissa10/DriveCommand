---
phase: quick-87
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/navigation/app-logo.tsx
  - src/components/navigation/sidebar.tsx
  - src/app/(admin)/layout.tsx
  - src/app/(driver)/layout.tsx
  - src/app/(auth)/layout.tsx
  - src/app/layout.tsx
  - src/components/landing/landing-page.tsx
autonomous: true

must_haves:
  truths:
    - "DC Chevron icon SVG renders inline at all sizes (16px to 192px) with correct navy/blue two-tone colors"
    - "Forward D wordmark renders with Poppins ExtraBold for the D and regular weight for riveCommand"
    - "Every layout header (admin, driver, owner sidebar, auth, landing) uses the new logo components consistently"
    - "Favicon and metadata icons use the DC Chevron mark"
  artifacts:
    - path: "src/components/navigation/app-logo.tsx"
      provides: "DCChevronIcon SVG component + DriveCommandWordmark component + AppLogo composite"
    - path: "src/app/layout.tsx"
      provides: "Poppins font import, updated metadata icons"
  key_links:
    - from: "src/components/navigation/sidebar.tsx"
      to: "src/components/navigation/app-logo.tsx"
      via: "import { AppLogo } from"
    - from: "src/app/(admin)/layout.tsx"
      to: "src/components/navigation/app-logo.tsx"
      via: "import { AppLogo, DCChevronIcon } from"
---

<objective>
Implement the DriveCommand logo system: DC Chevron icon (inline SVG) and Forward D wordmark across all app surfaces.

Purpose: Replace placeholder logo.png references with proper inline SVG logo components that render crisp at every size, use the brand color palette, and are consistent across all portals.

Output: Updated app-logo.tsx with SVG components, all layouts using them, Poppins font loaded, favicon/metadata updated.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/navigation/app-logo.tsx
@src/components/navigation/sidebar.tsx
@src/app/(admin)/layout.tsx
@src/app/(driver)/layout.tsx
@src/app/(auth)/layout.tsx
@src/app/layout.tsx
@src/components/landing/landing-page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create SVG logo components and load Poppins font</name>
  <files>
    src/components/navigation/app-logo.tsx
    src/app/layout.tsx
  </files>
  <action>
Rewrite `src/components/navigation/app-logo.tsx` to export three components:

1. **DCChevronIcon** — inline SVG component (no Image/png dependency).
   - Props: `size?: number` (default 32), `className?: string`, `variant?: 'dark' | 'light'` (default 'dark')
   - Renders the DC monogram: letter D on left in dark navy #1E3A5F, letter C on right in electric blue #2563EB
   - The D and C face each other — D's curved right edge and C's curved left edge nearly touch
   - The negative space between them forms a right-pointing chevron shape
   - For 'dark' variant: D=#1E3A5F, C=#2563EB on transparent bg (for light backgrounds/white containers)
   - For 'light' variant: both letters white on transparent bg (for dark backgrounds like nav headers)
   - Use a viewBox of "0 0 32 32" so it scales cleanly
   - Build the D and C as SVG `<path>` elements. The D: a vertical stroke on left with a curved right edge (like a capital D). The C: a curved letter C facing left. Position them so the gap between creates the chevron.
   - Keep it simple and geometric — thick bold letterforms, rounded where the original letters would be curved

2. **DriveCommandWordmark** — text-based wordmark component.
   - Props: `className?: string`, `size?: 'sm' | 'md' | 'lg'` (default 'md')
   - Renders "DriveCommand" as a `<span>` element
   - The leading "D" gets `font-extrabold` (Poppins 800 weight) — this is the Forward D concept
   - "riveCommand" gets `font-semibold` (Poppins 600 weight)
   - Size mapping: sm = text-sm, md = text-lg, lg = text-2xl
   - Text color inherited from parent (use `text-current` or just inherit)

3. **AppLogo** — composite component (keeps backward compatibility).
   - Props: `size?: number` (default 40), `className?: string`, `variant?: 'dark' | 'light'`, `showWordmark?: boolean` (default false), `wordmarkSize?: 'sm' | 'md' | 'lg'`
   - Renders DCChevronIcon at given size
   - When `showWordmark=true`, renders icon + DriveCommandWordmark side by side with gap-2
   - When `showWordmark=false`, renders icon only (backward compatible with current usage)

In `src/app/layout.tsx`:
- Add Poppins font import alongside Inter: `const poppins = Poppins({ subsets: ['latin'], weight: ['600', '800'], variable: '--font-poppins' })`
- Add `poppins.variable` to the body className so Poppins is available as CSS variable
- In the DriveCommandWordmark component, apply `font-[family-name:var(--font-poppins)]` to ensure Poppins is used for the wordmark
- Update metadata icons to reference `/favicon.png` for the icon and keep `/logo-192.png` for apple touch icon
  </action>
  <verify>
Run `npx tsc --noEmit` to confirm no type errors. Visually confirm the SVG renders by checking the component exports are valid JSX.
  </verify>
  <done>
Three exported components (DCChevronIcon, DriveCommandWordmark, AppLogo) exist with proper TypeScript types. Poppins font loaded in root layout. No png/Image dependencies in logo components.
  </done>
</task>

<task type="auto">
  <name>Task 2: Replace all logo references across layouts and landing page</name>
  <files>
    src/components/navigation/sidebar.tsx
    src/app/(admin)/layout.tsx
    src/app/(driver)/layout.tsx
    src/app/(auth)/layout.tsx
    src/components/landing/landing-page.tsx
  </files>
  <action>
Update every file that currently uses `logo.png` or the old AppLogo to use the new SVG components.

**Owner sidebar** (`src/components/navigation/sidebar.tsx` lines 60-82):
- Remove `import Image from "next/image"`
- Import `{ AppLogo, DriveCommandWordmark }` from `@/components/navigation/app-logo`
- Replace the Image+white-bg-div block with: `<AppLogo size={32} variant="dark" />` (icon in a white rounded container is no longer needed — the SVG has its own colors)
- Replace the "DriveCommand" text span with `<DriveCommandWordmark size="sm" />`
- Keep "Fleet Management" subtitle span as-is
- In collapsed sidebar state (`group-data-[collapsible=icon]:hidden`), only wordmark hides — icon stays

**Admin header** (`src/app/(admin)/layout.tsx` lines 27-33):
- Import `{ AppLogo, DriveCommandWordmark }` from `@/components/navigation/app-logo`
- Replace the img+white-bg-div with `<AppLogo size={32} variant="light" />` (light variant for dark header bg)
- Replace `<h1 className="text-xl font-semibold">DriveCommand Admin</h1>` with `<DriveCommandWordmark size="md" />` followed by a `<span className="text-white/60 text-sm font-medium">Admin</span>` badge
- Remove the eslint-disable comment for no-img-element

**Driver header** (`src/app/(driver)/layout.tsx` lines 59-62):
- Already imports AppLogo — update to also import DriveCommandWordmark
- Replace `<AppLogo size={32} />` with `<AppLogo size={32} variant="dark" />`
- Replace `<h1 className="text-lg font-bold tracking-tight text-foreground">DriveCommand</h1>` with `<DriveCommandWordmark size="md" />`

**Auth/login layout** (`src/app/(auth)/layout.tsx` lines 16-19):
- Already imports AppLogo — update to also import DriveCommandWordmark
- Replace the current stacked logo+text with: `<AppLogo size={56} variant="light" className="drop-shadow-md" />` and `<DriveCommandWordmark size="lg" className="text-white drop-shadow" />`

**Landing page** (`src/components/landing/landing-page.tsx`):
- Import `{ AppLogo, DriveCommandWordmark, DCChevronIcon }` from `@/components/navigation/app-logo`
- **Nav header** (line ~177): Replace the Image+white-bg block with `<DCChevronIcon size={28} variant="light" />`. Replace text "DriveCommand" span with `<DriveCommandWordmark size="md" className="text-white" />`
- **Footer** (line ~855): Replace the Truck icon + gradient div with `<DCChevronIcon size={28} variant="light" />`. Replace text span with `<DriveCommandWordmark size="md" className="text-white" />`
- Remove unused `Image` import from next/image if no other Image usage remains in the file (check first — there may be other Image uses)
  </action>
  <verify>
Run `npx tsc --noEmit` to confirm no type errors. Run `npm run build` (or `npx next build`) to verify the build succeeds with no errors. Grep for any remaining `logo.png` references in src/ to confirm all are replaced: `grep -r "logo\.png" src/`
  </verify>
  <done>
All 5 layout files use the new SVG logo components. Zero references to `logo.png` remain in src/ (public/ PNG files stay for OG/social media fallbacks). Build passes cleanly. Admin uses light variant on dark header, driver uses dark variant on light header, owner sidebar uses dark variant, auth uses light variant on overlay, landing nav/footer use light variant.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with zero errors
- `npm run build` completes successfully
- `grep -r "logo\.png" src/` returns no results (all references migrated)
- `grep -r "DCChevronIcon\|DriveCommandWordmark\|AppLogo" src/` shows usage across all layout files
- Poppins font variable present in root layout body class
</verification>

<success_criteria>
- DC Chevron inline SVG renders at all sizes without external image dependencies
- Poppins font loaded globally, wordmark uses ExtraBold D + SemiBold rest
- All 6 consumer files (sidebar, admin, driver, auth, landing nav, landing footer) use new components
- Dark/light variants used correctly per background context
- Build passes, no TypeScript errors, no remaining logo.png imports in src/
</success_criteria>

<output>
After completion, create `.planning/quick/87-implement-drivecommand-logo-system-dc-ch/87-SUMMARY.md`
</output>
