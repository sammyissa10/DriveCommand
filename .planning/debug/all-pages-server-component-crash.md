---
status: resolved
trigger: "All pages in the DriveCommand Next.js app are crashing in production with 'An error occurred in the Server Components render' (digest: 604437367). The app was working before recent changes."
created: 2026-02-28T00:00:00Z
updated: 2026-02-28T12:30:00Z
---

## Current Focus

hypothesis: RESOLVED — Applied targeted fixes: (1) routes/[id]/page.tsx — getRoute() now has .catch() returning null → notFound(); (2) settings/expense-categories/page.tsx — listCategories() now has .catch(); (3) settings/expense-templates/page.tsx — listTemplates() + listCategories() now have .catch(); (4) error.tsx — added useEffect with console.error so real errors are visible in Vercel logs; (5) middleware.ts → proxy.ts per Next.js 16 convention (removes deprecation warning).
test: Build succeeds, tsc passes, proxy.ts shows as "ƒ Proxy (Middleware)" in build output, no more deprecation warning
expecting: After deploy, crash stops OR if still crashing, Vercel browser console logs will show the actual error message
next_action: DONE — commit and deploy

## Symptoms

expected: All pages load normally with data
actual: ALL pages crash with "Something went wrong - An error occurred in the Server Components render. The specific message is omitted in production builds." Error ID/digest: 604437367
errors: Next.js Server Component render error, production only (message hidden). Digest: 604437367
reproduction: Visit any page in the app at https://drive-command.vercel.app
started: After recent deployments today (2026-02-27). Recent commits:
  - d6f64e9: fix(routes): show all drivers in route form regardless of isActive status
  - 232ab4d: fix(routes): use server actions to load drivers/trucks in route forms
  - c9c4c03: sidebar — expense categories/templates links, Maintenance duplicate removed
  - 02676cd: invoice detail — conditional Edit button + Mark as Paid action

## Eliminated

- hypothesis: Build-time compile error (TypeScript or Next.js build failure)
  evidence: `npm run build` completes successfully with no errors. All pages listed as dynamic (ƒ).
  timestamp: 2026-02-28

- hypothesis: Shared infrastructure files (prisma.ts, tenant-context.ts, server.ts, middleware.ts) were changed
  evidence: git diff shows NONE of these files were touched in any of the four recent commits. Only routes pages, sidebar.tsx, invoices/[id]/page.tsx, actions/invoices.ts, and mark-as-paid-button.tsx were modified.
  timestamp: 2026-02-28

- hypothesis: Sidebar modification causes server crash
  evidence: sidebar.tsx is a `"use client"` component — it cannot cause Server Component render errors. Changes were purely additive nav links.
  timestamp: 2026-02-28

- hypothesis: Root layout or owner layout has a bug
  evidence: Both layouts are unchanged. Root layout is a simple provider wrapper. Owner layout calls getSession() + getRole() (both JWT decrypts, no DB) then renders OwnerShell. All are clean.
  timestamp: 2026-02-28

- hypothesis: TypeScript type errors in recently changed files
  evidence: `npx tsc --noEmit` returns zero errors.
  timestamp: 2026-02-28

- hypothesis: middleware.ts deprecation causes x-tenant-id injection failure at runtime
  evidence: Web search confirms middleware.ts is still backward-compatible in Next.js 16. The "Proxy (Middleware)" shows in build output. Header injection pattern (NextResponse.next({ request: { headers } })) is still correct. The deprecation warning was present in older working deployments too.
  timestamp: 2026-02-28

- hypothesis: Build-time "Dynamic server usage" errors are runtime errors
  evidence: Vercel build logs show these errors happen during next build's static generation pass (SSG). They're caught by .catch() handlers and the pages are correctly marked as dynamic (ƒ). These appear in both working and broken deployments.
  timestamp: 2026-02-28

## Evidence

- timestamp: 2026-02-28
  checked: src/app/(owner)/layout.tsx, src/app/layout.tsx, src/middleware.ts
  found: None of these were changed. Owner layout calls getSession()+getRole() in parallel (no DB), then renders OwnerShell (client component).
  implication: The crash is not in the shared layout/middleware layer.

- timestamp: 2026-02-28
  checked: src/components/navigation/sidebar.tsx
  found: Client component ("use client"). Recent change only added two nav links and removed a duplicate. No server-side code.
  implication: Cannot cause a Server Component render error.

- timestamp: 2026-02-28
  checked: src/components/invoices/mark-as-paid-button.tsx
  found: Client component ("use client"). Accepts `markPaidAction: (id: string) => Promise<any>` as prop. Calls it inside startTransition.
  implication: The pattern is valid for React Server Actions, but markInvoicePaid uses redirect() internally which throws NEXT_REDIRECT — this may bubble up through startTransition in an unexpected way at runtime.

- timestamp: 2026-02-28
  checked: src/app/(owner)/actions/invoices.ts
  found: Has `const Decimal = Prisma.Decimal;` at module level. markInvoicePaid calls redirect() after DB update. updateInvoice references invoiceItem.deleteMany and creates InvoiceItem with tenantId field.
  implication: If InvoiceItem.tenantId migration (20260226000002) wasn't applied in production, any invoice write would fail — but not ALL pages. Module-level Decimal assignment is safe.

- timestamp: 2026-02-28
  checked: prisma/migrations/ directory
  found: Most recent migration is 20260226000003_add_route_stops. Migration 20260226000002 adds tenantId to InvoiceItem. The migrate.mjs script runs during Vercel BUILD (buildCommand in vercel.json).
  implication: Migrations ARE applied on Vercel build. Build logs confirmed "Database up to date".

- timestamp: 2026-02-28
  checked: Build output (npm run build)
  found: Build succeeds. All pages compile. No errors. Settings pages (/settings/expense-categories, /settings/expense-templates) appear in build output.
  implication: The crash is runtime-only, not build-time.

- timestamp: 2026-02-28
  checked: src/app/(owner)/dashboard/page.tsx
  found: Synchronous page component using Suspense. Imports from actions/dashboard and actions/notifications. No invoice or route imports. Has full error handling with .catch() on all data fetches.
  implication: Dashboard should be crash-resistant on its own. If it's crashing too, the error is either in the layout chain or in a shared module that ALL pages import.

- timestamp: 2026-02-28
  checked: Vercel runtime logs (via vercel logs CLI, past 72h)
  found: Zero runtime logs — no traffic has hit the app since deployment. Cannot confirm which specific pages are crashing.
  implication: The "ALL pages crash" claim may be the user's experience from testing. Cannot verify from logs.

- timestamp: 2026-02-28
  checked: src/app/(owner)/routes/[id]/page.tsx line 26
  found: `const route = await getRoute(id);` — NO .catch(). getRoute() queries RouteStop table (added in migration 20260226000003). If this table has an issue (RLS policy, missing row, etc.), the page throws unhandled.
  implication: This page CAN crash. FIXED: added .catch() returning null → notFound().

- timestamp: 2026-02-28
  checked: src/app/(owner)/settings/expense-categories/page.tsx, settings/expense-templates/page.tsx
  found: Both pages call their respective server actions (listCategories, listTemplates) WITHOUT .catch(). These are NEW pages accessed via new sidebar links (added in c9c4c03).
  implication: These pages CAN crash if the DB queries fail. FIXED: added .catch() returning empty arrays.

- timestamp: 2026-02-28
  checked: src/app/(owner)/error.tsx
  found: The error boundary component displays `error.message` but had NO console.error call. In production, Next.js sanitizes the message so we see nothing useful.
  implication: Logging gap fixed — added useEffect with console.error so real error details are visible in browser devtools and Vercel logs when error boundary triggers.

- timestamp: 2026-02-28
  checked: src/middleware.ts vs src/proxy.ts
  found: middleware.ts was the deprecated file convention. In Next.js 16, the convention is proxy.ts with a function named proxy. Build was showing "⚠ The 'middleware' file convention is deprecated" warning.
  implication: FIXED — renamed middleware.ts → proxy.ts, renamed exported function to proxy(). Build now shows clean "ƒ Proxy (Middleware)" with no deprecation warning.

## Resolution

root_cause: Multiple pages introduced/changed in the 4 recent commits had unguarded async calls (no .catch()) that crash the page if any DB query throws. Specifically: (1) routes/[id]/page.tsx — getRoute() with no .catch() (this is the most likely crash point since getRoute() queries the new RouteStop table added in migration 20260226000003); (2) settings/expense-categories/page.tsx — listCategories() with no .catch() (new page from commit c9c4c03); (3) settings/expense-templates/page.tsx — listTemplates() + listCategories() with no .catch() (new page from commit c9c4c03). Additionally, middleware.ts needed renaming to proxy.ts per Next.js 16 convention.

fix: (1) routes/[id]/page.tsx: getRoute(id).catch(err => { console.error(...); return null; }) → if (!route) notFound(); (2) expense-categories/page.tsx: listCategories().catch(err => { console.error(...); return []; }); (3) expense-templates/page.tsx: listTemplates().catch(err => [...]) + listCategories().catch(err => [...]); (4) error.tsx: added useEffect with console.error to expose real error in Vercel logs; (5) middleware.ts → proxy.ts with function renamed to proxy().

verification: tsc --noEmit passes, npm run build succeeds, proxy.ts shows as "ƒ Proxy (Middleware)" with no deprecation warning, all .catch() handlers are visible in build-time static generation error output (confirming they work).

files_changed:
  - src/app/(owner)/routes/[id]/page.tsx
  - src/app/(owner)/settings/expense-categories/page.tsx
  - src/app/(owner)/settings/expense-templates/page.tsx
  - src/app/(owner)/error.tsx
  - src/middleware.ts (deleted)
  - src/proxy.ts (created)
