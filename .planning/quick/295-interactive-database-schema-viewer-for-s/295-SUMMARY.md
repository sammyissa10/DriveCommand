---
phase: quick-295
plan: 01
subsystem: admin-docs
tags: [database, schema, documentation, prisma, sysadmin]
dependency_graph:
  requires: []
  provides: [database-schema-viewer, prisma-parser-utility]
  affects: [sysadmin-docs, developer-docs]
tech_stack:
  added: [prisma-schema-parsing, runtime-schema-introspection]
  patterns: [dynamic-schema-parsing, module-grouping, relation-mapping]
key_files:
  created:
    - apps/web/src/lib/docs/prisma-parser.ts
    - apps/web/src/app/(admin)/docs/database/page.tsx
    - apps/web/src/app/(admin)/docs/database/[model]/page.tsx
  modified:
    - apps/web/src/app/(admin)/docs/layout.tsx
decisions:
  - summary: Parse Prisma schema at runtime with module-level caching
    rationale: Build-time parsing would require complex build step; runtime parsing with caching is simple and fast enough for admin tool
  - summary: Use regex-based parser instead of @prisma/internals
    rationale: Avoid heavy dependency for simple use case; regex sufficient for schema structure extraction
  - summary: Compute incoming relations dynamically from schema
    rationale: Prisma doesn't explicitly define reverse relations; calculate by scanning all models
  - summary: Group models into 14 logical modules (Auth, Fleet, Dispatch, Finance, etc.)
    rationale: Makes 80 models navigable; hardcoded mapping ensures consistency
metrics:
  duration: 283s
  tasks_completed: 3
  files_created: 3
  files_modified: 1
  completed_at: "2026-05-10T02:26:00Z"
---

# Quick Task 295: Interactive Database Schema Viewer for SysAdmins

**One-liner:** Visual database schema browser parsing 80 Prisma models into grouped cards with searchable detail pages showing fields, relations, cascade behaviors, and feature usages.

## What Was Built

Created an interactive database documentation system at `/docs/database` that dynamically parses the Prisma schema and presents all 80 models grouped by module with clickable detail pages.

### Components Delivered

**1. Prisma Schema Parser (`apps/web/src/lib/docs/prisma-parser.ts`)**
- Runtime parser using regex to extract models and enums from schema.prisma
- Parses field attributes: `@id`, `@unique`, `@default`, `@db.*`
- Parses relation attributes: `onDelete`, `onUpdate`, `relationName`
- Module assignment logic mapping models to 14 categories
- Module-level caching for performance (parse once per server restart)
- Exports: `parsePrismaSchema()`, `PrismaModel`, `PrismaField`, `PrismaRelation`, `PrismaEnum`

**2. Main Schema Page (`/docs/database`)**
- Displays all 80 models grouped into 14 collapsible modules
- Module groups: Auth, Fleet, Dispatch, Finance, Compliance, CRM, Support, Integrations, Notifications, Carrier Ops, Workflow, Billing, Analytics, HOS/Incidents, Messaging, Other
- ModelCard component showing:
  - Field count and relation count badges
  - First 4 key fields as preview
  - Cascade delete warning icon if present
  - Click-through to detail page
- Search/filter functionality across all models
- Enums section showing all 64 enums with value counts
- Sidebar navigation link added

**3. Model Detail Pages (`/docs/database/[model]`)**
- Full field table with columns: Name, Type, Required, Default, Constraints
- Field constraint badges: `@id`, `@unique`, `@db.Uuid`, etc.
- Outgoing relations section (what this model references)
- Incoming relations section (what references this model) - computed dynamically
- RelationCard component showing:
  - Direction arrows (→ outgoing, ← incoming)
  - Cardinality badges (one-to-one, one-to-many)
  - Cascade delete warnings (yellow highlight, destructive badge)
  - Links to related model pages
- Feature usages section linking to feature registry docs
- Static generation for all 80 models at build time
- Next.js 16 async params support

### Module Groupings

| Module         | Model Count | Key Models                                          |
| -------------- | ----------- | --------------------------------------------------- |
| Auth           | 3           | User, Tenant, DriverInvitation                      |
| Fleet          | 7           | Truck, Driver, GPSLocation, SafetyEvent, FuelRecord |
| Dispatch       | 6           | Route, RouteStop, Load, RouteTemplate               |
| Finance        | 8           | Invoice, InvoiceItem, PayrollRecord, RouteExpense   |
| Compliance     | 1           | Document                                            |
| CRM            | 4           | Customer, CustomerInteraction, Tag                  |
| Support        | 2           | SupportTicket, TicketMessage                        |
| Integrations   | 2           | TenantIntegration, PushToken                        |
| Notifications  | 2           | NotificationLog, InAppNotification                  |
| Carrier Ops    | 11          | CarrierClient, CarrierDriver, DriverPayRecord       |
| Workflow       | 6           | Playbook, StepTemplate, PlaybookInstance            |
| Billing        | 3           | Subscription, ActivationProgress, SysAdminInvoice   |
| Analytics      | 5           | AutomationRule, TenantMetricsDaily                  |
| HOS/Incidents  | 2           | DriverHOSEntry, DriverIncident                      |
| Messaging      | 1           | FleetMessage                                        |
| Other          | ~17         | (Unmapped models)                                   |

## Implementation Highlights

**Regex-Based Parsing**
```typescript
// Extract model blocks
const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;

// Extract field attributes
const isId = trimmed.includes('@id');
const defaultMatch = trimmed.match(/@default\((.*?)\)/);
const dbMatch = trimmed.match(/@db\.(\w+)/);
```

**Incoming Relations Algorithm**
```typescript
// Scan all models to find relations targeting current model
for (const otherModel of schema.models) {
  for (const relation of otherModel.relations) {
    if (relation.targetModel === model.name) {
      incomingRelations.push({ sourceModel: otherModel.name, ... });
    }
  }
}
```

**Cascade Delete Warnings**
- Yellow highlight on RelationCard
- AlertTriangle icon on ModelCard
- Destructive badge on detail page
- Helps SysAdmins identify data loss risks

## Deviations from Plan

None - plan executed exactly as written. All 3 tasks completed without blocking issues.

## Verification Results

✅ TypeScript compilation passes (no errors in new files)
✅ parsePrismaSchema() extracts 80 models and 64 enums
✅ All models grouped into logical modules
✅ Search/filter works across all modules
✅ Model cards show field/relation counts and preview
✅ Detail pages show complete field info with constraints
✅ Relations computed correctly (outgoing + incoming)
✅ Feature usages link to feature docs
✅ Sidebar includes "Database Schema" link
✅ Static generation configured for all 80 model pages
✅ Next.js 16 async params compliance

## Usage Examples

**For SysAdmins:**
1. Navigate to `/docs/database`
2. Browse models by module or use search
3. Click a model card (e.g., "User")
4. View all fields, see what references User (incoming: Driver, CarrierDriver, etc.)
5. Click relation links to explore connected models
6. See which features use this model

**For Developers:**
- Quick reference for field types and constraints
- Understand cascade delete implications before migrations
- Map features to database models
- Explore schema dependencies

## Files Created/Modified

**Created:**
- `/Users/ayazmohammed/DriveCommand/apps/web/src/lib/docs/prisma-parser.ts` (288 lines)
- `/Users/ayazmohammed/DriveCommand/apps/web/src/app/(admin)/docs/database/page.tsx` (216 lines)
- `/Users/ayazmohammed/DriveCommand/apps/web/src/app/(admin)/docs/database/[model]/page.tsx` (295 lines)

**Modified:**
- `/Users/ayazmohammed/DriveCommand/apps/web/src/app/(admin)/docs/layout.tsx` (added Database Schema link)

**Total:** 799 lines added across 4 files

## Self-Check

Verifying all claims in this summary:

**Files created:**
```
✓ FOUND: apps/web/src/lib/docs/prisma-parser.ts
✓ FOUND: apps/web/src/app/(admin)/docs/database/page.tsx
✓ FOUND: apps/web/src/app/(admin)/docs/database/[model]/page.tsx
```

**Commits created:**
```
✓ FOUND: 4f192f17 (Task 1: Prisma schema parser utility)
✓ FOUND: 880af992 (Task 2: Database schema overview page)
✓ FOUND: 4f9bc289 (Task 3: Model detail pages)
```

**Schema parsing verification:**
```
✓ parsePrismaSchema() returns 80 models
✓ parsePrismaSchema() returns 64 enums
```

## Self-Check: PASSED

All files exist, all commits created, parser working correctly. Ready for deployment.
