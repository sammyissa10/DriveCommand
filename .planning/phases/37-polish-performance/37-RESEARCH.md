# Phase 37: Polish + Performance (Plans 04+) - Research

**Researched:** 2026-03-27
**Domain:** React Native / NativeWind v4 migration, form validation patterns, accessibility props, skeleton loaders
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Plans 01–03 (already shipped — preserved for reference)
- Touch targets: minimum 48×48pt enforced across all interactive elements
- FlashList: every FlatList/ScrollView-with-list replaced
- Skeleton loaders: shimmer animation (Reanimated, 800ms cycle, 0.3→1→0.3 opacity) on all driver portal screens
- Animations: FadeIn on screen mount, spring BottomSheet, no animation on tab switch
- Haptics: Light on tab press, Success/Error on form submit, Medium on status update, Warning on destructive action, Light on pull-to-refresh
- Dark mode: dark-first default, NativeWind dark: variants, system light mode supported
- Android: ripple on all Pressables; iOS: safe area verified

#### Design standardization (Plans 04+)
- NativeWind everywhere — full migration from inline StyleSheet across all screens
- Typography: Tailwind utilities only (text-sm, text-base, font-semibold, text-slate-900, etc.) — no hardcoded fontSize/fontWeight
- Spacing: Claude's discretion — pick a consistent scale (standard screen padding, card gap, section spacing) and apply everywhere
- Loading states: skeletons everywhere — no ActivityIndicator spinners on any data-fetching screen; every screen gets a content-shaped skeleton

#### Form validation & errors
- Validation triggers on submit only (not real-time, not on blur)
- Inline field errors: red text below the field (text-red-500) + field border turns red
- Coverage: all forms — Create Load, Create Incident, HOS Status Update, Login, Fleet Message, Add Document
- API error handling: toast notification + keep form open and populated so user can fix and retry

#### Accessibility
- Scope: basics only — accessibilityLabel + accessibilityRole on interactive elements
- All icon-only buttons get descriptive accessibilityLabel (FAB → "Add document", back → "Go back", filter → "Filter loads", etc.)
- Data elements get meaningful labels: KPI cards, status chips, stat displays read as full context (e.g., "12 active loads this month" not just "12")
- No full VoiceOver/TalkBack audit required — just label coverage pass

### Claude's Discretion
- Exact Tailwind spacing scale values (screen padding, card gap, section spacing)
- Which screens still need skeleton variants built (audit the remaining owner portal screens)
- accessibilityHint usage where helpful but not required
- Order of screen migrations within each plan

### Deferred Ideas (OUT OF SCOPE)
- Stub screens (Live Map, AI Documents, Incident Detail) — out of scope
- Full VoiceOver/TalkBack testing and focus-order audit — future accessibility phase
- Custom fonts beyond Poppins headings — future polish
- Micro-animations on data points — future polish
- Gesture-based navigation (swipe back on Android) — already handled
</user_constraints>

---

## Summary

Plans 04+ cover three distinct workstreams across the owner portal and shared screens: (1) NativeWind migration from inline `StyleSheet` and inline `style={}` props to `className`, (2) skeleton loaders replacing every `ActivityIndicator` used as a full-screen loading state, and (3) accessibility label coverage on all interactive and data-display elements. Form validation is already largely implemented in the critical forms (`CreateLoadSheet`, `NewIncidentScreen`) but the `Login` screen still uses `StyleSheet` throughout and needs migration.

The codebase audit reveals the split clearly: the **driver portal** is mostly NativeWind-first already (all screens use `className` except `_layout.tsx` badge overlays and the GPS/Notification modals). The **owner portal** secondary screens (`compliance.tsx`, `crm.tsx`, `trucks.tsx`, `invoices/index.tsx`, `payroll.tsx`, `more/index.tsx`) all use heavy inline `style={}` props with hardcoded colors and dimensions. These are the migration targets. The `login.tsx` screen is the only shared screen still fully on `StyleSheet`.

The shimmer Skeleton primitive and multiple skeleton components already exist and are consistent. The missing skeletons are for the "More" section owner portal screens — compliance, CRM, invoices, payroll, trucks — all of which currently show `ActivityIndicator` spinners as full-page loading states. The `DriverCardSkeleton` and `LoadCardSkeleton` patterns are solid reference implementations.

**Primary recommendation:** Split Plans 04+ into three focused plans: (04) NativeWind migration of owner portal secondary screens + login; (05) skeleton loaders for all remaining spinner-guarded screens; (06) accessibility label pass across both portals.

---

## Standard Stack

### Core (already installed — no new packages needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| nativewind | ^4.2.3 | Tailwind className on RN components | Established in Plans 01-03 |
| tailwindcss | ^3.4.19 | CSS utilities, configured in tailwind.config.js | Powers NativeWind |
| react-native-reanimated | 4.2.1 | Skeleton shimmer animation | Already used by Skeleton component |
| react-native-toast-message | ^2.3.3 | API error toast notifications | Already used in CreateLoadSheet, incidents |

### No New Packages

All required tooling is installed. Plans 04+ are pure code migration — no `npm install` required.

---

## Architecture Patterns

### Recommended Spacing Scale (Claude's Discretion)

Based on audit of the existing owner dashboard (already migrated and working well), adopt this consistent scale:

| Token | Value | Use |
|-------|-------|-----|
| `px-4` | 16px | Standard screen horizontal padding |
| `py-4` | 16px | Standard screen vertical start padding |
| `pb-8` | 32px | Screen bottom padding (above tab bar) |
| `mb-3` | 12px | Gap between list cards |
| `p-4` | 16px | Card internal padding |
| `gap-2` | 8px | Inline row gap (icon + text) |
| `gap-3` | 12px | Section gap within cards |
| `mb-5` | 20px | Section-to-section gap on screen |
| `rounded-xl` | 12px | Card border radius |
| `rounded-lg` | 8px | Button/input border radius |

This matches what the dashboard (`(owner)/index.tsx`) already uses successfully.

### Pattern 1: NativeWind Card Row Migration

**What:** Replace inline `style={{}}` object props on card/row components with `className` equivalents.
**When to use:** Any component using `style={{ marginHorizontal: 16, backgroundColor: '#1e293b', ... }}`

The current pattern in owner portal secondary screens:
```typescript
// BEFORE — inline style object (trucks.tsx, crm.tsx, payroll.tsx, compliance.tsx, invoices/index.tsx)
<View
  style={{
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#1e293b',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
  }}
>
```

The NativeWind equivalent:
```typescript
// AFTER — className
<View className="mx-4 mb-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3.5 flex-row items-center">
```

Color mapping for this codebase:
- `#1e293b` → `bg-slate-800` (card surface)
- `#0f172a` → `bg-slate-900` (screen background)
- `#334155` → `border-slate-700` (card border)
- `#f1f5f9` → `text-slate-100` (primary text)
- `#94a3b8` → `text-slate-400` (secondary text)
- `#64748b` → `text-slate-500` (muted text / placeholder)

### Pattern 2: StyleSheet.absoluteFillObject Replacement

**What:** `StyleSheet.absoluteFillObject` expands to `{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }`. In NativeWind, replace with `className="absolute inset-0"`.

```typescript
// BEFORE — login.tsx overlay
const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
})
<View style={styles.overlay} />

// AFTER — NativeWind
<View className="absolute inset-0 bg-black/40" />
```

Source: Tailwind CSS `inset-0` utility sets top/right/bottom/left to 0. Verified via [Tailwind docs](https://tailwindcss.com/docs/top-right-bottom-left) and NativeWind's support for positional utilities.

### Pattern 3: Dynamic Color Values (Where className Is Not Enough)

**What:** Some owner portal screens use computed dynamic colors — e.g., `borderColor: isVIP ? '#f59e0b40' : '#334155'` or `backgroundColor: colors.bg` from a `STATUS_COLORS` lookup. These cannot always be expressed as static className strings because the color values include opacity suffixes not in Tailwind (`#f59e0b40`).

**Rule:** Use `style={}` prop ONLY for truly dynamic values that cannot be expressed as Tailwind classes. Keep everything else in `className`.

```typescript
// Correct: mixed className + style for dynamic color only
<View
  className="mx-4 mb-3 rounded-xl border px-4 py-3.5 flex-row items-center"
  style={{ borderColor: isVIP ? '#f59e0b40' : '#334155' }}
>
```

NativeWind v4 merges `className` and `style` props — inline `style` takes precedence for duplicate properties. This is the supported approach for dynamic values. (Note: NativeWind v5 broke this merge behavior, but we are on v4.2.3.)

**Verified:** NativeWind v4 docs and GitHub issues confirm className + style merging works in v4.

### Pattern 4: StyleSheet Legitimacy — When NOT to Migrate

Some StyleSheet usages are legitimate and should remain:

1. **Tab bar badge overlays** (`app/(driver)/_layout.tsx`): The GPS status dot and unread badge use `position: 'absolute'` with `top: -4, right: -8` — pixel values that have no Tailwind equivalent. Keep as StyleSheet. The migration goal is not "zero StyleSheet", it is "no StyleSheet for standard card/text/spacing styling".

2. **Modal overlay components** (`GPSPermissionModal.tsx`, `NotificationPermissionModal.tsx`): These use `StyleSheet` but are not data-fetching screens — no spinner-to-skeleton conversion needed. Migrate the styling to className but these modals don't need new skeleton components.

3. **`login.tsx` ImageBackground**: The `ImageBackground` with `StyleSheet.absoluteFillObject` overlay is the primary migration target (replace overlay with `absolute inset-0`), but the `ImageBackground` itself needs its `style={styles.bg}` kept as `style={{ flex: 1 }}` since `className="flex-1"` on `ImageBackground` requires verifying it goes through NativeWind's cssInterop.

### Pattern 5: Skeleton Component — Established Pattern

The existing `Skeleton` primitive (`components/ui/Skeleton.tsx`) uses Reanimated `withRepeat/withTiming` at 800ms, opacity 0.3→0.8 (matches the spec of 0.3→1→0.3 via `true` reverse). The color `#334155` (slate-700) matches the app's card border color.

Established skeleton files to use as reference:
- `DashboardSkeleton.tsx` — 2x2 KPI grid pattern
- `LoadCardSkeleton.tsx` — card with horizontal layout
- `DriverCardSkeleton.tsx` — avatar + text lines pattern
- `MessageSkeleton.tsx` — chat bubble rows

New skeleton files needed (all in `components/skeletons/`):
- `InvoiceRowSkeleton.tsx` — mimics invoice row: left text block + right amount + status dot
- `TruckCardSkeleton.tsx` — mimics truck card: icon square + text lines + status chip
- `ComplianceRowSkeleton.tsx` — mimics compliance alert: indicator dot + text lines + days chip
- `PayrollRowSkeleton.tsx` — mimics payroll row: avatar circle + text lines + amount
- `CRMCardSkeleton.tsx` — mimics customer card: avatar square + text lines + status chips
- `LoadDetailSkeleton.tsx` — mimics the owner load detail view: header section + info grid + stops timeline

### Pattern 6: Form Validation — Already Established, Apply Consistently

The `CreateLoadSheet` is the gold standard implementation. It already has:
- Submit-only validation via `validate()` callback
- `errors` state as `Partial<Record<keyof FormState, string>>`
- Border turns red: `errors.field ? 'border-red-500' : 'border-slate-600'`
- Error text: `{errors.field && <Text className="text-red-400 text-xs mt-1">{errors.field}</Text>}`
- On field change, clear that field's error: `setErrors(prev => ({ ...prev, [key]: undefined }))`
- API errors: `Toast.show({ type: 'error', ... })` and form stays open

Forms that still need this pattern applied:
- **Login** (`login.tsx`): Has basic validation but uses `StyleSheet`-based `errorBox` view — migrate to NativeWind + standardize error display
- **Create Incident** (`incidents/new.tsx`): Has `errors` state and validation — audit completeness, ensure all fields covered
- **HOS Status Update** (`hos.tsx`): Uses a modal with `TextInput` for notes — check if notes field has validation
- **Fleet Message / Send** (`more/fleet.tsx`): Has a send input — ensure empty message is validated before submit
- **Document Upload** (`components/driver/DocumentUploadSheet.tsx`): Has a file picker flow — ensure document type selection is validated

### Pattern 7: Accessibility Props

React Native accessibility uses three props for interactive elements:
- `accessibilityLabel`: String read by screen reader instead of children
- `accessibilityRole`: Semantic role — `"button"`, `"header"`, `"image"`, `"text"`
- `accessibilityHint`: (optional) Describes what happens when activated

**Rules for this codebase:**

Icon-only buttons (FABs, back buttons, filter icons):
```typescript
<Pressable
  accessibilityLabel="Add load"
  accessibilityRole="button"
  onPress={...}
>
  <Plus color="white" size={26} />
</Pressable>
```

KPI cards (data display, not interactive):
```typescript
<View
  accessibilityLabel="12 active loads this month"
  accessibilityRole="text"
>
  <Text>12</Text>
  <Text>Active Loads</Text>
</View>
```

KPI cards that ARE pressable (navigate somewhere):
```typescript
<Pressable
  accessibilityLabel="Active Loads: 12. Tap to view loads."
  accessibilityRole="button"
>
```

Status chips (non-interactive display):
```typescript
<View accessibilityLabel="Status: En Route" accessibilityRole="text">
  <Badge label="En Route" variant="warning" />
</View>
```

Source: [React Native Accessibility docs](https://reactnative.dev/docs/accessibility) — HIGH confidence.

**Do NOT add accessibilityLabel to:**
- Text components that already have readable text as children (screen reader reads them automatically)
- Containers that wrap labeled children
- Decorative separators / dividers

**Inventory of icon-only buttons needing labels** (from codebase audit):

| Location | Element | Label |
|----------|---------|-------|
| All owner screens | Back chevron button | "Go back" |
| `(owner)/index.tsx` FAB | Plus icon | "Create load" |
| `(owner)/loads/index.tsx` FAB | Plus icon | "Create load" |
| `(driver)/documents.tsx` FAB | Plus icon | "Add document" |
| `(driver)/incidents/index.tsx` FAB | Plus icon | "Report incident" |
| `(owner)/loads/index.tsx` tab pills | All/Active/Pending/Delivered | Already have text labels — no label needed |
| `(driver)/loads/index.tsx` toggle | Active/History | Already have text — no label needed |
| `(owner)/more/fleet.tsx` send button | Send icon | "Send message" |
| `(driver)/hos.tsx` status buttons | Status option tiles | Already have text |
| KPI cards (owner dashboard) | 4 KPI cards | Composite labels (see Pattern 7) |
| AppHeader avatar | Back/profile avatar | "Open profile" |

### Anti-Patterns to Avoid

- **Migrating tab bar badge overlays to NativeWind:** The GPS dot and unread badge use sub-pixel positioning (`top: -4, right: -8`) with no Tailwind equivalent. Leave as StyleSheet.
- **Removing `style` prop entirely when dynamic colors exist:** Some screens use `statusColor + '22'` (hex opacity suffix) or computed background colors from a lookup object. These cannot be Tailwind classes. Use `style={{ backgroundColor: colors.bg }}` alongside `className` for the rest.
- **Adding `accessibilityLabel` to every View:** Only interactive elements and data-display elements without readable text children need labels.
- **Replacing submit button `ActivityIndicator` with a skeleton:** Submit buttons show `ActivityIndicator` inside the button while the mutation is pending — this is correct behavior, not a loading state to replace. Only replace full-screen/full-section `ActivityIndicator` spinners.
- **Using `className` on `ImageBackground` without verifying cssInterop:** `ImageBackground` is not a standard RN View. Test that NativeWind applies `flex-1` correctly, or keep `style={{ flex: 1 }}` as fallback.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Skeleton shimmer animation | Custom Animated API | `Skeleton` from `components/ui/Skeleton` | Already built, uses Reanimated correctly |
| Toast notifications for API errors | Custom alert modal | `react-native-toast-message` `Toast.show()` | Already installed, used in CreateLoadSheet |
| Form error state | Complex validation library | Manual `errors` state + `validate()` function | Pattern established and consistent across forms |
| Dynamic dark-mode colors | Runtime color switching | NativeWind `dark:` variants | Already configured in NativeWind preset |

**Key insight:** This phase is migration work, not new feature work. The primitives all exist. The job is applying established patterns to screens that were built before the patterns were standardized.

---

## Common Pitfalls

### Pitfall 1: Migrating StyleSheet That Serves a Legitimate Purpose

**What goes wrong:** Migrating `position: 'absolute', top: -4, right: -8` to `className` — there are no Tailwind utilities for `-4` and `-8` in the current tailwind config. The driver layout `styles.gpsDot` and `styles.unreadBadge` need these exact pixel values.
**Why it happens:** "NativeWind everywhere" is interpreted as "zero StyleSheet" when the actual goal is "no hardcoded card/text styling in StyleSheet."
**How to avoid:** Rule: only migrate when the Tailwind equivalent exists and produces identical layout. Keep StyleSheet for pixel-precise positioning.
**Warning signs:** If you see `top: -4` or `right: -8` in a StyleSheet, check the tailwind.config.js `extend` section — these negative values are not in the default config.

### Pitfall 2: Dynamic Color Suffix (`#rrggbbAA`) Cannot Be a Tailwind Class

**What goes wrong:** `crm.tsx` uses `statusColor + '22'` (e.g., `#22c55e22`) as a background — this is hex color + alpha. Tailwind has no utility for arbitrary hex+alpha unless you add a custom config or use `style={}`.
**Why it happens:** Attempting to express `backgroundColor: statusColor + '22'` as `bg-[${statusColor}22]` — this JIT arbitrary value syntax doesn't work for runtime-computed colors.
**How to avoid:** Keep these as `style={{ backgroundColor: statusColor + '22' }}` alongside `className` for all other properties.
**Warning signs:** Any color expression that is concatenated at runtime cannot be a Tailwind class.

### Pitfall 3: Skeleton Shapes Must Match Actual Content

**What goes wrong:** A generic 3-line skeleton where the real content is a 2-column grid with a status chip. Users feel the flicker/reflow when content loads and doesn't match the skeleton.
**Why it happens:** Building "a skeleton" rather than "a skeleton that mirrors this screen's layout."
**How to avoid:** Before building each skeleton, read the actual component layout and mirror its structure precisely. The `DashboardSkeleton` is the gold standard — it replicates the 2x2 KPI grid, divider, and section header.

### Pitfall 4: Form Stays Open on API Error But Field Errors Cleared

**What goes wrong:** On API error, the toast fires but the form clears field-level validation errors. Then user submits again, gets different errors. Inconsistent state.
**Why it happens:** The `onError` handler calls some cleanup that unintentionally clears `errors` state.
**How to avoid:** On API error, do NOT touch `errors` state at all. Only call `Toast.show()`. The form stays exactly as-is for the user to fix and retry.

### Pitfall 5: accessibilityLabel on Pressable Wrapping Text Already Has the Label

**What goes wrong:** Adding `accessibilityLabel="Go back"` to a Pressable that already contains `<Text>Go back</Text>` — screen readers will either read it twice or use the label and skip the text.
**Why it happens:** Applying accessibilityLabel mechanically without checking if children already provide context.
**How to avoid:** Only add `accessibilityLabel` to icon-only buttons (no text children) and data display elements where the raw number/text is not sufficient context.

---

## Code Examples

### NativeWind Card Row (verified working pattern from owner dashboard)

```typescript
// Source: apps/mobile/app/(owner)/loads/index.tsx — existing working pattern
<Pressable
  onPress={onPress}
  className="bg-slate-800 border border-slate-700 rounded-xl mx-4 mb-3 p-4 active:opacity-75"
>
  <View className="flex-row items-center justify-between mb-2">
    <Text className="text-white font-semibold text-base">#{load.loadNumber}</Text>
    <Badge label={badge.label} variant={badge.variant} />
  </View>
  <Text className="text-slate-300 text-sm font-medium mb-1" numberOfLines={1}>
    {load.customer.companyName}
  </Text>
</Pressable>
```

### Skeleton Component Usage (verified working pattern)

```typescript
// Source: apps/mobile/components/skeletons/DriverCardSkeleton.tsx — reference pattern
import { View } from 'react-native'
import { Skeleton } from '../ui/Skeleton'

export function TruckCardSkeleton() {
  return (
    <View
      style={{
        backgroundColor: '#1e293b',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 12,
        padding: 14,
        marginHorizontal: 16,
        marginBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {/* Icon square */}
      <Skeleton width={42} height={42} borderRadius={10} />
      {/* Text lines */}
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width="60%" height={15} />
        <Skeleton width="40%" height={12} />
      </View>
      {/* Status chip */}
      <Skeleton width={72} height={22} borderRadius={11} />
    </View>
  )
}
```

Note: Skeleton components intentionally use `style={}` (not `className`) since they are purely structural layout with fixed colors. This is correct — Skeleton is a UI primitive, not a content component.

### Form Validation Pattern (verified working from CreateLoadSheet)

```typescript
// Source: apps/mobile/components/owner/CreateLoadSheet.tsx — gold standard
const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})

const validate = useCallback((): boolean => {
  const newErrors: Partial<Record<keyof FormState, string>> = {}
  if (!form.email.trim()) newErrors.email = 'Email is required'
  if (!form.password) newErrors.password = 'Password is required'
  setErrors(newErrors)
  return Object.keys(newErrors).length === 0
}, [form])

const handleSubmit = useCallback(() => {
  if (!validate()) return
  mutate()
}, [validate, mutate])

// Field with error state:
<TextInput
  className={`bg-slate-700 border ${
    errors.email ? 'border-red-500' : 'border-slate-600'
  } rounded-xl px-4 py-3 text-white text-sm`}
/>
{errors.email && (
  <Text className="text-red-400 text-xs mt-1">{errors.email}</Text>
)}

// API error handler — toast only, form stays open:
onError: (error: Error) => {
  Toast.show({ type: 'error', text1: 'Failed to sign in', text2: error.message })
  // DO NOT clear form or errors state
}
```

### Accessibility Pattern (verified from React Native docs)

```typescript
// Source: https://reactnative.dev/docs/accessibility

// Icon-only FAB
<Pressable
  accessibilityLabel="Create load"
  accessibilityRole="button"
  onPress={() => setCreateSheetVisible(true)}
  className="absolute bottom-6 right-6 w-14 h-14 bg-sky-600 rounded-full items-center justify-center"
>
  <Plus color="white" size={26} />
</Pressable>

// KPI card (pressable, contains data)
<Pressable
  accessibilityLabel={`Active Loads: ${kpis.activeLoadsCount}. Tap to view all loads.`}
  accessibilityRole="button"
  onPress={() => router.push('/(owner)/loads')}
>
  <KPICard label="Active Loads" value={kpis.activeLoadsCount} ... />
</Pressable>

// Back button
<Pressable
  accessibilityLabel="Go back"
  accessibilityRole="button"
  onPress={() => router.back()}
  className="p-2 -ml-2"
>
  <ChevronLeft color="#94a3b8" size={24} />
</Pressable>
```

### StyleSheet.absoluteFillObject Migration

```typescript
// BEFORE (login.tsx)
const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.42)' },
})
<View style={styles.overlay} />

// AFTER (NativeWind — verified Tailwind equivalent)
<View className="absolute inset-0 bg-black/40" />
// Note: bg-black/40 = rgba(0,0,0,0.40) — close enough to rgba(0,0,0,0.42)
// If exact value needed: use style={{ backgroundColor: 'rgba(0,0,0,0.42)' }} + className="absolute inset-0"
```

---

## Screen-by-Screen Audit

### Screens Needing NativeWind Migration (owner portal secondary + login)

| File | StyleSheet Usage | Inline style={}? | Priority |
|------|-----------------|-----------------|----------|
| `app/login.tsx` | YES (full StyleSheet) | No | HIGH — shared screen, forms work |
| `app/(owner)/more/crm.tsx` | NO | YES — all card/row styling | HIGH |
| `app/(owner)/more/trucks.tsx` | NO | YES — all card/row styling | HIGH |
| `app/(owner)/more/compliance.tsx` | NO | YES — all row styling | HIGH |
| `app/(owner)/more/payroll.tsx` | NO | YES — all row styling | HIGH |
| `app/(owner)/more/invoices/index.tsx` | NO | YES — uses TouchableOpacity+inline style | HIGH |
| `app/(owner)/more/index.tsx` | YES (has StyleSheet) | Partial | MEDIUM |

### StyleSheet That Should Remain

| File | StyleSheet Usage | Why Keep |
|------|-----------------|----------|
| `app/(driver)/_layout.tsx` | GPS dot + unread badge | Sub-pixel absolute positioning, no Tailwind equivalent |
| `components/driver/GPSPermissionModal.tsx` | Full modal layout | Legitimate modals; low churn value to migrate |
| `components/shared/NotificationPermissionModal.tsx` | Full modal layout | Legitimate modals; low churn value to migrate |
| `components/driver/LoadStatusTimeline.tsx` | Timeline line + dots | Complex custom drawing |
| `components/owner/VehicleDetailSheet.tsx` | Sheet layout | Complex layout |
| `components/owner/VehicleMarker.tsx` | Map marker | Map-specific component |
| `components/owner/RecipientSelector.tsx` | List layout | Acceptable inline mixed usage |

### Screens Needing Skeleton (replace full-page ActivityIndicator)

| File | Current Loading State | Skeleton Needed |
|------|----------------------|-----------------|
| `app/(owner)/more/compliance.tsx` | `<ActivityIndicator size="large" />` centered | `ComplianceRowSkeleton` × 3 |
| `app/(owner)/more/crm.tsx` | `<ActivityIndicator size="large" />` centered | `CRMCardSkeleton` × 3 |
| `app/(owner)/more/trucks.tsx` | `<ActivityIndicator size="large" />` centered | `TruckCardSkeleton` × 3 |
| `app/(owner)/more/payroll.tsx` | `<ActivityIndicator size="large" />` centered | `PayrollRowSkeleton` × 3 |
| `app/(owner)/more/invoices/index.tsx` | `<ActivityIndicator size="large" />` centered | `InvoiceRowSkeleton` × 3 |
| `app/(owner)/loads/[id].tsx` | `<ActivityIndicator size="large" />` centered | `LoadDetailSkeleton` |
| `app/(driver)/loads/[id].tsx` | `<ActivityIndicator size="small" />` (line 248) | Context: inside a data row during status update — this is a mutation spinner, leave it |

**Note:** `ActivityIndicator` inside submit buttons and mutation-pending states (e.g., `isPending && <ActivityIndicator size="small" />`) should NOT be replaced — these are inline action spinners, not page-level loading states.

### Forms Needing Validation Audit

| Form | Current State | Action Needed |
|------|--------------|--------------|
| `CreateLoadSheet` | COMPLETE — gold standard | None |
| `NewIncidentScreen` | Has `errors` state + validation | Audit field coverage completeness |
| `hos.tsx` status modal | Has notes `TextInput` | Verify notes validation (likely optional field) |
| `login.tsx` | Basic string check + `setError(string)` | Migrate error display to NativeWind className pattern |
| `more/fleet.tsx` send input | No validation visible | Add empty message guard |
| `DocumentUploadSheet` | Has file state management | Verify type selection required validation |

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Inline `style={{ ... }}` for every component | NativeWind `className` | Consistent tokens, dark mode via `dark:` variants, no hardcoded color values |
| `ActivityIndicator` centered in screen | Content-shaped `Skeleton` components | No layout shift on load, native feel |
| Error displayed in `errorBox` View with StyleSheet | `border-red-500` + `text-red-400 text-xs mt-1` inline | Consistent error UX, one pattern everywhere |
| `TouchableOpacity` in owner secondary screens | `Pressable` with `className="active:opacity-75"` | Ripple support (Android), consistent press feedback |

**Deprecated patterns in this codebase:**
- `TouchableOpacity` in new code — use `Pressable` everywhere (several owner screens still use `TouchableOpacity` from when they were first built)
- Centered `<ActivityIndicator color="#38bdf8" size="large" />` as page loading state — replace with skeleton

---

## Recommended Plan Structure for Plans 04+

Based on the audit, three plans map naturally to the three workstreams:

**Plan 04 — NativeWind Migration**
- `login.tsx` — full migration from StyleSheet to className
- `(owner)/more/crm.tsx` — inline style to className
- `(owner)/more/trucks.tsx` — inline style to className
- `(owner)/more/compliance.tsx` — inline style to className
- `(owner)/more/payroll.tsx` — inline style to className
- `(owner)/more/invoices/index.tsx` — inline style + TouchableOpacity to Pressable + className
- `(owner)/more/index.tsx` — StyleSheet to className

**Plan 05 — Skeleton Loaders**
- Create: `TruckCardSkeleton`, `InvoiceRowSkeleton`, `ComplianceRowSkeleton`, `PayrollRowSkeleton`, `CRMCardSkeleton`, `LoadDetailSkeleton`
- Replace all full-page `ActivityIndicator` spinners in owner portal and owner load detail

**Plan 06 — Accessibility Labels**
- Add `accessibilityLabel` + `accessibilityRole` to all FABs, back buttons, icon-only actions
- Add composite labels to KPI cards, status chips on owner dashboard
- Audit driver portal icon buttons (HOS status tiles already have text, documents FAB needs label)

---

## Open Questions

1. **`login.tsx` ImageBackground with className**
   - What we know: `ImageBackground` requires `style` prop for the background image; NativeWind may not fully apply `flex-1` via className on this component
   - What's unclear: Whether `className="flex-1"` works reliably on `ImageBackground` in NativeWind v4
   - Recommendation: Keep `style={{ flex: 1 }}` on the `ImageBackground` itself, use `className` for all inner elements

2. **`(owner)/more/index.tsx` StyleSheet has `TouchableOpacity` rows with StyleSheet-based styling**
   - What we know: The "More" menu uses `TouchableOpacity` with complex row layout
   - What's unclear: Whether migrating to `Pressable` + className changes any visual behavior
   - Recommendation: Migrate to `Pressable` + className with `active:opacity-75` — functionally equivalent

3. **`TouchableOpacity` in `more/fleet.tsx` ConversationRow**
   - What we know: Fleet messaging uses `TouchableOpacity` for conversation rows
   - What's unclear: Whether to migrate this during Plan 04 or leave for a future dedicated pass
   - Recommendation: Migrate `TouchableOpacity` → `Pressable` as part of Plan 04 when touching that file

---

## Sources

### Primary (HIGH confidence)
- Codebase audit — direct read of 30+ files in `apps/mobile/app/` and `apps/mobile/components/`
- `apps/mobile/package.json` — confirmed nativewind ^4.2.3, tailwindcss ^3.4.19, reanimated 4.2.1
- `apps/mobile/tailwind.config.js` — confirmed surface color tokens and preset
- Existing skeleton components (`DashboardSkeleton`, `DriverCardSkeleton`, etc.) — confirmed implementation pattern
- Existing `CreateLoadSheet.tsx` — confirmed gold standard form validation pattern

### Secondary (MEDIUM confidence)
- [React Native Accessibility docs](https://reactnative.dev/docs/accessibility) — accessibilityLabel, accessibilityRole, accessibilityHint
- [Tailwind CSS inset utilities](https://tailwindcss.com/docs/top-right-bottom-left) — verified `inset-0` = top/right/bottom/left: 0

### Tertiary (LOW confidence — cross-referenced with GitHub issues)
- NativeWind v4 className + style merging behavior — confirmed via multiple GitHub issues (#957, #1018) that v4 merges correctly; v5 breaks this. We are on v4. Treat with MEDIUM confidence.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — installed packages confirmed from package.json
- Architecture patterns: HIGH — derived directly from working codebase patterns
- Screen audit: HIGH — direct file reads of all owner portal screens
- NativeWind style merging: MEDIUM — confirmed via GitHub issues, not official docs
- Accessibility patterns: HIGH — official React Native docs

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (NativeWind v4 is stable; no API changes expected)
