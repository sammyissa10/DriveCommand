---
phase: quick-29
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(owner)/dashboard/page.tsx
  - src/app/(owner)/actions/dashboard.ts
  - src/app/(owner)/actions/notifications.ts
autonomous: true
must_haves:
  truths:
    - "Dashboard header renders instantly without waiting for any DB queries"
    - "Skeleton fallbacks appear immediately while data loads"
    - "Auth check does not redundantly decrypt session cookie across page and each data function"
    - "Cold-cache dashboard load completes within 2-3 seconds max"
  artifacts:
    - path: "src/app/(owner)/dashboard/page.tsx"
      provides: "Optimized dashboard page with reduced auth overhead"
    - path: "src/app/(owner)/actions/dashboard.ts"
      provides: "Dashboard data functions without redundant auth in cached path"
    - path: "src/app/(owner)/actions/notifications.ts"
      provides: "Notification data functions without redundant auth in cached path"
  key_links:
    - from: "src/app/(owner)/dashboard/page.tsx"
      to: "src/app/(owner)/actions/dashboard.ts"
      via: "direct function import (not server action RPC)"
      pattern: "import.*from.*actions/dashboard"
---

<objective>
Fix dashboard slow loading / blank white screen by eliminating redundant auth overhead
and ensuring Suspense streaming works correctly.

Purpose: The dashboard currently decrypts the session cookie 7+ times per page load
(1 in layout, 1 in page requireRole, then 2 calls per each of 4 data functions =
requireRole + requireTenantId). Each decrypt involves AES-256-GCM via Web Crypto.
Additionally, the page-level `requireRole()` blocks the entire page render before
any Suspense boundary can activate — causing the blank white screen.

Output: Dashboard that shows header + skeletons instantly, streams data sections
independently, with auth checked once.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/(owner)/dashboard/page.tsx
@src/app/(owner)/dashboard/loading.tsx
@src/app/(owner)/actions/dashboard.ts
@src/app/(owner)/actions/notifications.ts
@src/app/(owner)/layout.tsx
@src/lib/auth/server.ts
@src/lib/auth/session.ts
@src/lib/context/tenant-context.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove page-level blocking auth and deduplicate session decrypts</name>
  <files>
    src/app/(owner)/dashboard/page.tsx
    src/app/(owner)/actions/dashboard.ts
    src/app/(owner)/actions/notifications.ts
  </files>
  <action>
The root cause of the blank white screen is the waterfall:
1. Layout awaits getSession() + getRole() (auth check) -- BLOCKS layout render
2. Page awaits requireRole() (ANOTHER session decrypt) -- BLOCKS page render before any Suspense boundaries activate
3. Each of 4 async section components calls a server action that calls requireRole() + requireTenantId() (2 more session decrypts each)

Total: ~9 session decrypts (each involving AES-256-GCM) per cold page load, with the page-level one blocking ALL Suspense boundaries.

**Fix in page.tsx:**
- REMOVE the `await requireRole()` call from `DashboardPage`. The layout already enforces OWNER/MANAGER auth -- the page-level check is redundant and blocks the entire render.
- The individual server actions still enforce auth (defense in depth), so security is maintained.
- This allows the page to return JSX immediately, letting Suspense boundaries activate and show skeletons.

**Fix in dashboard.ts and notifications.ts:**
- In each public exported function (getDashboardMetrics, getNotificationAlerts, getUpcomingMaintenance, getExpiringDocuments), combine the two separate async calls `requireRole()` + `requireTenantId()` into a single optimized path:
  - Call `getSession()` once, extract role AND tenantId from the same session object (SessionData already contains both `role` and `tenantId` fields).
  - Validate role from the session data directly instead of calling requireRole which calls getSession again.
  - Get tenantId from the same session data instead of calling requireTenantId which reads headers().
  - This cuts session decrypts from 2 per function to 1, and eliminates the headers() call entirely.

Create a small helper in each file (or inline):
```typescript
async function getAuthContext(): Promise<{ tenantId: string }> {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized: Authentication required');
  const role = session.role as UserRole;
  if (role !== UserRole.OWNER && role !== UserRole.MANAGER) {
    throw new Error('Unauthorized: Required roles: OWNER, MANAGER');
  }
  if (!session.tenantId) {
    throw new Error('Tenant context is required');
  }
  return { tenantId: session.tenantId };
}
```

Then replace:
```typescript
// Before (2 async calls, 2 session decrypts):
await requireRole([UserRole.OWNER, UserRole.MANAGER]);
const tenantId = await requireTenantId();

// After (1 async call, 1 session decrypt):
const { tenantId } = await getAuthContext();
```

Apply this to all 4 exported dashboard/notification functions. Do NOT change the non-dashboard functions (sendLoadUpdateNotification, sendETANotification) as those are actual server actions called from client components and need the existing auth pattern.

Import getSession from '@/lib/auth/session' in both files.
  </action>
  <verify>
Run `npx tsc --noEmit` to verify no type errors.
Run `npm run build` (or `npx next build`) to verify the build succeeds.
Manually verify by reading the modified files that:
- page.tsx no longer has requireRole() call
- Each dashboard data function calls getSession() only once
- Auth is still enforced in each data function
  </verify>
  <done>
Dashboard page returns JSX immediately without blocking auth call.
Each data-fetching function decrypts the session cookie exactly once (down from 2+ times).
Total session decrypts per dashboard load reduced from ~9 to ~4 (one per data function).
Build passes with no errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Verify Suspense streaming works and measure improvement</name>
  <files>
    src/app/(owner)/dashboard/page.tsx
  </files>
  <action>
After Task 1 changes, verify the Suspense streaming behavior is correct:

1. Start the dev server (`npm run dev`) and navigate to /dashboard
2. Open browser DevTools Network tab and check:
   - The initial HTML response should contain the header ("Dashboard" + date) and skeleton placeholders
   - Data sections should stream in as they resolve
3. Check the terminal/server logs for any errors from the data-fetching functions

If the page still shows a blank white screen, investigate whether the issue is:
- The OwnerShell component in layout.tsx doing something blocking (unlikely since it just wraps children)
- CSS/hydration issues causing a flash

Also add a small performance improvement to page.tsx: make `DashboardPage` a regular (non-async) function since it no longer awaits anything. The date formatting is synchronous. This removes it from the async server component path entirely, making it render as fast as possible.

```typescript
// Change from:
export default async function DashboardPage() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]); // REMOVED
  const currentDate = new Date().toLocaleDateString(...);
  return (...);
}

// Change to:
export default function DashboardPage() {
  const currentDate = new Date().toLocaleDateString(...);
  return (...);
}
```

This is valid because all data fetching is inside the Suspense-wrapped async child components.
  </action>
  <verify>
Run `npm run dev` and visit http://localhost:3000/dashboard (or whatever the dev URL is).
Confirm: header + skeletons appear immediately, data streams in within 1-3 seconds.
Run `npm run build` to confirm production build works.
  </verify>
  <done>
Dashboard renders header and skeletons instantly on navigation.
Data sections stream in independently as queries resolve.
No blank white screen on load.
Build passes cleanly.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors
- `npm run build` completes successfully
- Dashboard page.tsx has no `await` calls at the page component level
- Each data function in dashboard.ts and notifications.ts has exactly one `getSession()` call
- Auth is still enforced in each data function (defense in depth maintained)
- Suspense skeletons render immediately on page load
</verification>

<success_criteria>
- Dashboard shows header + skeleton fallbacks instantly (no blank white screen)
- Data sections stream in independently within 1-3 seconds
- Session cookie decrypted ~4 times per load instead of ~9
- All auth checks maintained (layout + individual data functions)
- Build passes with no type or compilation errors
</success_criteria>

<output>
After completion, create `.planning/quick/29-fix-dashboard-slow-loading-performance-i/29-SUMMARY.md`
</output>
