---
phase: 316-notification-dispatcher
plan: 01
type: execute
wave: 1
depends_on: [315]
files_modified:
  - apps/web/package.json
  - apps/web/src/emails/dynamic-template.tsx
  - apps/web/src/lib/notifications/dispatcher.ts
  - apps/web/src/lib/notifications/recipient-resolver.ts
  - apps/web/src/lib/notifications/template-renderer.ts
  - apps/web/src/lib/notifications/idempotency.ts
  - apps/web/src/lib/notifications/audit-log.ts
  - apps/web/src/lib/notifications/in-app-writer.ts
  - apps/web/src/lib/notifications/__tests__/dispatcher.test.ts
  - apps/web/src/lib/notifications/README.md
autonomous: true

must_haves:
  truths:
    - "dispatchNotification(triggerKey, options) is the only public entry point and executes the 10-step flow"
    - "Templates with global isActive=false short-circuit early and write a SKIPPED_DISABLED audit row"
    - "Tenant-disabled triggers short-circuit and write a SKIPPED_DISABLED audit row"
    - "Recipients are resolved from default rules (role | tenant_owners | related) unioned with NotificationSubscription, deduped, with UserNotificationPreference applied"
    - "Variable substitution replaces every {{var}} token in the rendered HTML and subject; missing vars resolve to empty string with a console warning"
    - "Idempotency keys block double-sends within the same scope (day for digest, second for event)"
    - "Email channel uses resend.emails.send({ from, to, subject, react }) with DynamicTemplateEmail as the React shell"
    - "IN_APP channel writes a row into the existing InAppNotification table (orgId=tenantId, mapped enum type)"
    - "A failure dispatching to one recipient does NOT abort the others"
    - "Every send attempt (SENT, FAILED, SKIPPED_*) results in a NotificationSendLog row written via bypass_rls transaction"
    - "Vitest unit tests cover all 6 mandated scenarios and pass under `npm test`"
  artifacts:
    - path: "apps/web/src/lib/notifications/dispatcher.ts"
      provides: "dispatchNotification public API + 10-step orchestrator"
      exports: ["dispatchNotification"]
    - path: "apps/web/src/lib/notifications/recipient-resolver.ts"
      provides: "resolveRecipients function returning ResolvedRecipient[] with preferences attached"
      exports: ["resolveRecipients", "ResolvedRecipient"]
    - path: "apps/web/src/lib/notifications/template-renderer.ts"
      provides: "Tiptap blockJson -> HTML -> variable substitution -> React Email shell -> final HTML"
      exports: ["renderTemplate", "substituteVariables"]
    - path: "apps/web/src/lib/notifications/idempotency.ts"
      provides: "Idempotency key builder + DB-backed check against NotificationSendLog"
      exports: ["buildIdempotencyKey", "checkIdempotency"]
    - path: "apps/web/src/lib/notifications/audit-log.ts"
      provides: "Bulk audit log writer (bypass_rls) for NotificationSendLog"
      exports: ["writeAuditLog", "AuditLogEntry"]
    - path: "apps/web/src/lib/notifications/in-app-writer.ts"
      provides: "InAppNotification row writer with trigger->enum mapping"
      exports: ["writeInAppNotification"]
    - path: "apps/web/src/emails/dynamic-template.tsx"
      provides: "React Email shell wrapping rendered body HTML (the ONLY HTML injection site)"
      exports: ["DynamicTemplateEmail", "default"]
    - path: "apps/web/src/lib/notifications/__tests__/dispatcher.test.ts"
      provides: "Vitest unit tests for all 6 dispatcher scenarios"
    - path: "apps/web/src/lib/notifications/README.md"
      provides: "Public API docs, 10-step flow, how to add a trigger, known limitations"
  key_links:
    - from: "apps/web/src/lib/notifications/dispatcher.ts"
      to: "apps/web/src/lib/notifications/recipient-resolver.ts"
      via: "import { resolveRecipients }"
      pattern: "from ['\"]./recipient-resolver['\"]"
    - from: "apps/web/src/lib/notifications/dispatcher.ts"
      to: "apps/web/src/lib/notifications/template-renderer.ts"
      via: "import { renderTemplate }"
      pattern: "from ['\"]./template-renderer['\"]"
    - from: "apps/web/src/lib/notifications/dispatcher.ts"
      to: "apps/web/src/lib/notifications/idempotency.ts"
      via: "import { buildIdempotencyKey, checkIdempotency }"
      pattern: "from ['\"]./idempotency['\"]"
    - from: "apps/web/src/lib/notifications/dispatcher.ts"
      to: "apps/web/src/lib/notifications/audit-log.ts"
      via: "import { writeAuditLog }"
      pattern: "from ['\"]./audit-log['\"]"
    - from: "apps/web/src/lib/notifications/dispatcher.ts"
      to: "apps/web/src/lib/notifications/in-app-writer.ts"
      via: "import { writeInAppNotification }"
      pattern: "from ['\"]./in-app-writer['\"]"
    - from: "apps/web/src/lib/notifications/dispatcher.ts"
      to: "apps/web/src/lib/email/resend-client.ts"
      via: "import { resend, FROM_EMAIL } and call resend.emails.send({ from, to, subject, react })"
      pattern: "resend\\.emails\\.send"
    - from: "apps/web/src/lib/notifications/template-renderer.ts"
      to: "@tiptap/html"
      via: "generateHTML(blockJson, [StarterKit])"
      pattern: "generateHTML"
    - from: "apps/web/src/lib/notifications/template-renderer.ts"
      to: "apps/web/src/emails/dynamic-template.tsx"
      via: "render(<DynamicTemplateEmail bodyHtml={...} />) via @react-email/render"
      pattern: "DynamicTemplateEmail"
---

<objective>
Build the notification dispatcher library — the runtime engine for DriveCommand's Tenant-Configurable
Notification System. This is Plan 02 of 5 (Phase 41).

Purpose: Provide a single `dispatchNotification(triggerKey, options)` entry point that orchestrates the
10-step flow defined in `docs/specs/Notifications System Technical Documentation.md`: template lookup,
tenant/global gating, recipient resolution, Tiptap-blockJson rendering with variable substitution,
idempotency, per-channel fan-out (Resend email + InAppNotification row), and full audit logging into
`NotificationSendLog`. Server actions and cron jobs (built in Plans 03-05) will call this library.

Output: A self-contained library under `apps/web/src/lib/notifications/` plus a single React Email shell
component at `apps/web/src/emails/dynamic-template.tsx`. No schema changes, no UI, no existing-file
modifications.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@docs/specs/Notifications System Technical Documentation.md
@.planning/quick/315-phase-41-plan-01-notification-system-dat/315-PLAN.md
@apps/web/src/lib/notifications/types.ts
@apps/web/src/lib/notifications/build-template.ts
@apps/web/src/lib/email/resend-client.ts
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install Tiptap HTML packages</name>
  <files>apps/web/package.json</files>
  <action>
From repo root, install Tiptap dependencies into the web app:

  npm install --workspace=apps/web @tiptap/html @tiptap/core @tiptap/starter-kit

(If the workspace flag is not honored by the local npm version, fall back to:
  cd apps/web && npm install @tiptap/html @tiptap/core @tiptap/starter-kit)

Why these three: `@tiptap/html` exposes `generateHTML(doc, extensions)`. It requires
`@tiptap/core` as a peer and the Tiptap node/mark extensions to render. `@tiptap/starter-kit`
bundles paragraph/heading/bold/italic/lists/etc. — the same set the admin editor in Plan 03
will use, ensuring identical rendering.

DO NOT install `prosemirror-*` packages directly; let Tiptap pull them transitively.
DO NOT downgrade or change any other dependency versions.
  </action>
  <verify>
  - `apps/web/package.json` shows `@tiptap/html`, `@tiptap/core`, `@tiptap/starter-kit` in `dependencies`
  - `npm ls @tiptap/html --workspace=apps/web` resolves without UNMET PEER warnings
  - `node -e "require('@tiptap/html')"` from `apps/web` exits 0
  </verify>
  <done>All three Tiptap packages are installed in `apps/web` and resolvable.</done>
</task>

<task type="auto">
  <name>Task 2: Create React Email shell component (DynamicTemplateEmail)</name>
  <files>apps/web/src/emails/dynamic-template.tsx</files>
  <action>
Create a React Email component that wraps already-rendered body HTML in a branded email shell.
This is the ONLY place HTML injection is permitted in the system.

Props:
  type DynamicTemplateEmailProps = {
    bodyHtml: string;            // Already-substituted, Tiptap-generated HTML
    brandName?: string;          // Defaults to "DriveCommand"
    footerAddress?: string;      // Optional postal address line; render only if present
  };

Structure (use components from `@react-email/components`):
  <Html>
    <Head />
    <Preview>{brandName} notification</Preview>
    <Body style={bodyStyle}>
      <Container style={containerStyle}>
        <Section style={headerStyle}>
          <Text style={brandStyle}>{brandName ?? "DriveCommand"}</Text>
        </Section>

        <Section style={bodySectionStyle}>
          <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
        </Section>

        <Hr style={hrStyle} />

        <Section style={footerStyle}>
          <Text style={footerTextStyle}>
            Sent by {brandName ?? "DriveCommand"}
          </Text>
          {footerAddress ? <Text style={footerTextStyle}>{footerAddress}</Text> : null}
        </Section>
      </Container>
    </Body>
  </Html>

Styling: inline style objects only (email clients ignore CSS). Keep it minimal — neutral background
(#f6f7f9), white container (max-width 600px, border-radius 8px), brand line in DriveCommand blue
(#0f62fe or similar). Do not import Tailwind or external CSS.

Exports:
  - Named: `export const DynamicTemplateEmail: React.FC<DynamicTemplateEmailProps>`
  - Default: `export default DynamicTemplateEmail`

CRITICAL: Do NOT modify any other file under `apps/web/src/emails/`. This is a NEW file.
  </action>
  <verify>
  - `apps/web/src/emails/dynamic-template.tsx` exists
  - `tsc --noEmit -p apps/web` compiles with zero errors
  - File contains exactly one `dangerouslySetInnerHTML` usage (the body HTML wrapper)
  - Component default-exports and named-exports `DynamicTemplateEmail`
  </verify>
  <done>DynamicTemplateEmail renders a branded React Email shell that wraps `bodyHtml` and is the sole HTML-injection site.</done>
</task>

<task type="auto">
  <name>Task 3: Implement template-renderer.ts (Tiptap -> HTML -> substitute -> shell -> string)</name>
  <files>apps/web/src/lib/notifications/template-renderer.ts</files>
  <action>
Create the rendering pipeline:

  import { generateHTML } from "@tiptap/html";
  import StarterKit from "@tiptap/starter-kit";
  import { render } from "@react-email/render";
  import React from "react";
  import DynamicTemplateEmail from "@/emails/dynamic-template";

Function 1 — pure string substitution:

  export function substituteVariables(
    text: string,
    payload: Record<string, string>
  ): string

Rules:
  - Replace every `{{varName}}` token with `payload[varName]`
  - Token regex: /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g  (allow optional whitespace inside braces)
  - Missing key -> replace with empty string AND `console.warn(`[notifications] missing variable: ${name}`)`
  - Never throw; always return a string

Function 2 — full template render:

  export async function renderTemplate(
    blockJson: unknown,
    payload: Record<string, string>,
    subject: string
  ): Promise<{ html: string; subjectFinal: string }>

Steps:
  1. const rawHtml = generateHTML(blockJson as any, [StarterKit]);
     - Wrap in try/catch; on error, log and fall back to: `<p>${escapeHtml(JSON.stringify(blockJson))}</p>`
       so dispatch can still proceed (audit will mark FAILED upstream if needed)
  2. const bodyHtml = substituteVariables(rawHtml, payload);
  3. const subjectFinal = substituteVariables(subject, payload);
  4. const html = await render(React.createElement(DynamicTemplateEmail, { bodyHtml }));
     - `render` returns Promise<string> in @react-email/render v2
  5. return { html, subjectFinal };

Add a small `escapeHtml` helper (internal, not exported).

CRITICAL: Do not use `react-dom/server` directly; `@react-email/render` handles it.
  </action>
  <verify>
  - `tsc --noEmit -p apps/web` compiles
  - Manual smoke: `renderTemplate({ type:'doc', content:[{type:'paragraph', content:[{type:'text', text:'Hi {{name}}'}]}] }, { name:'Sam' }, 'Hello {{name}}')` returns html containing "Hi Sam" and subjectFinal === "Hello Sam"
  - Missing var case emits a console.warn and substitutes empty string
  </verify>
  <done>Tiptap blockJson can be rendered to a fully-substituted, shell-wrapped HTML string and the subject is substituted in parallel.</done>
</task>

<task type="auto">
  <name>Task 4: Implement idempotency.ts</name>
  <files>apps/web/src/lib/notifications/idempotency.ts</files>
  <action>
Create idempotency primitives used by the dispatcher:

  import type { PrismaClient } from "@prisma/client";

  export function buildIdempotencyKey(
    triggerKey: string,
    relatedEntity: { type: string; id: string } | undefined,
    userId: string,
    isDigest: boolean
  ): string

Format:
  - Common prefix: `${triggerKey}:${relatedEntity?.type ?? 'none'}:${relatedEntity?.id ?? 'none'}:${userId}`
  - Digest suffix: `:${YYYY-MM-DD}` using UTC date (toISOString().slice(0,10))
  - Event suffix:  `:${ISO_TO_SECOND}` using `new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')`
  - Returned key length must be <= 255 chars (defensive truncate not required at this scale)

  export async function checkIdempotency(
    prisma: PrismaClient,
    key: string
  ): Promise<boolean>

Returns true if a `NotificationSendLog` row exists with `idempotencyKey === key` AND `status === 'SENT'`.
Uses a single `findFirst({ where: { idempotencyKey: key, status: 'SENT' }, select: { id: true } })`.
Returns false on any DB error (log and continue — never block dispatch because the check failed).
  </action>
  <verify>
  - `tsc --noEmit -p apps/web` compiles
  - `buildIdempotencyKey('load.created', { type:'Load', id:'abc' }, 'user1', false)` produces a key with the literal triggerKey, type, id, userId, and an ISO-to-second timestamp
  - `buildIdempotencyKey('digest.daily', undefined, 'user1', true)` ends with `:none:none:user1:YYYY-MM-DD`
  </verify>
  <done>Idempotency keys are deterministic per scope and `checkIdempotency` returns boolean from a SENT-row lookup.</done>
</task>

<task type="auto">
  <name>Task 5: Implement audit-log.ts</name>
  <files>apps/web/src/lib/notifications/audit-log.ts</files>
  <action>
Create the bulk audit writer:

  import type { PrismaClient } from "@prisma/client";

  export type AuditLogEntry = {
    tenantId: string;
    triggerKey: string;
    recipientUserId?: string | null;
    recipientEmail?: string | null;
    channel: 'EMAIL' | 'IN_APP';
    subject?: string | null;
    status: 'SENT' | 'FAILED' | 'SKIPPED_DISABLED' | 'SKIPPED_USER_PREF' | 'SKIPPED_IDEMPOTENT';
    errorMessage?: string | null;
    idempotencyKey: string;
    relatedEntityType?: string | null;
    relatedEntityId?: string | null;
  };

  export async function writeAuditLog(
    prisma: PrismaClient,
    entries: AuditLogEntry[]
  ): Promise<void>

Behavior:
  - No-op when `entries.length === 0`
  - Use a single transaction with bypass_rls:
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SELECT set_config('app.bypass_rls','on',true)");
        await tx.notificationSendLog.createMany({ data: entries.map(e => ({
          tenantId: e.tenantId,
          triggerKey: e.triggerKey,
          recipientUserId: e.recipientUserId ?? null,
          recipientEmail: e.recipientEmail ?? null,
          channel: e.channel,
          subject: e.subject ?? null,
          status: e.status,
          errorMessage: e.errorMessage ?? null,
          idempotencyKey: e.idempotencyKey,
          relatedEntityType: e.relatedEntityType ?? null,
          relatedEntityId: e.relatedEntityId ?? null,
        })), skipDuplicates: false });
      });
  - Wrap in try/catch; on failure, console.error and SWALLOW (audit must never break the caller). The caller has already done the work; we just lost telemetry.

NOTE: If the actual NotificationSendLog field names in `prisma/schema.prisma` differ slightly,
read the model first and adjust field names accordingly. Do not invent fields.
  </action>
  <verify>
  - `tsc --noEmit -p apps/web` compiles
  - Empty array call returns without touching the DB
  - Non-empty array call issues exactly one transaction with one createMany
  </verify>
  <done>writeAuditLog persists 0..N NotificationSendLog rows in one bypass_rls transaction and never throws to its caller.</done>
</task>

<task type="auto">
  <name>Task 6: Implement recipient-resolver.ts</name>
  <files>apps/web/src/lib/notifications/recipient-resolver.ts</files>
  <action>
Resolve who should receive a notification for a given tenant + trigger.

  import type { PrismaClient } from "@prisma/client";
  import type { DefaultRecipientRule } from "./types"; // adjust path: '@/lib/notifications/types'

  export type ResolvedRecipient = {
    userId: string;
    email: string;
    emailEnabled: boolean;
    inAppEnabled: boolean;
  };

  export async function resolveRecipients(
    prisma: PrismaClient,
    tenantId: string,
    triggerKey: string,
    defaultRecipients: DefaultRecipientRule[],
    payload: Record<string, string>
  ): Promise<ResolvedRecipient[]>

Algorithm:
  1. Build a `Set<string>` of candidate userIds.
  2. For each rule in defaultRecipients:
       - rule.kind === 'role':
           const users = await prisma.user.findMany({
             where: { tenantId, role: rule.role, isActive: true, email: { not: null } },
             select: { id: true, email: true },
           });
           Add user.id to set, stash user record in a Map<userId, {email}>.
       - rule.kind === 'tenant_owners':
           Same as role but with role: 'OWNER'.
       - rule.kind === 'related':
           const userId = payload[rule.payloadKey];
           if (!userId) continue;
           const user = await prisma.user.findFirst({
             where: { id: userId, tenantId, isActive: true, email: { not: null } },
             select: { id: true, email: true },
           });
           if (user) add to map.
  3. Union with explicit NotificationSubscription rows:
       const subs = await prisma.notificationSubscription.findMany({
         where: { tenantId, triggerKey },
         select: { user: { select: { id: true, email: true, isActive: true } } },
       });
       For each sub where user.isActive && user.email, add to map.
  4. Deduplicate by userId (Map already handles this).
  5. Load preferences in ONE query:
       const prefs = await prisma.userNotificationPreference.findMany({
         where: { userId: { in: [...map.keys()] }, triggerKey },
         select: { userId: true, emailEnabled: true, inAppEnabled: true },
       });
       Build Map<userId, pref>.
  6. Build result array. For each (userId, {email}) in map:
       const p = prefMap.get(userId);
       push({
         userId,
         email,
         emailEnabled: p?.emailEnabled ?? true,   // default true
         inAppEnabled: p?.inAppEnabled ?? true,   // default true
       });
  7. Filter out any entry with missing email (defensive).
  8. Return result.

CRITICAL:
  - Use the base prisma client (NOT getTenantPrisma). Cross-tenant safety enforced by explicit tenantId filters.
  - If `DefaultRecipientRule` type's discriminator field is named differently than `kind` in `types.ts`, read types.ts first and use the actual discriminant.
  - Do NOT query InAppNotificationType or anything Plan 03+ owns.
  </action>
  <verify>
  - `tsc --noEmit -p apps/web` compiles
  - Mock test in Task 9 confirms dedup, role+related union, preference defaults
  - No use of `getTenantPrisma`
  </verify>
  <done>resolveRecipients returns the deduped, pref-attached ResolvedRecipient[] union of rule-matched users and explicit subscribers.</done>
</task>

<task type="auto">
  <name>Task 7: Implement in-app-writer.ts</name>
  <files>apps/web/src/lib/notifications/in-app-writer.ts</files>
  <action>
Create the InAppNotification row writer.

  import type { PrismaClient, InAppNotificationType } from "@prisma/client";

  type WriteArgs = {
    tenantId: string;
    userId: string;
    triggerKey: string;
    title: string;
    message: string;
    relatedEntity?: { type: string; id: string };
  };

  export async function writeInAppNotification(
    prisma: PrismaClient,
    args: WriteArgs
  ): Promise<void>

Implementation:

  const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

  function mapTriggerToType(triggerKey: string): InAppNotificationType {
    // Map by prefix to the closest existing enum value.
    // Existing enum members (DO NOT add new ones in this plan):
    //   dispatch_assigned, load_delivered, pay_record_ready, invoice_generated,
    //   compliance_alert, stop_completed, needs_assignment, dispatch_generated, fleet_message
    if (triggerKey.startsWith('load.')) return 'load_delivered' as InAppNotificationType;
    if (triggerKey.startsWith('dispatch.')) return 'dispatch_assigned' as InAppNotificationType;
    if (triggerKey.startsWith('pay.') || triggerKey.startsWith('payroll.')) return 'pay_record_ready' as InAppNotificationType;
    if (triggerKey.startsWith('invoice.')) return 'invoice_generated' as InAppNotificationType;
    if (triggerKey.startsWith('compliance.') || triggerKey.startsWith('document.')) return 'compliance_alert' as InAppNotificationType;
    if (triggerKey.startsWith('stop.')) return 'stop_completed' as InAppNotificationType;
    if (triggerKey.startsWith('assignment.')) return 'needs_assignment' as InAppNotificationType;
    if (triggerKey.startsWith('message.') || triggerKey.startsWith('fleet.')) return 'fleet_message' as InAppNotificationType;
    // Fallback — closest catch-all for system notifications
    return 'compliance_alert' as InAppNotificationType;
  }

Then:
  await prisma.$transaction(
    [
      prisma.inAppNotification.create({
        data: {
          orgId: args.tenantId,                                       // orgId == tenantId
          userId: args.userId,
          type: mapTriggerToType(args.triggerKey),
          title: args.title.slice(0, 200),                            // schema VARCHAR(200)
          message: args.message,
          entityType: args.relatedEntity?.type ?? args.triggerKey,
          entityId: args.relatedEntity?.id ?? ZERO_UUID,
          read: false,
        },
      }),
    ],
    { isolationLevel: 'ReadCommitted' }
  );

CRITICAL:
  - No bypass_rls — this is a system write that already filters by tenant via orgId.
  - Do NOT modify the InAppNotificationType enum or InAppNotification table.
  - Document the prefix->enum mapping in README (Task 10).
  - Title is hard-capped to 200 chars (matches existing schema).
  </action>
  <verify>
  - `tsc --noEmit -p apps/web` compiles
  - Triggers like "load.created" map to load_delivered; unknown triggers fall back to compliance_alert
  - Created row uses orgId (not tenantId) and ZERO_UUID when relatedEntity is omitted
  </verify>
  <done>writeInAppNotification inserts a single InAppNotification row with mapped enum type and safe fallback entity fields.</done>
</task>

<task type="auto">
  <name>Task 8: Implement dispatcher.ts (the 10-step orchestrator)</name>
  <files>apps/web/src/lib/notifications/dispatcher.ts</files>
  <action>
This is the public entry point. Strictly follows the design doc's Dispatch Architecture.

  import type { PrismaClient } from "@prisma/client";
  import { prisma } from "@/lib/prisma";
  import { resend, FROM_EMAIL } from "@/lib/email/resend-client";
  import React from "react";
  import DynamicTemplateEmail from "@/emails/dynamic-template";
  import type { TriggerKey, NotificationPayload, DefaultRecipientRule } from "./types";
  import { resolveRecipients, type ResolvedRecipient } from "./recipient-resolver";
  import { renderTemplate } from "./template-renderer";
  import { buildIdempotencyKey, checkIdempotency } from "./idempotency";
  import { writeAuditLog, type AuditLogEntry } from "./audit-log";
  import { writeInAppNotification } from "./in-app-writer";

  export async function dispatchNotification<K extends TriggerKey>(
    triggerKey: K,
    options: {
      tenantId: string;
      payload: NotificationPayload[K];
      relatedEntity?: { type: string; id: string };
      // optional injected client for tests
      prismaClient?: PrismaClient;
    }
  ): Promise<{ sent: number; skipped: number; failed: number }>

Steps (mirroring design doc):

  const db = options.prismaClient ?? prisma;
  const audits: AuditLogEntry[] = [];
  let sent = 0, skipped = 0, failed = 0;

  try {
    // 1. Fetch global NotificationTemplate
    const template = await db.notificationTemplate.findUnique({ where: { triggerKey } });
    if (!template || !template.isActive) {
      audits.push({
        tenantId: options.tenantId, triggerKey,
        channel: 'EMAIL', status: 'SKIPPED_DISABLED',
        idempotencyKey: `disabled-global:${triggerKey}:${Date.now()}`,
        relatedEntityType: options.relatedEntity?.type, relatedEntityId: options.relatedEntity?.id,
        errorMessage: !template ? 'Template not found' : 'Template globally disabled',
      });
      skipped++;
      return { sent, skipped, failed };
    }

    // 2. Fetch TenantNotificationSettings
    const tenantSettings = await db.tenantNotificationSettings.findUnique({
      where: { tenantId_triggerKey: { tenantId: options.tenantId, triggerKey } },
    });
    if (tenantSettings && tenantSettings.isEnabled === false) {
      audits.push({
        tenantId: options.tenantId, triggerKey,
        channel: 'EMAIL', status: 'SKIPPED_DISABLED',
        idempotencyKey: `disabled-tenant:${options.tenantId}:${triggerKey}:${Date.now()}`,
        relatedEntityType: options.relatedEntity?.type, relatedEntityId: options.relatedEntity?.id,
        errorMessage: 'Tenant disabled this trigger',
      });
      skipped++;
      return { sent, skipped, failed };
    }

    // 3. Resolve recipients
    const defaultRules = (template.defaultRecipients as DefaultRecipientRule[]) ?? [];
    const recipients = await resolveRecipients(
      db, options.tenantId, triggerKey, defaultRules, options.payload as Record<string, string>
    );

    // 4. Resolve template content (tenant override or global default)
    const blockJson = tenantSettings?.customBlockJson ?? template.defaultBlockJson;
    const subject = (tenantSettings?.customSubject ?? template.defaultSubject) as string;

    // 5. Render once (HTML + final subject) — shared by all recipients
    const { html, subjectFinal } = await renderTemplate(
      blockJson, options.payload as Record<string, string>, subject
    );

    // 6-10. Per-recipient fan-out with isolated error boundaries
    for (const r of recipients) {
      try {
        // 6a. EMAIL channel
        if (r.emailEnabled) {
          const idemKey = buildIdempotencyKey(triggerKey, options.relatedEntity, r.userId, false);
          const already = await checkIdempotency(db, idemKey);
          if (already) {
            audits.push({
              tenantId: options.tenantId, triggerKey,
              recipientUserId: r.userId, recipientEmail: r.email,
              channel: 'EMAIL', subject: subjectFinal,
              status: 'SKIPPED_IDEMPOTENT', idempotencyKey: idemKey,
              relatedEntityType: options.relatedEntity?.type, relatedEntityId: options.relatedEntity?.id,
            });
            skipped++;
          } else {
            try {
              await resend.emails.send({
                from: FROM_EMAIL,
                to: r.email,
                subject: subjectFinal,
                react: React.createElement(DynamicTemplateEmail, { bodyHtml: html }),
              });
              audits.push({
                tenantId: options.tenantId, triggerKey,
                recipientUserId: r.userId, recipientEmail: r.email,
                channel: 'EMAIL', subject: subjectFinal,
                status: 'SENT', idempotencyKey: idemKey,
                relatedEntityType: options.relatedEntity?.type, relatedEntityId: options.relatedEntity?.id,
              });
              sent++;
            } catch (err) {
              audits.push({
                tenantId: options.tenantId, triggerKey,
                recipientUserId: r.userId, recipientEmail: r.email,
                channel: 'EMAIL', subject: subjectFinal,
                status: 'FAILED', idempotencyKey: idemKey,
                errorMessage: (err as Error).message?.slice(0, 1000),
                relatedEntityType: options.relatedEntity?.type, relatedEntityId: options.relatedEntity?.id,
              });
              failed++;
            }
          }
        } else {
          audits.push({
            tenantId: options.tenantId, triggerKey,
            recipientUserId: r.userId, recipientEmail: r.email,
            channel: 'EMAIL', subject: subjectFinal,
            status: 'SKIPPED_USER_PREF',
            idempotencyKey: `pref-off:${triggerKey}:${r.userId}:${Date.now()}`,
            relatedEntityType: options.relatedEntity?.type, relatedEntityId: options.relatedEntity?.id,
          });
          skipped++;
        }

        // 6b. IN_APP channel (independent of email outcome)
        if (r.inAppEnabled) {
          const idemKeyApp = buildIdempotencyKey(triggerKey, options.relatedEntity, r.userId, false) + ':inapp';
          try {
            await writeInAppNotification(db, {
              tenantId: options.tenantId,
              userId: r.userId,
              triggerKey,
              title: subjectFinal,
              message: stripHtml(html),         // see helper below
              relatedEntity: options.relatedEntity,
            });
            audits.push({
              tenantId: options.tenantId, triggerKey,
              recipientUserId: r.userId,
              channel: 'IN_APP', subject: subjectFinal,
              status: 'SENT', idempotencyKey: idemKeyApp,
              relatedEntityType: options.relatedEntity?.type, relatedEntityId: options.relatedEntity?.id,
            });
            sent++;
          } catch (err) {
            audits.push({
              tenantId: options.tenantId, triggerKey,
              recipientUserId: r.userId,
              channel: 'IN_APP', subject: subjectFinal,
              status: 'FAILED', idempotencyKey: idemKeyApp,
              errorMessage: (err as Error).message?.slice(0, 1000),
              relatedEntityType: options.relatedEntity?.type, relatedEntityId: options.relatedEntity?.id,
            });
            failed++;
          }
        } else {
          audits.push({
            tenantId: options.tenantId, triggerKey,
            recipientUserId: r.userId,
            channel: 'IN_APP', subject: subjectFinal,
            status: 'SKIPPED_USER_PREF',
            idempotencyKey: `pref-off-inapp:${triggerKey}:${r.userId}:${Date.now()}`,
            relatedEntityType: options.relatedEntity?.type, relatedEntityId: options.relatedEntity?.id,
          });
          skipped++;
        }
      } catch (perRecipientErr) {
        // Catch-all per recipient — never let one bad recipient kill the loop
        console.error('[notifications] recipient dispatch failed', r.userId, perRecipientErr);
        failed++;
      }
    }
  } catch (outerErr) {
    console.error('[notifications] dispatch failed before fan-out', outerErr);
    failed++;
  } finally {
    // 10. Persist all audit rows in one transaction
    await writeAuditLog(db, audits);
  }

  return { sent, skipped, failed };

Helper (internal, not exported):
  function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 500);
  }

CRITICAL constraints:
  - Field names like `customBlockJson`, `defaultBlockJson`, `customSubject`, `defaultSubject`,
    `isActive`, `isEnabled`, `defaultRecipients`, and the composite unique on
    TenantNotificationSettings (`tenantId_triggerKey`) MUST match what Plan 01 actually wrote.
    Open `apps/web/prisma/schema.prisma` first and adjust naming if any field differs.
  - The dispatcher ALWAYS returns. It NEVER throws to its caller.
  - Audit logging happens in `finally` so failures are recorded even on outer errors.
  - `prisma` is imported from the project's existing prisma client module — find it via
    `apps/web/src/lib/prisma.ts` or equivalent path used by Plan 01.
  </action>
  <verify>
  - `tsc --noEmit -p apps/web` compiles
  - Function signature matches the task contract exactly
  - All 10 steps from the design doc are present and traceable in code comments
  - No `throw` reaches the caller boundary
  </verify>
  <done>`dispatchNotification` executes the full 10-step flow with per-recipient isolation, idempotency, and complete audit coverage; always returns {sent,skipped,failed}.</done>
</task>

<task type="auto">
  <name>Task 9: Write Vitest unit tests for dispatcher</name>
  <files>apps/web/src/lib/notifications/__tests__/dispatcher.test.ts</files>
  <action>
Create Vitest tests that exercise dispatcher.ts via dependency injection (prismaClient option +
vi.mock on the resend client).

Structure:

  import { describe, it, expect, vi, beforeEach } from "vitest";

  // Mock the resend client at module level
  vi.mock("@/lib/email/resend-client", () => ({
    resend: { emails: { send: vi.fn().mockResolvedValue({ id: 'msg_1' }) } },
    FROM_EMAIL: 'noreply@drivecommand.app',
    sendEmail: vi.fn(),
  }));

  // Mock the base prisma module so the dispatcher's default import is also mocked
  // (the actual mock client is still passed via options.prismaClient — this prevents
  // accidental real DB access during import-time side effects)
  vi.mock("@/lib/prisma", () => ({ prisma: {} }));

  import { dispatchNotification } from "../dispatcher";
  import * as resendModule from "@/lib/email/resend-client";

Helper: build a `makeMockPrisma()` that returns an object with:
  - notificationTemplate.findUnique
  - tenantNotificationSettings.findUnique
  - user.findMany / user.findFirst
  - notificationSubscription.findMany
  - userNotificationPreference.findMany
  - notificationSendLog.findFirst (idempotency probe)
  - inAppNotification.create
  - $transaction (executes the callback or array)
  - $executeRawUnsafe (no-op)

Each test sets the return values it needs.

Tests required (all must pass):

  1. "globally inactive trigger -> SKIPPED_DISABLED, no email sent"
     - findUnique returns { isActive: false, ... }
     - expect resend.emails.send NOT called
     - expect result.skipped === 1, result.sent === 0
     - expect a SKIPPED_DISABLED audit row was queued

  2. "tenant-disabled trigger -> SKIPPED_DISABLED, no email sent"
     - template active, tenantSettings.isEnabled === false
     - expect resend.emails.send NOT called
     - expect SKIPPED_DISABLED audit row

  3. "email-off + in-app-on per-user pref -> email skipped, in-app fires"
     - one recipient with emailEnabled=false, inAppEnabled=true
     - expect resend.emails.send NOT called
     - expect inAppNotification.create called once
     - expect one SKIPPED_USER_PREF (EMAIL) audit and one SENT (IN_APP) audit

  4. "idempotent re-send -> second call SKIPS the email"
     - First call: findFirst returns null -> email sent
     - Second call: findFirst returns { id: 'log_1' } -> SKIPPED_IDEMPOTENT
     - expect resend.emails.send called exactly once across both invocations

  5. "variable substitution through full pipeline"
     - template defaultBlockJson = { type:'doc', content:[{type:'paragraph', content:[{type:'text', text:'Hi {{driverName}}'}]}] }
     - defaultSubject = 'Welcome {{driverName}}'
     - payload = { driverName: 'Alex' }
     - expect resend.emails.send called with subject 'Welcome Alex' and react element whose bodyHtml contains 'Hi Alex' and does NOT contain '{{driverName}}'

  6. "one recipient throws -> others still receive"
     - resend.emails.send mockImplementation: rejects for recipient1's email, resolves for recipient2's email
     - expect result.failed === 1 and result.sent >= 1 (in-app for both + email for r2)
     - expect FAILED audit for r1 and SENT audit for r2

CRITICAL:
  - Tests inject prismaClient via the options arg — no real DB.
  - Use `await dispatchNotification('test.trigger' as any, { ... })` casts where the test uses a fake triggerKey not in the union.
  - Reset mocks in beforeEach.
  </action>
  <verify>
  - `npm test -- dispatcher.test --workspace=apps/web` (or `cd apps/web && npm test -- dispatcher`) passes all 6 tests
  - No real network or DB calls during test run
  - `tsc --noEmit -p apps/web` still compiles
  </verify>
  <done>All 6 dispatcher scenarios are covered by passing Vitest tests.</done>
</task>

<task type="auto">
  <name>Task 10: Write README documenting the library</name>
  <files>apps/web/src/lib/notifications/README.md</files>
  <action>
Author a developer-facing README. Sections (in order):

  # Notification Dispatcher

  ## Public API
  The only function consumers should call is `dispatchNotification` exported from
  `apps/web/src/lib/notifications/dispatcher.ts`.

      import { dispatchNotification } from '@/lib/notifications/dispatcher';

      await dispatchNotification('load.created', {
        tenantId: ctx.tenantId,
        payload: {
          driverName: load.driver.name,
          loadNumber: load.number,
          pickupCity: load.pickup.city,
        },
        relatedEntity: { type: 'Load', id: load.id },
      });

  ### Usage example — server action call site

      // apps/web/src/actions/loads.ts
      'use server';
      ...
      await dispatchNotification('load.created', {
        tenantId,
        payload: { driverName, loadNumber, pickupCity },
        relatedEntity: { type: 'Load', id: load.id },
      });

  ### Usage example — cron call site

      // apps/web/src/app/api/cron/document-expiring/route.ts
      for (const doc of expiringDocs) {
        await dispatchNotification('document.expiring', {
          tenantId: doc.tenantId,
          payload: { documentType: doc.type, daysLeft: String(doc.daysLeft) },
          relatedEntity: { type: 'Document', id: doc.id },
        });
      }

  ## Dispatch Flow (10 steps)
  1. Fetch `NotificationTemplate` by `triggerKey`. If missing or `isActive === false`, log
     SKIPPED_DISABLED and return.
  2. Fetch `TenantNotificationSettings` for `(tenantId, triggerKey)`. If `isEnabled === false`,
     log SKIPPED_DISABLED and return.
  3. Resolve recipients via `resolveRecipients`: union of default rule matches (`role`,
     `tenant_owners`, `related`) with explicit `NotificationSubscription` rows.
  4. Apply per-user preferences from `UserNotificationPreference` (defaults: email=true, in_app=true).
  5. Pick template content: `customBlockJson ?? defaultBlockJson` and `customSubject ?? defaultSubject`.
  6. Render once via `renderTemplate`: Tiptap blockJson -> HTML -> variable substitution ->
     `DynamicTemplateEmail` shell -> final HTML string. Subject is substituted in parallel.
  7. Per recipient, build idempotency key and check `NotificationSendLog` for an existing SENT row;
     if found, log SKIPPED_IDEMPOTENT.
  8. Fan-out EMAIL via `resend.emails.send({ from, to, subject, react: <DynamicTemplateEmail …/> })`.
  9. Fan-out IN_APP via `writeInAppNotification` (inserts into existing `InAppNotification` table).
  10. Persist all audit rows into `NotificationSendLog` in one bypass_rls transaction (always
      runs, even on outer errors).

  ## How to Add a New Trigger
  1. Add the literal to the `TriggerKey` union in `apps/web/src/lib/notifications/types.ts`.
  2. Add the matching `NotificationPayload` entry (variable names = `{{varName}}` tokens).
  3. Seed a `NotificationTemplate` row via the seed runner (see Plan 01's
     `scripts/seed-notification-templates.ts`) with:
        - `defaultBlockJson` (Tiptap doc)
        - `defaultSubject`
        - `variables` (VariableDef[])
        - `defaultRecipients` (DefaultRecipientRule[])
  4. (Optional) Map the trigger prefix to an `InAppNotificationType` in `in-app-writer.ts` if a new
     family is being introduced — but prefer reusing the existing prefix mapping.
  5. Call `dispatchNotification('your.new.trigger', { … })` from the originating server action
     or cron route.

  ## Known Limitations
  - **InAppNotificationType enum is fixed.** It predates this system (Quick-228) and we MUST NOT
    extend it in this plan. Trigger keys are mapped by prefix:
      | Prefix | Mapped enum value |
      | --- | --- |
      | `load.*` | `load_delivered` |
      | `dispatch.*` | `dispatch_assigned` |
      | `pay.*` / `payroll.*` | `pay_record_ready` |
      | `invoice.*` | `invoice_generated` |
      | `compliance.*` / `document.*` | `compliance_alert` |
      | `stop.*` | `stop_completed` |
      | `assignment.*` | `needs_assignment` |
      | `message.*` / `fleet.*` | `fleet_message` |
      | (unmatched) | `compliance_alert` (catch-all) |
  - **`entityType` and `entityId` are required** on `InAppNotification`. When `relatedEntity` is
    omitted by the caller, we fall back to `entityType = triggerKey` and
    `entityId = '00000000-0000-0000-0000-000000000000'`. This is intentional and documented.
  - **`orgId` vs `tenantId` naming.** The legacy `InAppNotification` table uses `orgId` for what
    the rest of the notification system calls `tenantId`. The writer maps the two transparently.
  - **HTML injection.** `dangerouslySetInnerHTML` is used in exactly ONE place
    (`apps/web/src/emails/dynamic-template.tsx`) to wrap Tiptap-generated HTML. Never call it
    from anywhere else.
  - **Idempotency granularity.** Event triggers dedup at second-precision; digests dedup per UTC
    day. Tighter or looser windows require a code change to `buildIdempotencyKey`.
  - **No queue.** Dispatch is synchronous within the request. If Resend latency or volume becomes
    a problem, introduce a background job in a later plan — the public API will not change.
  </action>
  <verify>
  - `apps/web/src/lib/notifications/README.md` exists and renders in markdown preview
  - Contains all sections listed above (Public API, two usage examples, 10-step flow, How to Add,
    Known Limitations including the prefix mapping table and zero-UUID note)
  </verify>
  <done>README fully documents the public API, dispatch flow, extension steps, and every known limitation.</done>
</task>

</tasks>

<verification>
End-of-plan checks (run from `apps/web`):

1. Type-check: `npx tsc --noEmit` — zero errors
2. Unit tests: `npm test -- dispatcher.test` — all 6 tests pass
3. Module wiring: `node -e "require('./src/lib/notifications/dispatcher')"` — no import errors
4. Grep checks:
   - `rg -n "getTenantPrisma" apps/web/src/lib/notifications` returns nothing
   - `rg -n "dangerouslySetInnerHTML" apps/web/src` shows exactly one match (dynamic-template.tsx)
   - `rg -n "resend\.emails\.send" apps/web/src/lib/notifications/dispatcher.ts` returns at least one hit
5. No edits to: any pre-existing `apps/web/src/emails/*.tsx`, `prisma/schema.prisma`, any pre-existing
   file under `apps/web/src/lib/email/`.
</verification>

<success_criteria>
- All 10 tasks complete with their <verify> commands passing
- `dispatchNotification(triggerKey, options)` callable, fully typed against `TriggerKey`/`NotificationPayload`
- The 10-step flow from the design doc is observable in code and exercised by tests
- Every send/skip/fail emits a `NotificationSendLog` row
- Email path uses `resend.emails.send({ from, to, subject, react })` exactly once per send
- IN_APP path writes to the existing `InAppNotification` table without schema changes
- README explains usage, flow, extension, and all known limitations
- No changes to schema.prisma, no changes to existing emails, no changes to existing email helpers
</success_criteria>

<output>
After completion, create `.planning/quick/316-phase-41-plan-02-notification-dispatcher/316-SUMMARY.md`
documenting:
- Final file list with line counts
- The dispatch flow as implemented (any deviations from the design doc and why)
- Test results (6/6 passing)
- Any field-name adjustments made after reading the actual schema
- Outstanding follow-ups for Plans 03-05 (e.g., admin editor will use the same Tiptap StarterKit
  extension set to guarantee identical rendering)
</output>
