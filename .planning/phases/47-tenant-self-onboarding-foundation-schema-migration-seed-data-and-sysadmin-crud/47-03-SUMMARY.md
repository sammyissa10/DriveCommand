---
plan: "47-03"
phase: "47"
status: complete
completed_at: "2026-04-29"
---

# 47-03 Summary: SysAdmin Plans and Promos CRUD UI

## What was built

**Server actions** (`apps/web/src/app/(admin)/actions/`):
- `plans.ts` — `getPlans`, `getPlanById`, `createPlan`, `updatePlan` with Zod validation + `requireAdminAccess()`
- `promos.ts` — `getPromos`, `createPromo` with Zod validation + `requireAdminAccess()`

**Admin navigation** (`layout.tsx`): Plans and Promos nav links added to the SysAdmin sidebar.

**Plans UI** (`src/app/(admin)/plans/`):
- `page.tsx` + `plans-list-client.tsx` — table with Key, Name, Price/mo, Trial Days, Max Trucks, Max Users, Status, Edit link
- `new/page.tsx` + `new/new-plan-form.tsx` — create form (key auto-lowercased, all fields, isActive checkbox)
- `[id]/page.tsx` + `[id]/edit-plan-form.tsx` — edit form (key read-only, all other fields editable, isActive toggle)

**Promos UI** (`src/app/(admin)/promos/`):
- `page.tsx` + `promos-list-client.tsx` — table with Code, Description, +Days, Discount, Active From, Active To, Used/Max, Status badge
- `new/page.tsx` + `new/new-promo-form.tsx` — create form (code auto-uppercased, bonus trial days, discount %, date range, max redemptions)

## Commits
- `63f3aba` — actions + admin nav (from Wave 3 executor)
- `49e4299` — all 10 UI files (Plans + Promos pages)

## Verification
- TypeScript: `tsc --noEmit` passes clean
- No delete button on plans (isActive toggle is the deactivation path)
- `requireAdminAccess()` guards all server actions
- All money handled as integers (cents), converted to/from dollars in UI
- Promos code auto-uppercased at form level and schema level
