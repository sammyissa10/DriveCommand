---
phase: quick-6
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(owner)/actions/trucks.ts
  - src/app/(owner)/trucks/[id]/page.tsx
  - src/app/(owner)/routes/new/page.tsx
  - src/app/(owner)/routes/[id]/page.tsx
autonomous: true
must_haves:
  truths:
    - "Saving a new truck succeeds and redirects to the truck detail page"
    - "Opening a truck detail page renders without server-side errors"
    - "Driver dropdown on new route form shows active drivers"
    - "Driver dropdown on route edit form shows active drivers"
  artifacts:
    - path: "src/app/(owner)/actions/trucks.ts"
      provides: "Error-safe createTruck and updateTruck server actions"
    - path: "src/app/(owner)/trucks/[id]/page.tsx"
      provides: "Error-safe truck detail page"
    - path: "src/app/(owner)/routes/new/page.tsx"
      provides: "Routes new page with working driver query"
    - path: "src/app/(owner)/routes/[id]/page.tsx"
      provides: "Route detail page with working driver query in edit mode"
  key_links:
    - from: "src/app/(owner)/actions/trucks.ts"
      to: "prisma.truck.create"
      via: "try/catch with user-friendly error return"
      pattern: "try.*prisma\\.truck\\.create"
    - from: "src/app/(owner)/routes/new/page.tsx"
      to: "prisma.user.findMany"
      via: "driver query with correct role filter"
      pattern: "role.*DRIVER"
---

<objective>
Fix three production bugs and improve error handling: (1) truck save errors caused by unhandled database exceptions in createTruck/updateTruck server actions, (2) truck view page errors from potential unhandled exceptions in data fetching, and (3) routes driver dropdown not populating because the driver query may return empty results or throw errors.

Purpose: Eliminate server-side exceptions that show generic "Application error" pages to users.
Output: Error-safe truck CRUD actions, robust truck detail page, working driver dropdown on route forms.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/(owner)/actions/trucks.ts
@src/app/(owner)/trucks/[id]/page.tsx
@src/app/(owner)/trucks/new/page.tsx
@src/app/(owner)/routes/new/page.tsx
@src/app/(owner)/routes/[id]/page.tsx
@src/components/trucks/truck-form.tsx
@src/components/routes/route-form.tsx
@src/lib/validations/truck.schemas.ts
@src/lib/context/tenant-context.ts
@src/lib/auth/server.ts
@prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix truck save and view errors with proper error handling</name>
  <files>
    src/app/(owner)/actions/trucks.ts
    src/app/(owner)/trucks/[id]/page.tsx
  </files>
  <action>
**In `src/app/(owner)/actions/trucks.ts`:**

1. Wrap the `prisma.truck.create` call in `createTruck` (lines 66-73) in a try/catch block. The `revalidatePath` and `redirect` calls MUST remain OUTSIDE the try/catch (Next.js redirect throws a special NEXT_REDIRECT error that must not be caught).

   Pattern:
   ```typescript
   let truckId: string;
   try {
     const tenantId = await requireTenantId();
     const prisma = await getTenantPrisma();
     const truck = await prisma.truck.create({
       data: {
         ...result.data,
         tenantId,
       },
     });
     truckId = truck.id;
   } catch (error: any) {
     // Handle Prisma unique constraint violation (P2002) for VIN
     if (error?.code === 'P2002') {
       const target = error?.meta?.target;
       if (Array.isArray(target) && target.includes('vin')) {
         return { error: { vin: ['A truck with this VIN already exists'] } };
       }
       return { error: 'A truck with these details already exists. Please check for duplicates.' };
     }
     console.error('Failed to create truck:', error);
     return { error: 'Failed to create truck. Please try again.' };
   }

   // Revalidate and redirect OUTSIDE try/catch
   revalidatePath('/trucks');
   redirect(`/trucks/${truckId}`);
   ```

2. Apply the same pattern to `updateTruck` (lines 133-143): wrap the `prisma.truck.update` in try/catch, handle P2002 for VIN uniqueness, keep redirect outside.

   Pattern:
   ```typescript
   let updatedTruckId: string;
   try {
     const prisma = await getTenantPrisma();
     const truck = await prisma.truck.update({
       where: { id },
       data: result.data,
     });
     updatedTruckId = truck.id;
   } catch (error: any) {
     if (error?.code === 'P2002') {
       const target = error?.meta?.target;
       if (Array.isArray(target) && target.includes('vin')) {
         return { error: { vin: ['A truck with this VIN already exists'] } };
       }
       return { error: 'A truck with these details already exists. Please check for duplicates.' };
     }
     console.error('Failed to update truck:', error);
     return { error: 'Failed to update truck. Please try again.' };
   }

   revalidatePath('/trucks');
   revalidatePath(`/trucks/${id}`);
   redirect(`/trucks/${updatedTruckId}`);
   ```

3. Also wrap the `requireRole` call in both actions so auth errors return a user-friendly message instead of an unhandled throw. Actually -- do NOT catch requireRole errors. Those are intentional security guards. The error boundary page at `src/app/(owner)/error.tsx` should handle auth errors. The database operations are the ones that need try/catch.

**In `src/app/(owner)/trucks/[id]/page.tsx`:**

4. Wrap the `listDocuments` call (line 22) in a try/catch so that if S3/document listing fails, the truck detail page still renders (just without the documents section).

   Change:
   ```typescript
   // Fetch documents for this truck (non-blocking - page renders even if this fails)
   let documents: any[] = [];
   try {
     documents = await listDocuments('truck', id);
   } catch (error) {
     console.error('Failed to load truck documents:', error);
   }
   ```

   This prevents the entire truck detail page from crashing when document listing throws.
  </action>
  <verify>
    Run `npx tsc --noEmit` to confirm no type errors. Run `npm run build` to verify the pages compile without errors. Visually confirm the try/catch blocks are correctly structured with redirect() outside them.
  </verify>
  <done>
    createTruck returns field-level errors for duplicate VIN and generic error message for other database failures instead of throwing unhandled exceptions. updateTruck has the same error handling. Truck detail page renders even when document listing fails.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix routes driver dropdown and add error resilience</name>
  <files>
    src/app/(owner)/routes/new/page.tsx
    src/app/(owner)/routes/[id]/page.tsx
  </files>
  <action>
**In `src/app/(owner)/routes/new/page.tsx`:**

1. The current driver query on line 10-19 queries `prisma.user.findMany({ where: { role: 'DRIVER', isActive: true } })`. The issue is likely that the query is throwing an error (possibly RLS-related or auth-related) which crashes the entire page instead of showing an empty dropdown. Wrap the driver and truck queries in try/catch blocks:

   ```typescript
   const prisma = await getTenantPrisma();

   let drivers: Array<{ id: string; firstName: string | null; lastName: string | null }> = [];
   let trucks: Array<{ id: string; make: string; model: string; year: number; licensePlate: string }> = [];

   try {
     [drivers, trucks] = await Promise.all([
       prisma.user.findMany({
         where: {
           role: 'DRIVER',
           isActive: true,
         },
         select: {
           id: true,
           firstName: true,
           lastName: true,
         },
         orderBy: { firstName: 'asc' },
       }),
       prisma.truck.findMany({
         select: {
           id: true,
           make: true,
           model: true,
           year: true,
           licensePlate: true,
         },
         orderBy: { year: 'desc' },
       }),
     ]);
   } catch (error) {
     console.error('Failed to load drivers/trucks for route form:', error);
     // Continue with empty arrays - form will show "No drivers available" / "No trucks available"
   }
   ```

   Also add `orderBy` to both queries so results are alphabetically/chronologically sorted.

2. Additionally, check if the `role` filter value matches the Prisma enum. The schema uses `UserRole` enum. The query `role: 'DRIVER'` should work since Prisma accepts string literals matching enum values. However, verify by checking the `UserRole` enum definition in the schema to ensure `DRIVER` is a valid value.

**In `src/app/(owner)/routes/[id]/page.tsx`:**

3. Apply the same error-resilient pattern to the edit mode driver/truck query (lines 51-62). The existing code already initializes empty arrays and only queries in edit mode, which is good. But wrap the `Promise.all` in try/catch:

   ```typescript
   if (isEditMode) {
     try {
       const prisma = await getTenantPrisma();
       [drivers, trucks] = await Promise.all([
         prisma.user.findMany({
           where: { role: 'DRIVER', isActive: true },
           select: { id: true, firstName: true, lastName: true },
           orderBy: { firstName: 'asc' },
         }),
         prisma.truck.findMany({
           select: { id: true, make: true, model: true, year: true, licensePlate: true },
           orderBy: { year: 'desc' },
         }),
       ]);
     } catch (error) {
       console.error('Failed to load drivers/trucks for route edit:', error);
     }
   }
   ```

4. Also add error handling around the `listDocuments` call in the Promise.all on line 32-40 so that a document listing failure doesn't crash the entire route detail page. Separate the `listDocuments` call from the main Promise.all or add a .catch:

   Replace the Promise.all to use `.catch` on `listDocuments`:
   ```typescript
   const [documents, expenses, payments, categories, templates, analytics] =
     await Promise.all([
       listDocuments('route', id).catch((err) => {
         console.error('Failed to load route documents:', err);
         return [] as any[];
       }),
       listExpenses(id),
       listPayments(id),
       listExpenseCategories(),
       listTemplates(),
       getRouteFinancialAnalytics(id),
     ]);
   ```
  </action>
  <verify>
    Run `npx tsc --noEmit` to confirm no type errors. Run `npm run build` to verify compilation. Check that the route form's driver dropdown interface matches the data shape returned by the queries (id, firstName, lastName).
  </verify>
  <done>
    Routes new page and route edit page load drivers without crashing even if the query fails. Driver dropdown shows drivers when they exist in the tenant, or shows "No drivers available" gracefully when empty. Document listing failures don't crash the route detail page.
  </done>
</task>

</tasks>

<verification>
1. `npm run build` completes without errors
2. All truck and route pages compile successfully
3. No unhandled promise rejections in truck save/update/view flows
4. Route form driver dropdown renders (empty state or populated)
</verification>

<success_criteria>
- Saving a new truck with valid data succeeds and redirects to truck detail
- Saving a truck with a duplicate VIN shows a field-level error ("A truck with this VIN already exists")
- Saving a truck that hits any other database error shows a generic "Failed to create truck" message (not a full-page crash)
- Truck detail page renders successfully for existing trucks
- Truck detail page still renders even if document listing fails
- Routes new form driver dropdown shows active drivers from the tenant
- Route detail edit form driver dropdown shows active drivers
- Route detail page renders even if document listing fails
</success_criteria>

<output>
After completion, create `.planning/quick/6-fix-truck-save-view-errors-improve-truck/6-SUMMARY.md`
</output>
