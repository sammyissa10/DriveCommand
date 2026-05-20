# DataGrid Design System

**Last updated:** 2026-05-20
**Status:** v2.0 — Vercel/Apple Crisp-Minimal Aesthetic

This document defines the visual design language for the DataGrid component system.

---

## Design Philosophy

The DataGrid follows a **Vercel/Apple crisp-minimal aesthetic**:

- Near-monochrome with single refined blue accent
- Ultra-minimal borders and visual noise
- Generous whitespace and breathing room
- Refined typography with consistent weights
- Subtle motion that respects user preferences
- Mobile-first responsive design

---

## Color Usage

### Monochrome Foundation

- **Background**: `hsl(var(--background))` — canvas
- **Foreground**: `hsl(var(--foreground))` — primary text
- **Muted**: `hsl(var(--muted))` / `hsl(var(--muted-foreground))` — secondary elements
- **Border**: `hsl(var(--border))` at 40% opacity for separators

### Blue Accent

- **Primary**: `var(--color-b-500)` (#0066CC) — focused states, primary actions
- **Subtle**: `var(--color-b-050)` — selected row backgrounds

### Semantic Colors

Status badges use **tinted backgrounds** (NEVER solid fills):

- **Success**: `bg-status-success-bg` + `text-status-success-foreground`
- **Warning**: `bg-status-warning-bg` + `text-status-warning-foreground`
- **Danger**: `bg-status-danger-bg` + `text-status-danger-foreground`
- **Info**: `bg-status-info-bg` + `text-status-info-foreground`
- **Purple**: `bg-status-purple-bg` + `text-status-purple-foreground`
- **Neutral**: `bg-muted` + `text-muted-foreground`

All semantic colors are at **≤60% saturation** for visual restraint.

---

## Typography

### Font Family

- **Primary**: Inter (system font via `var(--font-inter)`)
- **Monospace**: JetBrains Mono (for code/data)

### Font Weights

**ONLY Inter 400 (normal) and 500 (medium) are permitted.**

- **NO** font-semibold (600)
- **NO** font-bold (700)

### Type Scale

| Element | Size | Weight | Line Height | Transform |
|---------|------|--------|-------------|-----------|
| Header text | text-xs (12px) | font-medium (500) | 16px | uppercase tracking-wider |
| Body text | text-sm (14px) | font-normal (400) | 20px | none |
| Metadata | text-xs (12px) | font-normal (400) | 16px | none |

### Examples

```tsx
// Header
<span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
  Column Name
</span>

// Body
<span className="text-sm text-foreground">
  Cell value
</span>

// Metadata
<span className="text-xs text-muted-foreground">
  Label
</span>
```

---

## Borders

### Ultra-Minimal Border Rules

1. **ZERO vertical cell borders** — columns are separated by whitespace only
2. **ZERO alternating row backgrounds** — no zebra striping
3. **Horizontal separators**: `border-b border-border/40` (40% opacity)
4. **Container border**: `border border-border rounded-lg`

### Border Opacity

- **40% opacity** (`/40`) for all internal horizontal separators
- **100% opacity** for outer container border

---

## Row Height

**Fixed 48px row height** — no density toggle.

- **Header height**: 40px (`--grid-header-height`)
- **Row height**: 48px (`--grid-row-height`)
- **Footer height**: 48px

This ensures consistent vertical rhythm and touch-friendly targets on mobile.

---

## Icons

All Lucide icons **MUST** use `strokeWidth={1.5}`:

```tsx
<ChevronDown className="h-4 w-4" strokeWidth={1.5} />
```

**NEVER** use the default `strokeWidth={2}` — it's too heavy for the crisp-minimal aesthetic.

### Icon Sizes

- **Small**: `h-3.5 w-3.5` — sort indicators
- **Standard**: `h-4 w-4` — buttons, inline icons
- **Large**: `h-5 w-5` — FAB, empty states
- **Extra Large**: `h-6 w-6` — mobile FAB only

---

## Badges (StatusBadge)

**The tinted-background pattern is mandatory:**

```tsx
<StatusBadge variant="success">Active</StatusBadge>
// Renders: bg-status-success-bg text-status-success-foreground
```

### Badge Styling

- **Background**: Tinted at ~10-20% color strength
- **Text**: Full-strength color (high contrast)
- **Shape**: `rounded-md` pill
- **Spacing**: `px-2 py-0.5`
- **Typography**: `text-xs font-medium`

**NEVER** use solid fill badges (`bg-green-500 text-white`) — they're too loud.

---

## Responsive Breakpoints

**Single breakpoint at 768px:**

- **Mobile**: `< 768px` — card layout
- **Desktop**: `>= 768px` — table layout

```tsx
const { isMobile, isDesktop } = useBreakpoint();
```

### Layout Switching

| Breakpoint | Layout | Components |
|------------|--------|------------|
| < 768px | Cards | GridCardList + MobileFAB + MobileToolbar + MobileActionSheet |
| >= 768px | Table | GridHeader + GridBody + GridFooter |

---

## Motion & Animations

All animations **MUST** respect `prefers-reduced-motion`:

```tsx
className="motion-safe:transition-opacity motion-safe:duration-150"
```

### Transition Durations

- **Fast** (150ms): Micro-interactions (hover, focus)
- **Base** (200ms): State changes (selection, open/close)

### Animation Patterns

```tsx
// Fade in
className="motion-safe:animate-pulse"

// Slide in (desktop BulkActionsBar)
className="motion-safe:transition-all motion-safe:duration-200"

// Scale on press (mobile FAB)
className="motion-safe:transition-transform motion-safe:duration-150 active:scale-95"
```

---

## Component Hierarchy

```
GridShell (Main Container)
├── GridToolbar (Responsive)
│   ├── Desktop: Search + Filter + Columns + Export + New
│   └── Mobile: MobileToolbar
├── BulkActionsBar (Conditional, when selectedCount > 0)
│   ├── Desktop: Below toolbar
│   └── Mobile: Fixed bottom
├── Desktop View (>= 768px)
│   ├── GridHeader
│   ├── GridBody (Virtualized)
│   │   ├── GridRow[]
│   │   │   └── GridCell[]
│   │   ├── EmptyState
│   │   ├── LoadingSkeleton
│   │   └── ErrorState
│   └── GridFooter
└── Mobile View (< 768px)
    ├── GridCardList (Virtualized)
    │   └── GridCard[]
    └── MobileFAB (when showNew && selectedCount === 0)
```

---

## Accessibility

### ARIA Attributes

- **role="grid"** on GridShell container
- **role="row"** on GridRow
- **role="cell"** on GridCell
- **role="columnheader"** on GridHeader cells
- **role="toolbar"** on BulkActionsBar
- **aria-selected** on selected rows
- **aria-rowindex** on each row
- **aria-label** on icon-only buttons

### Keyboard Navigation

| Key | Action |
|-----|--------|
| Arrow keys | Navigate cells (desktop) |
| Space | Toggle row selection |
| Enter | Open row detail |
| Escape | Clear selection |
| Tab | Focus next interactive element |

### Focus States

All interactive elements have visible focus rings:

```tsx
className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
```

---

## Design Tokens

All design tokens live in `tokens/grid-tokens.css`:

```css
:root {
  /* Dimensions */
  --grid-row-height: 48px;
  --grid-header-height: 40px;
  --grid-cell-padding-x: 16px;
  --grid-cell-padding-y: 12px;

  /* Borders */
  --grid-border-opacity: 0.4;

  /* Colors */
  --grid-accent: var(--color-b-500);
  --grid-accent-subtle: var(--color-b-050);

  /* Transitions */
  --grid-transition-fast: 150ms;
  --grid-transition-base: 200ms;
}
```

---

## Mobile Patterns

### Touch Targets

Minimum 48px height for all interactive elements on mobile.

### Gestures

- **Long-press** (500ms): Enter multi-select mode
- **Swipe left/right**: Reveal actions (optional)
- **Tap**: Open detail view
- **Pull-to-refresh**: Reload data (optional)

### Mobile-Specific Components

| Component | Purpose |
|-----------|---------|
| GridCard | Card representation of table row |
| GridCardList | Virtualized card container |
| MobileToolbar | Compact search + action buttons |
| MobileFAB | Floating action button (create new) |
| MobileActionSheet | Bottom sheet for filters/sort/columns |

---

## Do's and Don'ts

### Do ✅

- Use Inter 400/500 only
- Use Lucide icons with `strokeWidth={1.5}`
- Use StatusBadge with tinted backgrounds
- Use 48px fixed row height
- Respect `prefers-reduced-motion`
- Provide ARIA labels on icon-only buttons
- Use 40% opacity for horizontal separators

### Don't ❌

- Don't use Inter 600/700 (semibold/bold)
- Don't use default Lucide strokeWidth (2)
- Don't use solid fill badges
- Don't add vertical cell borders
- Don't add zebra striping
- Don't add density toggle
- Don't ignore keyboard navigation
- Don't forget mobile card layout below 768px

---

## Version History

- **v2.0** (2026-05-20): Complete rebuild with Vercel/Apple aesthetic, responsive shell
- **v1.0** (2026-05-19): Initial DataGrid with filters, saved views, inline edit, CSV export

