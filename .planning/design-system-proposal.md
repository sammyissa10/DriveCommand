# Design System Consolidation — Audit & Proposal

**Date:** 2026-06-21
**Status:** PASS 1 COMPLETE — Awaiting sign-off
**Scope:** Audit findings + proposed consolidation plan

---

## 1. What Already Exists

### 1.1 UI Primitives (`apps/web/src/components/ui/`)

**30 components found.** Most are standard shadcn/ui New York style:

| Component | Status | Notes |
|-----------|--------|-------|
| button | **Used** | Brand tokens applied (bg-b-500, rounded-brand-sm) |
| input | **Used** | Has `tone` variant (light/dark), uses brand tokens |
| card | **Used** | Uses brand tokens, has `cardVariants` utility |
| badge | **Used** | 8 variants including semantic (success/warning/critical/info) |
| dialog | **Used** | Standard shadcn |
| tabs | **Used** | Standard shadcn |
| select | **Used** | Standard shadcn |
| checkbox | **Used** | Standard shadcn |
| label | **Used** | Standard shadcn |
| popover | **Used** | Standard shadcn |
| table | **Used** | Basic primitives; GridShell uses custom grid layout instead |
| sheet | **Used** | Standard shadcn |
| tooltip | **Used** | Standard shadcn |
| textarea | **Used** | Standard shadcn |
| alert-dialog | **Used** | Standard shadcn |
| dropdown-menu | **Used** | Standard shadcn |
| command | **Used** | For command palette patterns |
| accordion | Likely orphaned | No imports found in pages |
| collapsible | **Used** | Sidebar |
| progress | **Used** | Loading states |
| switch | **Used** | Toggle controls |
| skeleton | **Used** | Loading states |
| separator | **Used** | Visual dividers |
| scroll-area | **Used** | Overflow containers |
| sidebar | **Used** | Main navigation shell |
| alert | **Used** | Notifications |
| chart | **Used** | Recharts wrapper |
| searchable-select | **Used** | Custom combo box |
| empty-state | **Used** | No-data screens |
| coming-soon-banner | **Used** | Placeholder UI |

**Verdict:** Good foundation. No need to add more primitives.

---

### 1.2 Design Tokens

**Web tokens live in two files:**

1. **`tailwind.config.ts`** — Semantic color system + brand scales
   - Neutrals: `n-000` to `n-900` (11-step grayscale)
   - Brand blue: `b-050` to `b-800` (9-step blue scale)
   - Semantic: `brand-success`, `brand-warning`, `brand-critical`, `brand-info`
   - Status: `status-{success|warning|danger|info|purple}` with `bg` and `foreground` variants
   - Typography scale: `display`, `headline`, `h1-h3`, `body`, `small`, `label`, `data`
   - Font families: `font-display` (DM Sans), `font-sans` (Inter), `font-mono` (JetBrains Mono)
   - Shadows: `shadow-1/2/3`
   - Radii: `radius-sm/md/lg` plus shadcn `lg/md/sm`

2. **`globals.css`** — CSS variables for light/dark themes
   - Full light + dark mode support
   - Sidebar-specific tokens (always dark chrome)
   - Glassmorphism utilities
   - Transition durations

**Mobile tokens are separate:** `apps/mobile/constants/tokens.ts`
- Own color palette, radii, spacing, typography
- `useThemeColors()` hook for theme-aware colors
- Not synced with web tokens

**Inconsistencies found:**
- `load-status-badge.tsx` uses hardcoded colors: `bg-yellow-100 text-yellow-700`
- `expiry-status-badge.tsx` uses hardcoded colors: `bg-red-100 text-red-800`
- Some forms use `ring-offset-background` (old shadcn) vs `focus-visible:ring-b-500` (brand)

---

### 1.3 Forms

**Current pattern:**
- React 19 `useActionState` + native FormData + server actions
- Zod validation via `packages/validation/` (17+ schemas)
- No react-hook-form

**Form styling:**
- Each form defines local constants:
  ```tsx
  const inputClass = "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm..."
  const labelClass = "block text-sm font-medium text-foreground mb-1.5"
  ```
- Duplicated across: `truck-form.tsx`, `invoice-form.tsx`, `customer-form.tsx`, `payroll-form.tsx`, etc.

**What's missing:**
- No shared `FormField` component (label + input + error wrapper)
- No `FormSection` component (titled group with consistent spacing)
- No required indicator (`*`) convention
- Helper text styling is inconsistent

---

### 1.4 Tables & Data Grids

**Sophisticated DataGrid exists:** `apps/web/src/components/data-grid/`

| Feature | Status |
|---------|--------|
| Responsive (table → cards) | Yes, via `GridShell` |
| Sorting | Yes, TanStack Table |
| Pagination | Yes |
| Row selection | Yes |
| Quick actions per row | Yes |
| Bulk actions | Yes |
| Search | Yes |
| Column filtering | Partial (Text, Select, NumberRange, DateRange) |
| Saved views | Yes |
| Mobile card layout | Yes |
| Design doc | Yes (`DESIGN.md`) |

**What's missing for the brief:**
- Type-aware column filter (shape changes by data type)
- Wide search bar with inline "advanced filters" button
- Quick presets for date filters (Today, 7 days, 30 days, This year)
- Relation filter (searchable list for FK fields like driver)

---

### 1.5 Status Chips

**Two patterns coexist:**

1. **Good:** `StatusBadge` in data-grid
   - Uses CSS custom properties from `grid-tokens.css`
   - Tinted backgrounds, monospace font
   - 9 semantic variants

2. **Legacy:** One-off badges
   - `LoadStatusBadge` — hardcoded Tailwind colors
   - `ExpiryStatusBadge` — hardcoded Tailwind colors
   - Not using `StatusBadge` component

---

### 1.6 KPI Cards

**Web:** `KPIStrip` in carrier dashboard
- Inline implementation, not reusable
- No trend indicator
- Fetches data internally (not presentational)

**Mobile:** `KPICard` component
- Reusable, presentational
- Has trend support (up/down/neutral)
- Accent color strip

**Gap:** No shared KPI card primitive for web.

---

### 1.7 Web vs Mobile Sharing

| Artifact | Shared? |
|----------|---------|
| Types (`packages/types`) | Yes |
| Validation schemas (`packages/validation`) | Yes |
| Design tokens | No — separate systems |
| UI components | No — completely separate |

**Mobile uses:**
- NativeWind (Tailwind for RN)
- Own token file with `useThemeColors()` hook
- StyleSheet.create with inline styles

---

## 2. Gap Analysis (vs. Brief Requirements)

| Pattern | Status | Work Needed |
|---------|--------|-------------|
| **Form field** (label + input + error + helper) | Missing | Build `FormField` wrapper |
| **Form section** (titled group) | Missing | Build `FormSection` wrapper |
| **Status chip** | Exists | Consolidate — migrate legacy badges to `StatusBadge` |
| **Alert/compliance badge** | Partial | Extend `StatusBadge` with icon support or build `AlertBadge` |
| **KPI card** | Missing (web) | Build presentational `KPICard` |
| **Data table** | Exists | Already in DataGrid |
| **Type-aware column filter** | Partial | Extend filter system |
| **Search bar** (wide + filter button) | Missing | Build `SearchBar` component |
| **Detail/record layout** | Missing | Build `RecordLayout` with sections + rail |

---

## 3. Recommendations

### 3.1 Where Shared Pieces Should Live

**Web-only for now (`apps/web/src/components/design-system/`):**
- FormField, FormSection
- KPICard
- AlertBadge
- SearchBar
- RecordLayout

**Why not a shared package?**
1. Mobile uses completely different component APIs (React Native)
2. Mobile already has its own UI library in `apps/mobile/components/ui/`
3. Shared package would require abstraction layer (web: `className`, mobile: `style`)
4. Over-engineering risk is high; we'd be building for hypothetical reuse

**Token sharing (pragmatic approach):**
- Keep `tailwind.config.ts` as source of truth for web
- Mobile can read the same CSS variable names via NativeWind dark class
- No need for a shared tokens package yet

### 3.2 Consolidation Work

1. **Migrate legacy status badges to `StatusBadge`**
   - `LoadStatusBadge` → use `StatusBadge` with `getStatusVariant()`
   - `ExpiryStatusBadge` → use `StatusBadge` with urgency variant

2. **Kill duplicated form styling**
   - Replace inline `inputClass`/`labelClass` with `FormField` component

3. **Document tokens**
   - Create `DESIGN_SYSTEM.md` listing all tokens and rules

---

## 4. Proposed Build Order (Pass 2)

### Phase A: Consolidate & Document

| Step | Deliverable |
|------|-------------|
| A1 | `FormField` — label + input/select/textarea + error + helper |
| A2 | `FormSection` — titled group with spacing |
| A3 | Migrate `LoadStatusBadge` and `ExpiryStatusBadge` to use `StatusBadge` |
| A4 | `AlertBadge` — icon + text, semantic variants |
| A5 | `KPICard` — number, label, icon, optional trend |
| A6 | `SearchBar` — wide input with inline filter button |
| A7 | `RecordLayout` — sections + right rail |
| A8 | Write `DESIGN_SYSTEM.md` reference doc |

### Phase B: Rebuild Trucks Pages

| Step | Deliverable |
|------|-------------|
| B1 | Trucks overview — KPI cards, tabbed counts, SearchBar, DataGrid with type-aware filters |
| B2 | Truck quick-create — FormField/FormSection, VIN lookup, completeness indicator |
| B3 | Truck view/edit — single component, two routes, RecordLayout, unsaved-changes guard |

---

## 5. Open Questions

1. **VIN lookup service** — Does an API exist, or should we stub it?
2. **Completeness indicator** — Progress bar vs. checklist vs. subtle percentage?
3. **Right rail content** — What goes in the truck detail rail? (Compliance health, driver assignment, next service due?)

---

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Building parallel design system | New components go in `design-system/` folder, not `ui/` |
| Over-abstracting forms | FormField wraps existing Input/Select; doesn't replace them |
| Breaking existing pages | Incremental migration; legacy badges still work during transition |
| Mobile drift | Document that web system is authoritative; mobile aligns when practical |

---

**Next step:** Review this proposal. If approved, I'll proceed with Pass 2 (build the consolidated design system, then rebuild Trucks pages).
