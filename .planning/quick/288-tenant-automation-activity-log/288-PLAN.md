---
phase: 288-tenant-automation-activity-log
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/prisma/migrations/20260428100001_add_playbook_instance_triggered_by/migration.sql
  - apps/web/src/server/services/workflows/generatePlaybookInstance.ts
  - apps/web/src/server/services/workflows/fireEvent.ts
  - apps/web/src/server/api/routers/workflows/trigger.ts
  - apps/web/src/app/(owner)/checklists/automation/_components/AutomationClient.tsx
  - apps/web/src/app/(owner)/checklists/automation/_components/AutomationActivityLog.tsx
autonomous: true

must_haves:
  truths:
    - "Owner sees an Activity feed on /checklists/automation showing the most recent 50 auto-start events"
    - "Each entry shows: trigger event (e.g. ON_DRIVER_CREATE), playbook name, entity name (driver/truck/load), timestamp"
    - "Entries are tenant-scoped and ordered most-recent first"
    - "Manual instance creations do not appear in the activity feed (trigger-spawned only)"
    - "When fireEvent spawns a PlaybookInstance via a trigger, the trigger event is captured on the instance row"
  artifacts:
    - path: "apps/web/prisma/schema.prisma"
      provides: "PlaybookInstance.triggeredBy + triggeredEvent fields"
      contains: "triggeredBy"
    - path: "apps/web/src/server/api/routers/workflows/trigger.ts"
      provides: "listActivityLog tRPC procedure"
      contains: "listActivityLog"
    - path: "apps/web/src/app/(owner)/checklists/automation/_components/AutomationActivityLog.tsx"
      provides: "Read-only activity feed UI"
      min_lines: 60
  key_links:
    - from: "apps/web/src/server/services/workflows/fireEvent.ts"
      to: "generatePlaybookInstance"
      via: "passes triggerEvent so it can be persisted on instance"
      pattern: "triggeredEvent.*event"
    - from: "apps/web/src/app/(owner)/checklists/automation/_components/AutomationClient.tsx"
      to: "AutomationActivityLog"
      via: "rendered as a third section below Custom Rules"
      pattern: "<AutomationActivityLog"
    - from: "apps/web/src/app/(owner)/checklists/automation/_components/AutomationActivityLog.tsx"
      to: "trpc.workflows.trigger.listActivityLog"
      via: "TanStack Query"
      pattern: "listActivityLog\\.queryOptions"
---

<objective>
Add a tenant-scoped automation activity log on the Auto-Start Rules page so owners can see every checklist that fired automatically — what triggered it, what playbook ran, on which entity, and when.

Purpose: Transparency for tenants over their automation. Required by spec Section 14 Phase 5: "Tenant account page: automation activity log". Without this, owners cannot audit whether their auto-start rules are firing as expected.

Output:
- Two new fields on `PlaybookInstance` (`triggeredBy`, `triggeredEvent`) so trigger-spawned instances can be distinguished from manual ones and the firing event is captured.
- A new `listActivityLog` tRPC procedure on the trigger router returning the most recent 50 trigger-spawned instances with playbook + entity name resolved.
- A read-only `AutomationActivityLog` section on `/checklists/automation` rendering the feed.

NO new Prisma model — we reuse `PlaybookInstance` (constraint honored). Two columns added, justified by spec scope and the impossibility of distinguishing trigger-vs-manual instances otherwise.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@docs/specs/DriveCommand_Workflow_Engine_v2.md
@apps/web/prisma/schema.prisma
@apps/web/src/server/services/workflows/fireEvent.ts
@apps/web/src/server/services/workflows/generatePlaybookInstance.ts
@apps/web/src/server/api/routers/workflows/trigger.ts
@apps/web/src/app/(owner)/checklists/automation/page.tsx
@apps/web/src/app/(owner)/checklists/automation/_components/AutomationClient.tsx

# Reference for spec scope:
# Section 14 Phase 5 (line ~1023 of the spec markdown) explicitly lists:
#   "Tenant account page: automation activity log"
# This task implements that line item but surfaces it on the existing
# Auto-Start Rules page instead of a separate "tenant account" page,
# per user direction in the planning context.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Capture trigger metadata on PlaybookInstance</name>
  <files>
    apps/web/prisma/schema.prisma
    apps/web/prisma/migrations/20260428100001_add_playbook_instance_triggered_by/migration.sql
    apps/web/src/server/services/workflows/generatePlaybookInstance.ts
    apps/web/src/server/services/workflows/fireEvent.ts
  </files>
  <action>
Add the smallest possible schema delta to make trigger-spawned instances queryable. NO new model.

**1. Update `apps/web/prisma/schema.prisma`** — extend the `PlaybookInstance` model with two nullable fields:

```prisma
model PlaybookInstance {
  // ...existing fields above...
  triggeredBy       String?            // 'manual' | 'trigger' — null for legacy rows
  triggeredEvent    TriggerEvent?      // Set when triggeredBy='trigger', e.g. ON_DRIVER_CREATE
  // ...existing fields below...

  // ADD this index for the activity log query (tenant + most-recent-first scan)
  @@index([tenantId, triggeredBy, createdAt(sort: Desc)])
}
```

Keep both columns nullable so existing rows are not invalidated. `TriggerEvent` enum already exists (line 2087 area of schema).

**2. Create migration** at `apps/web/prisma/migrations/20260428100001_add_playbook_instance_triggered_by/migration.sql`:

```sql
-- Add trigger metadata to PlaybookInstance for the automation activity log
ALTER TABLE "PlaybookInstance" ADD COLUMN "triggeredBy" TEXT;
ALTER TABLE "PlaybookInstance" ADD COLUMN "triggeredEvent" "TriggerEvent";

CREATE INDEX "PlaybookInstance_tenantId_triggeredBy_createdAt_idx"
  ON "PlaybookInstance" ("tenantId", "triggeredBy", "createdAt" DESC);
```

The migration auto-deploy hook will apply this to Supabase on write.

**3. Persist `triggeredBy` in `generatePlaybookInstance.ts`** — the function already receives `triggeredBy: 'manual' | 'trigger'`. Currently unused. Add it to the create payload AND accept an optional `triggeredEvent: TriggerEvent` parameter:

```ts
export async function generatePlaybookInstance(args: {
  playbookId: string;
  entityType: PlaybookEntityType;
  entityId: string;
  tenantId: string;
  triggeredBy: 'manual' | 'trigger';
  triggeredEvent?: TriggerEvent;   // NEW — only set when triggeredBy='trigger'
}) {
  // ...
  const newInstance = await tx.playbookInstance.create({
    data: {
      // ...existing fields...
      triggeredBy,
      triggeredEvent: triggeredEvent ?? null,
    },
  });
  // ...
}
```

Import `TriggerEvent` from `@/generated/prisma`.

**4. Pass `triggerEvent` from `fireEvent.ts`** to `generatePlaybookInstance`:

```ts
await generatePlaybookInstance({
  playbookId: trigger.playbookId,
  entityType,
  entityId: String(entityData.id),
  tenantId,
  triggeredBy: 'trigger',
  triggeredEvent: event,   // NEW
});
```

**5. Regenerate Prisma client:** `cd apps/web && npx prisma generate`

WHY: `PlaybookNotification` is purpose-built for user notifications and requires a `recipientUserId`, so it cannot represent an auto-start event (no recipient). `DispatchOverrideAudit` is dispatch-specific. A new audit table would be heavier than the 2-column delta this task makes. Storing the data on `PlaybookInstance` is the minimum viable addition and matches existing patterns (the function already accepts `triggeredBy` — it just was not persisted).
  </action>
  <verify>
    - `cd apps/web && npx prisma format` succeeds.
    - `cd apps/web && npx prisma generate` succeeds.
    - Migration applies cleanly (auto-deploy hook).
    - `cd apps/web && npx tsc --noEmit` passes (verifies generatePlaybookInstance + fireEvent typecheck).
    - Grep confirms wiring: `grep -n "triggeredEvent: event" apps/web/src/server/services/workflows/fireEvent.ts` returns the new line.
  </verify>
  <done>
    - PlaybookInstance has `triggeredBy` (text) and `triggeredEvent` (TriggerEvent enum) columns, both nullable.
    - Index `(tenantId, triggeredBy, createdAt DESC)` exists.
    - `generatePlaybookInstance` writes both fields on insert.
    - `fireEvent` passes `triggeredEvent: event` so the firing event is captured.
    - Manual instance creations (any caller passing `triggeredBy: 'manual'`) write `'manual'` and leave `triggeredEvent` null.
  </done>
</task>

<task type="auto">
  <name>Task 2: listActivityLog tRPC procedure + AutomationActivityLog UI</name>
  <files>
    apps/web/src/server/api/routers/workflows/trigger.ts
    apps/web/src/app/(owner)/checklists/automation/_components/AutomationActivityLog.tsx
    apps/web/src/app/(owner)/checklists/automation/_components/AutomationClient.tsx
  </files>
  <action>
Expose the activity log as a tRPC query and render it as a new section on the Auto-Start Rules page.

**1. Add `listActivityLog` to `apps/web/src/server/api/routers/workflows/trigger.ts`**

Add this procedure (alongside `listRecipes`, `listCustomRules`, etc.). Use `adminProcedure` to match the existing security model on this router.

```ts
listActivityLog: adminProcedure.query(async ({ ctx }) => {
  // Most recent 50 trigger-spawned PlaybookInstance rows for this tenant.
  // triggeredBy='trigger' filter is the index match — see Phase 288 migration.
  const instances = await prisma.playbookInstance.findMany({
    where: { tenantId: ctx.tenantId, triggeredBy: 'trigger' },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      createdAt: true,
      triggeredEvent: true,
      entityType: true,
      entityId: true,
      playbook: { select: { id: true, name: true } },
    },
  });

  if (instances.length === 0) return [];

  // Resolve entity display names in batched lookups per entityType
  const driverIds = instances.filter((i) => i.entityType === 'DRIVER').map((i) => i.entityId);
  const vehicleIds = instances.filter((i) => i.entityType === 'VEHICLE').map((i) => i.entityId);
  const partnerIds = instances.filter((i) => i.entityType === 'PARTNER').map((i) => i.entityId);
  const dispatchIds = instances.filter((i) => i.entityType === 'DISPATCH').map((i) => i.entityId);

  const [drivers, vehicles, partners, dispatches] = await Promise.all([
    driverIds.length
      ? prisma.user.findMany({
          where: { id: { in: driverIds }, tenantId: ctx.tenantId },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : Promise.resolve([]),
    vehicleIds.length
      ? prisma.carrierTruck.findMany({
          where: { id: { in: vehicleIds }, orgId: ctx.tenantId },
          select: { id: true, unitNumber: true, vin: true },
        })
      : Promise.resolve([]),
    partnerIds.length
      ? prisma.customer.findMany({
          where: { id: { in: partnerIds }, tenantId: ctx.tenantId },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    dispatchIds.length
      ? prisma.carrierDispatch.findMany({
          where: { id: { in: dispatchIds } },
          select: { id: true, dispatchNumber: true },
        })
      : Promise.resolve([]),
  ]);

  const driverMap = new Map(drivers.map((d) => [d.id, [d.firstName, d.lastName].filter(Boolean).join(' ') || d.email]));
  const vehicleMap = new Map(vehicles.map((v) => [v.id, v.unitNumber || v.vin || 'Unknown vehicle']));
  const partnerMap = new Map(partners.map((p) => [p.id, p.name]));
  const dispatchMap = new Map(dispatches.map((d) => [d.id, d.dispatchNumber ?? `Dispatch ${d.id.slice(0, 8)}`]));

  return instances.map((i) => {
    let entityName: string;
    switch (i.entityType) {
      case 'DRIVER':   entityName = driverMap.get(i.entityId) ?? 'Unknown driver'; break;
      case 'VEHICLE':  entityName = vehicleMap.get(i.entityId) ?? 'Unknown vehicle'; break;
      case 'PARTNER':  entityName = partnerMap.get(i.entityId) ?? 'Unknown partner'; break;
      case 'DISPATCH': entityName = dispatchMap.get(i.entityId) ?? 'Unknown dispatch'; break;
      default:         entityName = 'Unknown';
    }

    return {
      id: i.id,
      createdAt: i.createdAt,
      triggerEvent: i.triggeredEvent,            // e.g. ON_DRIVER_CREATE
      playbookId: i.playbook.id,
      playbookName: i.playbook.name,
      entityType: i.entityType,
      entityName,
    };
  });
}),
```

Verify the actual select field names against the schema (check User firstName/lastName, CarrierTruck unitNumber, Customer name, CarrierDispatch dispatchNumber). If a field name differs, adjust to match — DO NOT invent fields. Run `grep -n "model User\b\|model CarrierTruck\|model Customer\b\|model CarrierDispatch" apps/web/prisma/schema.prisma` to find each model and verify field names before writing the query.

**2. Create `apps/web/src/app/(owner)/checklists/automation/_components/AutomationActivityLog.tsx`**

Read-only feed. Match the existing style of `AutomationClient.tsx` and `CustomRulesTable.tsx` (shadcn primitives, muted-foreground for secondary text, tasteful spacing). Use `formatDistanceToNow` from `date-fns` for human-friendly relative times.

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { formatDistanceToNow } from 'date-fns';
import { Activity } from 'lucide-react';

// Friendly labels for trigger events — keep aligned with TriggerEvent enum.
const EVENT_LABEL: Record<string, string> = {
  ON_DRIVER_CREATE:    'Driver created',
  ON_VEHICLE_CREATE:   'Vehicle created',
  ON_DISPATCH_CREATE:  'Dispatch created',
  ON_DISPATCH_DEPART:  'Dispatch departed',
  ON_DISPATCH_DELIVER: 'Dispatch delivered',
  ON_PARTNER_CREATE:   'Partner created',
};

export function AutomationActivityLog() {
  const trpc = useTRPC();
  const { data: entries = [], isLoading } = useQuery(
    trpc.workflows.trigger.listActivityLog.queryOptions(),
  );

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Activity</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          The 50 most recent checklists started automatically by your rules.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded-md border border-border bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center">
          <Activity className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No automation activity yet. When a rule fires, it will show up here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {entries.map((e) => (
            <li key={e.id} className="px-4 py-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {e.playbookName}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {EVENT_LABEL[e.triggerEvent ?? ''] ?? e.triggerEvent ?? 'Triggered'} ·{' '}
                  <span className="text-foreground">{e.entityName}</span>
                </div>
              </div>
              <time
                className="text-xs text-muted-foreground whitespace-nowrap"
                dateTime={new Date(e.createdAt).toISOString()}
                title={new Date(e.createdAt).toLocaleString()}
              >
                {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true })}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

**3. Wire it into `AutomationClient.tsx`** as a third section below Custom Rules:

```tsx
import { AutomationActivityLog } from './AutomationActivityLog';

// ...inside the returned <div className="space-y-10">, after the Custom Rules section:
<AutomationActivityLog />
```

UI conventions: this is a logistics SaaS dashboard page (per CLAUDE.md UI UX Pro Max defaults — Next.js + Tailwind + shadcn, professional/modern, dark-mode supported). The component uses only existing tokens (border, muted-foreground, foreground) so dark mode works automatically. No new design system tokens introduced.

DO NOT add filters, pagination, search, or export — out of scope. Read-only feed of the latest 50 entries.
  </action>
  <verify>
    - `cd apps/web && npx tsc --noEmit` passes.
    - `cd apps/web && npm run lint` (or eslint on the changed files) passes.
    - Manually verify entity model field names by greping schema.prisma BEFORE writing the procedure (User, CarrierTruck, Customer, CarrierDispatch).
    - Visit `/checklists/automation` in the browser — Activity section renders below Custom Rules. With no trigger-spawned instances yet, shows empty state. After firing one (e.g. create a driver while a recipe is enabled), the entry appears at the top of the list.
    - Tenant scoping: log entries from other tenants do not appear (enforced by `where: { tenantId: ctx.tenantId }` + adminProcedure).
  </verify>
  <done>
    - `trpc.workflows.trigger.listActivityLog` returns up to 50 most-recent trigger-spawned instances for the caller's tenant.
    - Each returned row has: `id`, `createdAt`, `triggerEvent`, `playbookId`, `playbookName`, `entityType`, `entityName`.
    - `/checklists/automation` shows a third section titled "Activity" below "Custom Rules".
    - Empty state renders when no entries exist.
    - Loading state uses skeletons (matches existing recipe loading pattern in `AutomationClient.tsx`).
    - Dark mode works (uses theme tokens only).
  </done>
</task>

</tasks>

<verification>
End-to-end smoke test:
1. Enable a recipe (e.g. ON_DRIVER_CREATE) on `/checklists/automation` and link it to any active playbook.
2. Create a new driver via `/drivers/new`.
3. Refresh `/checklists/automation`. The Activity section now shows one entry: playbook name, "Driver created · {driver name}", "a few seconds ago".
4. Manually start a checklist via the StartChecklistDialog. Confirm it does NOT appear in the activity log (manual creations excluded).
5. Switch to a second tenant account. Confirm the log is empty (or shows only that tenant's entries).
</verification>

<success_criteria>
- Spec Section 14 Phase 5 line item "Tenant account page: automation activity log" satisfied.
- No new Prisma model created. Schema delta is 2 nullable columns + 1 index on existing `PlaybookInstance`.
- `triggeredBy` and `triggeredEvent` populated on every PlaybookInstance going forward (manual + trigger paths).
- Owner-visible Activity section on `/checklists/automation` shows tenant-scoped, most-recent-first, max 50 entries.
- TypeScript clean (`tsc --noEmit`), lint clean, dark mode supported.
- Read-only — no edit/delete/clear actions in this task.
</success_criteria>

<output>
After completion, create `.planning/quick/288-tenant-automation-activity-log/288-SUMMARY.md` documenting:
- The 2-column schema delta and rationale (why not a new table, why not PlaybookNotification).
- The new tRPC procedure `workflows.trigger.listActivityLog`.
- The new component `AutomationActivityLog.tsx` and where it mounts.
- Migration filename and confirmation it auto-deployed.
- Any field-name corrections made during Task 2 verification (CarrierTruck/Customer/CarrierDispatch field discovery).
</output>
