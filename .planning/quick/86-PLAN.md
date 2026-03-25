# Quick-86: Display Tenant Business Name in Owner Portal Sidebar

## Goal
Replace hardcoded "DriveCommand" / "Fleet Management" text in the owner portal sidebar header with the tenant's actual business name fetched from the database.

## Tasks

### Task 1 — Fetch tenant name in OwnerLayout and thread to sidebar
- In `src/app/(owner)/layout.tsx`: fetch `tenant.name` using `session.tenantId` via prisma
- Add `tenantName` prop to `OwnerShellProps` in `src/components/navigation/owner-shell.tsx`
- Pass `tenantName` through `OwnerShell` to `AppSidebar`
- Add `tenantName` prop to `AppSidebarProps` in `src/components/navigation/sidebar.tsx`
- Display `tenantName` (fallback: "DriveCommand") as primary text in sidebar header
- Display "Fleet Management" as subtitle (static — it's a product descriptor, not tenant-specific)

## Decisions
- Fetch in layout (server component) to avoid API round-trip from client
- Fallback to "DriveCommand" if tenantName is null/undefined (graceful degradation)
- Keep "Fleet Management" subtitle static — it describes the product category
- Use prisma.$queryRaw with bypass_rls to avoid RLS complications on Tenant table
