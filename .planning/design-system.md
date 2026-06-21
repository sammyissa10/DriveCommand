<!-- Canonical design system reference for DriveCommand -->
<!-- Source: apps/web/DESIGN_SYSTEM.md -->

# DriveCommand Design System

**Version:** 1.0
**Last Updated:** 2026-06-21

This document defines the reusable components and design rules for the DriveCommand web application.

---

## Quick Reference

| Component | Purpose | Import |
|-----------|---------|--------|
| `FormField` | Label + input + error + helper wrapper | `@/components/design-system` |
| `FormSection` | Titled group of form fields | `@/components/design-system` |
| `FormRow` | Horizontal layout for multiple fields | `@/components/design-system` |
| `StatusBadge` | Colored status pill (Active, Pending, etc.) | `@/components/design-system` |
| `AlertBadge` | Icon + text compliance/alert indicator | `@/components/design-system` |
| `KPICard` | Metric card with number, label, icon, trend | `@/components/design-system` |
| `KPICardGrid` | Responsive grid for KPI cards | `@/components/design-system` |
| `SearchBar` | Wide search with inline filter button | `@/components/design-system` |
| `ActiveFilters` | Filter pills with remove/clear all | `@/components/design-system` |
| `RecordLayout` | Detail page with sections + rail | `@/components/design-system` |
| `RecordSection` | Titled section in detail page | `@/components/design-system` |
| `RecordField` | Single field display (label + value) | `@/components/design-system` |
| `RecordHeader` | Page header with title, subtitle, actions | `@/components/design-system` |

---

## Design Rules

### 1. Forms

- **Labels always above inputs.** Never use placeholder as the only label.
- **Required fields marked with `*`** (red asterisk after label).
- **Helper text in muted color** below the field.
- **Error text in red** below the field (replaces helper when present).
- **Use `FormField` wrapper** for consistent spacing and error handling.

```tsx
<FormField label="Email" name="email" required error={errors.email} helperText="We'll send confirmations here">
  <Input name="email" type="email" />
</FormField>
```

### 2. Colors

- **Red is only for errors and destructive actions.** Never decorative.
- **Status colors use tinted backgrounds** (10-20% opacity) with full-strength text.
- **Never use hardcoded Tailwind colors** like `bg-red-100`. Use semantic tokens:
  - `bg-status-danger-bg text-status-danger-foreground`
  - `bg-status-warning-bg text-status-warning-foreground`
  - `bg-status-success-bg text-status-success-foreground`

### 3. Status & Alerts

- **Color must always pair with icon or text** for accessibility.
- **Use `StatusBadge`** for record states (Active, Pending, Delivered).
- **Use `AlertBadge`** for compliance warnings (includes icon automatically).

```tsx
// Status (no icon needed - text conveys meaning)
<StatusBadge variant="success">Active</StatusBadge>

// Alert (icon included - for urgency indicators)
<AlertBadge variant="warning">Insurance expires in 3 days</AlertBadge>
```

### 4. Typography

- **Headings:** DM Sans (font-display)
- **Body text:** Inter (font-sans)
- **Data/monospace:** JetBrains Mono (font-mono)

Use the typography scale from `tailwind.config.ts`:

| Token | Size | Use for |
|-------|------|---------|
| `text-h1` | 32px | Page titles |
| `text-h2` | 24px | Section headers |
| `text-h3` | 18px | Card titles |
| `text-body` | 16px | Body text |
| `text-small` | 13px | Secondary text |
| `text-label` | 12px | Form labels, metadata |
| `text-data` | 14px | Table data |

### 5. Text Overflow

- **Text must never overflow or clip.** Long values must:
  - Truncate with ellipsis (`truncate` class), OR
  - Wrap gracefully (`break-words` class)
- **Choose based on context:**
  - Tables: truncate (hover to see full value)
  - Forms: wrap
  - Headings: truncate

### 6. Spacing & Radius

Use tokens from the scale, not arbitrary numbers:

**Spacing (padding, margin, gap):**
- `gap-1` (4px), `gap-2` (8px), `gap-4` (16px), `gap-6` (24px)

**Border radius:**
- `rounded-brand-sm` (6px) — buttons, inputs, pills
- `rounded-brand-md` (10px) — cards, modals
- `rounded-brand-lg` (14px) — hero panels

### 7. Touch Targets

- **Minimum 44px** on mobile for all interactive elements.
- Use `h-11` (44px) for button/input heights.

### 8. Shadows

Use semantic shadow tokens:
- `shadow-1` — subtle elevation (cards)
- `shadow-2` — medium elevation (dropdowns)
- `shadow-3` — high elevation (modals)

---

## Component Usage

### FormField

Wraps any input element with label, error, and helper text.

```tsx
import { FormField } from '@/components/design-system';
import { Input } from '@/components/ui/input';

<FormField
  label="VIN"
  name="vin"
  required
  error={errors.vin}
  helperText="17 characters, no I, O, or Q"
>
  <Input name="vin" maxLength={17} className="uppercase font-mono" />
</FormField>
```

### FormSection

Groups related fields with a title.

```tsx
import { FormSection, FormRow, FormField } from '@/components/design-system';

<FormSection title="Vehicle Information">
  <FormRow>
    <FormField label="Make" name="make" required>
      <Input name="make" />
    </FormField>
    <FormField label="Model" name="model" required>
      <Input name="model" />
    </FormField>
  </FormRow>
</FormSection>

<FormSection title="Documents" divider>
  {/* divider adds top border */}
</FormSection>
```

### StatusBadge

For record status indicators.

```tsx
import { StatusBadge, getStatusVariant } from '@/components/design-system';

// Direct variant
<StatusBadge variant="success">Active</StatusBadge>
<StatusBadge variant="warning">Pending</StatusBadge>
<StatusBadge variant="danger">Expired</StatusBadge>

// From API status string
const variant = getStatusVariant(load.status); // "DELIVERED" → "delivered"
<StatusBadge variant={variant}>{load.status}</StatusBadge>
```

### AlertBadge

For compliance warnings (always includes icon).

```tsx
import { AlertBadge, getExpiryVariant, formatExpiryMessage } from '@/components/design-system';

// Manual
<AlertBadge variant="warning">Insurance expires in 3 days</AlertBadge>
<AlertBadge variant="danger">Registration expired</AlertBadge>

// From expiry date
const days = differenceInDays(expiryDate, now);
<AlertBadge variant={getExpiryVariant(days)}>
  {formatExpiryMessage(days)}
</AlertBadge>
```

### KPICard

Presentational metric card.

```tsx
import { KPICard, KPICardGrid } from '@/components/design-system';
import { Package, DollarSign } from 'lucide-react';

<KPICardGrid>
  <KPICard
    label="Loads This Week"
    value={42}
    icon={Package}
    trend={{ direction: 'up', label: '+12%' }}
  />
  <KPICard
    label="Revenue"
    value="$125K"
    icon={DollarSign}
    onClick={() => router.push('/reports/revenue')}
  />
</KPICardGrid>
```

### SearchBar

Wide search with filter button.

```tsx
import { SearchBar, ActiveFilters } from '@/components/design-system';

<SearchBar
  value={search}
  onChange={setSearch}
  placeholder="Search trucks..."
  onFilterClick={() => setFilterPanelOpen(true)}
  filterCount={activeFilters.length}
/>

<ActiveFilters
  filters={[
    { id: 'status', label: 'Status: Active' },
    { id: 'type', label: 'Type: Semi' },
  ]}
  onRemove={(id) => removeFilter(id)}
  onClearAll={() => clearFilters()}
/>
```

### RecordLayout

Detail page with sections and rail.

```tsx
import {
  RecordLayout,
  RecordHeader,
  RecordSection,
  RecordField,
  RecordFieldGrid,
} from '@/components/design-system';

<RecordHeader
  title={truck.unitNumber}
  subtitle={truck.vin}
  badge={<StatusBadge variant="success">Active</StatusBadge>}
  actions={<Button onClick={() => setEditMode(true)}>Edit</Button>}
/>

<RecordLayout
  rail={<ComplianceSummary truck={truck} />}
  railTitle="Compliance"
>
  <RecordSection title="Vehicle Information">
    <RecordFieldGrid>
      <RecordField label="Make" value={truck.make} />
      <RecordField label="Model" value={truck.model} />
      <RecordField label="Year" value={truck.year} />
      <RecordField label="VIN" value={truck.vin} mono />
    </RecordFieldGrid>
  </RecordSection>
</RecordLayout>
```

---

## Migration Guide

### Replacing legacy form patterns

Before:
```tsx
const inputClass = "w-full rounded-lg border...";
const labelClass = "block text-sm font-medium...";

<div>
  <label className={labelClass}>Email</label>
  <input className={inputClass} />
  {error && <p className="text-red-600">{error}</p>}
</div>
```

After:
```tsx
import { FormField } from '@/components/design-system';

<FormField label="Email" name="email" error={error}>
  <Input name="email" />
</FormField>
```

### Replacing legacy status badges

Before:
```tsx
<span className="bg-yellow-100 text-yellow-700 ...">Pending</span>
```

After:
```tsx
import { StatusBadge } from '@/components/design-system';

<StatusBadge variant="warning">Pending</StatusBadge>
```

---

## File Locations

| Path | Contents |
|------|----------|
| `src/components/design-system/` | All design system components |
| `src/components/ui/` | shadcn/ui primitives (Button, Input, etc.) |
| `src/components/data-grid/` | DataGrid system with StatusBadge |
| `tailwind.config.ts` | Design tokens (colors, typography, spacing) |
| `src/app/globals.css` | CSS variables for light/dark themes |

---

## Checklist for New Pages

- [ ] Using `FormField` for all form inputs (not raw label/input)
- [ ] Using `FormSection` for grouped fields
- [ ] Using `StatusBadge` for record states (not hardcoded colors)
- [ ] Using `AlertBadge` for compliance warnings
- [ ] Text truncates or wraps properly (no overflow)
- [ ] Touch targets are 44px+ on mobile
- [ ] Red is only used for errors/destructive actions
- [ ] All status indicators have icon or text (not color alone)
