---
phase: quick-295
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/docs/prisma-parser.ts
  - apps/web/src/app/(admin)/docs/database/page.tsx
  - apps/web/src/app/(admin)/docs/database/[model]/page.tsx
  - apps/web/src/app/(admin)/docs/layout.tsx
autonomous: true

must_haves:
  truths:
    - "SysAdmin can view all 80 Prisma models grouped by module on /docs/database"
    - "SysAdmin can click a model card to see full field details"
    - "SysAdmin can see incoming and outgoing relations for each model"
    - "SysAdmin can search/filter models by name"
  artifacts:
    - path: "apps/web/src/lib/docs/prisma-parser.ts"
      provides: "Prisma schema parsing utility"
      exports: ["parsePrismaSchema", "PrismaModel", "PrismaField", "PrismaRelation", "PrismaEnum"]
    - path: "apps/web/src/app/(admin)/docs/database/page.tsx"
      provides: "Database schema overview page with module groupings"
    - path: "apps/web/src/app/(admin)/docs/database/[model]/page.tsx"
      provides: "Model detail page with fields and relations"
  key_links:
    - from: "apps/web/src/app/(admin)/docs/database/page.tsx"
      to: "apps/web/src/lib/docs/prisma-parser.ts"
      via: "parsePrismaSchema import"
      pattern: "parsePrismaSchema"
    - from: "apps/web/src/app/(admin)/docs/database/[model]/page.tsx"
      to: "apps/web/src/lib/docs/prisma-parser.ts"
      via: "parsePrismaSchema import"
      pattern: "parsePrismaSchema"
---

<objective>
Build an interactive database schema viewer at /docs/database that parses the Prisma schema dynamically and displays all 80 models grouped by module with clickable detail pages.

Purpose: Give SysAdmins a visual reference for the database structure without needing to read raw schema files. Shows relationships, cascade behaviors, and field details at a glance.

Output: Three new files (parser utility, main page, detail page) plus sidebar nav update.
</objective>

<context>
@apps/web/prisma/schema.prisma (80 models, 64 enums, 2891 lines)
@apps/web/src/app/(admin)/docs/layout.tsx (existing sidebar nav)
@apps/web/src/app/(admin)/docs/page.tsx (existing docs landing page pattern)
@apps/web/src/lib/docs/feature-registry.ts (prismaModels field for code usages)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create Prisma schema parser utility</name>
  <files>apps/web/src/lib/docs/prisma-parser.ts</files>
  <action>
Create a TypeScript utility that parses schema.prisma at build/runtime and extracts:

**Types to export:**
```typescript
interface PrismaField {
  name: string;
  type: string;
  isRequired: boolean;
  isArray: boolean;
  isId: boolean;
  isUnique: boolean;
  hasDefault: boolean;
  defaultValue?: string;
  dbType?: string; // @db.Uuid, @db.Timestamptz, etc.
}

interface PrismaRelation {
  fieldName: string;
  targetModel: string;
  isArray: boolean;
  onDelete?: string; // Cascade, SetNull, etc.
  onUpdate?: string;
  relationName?: string;
}

interface PrismaModel {
  name: string;
  fields: PrismaField[];
  relations: PrismaRelation[];
  module: string; // Computed from model name/purpose
}

interface PrismaEnum {
  name: string;
  values: string[];
}

interface ParsedSchema {
  models: PrismaModel[];
  enums: PrismaEnum[];
}
```

**Module assignment logic** (derive from model name patterns):
- Auth: User, Tenant, DriverInvitation
- Fleet: Truck, Driver, GPSLocation, SafetyEvent, FuelRecord, MaintenanceEvent, ScheduledService
- Dispatch: Route, RouteStop, RouteDriver, DriverRouteJoin, Load, RouteTemplate
- Finance: Invoice, InvoiceItem, RouteExpense, RoutePayment, PayrollRecord, ExpenseCategory, ExpenseTemplate, ExpenseTemplateItem
- Compliance: Document
- CRM: Customer, CustomerInteraction, Tag, TagAssignment
- Support: SupportTicket, TicketMessage
- Integrations: TenantIntegration, PushToken
- Notifications: NotificationLog, InAppNotification
- Carrier Ops: CarrierClient, CarrierContract, CarrierFacility, CarrierDriver, CarrierTruck, CarrierDispatch, CarrierLoad, CarrierExpense, DriverPayRecord, DriverCompensationTemplate
- Workflow: StepTemplate, Playbook, PlaybookInstance, PlaybookNotification, PlaybookTrigger, DispatchOverrideAudit
- Billing: Subscription, ActivationProgress, SysAdminInvoice
- Analytics: AutomationRule, AutomationRun, AppEvent, TenantMetricsDaily, TenantHealthScore
- HOS/Incidents: DriverHOSEntry, DriverIncident
- Other: anything not matched

**Parsing approach:**
- Read schema.prisma from `process.cwd()` at runtime (server component)
- Use regex to extract model blocks: `/model (\w+) \{([^}]+)\}/g`
- Use regex to extract enum blocks: `/enum (\w+) \{([^}]+)\}/g`
- Parse fields within model blocks, detecting @id, @unique, @default, @db.*, @relation
- For relations, parse `@relation(...)` to extract onDelete, onUpdate, name

Cache the parsed result in module scope (parse once per server restart).

Export function: `parsePrismaSchema(): ParsedSchema`
  </action>
  <verify>
Create a simple test: import parsePrismaSchema and verify it returns { models: PrismaModel[], enums: PrismaEnum[] } with 80 models and 64 enums.
  </verify>
  <done>
parsePrismaSchema() returns all 80 models with fields, relations, and module assignments. All 64 enums extracted with their values.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create /docs/database main page with module groupings</name>
  <files>
    apps/web/src/app/(admin)/docs/database/page.tsx
    apps/web/src/app/(admin)/docs/layout.tsx
  </files>
  <action>
**Create apps/web/src/app/(admin)/docs/database/page.tsx:**

Server component that:
1. Calls `parsePrismaSchema()` to get all models and enums
2. Groups models by their `module` field
3. Renders collapsible sections for each module

**UI structure:**
```
<header>
  <h1>Database Schema</h1>
  <p>80 models, 64 enums across 14 modules</p>
  <SearchInput placeholder="Filter models..." />
</header>

<div className="grid gap-6">
  {modules.map(module => (
    <CollapsibleSection key={module.name} title={module.name} count={module.models.length}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {module.models.map(model => (
          <ModelCard key={model.name} model={model} />
        ))}
      </div>
    </CollapsibleSection>
  ))}
</div>

<section>
  <h2>Enums</h2>
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
    {enums.map(e => <EnumBadge name={e.name} valueCount={e.values.length} />)}
  </div>
</section>
```

**ModelCard component (inline):**
- Card with model name as title
- Badge showing field count and relation count
- Clickable, links to /docs/database/[model]
- Show first 3-4 key fields as preview
- Icon indicator if has cascade deletes (warning color)

**Search/filter:**
- Client component wrapper for search state
- Filter models across all modules by name (case-insensitive contains)

**Update apps/web/src/app/(admin)/docs/layout.tsx:**
- Add "Database Schema" link under Architecture & Operations section
- Insert after "Modules" entry: `{ slug: 'database', name: 'Database Schema', href: '/docs/database' }`
- Since this is a different route pattern, add as direct Link with href="/docs/database"

Use existing shadcn components: Card, CardHeader, CardContent, Badge, Collapsible (or details/summary HTML).
Follow existing docs page styling patterns from feature-registry pages.
  </action>
  <verify>
Visit /docs/database in browser. Should see:
- All modules as collapsible sections
- Model cards with field/relation counts
- Search filter working
- Sidebar shows "Database Schema" link
  </verify>
  <done>
/docs/database renders all 80 models grouped into ~14 modules. Each model card shows field count, relation count, and links to detail page. Search filters models by name.
  </done>
</task>

<task type="auto">
  <name>Task 3: Create /docs/database/[model] detail page</name>
  <files>apps/web/src/app/(admin)/docs/database/[model]/page.tsx</files>
  <action>
**Create apps/web/src/app/(admin)/docs/database/[model]/page.tsx:**

Server component with `params: { model: string }` that:
1. Calls `parsePrismaSchema()` and finds the model by name (case-insensitive)
2. If not found, return notFound()
3. Renders full model details

**Page structure:**
```
<header>
  <Link href="/docs/database">< Back to Schema</Link>
  <h1>{model.name}</h1>
  <Badge>{model.module}</Badge>
  <p>{model.fields.length} fields, {model.relations.length} relations</p>
</header>

<section>
  <h2>Fields</h2>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead>Type</TableHead>
        <TableHead>Required</TableHead>
        <TableHead>Default</TableHead>
        <TableHead>Constraints</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {model.fields.map(field => (
        <TableRow key={field.name}>
          <TableCell className="font-mono">{field.name}</TableCell>
          <TableCell className="font-mono">{field.type}{field.isArray ? '[]' : ''}</TableCell>
          <TableCell>{field.isRequired ? 'Yes' : 'No'}</TableCell>
          <TableCell>{field.defaultValue || '-'}</TableCell>
          <TableCell>
            {field.isId && <Badge variant="outline">@id</Badge>}
            {field.isUnique && <Badge variant="outline">@unique</Badge>}
            {field.dbType && <Badge variant="secondary">{field.dbType}</Badge>}
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
</section>

<section>
  <h2>Outgoing Relations</h2>
  <p className="text-muted-foreground">What this model references</p>
  {outgoingRelations.length === 0 ? (
    <p>No outgoing relations</p>
  ) : (
    <div className="grid gap-2">
      {outgoingRelations.map(rel => (
        <RelationCard
          fieldName={rel.fieldName}
          targetModel={rel.targetModel}
          isArray={rel.isArray}
          onDelete={rel.onDelete}
          direction="outgoing"
        />
      ))}
    </div>
  )}
</section>

<section>
  <h2>Incoming Relations</h2>
  <p className="text-muted-foreground">What references this model</p>
  {/* Find all models that have relations pointing TO this model */}
  {incomingRelations.length === 0 ? (
    <p>No incoming relations</p>
  ) : (
    <div className="grid gap-2">
      {incomingRelations.map(rel => (
        <RelationCard
          sourceModel={rel.sourceModel}
          fieldName={rel.fieldName}
          isArray={rel.isArray}
          onDelete={rel.onDelete}
          direction="incoming"
        />
      ))}
    </div>
  )}
</section>

<section>
  <h2>Feature Usages</h2>
  {/* Look up model.name in feature-registry.ts prismaModels arrays */}
  {usages.length === 0 ? (
    <p>Not referenced in feature registry</p>
  ) : (
    <ul>
      {usages.map(feature => (
        <li>
          <Link href={`/docs/features/${feature.slug}`}>{feature.name}</Link>
        </li>
      ))}
    </ul>
  )}
</section>
```

**RelationCard component (inline):**
- Shows field name, target/source model (as link to /docs/database/[model])
- Badge for cardinality (one-to-one, one-to-many, many-to-many)
- Warning badge if onDelete: Cascade (data loss risk)
- Neutral badge for onDelete: SetNull or Restrict

**Incoming relations logic:**
- Iterate all models from parsePrismaSchema()
- For each model, check if any relation.targetModel === current model name
- Collect as { sourceModel, fieldName, isArray, onDelete }

**Feature usages:**
- Import `features` from feature-registry.ts
- Filter features where prismaModels includes model.name

**generateStaticParams:**
- Export async function to pre-generate all 80 model pages at build time
- Return parsePrismaSchema().models.map(m => ({ model: m.name }))
  </action>
  <verify>
Visit /docs/database/User and /docs/database/Tenant. Should see:
- Full field table with types, defaults, constraints
- Outgoing relations (what User references)
- Incoming relations (what references User)
- Feature usages from registry
- Back link to /docs/database
  </verify>
  <done>
/docs/database/[model] shows complete model details: all fields in table format, outgoing relations with cascade info, incoming relations computed from schema, feature usages from registry. 80 pages generated at build time.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes (no TypeScript errors)
2. /docs/database loads with all 80 models grouped by module
3. Search filter works across all modules
4. Clicking a model card navigates to detail page
5. Detail page shows fields, relations, and feature usages
6. Back link returns to main schema page
7. Sidebar includes "Database Schema" link
</verification>

<success_criteria>
- parsePrismaSchema() extracts 80 models and 64 enums correctly
- Models grouped into logical modules (Auth, Fleet, Dispatch, Finance, etc.)
- Main page renders responsive grid of model cards with search
- Detail pages show complete field info with type, required, default, constraints
- Relations show cardinality and cascade behaviors with warning indicators
- Feature usages link to feature docs pages
- All pages use existing shadcn/ui components and follow docs styling
</success_criteria>

<output>
After completion, create `.planning/quick/295-interactive-database-schema-viewer-for-s/295-SUMMARY.md`
</output>
