---
phase: quick-464
plan: 464
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/scripts/refresh-notification-html-cache.ts
autonomous: true

must_haves:
  truths:
    - "driver.invited transactional email renders exactly one header banner and one footer"
    - "driver.invited body no longer contains a stale <h2>DriveCommand</h2> heading"
    - "driver.invited defaultHtmlCache <h2> matches the seed headerText 'Driver invitation'"
  artifacts:
    - path: "apps/web/scripts/refresh-notification-html-cache.ts"
      provides: "Standalone tsx script that serializes Tiptap defaultBlockJson to HTML, reports staleness for all templates, and refreshes driver.invited defaultHtmlCache"
      contains: "refresh-notification-html-cache"
  key_links:
    - from: "apps/web/scripts/refresh-notification-html-cache.ts"
      to: "NotificationTemplate.defaultHtmlCache"
      via: "prisma.notificationTemplate.update for driver.invited"
      pattern: "defaultHtmlCache"
---

<objective>
Fix the doubled header/footer in DriveCommand's transactional email shell for the `driver.invited` notification.

The shell (`dynamic-template.tsx`) is already correct: one blue header banner, one footer, one body injection. The duplication comes from a STALE `defaultHtmlCache` on the `driver.invited` NotificationTemplate row. That cache was generated when the seed `headerText` was 'DriveCommand', so the body contains an `<h2>DriveCommand</h2>` that duplicates the shell brand banner. The seed later changed `headerText` to 'Driver invitation' in `defaultBlockJson` but never regenerated `defaultHtmlCache`.

Purpose: Eliminate the visible duplicate heading in invitation emails without touching shell code, dispatcher, or legacy templates.
Output: A standalone cache-refresh script and the corrected `driver.invited` cache row in production.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/src/emails/dynamic-template.tsx
@apps/web/src/lib/notifications/build-template.ts
@apps/web/prisma/seeds/seed-notifications.ts
@apps/web/scripts/backfill-notification-html-cache.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Confirm shell correctness + write the cache refresh script</name>
  <files>apps/web/scripts/refresh-notification-html-cache.ts</files>
  <action>
First, confirm (read-only, no edit) that `apps/web/src/emails/dynamic-template.tsx` renders exactly ONE header banner (`<Section style={headerStyle}><Text style={brandStyle}>{brandName}</Text></Section>`), ONE body injection (`<div dangerouslySetInnerHTML={{ __html: bodyHtml }} />`), and ONE footer (`Sent by {brandName}`). It is already correct — do NOT edit it. Record this confirmation in the SUMMARY.

Then create `apps/web/scripts/refresh-notification-html-cache.ts`. Do NOT modify the existing `backfill-notification-html-cache.ts` (that one only fills NULL caches via @tiptap/html). This new script targets STALE non-null caches using a dependency-free serializer.

Runnable from `apps/web/` via:
  npx tsx --env-file=.env.local scripts/refresh-notification-html-cache.ts

PrismaClient bootstrap — match existing seed scripts EXACTLY:
```ts
import { setDefaultResultOrder } from 'dns';
setDefaultResultOrder('ipv4first');

import dotenv from 'dotenv';
dotenv.config({ path: '../../.env.local' });
dotenv.config({ path: '.env.local' });
dotenv.config();

import { PrismaClient } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
```

Implement a simple Tiptap JSON -> HTML serializer (do NOT use generateHTML from @tiptap/html; do NOT add any npm package). Only these node types appear in buildDefaultTemplate output:
- `doc`: join serialized children with no separator
- `heading` (attrs.level: number): `<h{level}>{innerInline}</h{level}>`
- `paragraph`: `<p>{innerInline}</p>`; if no content/empty: `<p><br></p>`
- `text` with optional marks array. Apply marks innermost-to-outermost over escaped text:
  - `link` (attrs.href, attrs.target): `<a href="{escAttr(href)}" target="{escAttr(target)}" rel="noopener noreferrer nofollow">{...}</a>`
  - `bold`: `<strong>{...}</strong>`
  - `italic`: `<em>{...}</em>`
  - unknown mark types: passthrough (no wrapping)

Escaping helpers:
  - escText(s): replace & -> &amp;, then < -> &lt;, then > -> &gt;
  - escAttr(s): replace & -> &amp;, then " -> &quot;
(Replace & FIRST in both to avoid double-escaping.)

Script logic:
1. Validate connection string exists (DIRECT_URL || DATABASE_URL); throw if neither set.
2. Fetch ALL NotificationTemplate rows: select id, triggerKey, defaultBlockJson, defaultHtmlCache.
3. For each row, serialize defaultBlockJson to HTML with the serializer above. Extract the first <h2>...</h2> inner text (regex) from both the freshly-serialized HTML and the existing defaultHtmlCache (may be null) for reporting.
4. Build a staleness report: a row is "STALE" if existing defaultHtmlCache is non-null AND differs from freshly-serialized HTML. Print a table/line per template: triggerKey, status (FRESH / STALE / NULL-CACHE), oldH2, newH2.
5. Update defaultHtmlCache ONLY for triggerKey === 'driver.invited' (targeted, safe). Do NOT update any other row.
6. Print explicit before/after for driver.invited: old first <h2> text vs new first <h2> text, and old vs new cache char length.
7. await prisma.$disconnect(); await pool.end();
8. main().catch(err => { console.error(err); process.exit(1); });

Add a top-of-file doc comment describing purpose and the exact run command.
  </action>
  <verify>
`npx tsc --noEmit` from apps/web introduces no NEW errors in this file (script must be type-clean against the generated Prisma client and pg/adapter types). Confirm the file exists and exports a `main()` invoked at module bottom.
  </verify>
  <done>
`apps/web/scripts/refresh-notification-html-cache.ts` exists, uses the exact seed-script Prisma bootstrap, contains a dependency-free Tiptap serializer, prints a full staleness report, and updates defaultHtmlCache only for driver.invited. dynamic-template.tsx confirmed unchanged and correct.
  </done>
</task>

<task type="auto">
  <name>Task 2: Run the script against production DB and capture output</name>
  <files>apps/web/scripts/refresh-notification-html-cache.ts</files>
  <action>
From `apps/web/`, run:
  npx tsx --env-file=.env.local scripts/refresh-notification-html-cache.ts

Capture the full stdout. Confirm in the output:
- driver.invited old first <h2> text (expected "DriveCommand" or whatever stale value) and new first <h2> text "Driver invitation".
- driver.invited cache was updated (one update performed).
- The staleness report listing for ALL templates, noting any OTHER templates flagged STALE (record them in the SUMMARY so the user knows whether the same drift affects other notifications — but do NOT update them; this task is scoped to driver.invited only).

Apply the fix via this script against the Supabase connection (DIRECT_URL || DATABASE_URL). Do NOT use prisma migrate. Do NOT modify dispatcher.ts, the legacy driver-invitation.tsx, or send-driver-invitation.ts.
  </action>
  <verify>
Script exits 0. Output shows driver.invited new <h2> = "Driver invitation" and that exactly one row (driver.invited) was updated.
  </verify>
  <done>
driver.invited defaultHtmlCache in production now contains an <h2>Driver invitation</h2> instead of <h2>DriveCommand</h2>; the doubled heading is eliminated. Staleness of any other templates is recorded in the SUMMARY.
  </done>
</task>

<task type="auto">
  <name>Task 3: TypeScript regression check</name>
  <files>apps/web/scripts/refresh-notification-html-cache.ts</files>
  <action>
From `apps/web/`, run:
  npx tsc --noEmit

Compare error count against the known pre-existing baseline of 35 errors (framer-motion, zustand, nuqs, papaparse, d3-geo, @tanstack/react-virtual missing @types — per feedback_tsc_baseline_errors). Only fail if there are NEW errors beyond baseline OR any error originating in the new script file.
  </action>
  <verify>
`npx tsc --noEmit` produces no NEW errors versus the 35-error baseline and zero errors referencing scripts/refresh-notification-html-cache.ts.
  </verify>
  <done>
No TypeScript regressions introduced by the new script.
  </done>
</task>

</tasks>

<verification>
- dynamic-template.tsx confirmed unchanged (single header, single body injection, single footer).
- New script exists and is dependency-free (no new npm packages, no @tiptap/html import).
- Script run output shows driver.invited new <h2> = "Driver invitation".
- Only driver.invited row updated; staleness report covers all templates.
- tsc --noEmit shows no new errors.
</verification>

<success_criteria>
- `driver.invited` invitation email shows one brand banner (shell), one body heading "Driver invitation", and one footer — no duplicate "DriveCommand" heading in the body.
- `apps/web/scripts/refresh-notification-html-cache.ts` is a standalone, re-runnable, dependency-free script.
- No changes to dispatcher.ts, driver-invitation.tsx, send-driver-invitation.ts, or dynamic-template.tsx.
- No prisma migrate used; fix applied via script + Supabase connection.
</success_criteria>

<output>
After completion, create `.planning/quick/464-fix-doubled-header-footer-in-transaction/464-SUMMARY.md`.
Record: confirmation that dynamic-template.tsx is correct, the driver.invited old vs new <h2>, and a list of any OTHER templates the script flagged as STALE.
</output>
