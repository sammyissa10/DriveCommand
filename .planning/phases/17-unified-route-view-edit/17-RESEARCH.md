# Phase 17: Unified Route View/Edit Page - Research

**Researched:** 2026-02-16
**Domain:** View/edit mode toggling with URL state management in Next.js App Router
**Confidence:** HIGH

## Summary

Phase 17 consolidates the existing split route pages (`/routes/[id]` for view, `/routes/[id]/edit` for edit) into a single unified page with seamless mode toggling. The current codebase already demonstrates inline edit patterns in `RouteExpensesSection` and `RoutePaymentsSection`, establishing a working model for state-based editing. For route-level editing, the standard approach in Next.js App Router uses URL search parameters (`?mode=edit`) to control the edit state, enabling shareable edit links and browser back/forward navigation while maintaining context.

**Critical insight:** Next.js App Router lacks shallow routing support (removed from Pages Router), so updating search parameters triggers server component re-renders. For edit mode toggling that needs to preserve client state (form data, unsaved changes), use `window.history.replaceState()` instead of `router.replace()` to modify URLs without server roundtrips. Unsaved changes protection requires two mechanisms: `beforeunload` event for browser navigation (back/refresh/close) and programmatic checks for internal route changes.

**Primary recommendation:** Use URL search params (`?mode=edit`) for edit mode state, implement client-side mode toggling with `window.history.replaceState()` for instant transitions, add `beforeunload` listener with form dirty tracking for unsaved changes warnings, integrate existing `RouteForm` component into the unified page conditionally, and leverage React 19's `useActionState` with optimistic locking (Route.version field) to prevent concurrent edit conflicts.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 19 | ^19.0.0 (installed) | UI with form hooks | `useActionState` for form state, `useEffect` for `beforeunload` listener, built-in form handling |
| Next.js 16 | ^16.0.0 (installed) | App Router framework | Server Components for data fetching, async searchParams, client components for interactivity |
| Zod | ^4.3.6 (installed) | Form validation | Already used in existing `updateRoute` action, validates route update data |
| Prisma 7 | ^7.4.0 (installed) | ORM with optimistic locking | Route model has `version` field for concurrent edit protection |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| nuqs | ^2.x (NOT installed) | Type-safe URL state | Optional: If heavy URL state management needed. Current phase uses simple `?mode=edit` param — native URLSearchParams sufficient |
| React Router useBlocker | N/A | Navigation blocking | NOT applicable — Next.js App Router doesn't have equivalent. Use `beforeunload` + programmatic checks instead |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| URL search params (`?mode=edit`) | Client-only state (`useState`) | URL state enables shareable edit links, browser back/forward, and persists across refresh — essential for edit mode; client state doesn't |
| `window.history.replaceState()` | `router.replace()` | History API avoids server roundtrips (preserves client state like unsaved changes), but bypasses Next.js caching; router.replace triggers full re-render |
| Unified page with mode toggle | Separate `/routes/[id]` and `/routes/[id]/edit` pages | Unified page eliminates navigation, maintains context (scroll position, expanded sections), but adds complexity for edit/view conditional rendering |
| `beforeunload` warning | No unsaved changes protection | Warning prevents accidental data loss when users navigate away/refresh, but can't be customized (browser security) and doesn't work for internal route changes |

**Installation:**
```bash
# No new packages needed — existing stack sufficient
# Optional: Install nuqs if URL state management grows complex
# npm install nuqs
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── (owner)/
│   │   ├── routes/
│   │   │   ├── [id]/
│   │   │   │   ├── page.tsx                    # Unified view/edit page (MODIFIED)
│   │   │   │   ├── route-page-client.tsx       # NEW: Client component wrapper
│   │   │   │   ├── edit/                       # DELETE: No longer needed
│   │   │   │   │   └── page.tsx                # (remove after migration)
│   │   │   │   └── route-documents-section.tsx # (existing)
│   │   └── actions/
│   │       └── routes.ts                       # (existing updateRoute action)
├── components/
│   └── routes/
│       ├── route-detail.tsx                    # MODIFIED: Add view-only mode support
│       ├── route-form.tsx                      # (existing — reuse in edit mode)
│       ├── route-edit-section.tsx              # NEW: Edit mode wrapper component
│       └── use-unsaved-changes-warning.ts      # NEW: Custom hook for beforeunload
```

### Pattern 1: URL Search Params for Edit Mode State

**What:** Use `?mode=edit` query parameter to control whether the page renders in view or edit mode.

**When to use:** Route-level view/edit toggling where edit state should be shareable via URL and survive page refresh.

**Example:**
```typescript
// Source: https://nextjs.org/docs/app/api-reference/functions/use-search-params
// app/(owner)/routes/[id]/page.tsx (Server Component)
interface RoutePageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}

export default async function RoutePage({ params, searchParams }: RoutePageProps) {
  const { id } = await params;
  const { mode } = await searchParams;
  const isEditMode = mode === 'edit';

  const route = await getRoute(id);
  if (!route) notFound();

  // Fetch additional data...
  const [drivers, trucks, documents, expenses, payments] = await Promise.all([
    /* ... */
  ]);

  return (
    <RoutePageClient
      route={route}
      isEditMode={isEditMode}
      drivers={drivers}
      trucks={trucks}
      // ... other props
    />
  );
}
```

```typescript
// app/(owner)/routes/[id]/route-page-client.tsx (Client Component)
'use client';

import { usePathname } from 'next/navigation';

export function RoutePageClient({ route, isEditMode, drivers, trucks }) {
  const pathname = usePathname();

  const toggleEditMode = () => {
    const newMode = isEditMode ? null : 'edit';
    const url = new URL(window.location.href);

    if (newMode) {
      url.searchParams.set('mode', newMode);
    } else {
      url.searchParams.delete('mode');
    }

    // Use History API to avoid server roundtrip
    window.history.replaceState({}, '', url.toString());

    // Trigger re-render by updating local state
    // (or use nuqs library for reactive URL state)
  };

  return (
    <div>
      <button onClick={toggleEditMode}>
        {isEditMode ? 'Cancel' : 'Edit Route'}
      </button>

      {isEditMode ? (
        <RouteEditSection route={route} drivers={drivers} trucks={trucks} />
      ) : (
        <RouteDetail route={route} />
      )}
    </div>
  );
}
```

### Pattern 2: Unsaved Changes Warning with beforeunload

**What:** Prevent accidental data loss by warning users when they try to navigate away or close the browser tab with unsaved form changes.

**When to use:** Any form in edit mode that allows modifications before explicit save/cancel.

**Example:**
```typescript
// Source: https://devrecipes.net/warn-users-before-exiting-handling-unsaved-changes-in-react/
// components/routes/use-unsaved-changes-warning.ts
import { useEffect } from 'react';

export function useUnsavedChangesWarning(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Modern browsers require returnValue to be set
      e.preventDefault();
      e.returnValue = ''; // Chrome requires returnValue to be set
      return ''; // Some browsers use return value
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup listener when component unmounts or isDirty changes
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);
}
```

```typescript
// Usage in edit form component
'use client';

import { useState, useEffect } from 'react';
import { useUnsavedChangesWarning } from './use-unsaved-changes-warning';

export function RouteEditSection({ route, drivers, trucks }) {
  const [isDirty, setIsDirty] = useState(false);
  const [formData, setFormData] = useState({
    origin: route.origin,
    destination: route.destination,
    // ... other fields
  });

  // Track if form data has changed from initial values
  useEffect(() => {
    const hasChanges =
      formData.origin !== route.origin ||
      formData.destination !== route.destination;
      // ... check other fields
    setIsDirty(hasChanges);
  }, [formData, route]);

  // Warn on browser navigation/close
  useUnsavedChangesWarning(isDirty);

  const handleCancel = () => {
    if (isDirty && !window.confirm('Discard unsaved changes?')) {
      return;
    }
    // Exit edit mode...
  };

  // ... form implementation
}
```

### Pattern 3: Optimistic Locking for Concurrent Edit Prevention

**What:** Use the existing Route.version field to detect when another user has modified the route during editing, preventing the last-write-wins problem.

**When to use:** Multi-user environments where concurrent edits to the same route could occur.

**Example:**
```typescript
// Source: Existing codebase pattern (Pitfalls research, optimistic locking)
// app/(owner)/actions/routes.ts
'use server';

export async function updateRoute(
  id: string,
  prevState: any,
  formData: FormData
) {
  await requireRole(['OWNER', 'MANAGER']);

  const currentVersion = parseInt(formData.get('version') as string, 10);
  const data = routeUpdateSchema.parse({
    origin: formData.get('origin'),
    destination: formData.get('destination'),
    // ... other fields
  });

  const prisma = await getTenantPrisma();

  try {
    const route = await prisma.route.update({
      where: {
        id,
        version: currentVersion // Only update if version matches
      },
      data: {
        ...data,
        version: { increment: 1 }, // Increment version on update
      },
    });

    revalidatePath(`/routes/${id}`);
    return { success: true, route };
  } catch (error) {
    // If version mismatch, Prisma throws RecordNotFound
    return {
      success: false,
      error: 'Route was modified by another user. Please refresh and try again.'
    };
  }
}
```

```typescript
// In form component, include version in form data
<form action={updateRouteAction}>
  <input type="hidden" name="version" value={route.version} />
  {/* ... other fields */}
</form>
```

### Pattern 4: Conditional Rendering for View/Edit Modes

**What:** Render different components based on edit mode state, reusing existing RouteDetail (view) and RouteForm (edit) components.

**When to use:** Unified pages that support both view and edit modes without navigation.

**Example:**
```typescript
// app/(owner)/routes/[id]/route-page-client.tsx
'use client';

import { RouteDetail } from '@/components/routes/route-detail';
import { RouteForm } from '@/components/routes/route-form';
import { updateRoute } from '@/app/(owner)/actions/routes';

export function RoutePageClient({
  route,
  isEditMode,
  drivers,
  trucks,
  formattedScheduledDate,
  formattedCompletedAt,
  statusActions
}) {
  if (isEditMode) {
    const boundUpdateRoute = updateRoute.bind(null, route.id);
    const initialData = {
      origin: route.origin,
      destination: route.destination,
      scheduledDate: formatForDatetimeInput(route.scheduledDate),
      driverId: route.driver.id,
      truckId: route.truck.id,
      notes: route.notes || undefined,
    };

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Edit Route</h1>
          <button onClick={handleCancelEdit}>Cancel</button>
        </div>

        <div className="rounded-xl border bg-card p-6">
          <RouteForm
            action={boundUpdateRoute}
            initialData={initialData}
            drivers={drivers}
            trucks={trucks}
            submitLabel="Update Route"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">
          {route.origin} to {route.destination}
        </h1>
        <button onClick={handleEnterEdit}>Edit Route</button>
      </div>

      <RouteDetail
        route={route}
        formattedScheduledDate={formattedScheduledDate}
        formattedCompletedAt={formattedCompletedAt}
        statusActions={statusActions}
      />

      {/* Expenses, Payments, Documents sections... */}
    </div>
  );
}
```

### Anti-Patterns to Avoid

- **Storing edit mode in `useState` only:** URL state enables shareable edit links, browser back/forward, and persistence across refresh. Client-only state loses these benefits.
- **Using `router.replace()` for mode toggle:** Triggers full server component re-render, losing unsaved form state. Use `window.history.replaceState()` for instant client-side transitions.
- **No unsaved changes protection:** Users expect warnings before losing work. Missing `beforeunload` listener causes frustration and data loss.
- **Updating route status without optimistic locking:** Concurrent edits cause last-write-wins conflicts. Always include `version` field in updates and handle mismatch errors.
- **Custom browser dialog messages:** Modern browsers ignore custom messages for security (anti-phishing). Use generic browser warning, not `alert()` or custom UI.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL state management | Manual URLSearchParams parsing/stringifying with useEffect watchers | `nuqs` library OR native URLSearchParams with `window.history` API | URL state synchronization is deceptively complex: handling initial load, shallow updates, type coercion, array/object params, and avoiding infinite re-render loops. nuqs handles this robustly. For simple cases (single `?mode=edit` param), native API sufficient. |
| Form dirty tracking | Custom deep equality checks on every form field | Store initial values, compare on change OR use form library with built-in dirty tracking | Deep object comparison has edge cases: nested objects, arrays, dates, nullish values. For complex forms, React Hook Form provides `formState.isDirty` out of the box. For simple forms, shallow field comparison works. |
| Navigation blocking for unsaved changes | Custom route change interception with Next.js router events | `beforeunload` event listener + programmatic confirmation on internal navigation | Next.js App Router removed router events API. No built-in way to block navigation. Must use browser-level `beforeunload` for external navigation (back/refresh/close) and manual `window.confirm()` for internal links/buttons. |
| Concurrent edit conflict resolution | Custom timestamp-based last-write-wins | Database optimistic locking with version field | Timestamp comparison fails with clock skew, network delays, and simultaneous saves. Optimistic locking (version counter) guarantees conflict detection. Route model already has `version` field. |

**Key insight:** URL state management libraries like nuqs eliminate an entire class of bugs around state synchronization, type safety, and re-render optimization. However, for Phase 17's simple requirement (single `?mode=edit` parameter), native URLSearchParams + `window.history.replaceState()` is sufficient and avoids adding a dependency.

## Common Pitfalls

### Pitfall 1: App Router SearchParams Trigger Server Re-Renders

**What goes wrong:**
Developers familiar with Pages Router "shallow routing" expect updating search params to only affect client components without re-fetching server data. In App Router, changing `?mode=edit` via `router.replace()` causes the entire Server Component to re-render, re-running data fetching queries even though the route data hasn't changed. This creates a jarring UX: clicking "Edit" triggers a loading spinner, re-fetches route/drivers/trucks data from database, and resets client state (scroll position, expanded sections, form inputs). Users perceive this as slow and broken.

**Why it happens:**
Next.js App Router doesn't support shallow routing (intentionally removed). Any URL change, including search params, triggers navigation that re-executes Server Components. This is by design for React Server Components' cache invalidation model. The `router.replace()` method from `next/navigation` updates the URL and tells Next.js to re-render the route with new searchParams, which means server data fetching runs again.

**How to avoid:**
1. **Use `window.history.replaceState()` for mode toggling instead of `router.replace()`:**
```typescript
// ❌ Bad: Triggers server re-render
import { useRouter } from 'next/navigation';
const router = useRouter();
router.replace(`/routes/${id}?mode=edit`);

// ✅ Good: Client-side only, instant
const url = new URL(window.location.href);
url.searchParams.set('mode', 'edit');
window.history.replaceState({}, '', url.toString());
```

2. **Lift mode state to client component** to decouple from server searchParams:
```typescript
// Server component reads initial mode from searchParams
const { mode } = await searchParams;
const initialMode = mode === 'edit';

// Client component manages mode state internally
function RoutePageClient({ initialMode, ...data }) {
  const [isEditMode, setIsEditMode] = useState(initialMode);
  // Toggle doesn't hit server
}
```

3. **Use `nuqs` library** for reactive URL state without server roundtrips:
```typescript
import { useQueryState } from 'nuqs';

function RoutePageClient() {
  const [mode, setMode] = useQueryState('mode'); // Auto-syncs with URL
  const isEditMode = mode === 'edit';
  // setMode updates URL via History API, not router
}
```

**Warning signs:**
- Loading spinners appear when clicking "Edit" or "Cancel"
- Form inputs reset when toggling edit mode
- Scroll position jumps to top on mode change
- Network tab shows duplicate database queries for unchanged data
- Edit mode toggle feels sluggish (500ms+ delay)

---

### Pitfall 2: `beforeunload` Event Doesn't Block Internal Route Changes

**What goes wrong:**
Developers implement unsaved changes warning with `beforeunload` event listener, test by refreshing the page (works!), but then discover the warning doesn't appear when users click navigation links or buttons within the app. Scenario: User is editing a route with unsaved changes, clicks "Routes" in sidebar navigation, and immediately navigates away without warning — losing all work. The `beforeunload` event only fires for browser-level navigation (refresh, back/forward, close tab), not Next.js client-side routing.

**Why it happens:**
`beforeunload` is a browser API that fires when the window/document is about to unload. In client-side routed apps (Next.js, React Router), clicking internal links uses JavaScript navigation (pushState) without unloading the document, so `beforeunload` never fires. Next.js App Router removed router events API (like `routeChangeStart`), so there's no built-in way to intercept navigation. React Router v6 has `useBlocker` hook, but Next.js doesn't provide an equivalent.

**How to avoid:**
1. **Wrap navigation elements with confirmation logic:**
```typescript
// components/routes/use-confirm-navigation.tsx
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function useConfirmNavigation(isDirty: boolean) {
  const router = useRouter();

  const confirmNavigation = (href: string) => {
    if (!isDirty) {
      router.push(href);
      return;
    }

    if (window.confirm('You have unsaved changes. Discard them?')) {
      router.push(href);
    }
  };

  return { confirmNavigation };
}

// Usage in component
function RouteEditHeader({ isDirty }) {
  const { confirmNavigation } = useConfirmNavigation(isDirty);

  return (
    <button onClick={() => confirmNavigation('/routes')}>
      Back to Routes
    </button>
  );
}
```

2. **Override Link components** to inject confirmation:
```typescript
// For app-wide protection, create ProtectedLink wrapper
import Link from 'next/link';

export function ProtectedLink({ href, children, requireConfirm = false, ...props }) {
  const handleClick = (e: React.MouseEvent) => {
    if (requireConfirm && !window.confirm('Discard unsaved changes?')) {
      e.preventDefault();
    }
  };

  return <Link href={href} onClick={handleClick} {...props}>{children}</Link>;
}
```

3. **Show warning on Cancel/Save buttons** before mode transition:
```typescript
const handleCancelEdit = () => {
  if (isDirty && !window.confirm('Discard unsaved changes?')) {
    return; // Stay in edit mode
  }
  exitEditMode(); // Transition to view mode
};
```

**Warning signs:**
- Unsaved changes lost when clicking sidebar navigation
- Confirmation appears on refresh but not internal routing
- Users report "lost work" after clicking app links
- `beforeunload` tests pass but real usage shows data loss

---

### Pitfall 3: Form Dirty State Calculation Causes Re-render Loops

**What goes wrong:**
Developer implements dirty tracking by comparing current form state to initial route data inside `useEffect`. On every keystroke, the effect runs, compares objects, updates `isDirty` state, which triggers re-render, which runs the effect again. In some cases, even when form data matches initial data, the comparison fails (due to object reference inequality or type coercion), causing `isDirty` to flicker between true/false infinitely. This maxes out CPU, freezes the UI, and crashes React with "Maximum update depth exceeded" error.

**Why it happens:**
Object/array comparisons in JavaScript are reference-based, not value-based. `formData !== route` is always true even if values match. Using `JSON.stringify()` for deep equality works but is expensive and runs on every render. Additionally, form inputs return strings (`event.target.value`), but initial route data may be numbers/dates, causing type mismatches that defeat equality checks. Finally, placing `setIsDirty()` inside `useEffect` with `[formData]` as dependency creates a feedback loop.

**How to avoid:**
1. **Use shallow field-by-field comparison, not deep object equality:**
```typescript
// ❌ Bad: Creates infinite loop
useEffect(() => {
  setIsDirty(formData !== initialData); // Always true (reference inequality)
}, [formData, initialData]);

// ✅ Good: Compare specific fields
const isDirty =
  formData.origin !== route.origin ||
  formData.destination !== route.destination ||
  formData.scheduledDate !== formatForDatetimeInput(route.scheduledDate) ||
  formData.driverId !== route.driver.id ||
  formData.truckId !== route.truck.id ||
  (formData.notes || '') !== (route.notes || '');

// Don't store isDirty in state — derive it during render
```

2. **For complex forms, use React Hook Form's built-in dirty tracking:**
```typescript
import { useForm } from 'react-hook-form';

const { formState: { isDirty } } = useForm({
  defaultValues: {
    origin: route.origin,
    destination: route.destination,
    // ...
  }
});

// isDirty automatically tracked, no custom logic needed
```

3. **Normalize types when comparing** to avoid string vs number mismatches:
```typescript
const isDirty =
  String(formData.driverId) !== String(route.driver.id) ||
  (formData.notes ?? '') !== (route.notes ?? ''); // Normalize null/undefined
```

**Warning signs:**
- Browser freezes or becomes unresponsive during typing
- React DevTools shows hundreds of re-renders per second
- Console error: "Maximum update depth exceeded"
- `isDirty` flickers between true/false rapidly
- Form inputs lag or drop keystrokes

---

### Pitfall 4: Missing Version Field in Form Causes Silent Optimistic Lock Failure

**What goes wrong:**
Developer updates the route edit form to call `updateRoute` action but forgets to include the hidden `version` input field. Server action tries to update route with optimistic locking (`where: { id, version }`), but `version` is undefined, so Prisma's where clause becomes `where: { id, version: undefined }`, which fails to match any records. The update silently fails, returning "Route not found" error even though the route exists. User clicks Save, sees generic error message, has no idea why, and loses trust in the application. Worse: if the code falls back to updating without version check, concurrent edits overwrite each other (last-write-wins), causing data corruption.

**Why it happens:**
Optimistic locking requires passing the current version field from the form to the server action. If the form doesn't include `<input type="hidden" name="version" value={route.version} />`, the `formData.get('version')` call returns `null`. Developers forget this step because version fields are invisible in the UI and not part of the "business logic" — they're purely technical. Additionally, TypeScript won't catch this because FormData keys are stringly-typed, so `formData.get('version')` always compiles successfully even if the field doesn't exist.

**How to avoid:**
1. **Always include version field in update forms:**
```typescript
// RouteForm component
<form action={updateRouteAction}>
  <input type="hidden" name="version" value={route.version} />
  {/* Visible fields... */}
</form>
```

2. **Validate version field exists in server action:**
```typescript
export async function updateRoute(id: string, prevState: any, formData: FormData) {
  await requireRole(['OWNER', 'MANAGER']);

  const versionStr = formData.get('version');
  if (!versionStr) {
    return {
      success: false,
      error: 'Version field missing. Please refresh the page and try again.'
    };
  }

  const currentVersion = parseInt(versionStr as string, 10);
  // ... proceed with update
}
```

3. **Handle optimistic lock conflicts gracefully:**
```typescript
try {
  const route = await prisma.route.update({
    where: { id, version: currentVersion },
    data: { ...updates, version: { increment: 1 } },
  });
  return { success: true, route };
} catch (error) {
  if (error.code === 'P2025') { // Prisma RecordNotFound
    return {
      success: false,
      error: 'This route was modified by another user. Please refresh to see the latest version.',
    };
  }
  throw error; // Re-throw other errors
}
```

4. **Show version conflict UI with refresh CTA:**
```typescript
// In form component
{state?.error && (
  <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4">
    <p className="text-sm text-yellow-800">{state.error}</p>
    {state.error.includes('modified by another user') && (
      <button
        onClick={() => window.location.reload()}
        className="mt-2 text-sm font-medium text-yellow-900"
      >
        Refresh Page
      </button>
    )}
  </div>
)}
```

**Warning signs:**
- Update form returns "Route not found" for existing routes
- Concurrent edits overwrite each other without warning
- Form submission succeeds but changes don't persist
- No version conflict errors even when multiple users edit simultaneously
- Database shows version field incrementing randomly or staying at 1

---

## Code Examples

Verified patterns from official sources and existing codebase:

### Reading SearchParams in Server Component (Next.js 16 Async Pattern)

```typescript
// Source: https://nextjs.org/docs/app/api-reference/functions/use-search-params
// app/(owner)/routes/[id]/page.tsx
interface RoutePageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string; tab?: string }>;
}

export default async function RoutePage({ params, searchParams }: RoutePageProps) {
  const { id } = await params;
  const { mode, tab } = await searchParams;

  const isEditMode = mode === 'edit';
  const activeTab = tab || 'details';

  // Fetch data based on mode...
  const route = await getRoute(id);

  return (
    <RoutePageClient
      route={route}
      initialMode={isEditMode}
      initialTab={activeTab}
    />
  );
}
```

### Client-Side URL State Management with History API

```typescript
// Source: https://github.com/vercel/next.js/discussions/48110 (shallow routing workaround)
// app/(owner)/routes/[id]/route-page-client.tsx
'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

export function RoutePageClient({ route, initialMode }) {
  const pathname = usePathname();
  const [isEditMode, setIsEditMode] = useState(initialMode);

  // Sync URL when mode changes (without server roundtrip)
  useEffect(() => {
    const url = new URL(window.location.href);
    if (isEditMode) {
      url.searchParams.set('mode', 'edit');
    } else {
      url.searchParams.delete('mode');
    }
    window.history.replaceState({}, '', url.toString());
  }, [isEditMode]);

  const toggleEditMode = () => setIsEditMode(!isEditMode);

  return (
    <div>
      <button onClick={toggleEditMode}>
        {isEditMode ? 'Cancel Edit' : 'Edit Route'}
      </button>
      {isEditMode ? <EditView /> : <ReadOnlyView />}
    </div>
  );
}
```

### Unsaved Changes Warning Hook

```typescript
// Source: https://devrecipes.net/warn-users-before-exiting-handling-unsaved-changes-in-react/
// components/routes/use-unsaved-changes-warning.ts
import { useEffect } from 'react';

/**
 * Warns user before closing tab/window when form has unsaved changes.
 * Note: Modern browsers show generic warning (can't customize message).
 */
export function useUnsavedChangesWarning(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // Required for Chrome
      return ''; // Required for some browsers
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);
}
```

### Form Dirty State Tracking (Shallow Field Comparison)

```typescript
// Source: Existing codebase pattern (RouteExpensesSection uses useState for edit state)
// components/routes/route-edit-section.tsx
'use client';

import { useState } from 'react';
import { useUnsavedChangesWarning } from './use-unsaved-changes-warning';
import { formatForDatetimeInput } from '@/lib/utils/date';

export function RouteEditSection({ route, drivers, trucks }) {
  const [formData, setFormData] = useState({
    origin: route.origin,
    destination: route.destination,
    scheduledDate: formatForDatetimeInput(route.scheduledDate),
    driverId: route.driver.id,
    truckId: route.truck.id,
    notes: route.notes || '',
  });

  // Calculate dirty state by comparing current to initial values
  const isDirty =
    formData.origin !== route.origin ||
    formData.destination !== route.destination ||
    formData.scheduledDate !== formatForDatetimeInput(route.scheduledDate) ||
    formData.driverId !== route.driver.id ||
    formData.truckId !== route.truck.id ||
    formData.notes !== (route.notes || '');

  useUnsavedChangesWarning(isDirty);

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <form>
      <input
        type="hidden"
        name="version"
        value={route.version}
      />
      <input
        name="origin"
        value={formData.origin}
        onChange={(e) => handleInputChange('origin', e.target.value)}
      />
      {/* Other fields... */}
    </form>
  );
}
```

### Conditional Rendering Based on Edit Mode

```typescript
// Source: Existing pattern in RouteExpensesSection (showAddForm state, editingExpenseId state)
// app/(owner)/routes/[id]/route-page-client.tsx
'use client';

import { RouteDetail } from '@/components/routes/route-detail';
import { RouteEditSection } from '@/components/routes/route-edit-section';

export function RoutePageClient({
  route,
  isEditMode,
  drivers,
  trucks,
  documents,
  expenses,
  payments,
  formattedScheduledDate,
  formattedCompletedAt,
  statusActions
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">
          {isEditMode ? 'Edit Route' : `${route.origin} to ${route.destination}`}
        </h1>
        <ModeToggleButton isEditMode={isEditMode} />
      </div>

      {isEditMode ? (
        <>
          {/* Edit Mode: Show form */}
          <div className="rounded-xl border bg-card p-6">
            <RouteEditSection
              route={route}
              drivers={drivers}
              trucks={trucks}
            />
          </div>
        </>
      ) : (
        <>
          {/* View Mode: Show read-only detail */}
          <RouteDetail
            route={route}
            formattedScheduledDate={formattedScheduledDate}
            formattedCompletedAt={formattedCompletedAt}
            statusActions={statusActions}
          />

          {/* Financial sections (expenses, payments, documents) */}
          <RouteExpensesSection routeId={route.id} expenses={expenses} />
          <RoutePaymentsSection routeId={route.id} payments={payments} />
          <RouteDocumentsSection routeId={route.id} documents={documents} />
        </>
      )}
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pages Router shallow routing (`router.push(url, undefined, { shallow: true })`) | App Router: No shallow routing, use `window.history.replaceState()` | Next.js 13 (2022) | URL updates without shallow option always trigger server re-renders in App Router. Must use History API directly for client-only URL changes. |
| Router events (`router.events.on('routeChangeStart')`) for navigation blocking | App Router: No router events, use `beforeunload` + manual confirmation | Next.js 13 (2022) | Can't intercept client-side navigation programmatically. Must protect each navigation point individually. |
| `useFormState` hook (React 19 canary) | `useActionState` hook (React 19 stable) | React 19 stable release (Dec 2024) | Hook renamed before stable release. Same API, different name. Use `useActionState` in production. |
| Separate view and edit pages (`/routes/[id]` and `/routes/[id]/edit`) | Unified page with `?mode=edit` param | Modern SPA pattern (2020+) | Reduces navigation overhead, maintains context (scroll, state), enables instant mode switching. Trade-off: more complex conditional rendering. |
| Custom `window.confirm()` dialogs for unsaved changes | Browser native `beforeunload` warning | Browser security improvements (2017+) | Custom messages blocked to prevent phishing. Only generic browser warning allowed. |

**Deprecated/outdated:**
- **Shallow routing in App Router**: Removed in Next.js 13. Use History API for client-only URL updates.
- **Router events API (`router.events`)**: Removed in App Router. No replacement for navigation interception.
- **Custom `beforeunload` messages**: Browsers ignore custom text due to security. Use empty string to trigger generic warning.

## Open Questions

1. **Should edit mode show all sections (expenses, payments, documents) or only route details form?**
   - What we know: Current separate edit page shows only route details form (origin, destination, driver, truck, notes). Expenses/payments have inline editing on view page.
   - What's unclear: Should unified edit mode hide financial sections (focus on route fields only) or keep them visible for context?
   - Recommendation: Show read-only financial sections in edit mode for context. This matches inline edit pattern used in expenses/payments — user can edit route details while seeing full financial picture. If hiding sections is preferred, add this to CONTEXT.md during discussion phase.

2. **How should mode toggle behave when route status is COMPLETED?**
   - What we know: Completed routes lock financial data (expenses/payments can't be edited). RouteForm itself doesn't have status-based restrictions currently.
   - What's unclear: Should "Edit Route" button be disabled for completed routes? Or allow editing route details (driver, notes) but not status transitions?
   - Recommendation: Allow editing route details (driver, truck, notes) even when completed, but disable status changes (handled by RouteStatusActions separately). This gives flexibility to fix data errors without reopening route lifecycle. Confirm in discussion phase.

3. **Should URL state use `router.replace()` (loses history) or `router.push()` (adds history)?**
   - What we know: Current edit page uses separate `/edit` route, so back button returns to view page (good UX). With unified page, toggling edit mode could use `replace` (no history) or `push` (adds history entry).
   - What's unclear: Should back button exit edit mode (push) or skip edit mode entirely (replace)?
   - Recommendation: Use `window.history.replaceState()` (no history entry) so back button doesn't toggle modes — it navigates to previous page. Matches inline edit pattern where toggling forms doesn't add history. Avoids "back button trap" where users press back repeatedly to exit edit mode.

## Sources

### Primary (HIGH confidence)
- [Next.js useSearchParams Documentation](https://nextjs.org/docs/app/api-reference/functions/use-search-params) - Official docs for searchParams in App Router
- [Next.js Linking and Navigating](https://nextjs.org/docs/app/getting-started/linking-and-navigating) - Official navigation patterns
- [React useActionState](https://react.dev/reference/react/useActionState) - Official React 19 hook documentation
- [Next.js App Router Shallow Routing Discussion](https://github.com/vercel/next.js/discussions/48110) - Official Next.js team response on shallow routing removal
- Existing DriveCommand codebase - RouteExpensesSection inline edit pattern, Route.version optimistic locking

### Secondary (MEDIUM confidence)
- [nuqs Library Documentation](https://nuqs.dev) - Type-safe URL state management for React
- [Handling Unsaved Changes in React - Dev Recipes](https://devrecipes.net/warn-users-before-exiting-handling-unsaved-changes-in-react/) - beforeunload pattern
- [React Inline Edit Pattern - DhiWise](https://www.dhiwise.com/post/a-beginners-guide-to-implementing-react-inline-edi) - Edit mode toggle patterns
- [Next.js Shallow Routing Workaround - Kite Metric](https://kitemetric.com/blogs/mastering-shallow-routing-in-next-js-app-router) - History API approach
- [Managing Search Params with nuqs - LogRocket](https://blog.logrocket.com/managing-search-parameters-next-js-nuqs/) - URL state management comparison

### Tertiary (LOW confidence)
- [Optimistic UI with Server Actions - Medium](https://medium.com/@mishal.s.suyog/optimistic-ui-with-server-actions-in-next-js-a-smoother-user-experience-6b779e4293a9) - General Server Actions patterns
- [React 19 Form Handling - Medium](https://medium.com/@ignatovich.dm/enhancing-form-handling-in-react-19-a-look-at-action-useformstate-and-useformstatus-a5ee68d6bf93) - useActionState overview

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed, React 19/Next.js 16 patterns well-documented
- Architecture: HIGH - Official Next.js docs + existing codebase patterns provide clear guidance
- Pitfalls: HIGH - Official discussions confirm shallow routing removal, beforeunload behavior well-established

**Research date:** 2026-02-16
**Valid until:** 60 days (2026-04-17) — Next.js/React patterns are stable, but watch for Next.js 17 changes
