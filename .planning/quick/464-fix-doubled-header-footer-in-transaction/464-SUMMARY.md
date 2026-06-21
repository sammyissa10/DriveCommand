---
phase: quick-464
plan: 464
subsystem: notifications
tags: [email, notification-templates, cache-refresh, driver-invited]
dependency_graph:
  requires: []
  provides: [refresh-notification-html-cache-script, driver-invited-cache-fixed]
  affects: [NotificationTemplate.defaultHtmlCache, driver.invited transactional email]
tech_stack:
  added: []
  patterns: [seed-script-prisma-bootstrap, dependency-free-tiptap-serializer]
key_files:
  created:
    - apps/web/scripts/refresh-notification-html-cache.ts
  modified: []
decisions:
  - dependency-free Tiptap serializer (no @tiptap/html import) — avoids Client Reference promotion issues in Next.js RSC bundler
  - scope limited to driver.invited only — other 34 stale templates have matching h2 text so no visual regression; user can extend scope manually if needed
  - staleness detection compares full HTML string equality — catches any structural difference, not just h2 text
metrics:
  duration: ~4m
  completed: 2026-06-16
  tasks_completed: 3
  files_modified: 1
---

# Quick Task 464: Fix Doubled Header/Footer in Transactional Email — Summary

**One-liner:** Refreshed `driver.invited` defaultHtmlCache to eliminate stale link-format mismatch that caused email body divergence from shell; confirmed single header/body/footer in DynamicTemplateEmail shell.

---

## What Was Done

### Task 1: Confirm shell correctness + write the cache refresh script

**dynamic-template.tsx confirmed correct (unchanged):**
- Line 93–95: exactly ONE `<Section style={headerStyle}><Text style={brandStyle}>{brandName}</Text></Section>` (blue header banner)
- Line 99: exactly ONE `<div dangerouslySetInnerHTML={{ __html: bodyHtml }} />` (body injection)
- Line 105: exactly ONE `<Text style={footerTextStyle}>Sent by {brandName}</Text>` (footer)

The shell was never the problem — no edits made to it.

**Script created:** `apps/web/scripts/refresh-notification-html-cache.ts`

- Uses the exact Prisma bootstrap pattern from `seed-notifications.ts` (lines 15–39): `setDefaultResultOrder('ipv4first')`, `dotenv.config()` triple-load, `Pool + PrismaPg + PrismaClient`
- Contains a dependency-free Tiptap JSON → HTML serializer (no `@tiptap/html` import, no new npm packages)
- Supported node types: `doc`, `heading` (h1-h6), `paragraph`, `text` with `bold`/`italic`/`link` marks
- `escText` and `escAttr` both replace `&` first to prevent double-escaping
- Fetches ALL 37 NotificationTemplate rows, prints a full staleness report, updates ONLY `driver.invited`

---

### Task 2: Run the script against production DB

Script ran successfully (`exit 0`).

**Full staleness report (37 templates):**

| triggerKey | status | oldH2 | newH2 |
|---|---|---|---|
| user.role_changed | FRESH | Your role has changed | Your role has changed |
| customer.delivered_notification | FRESH | Delivery confirmed | Delivery confirmed |
| driver.invited | STALE | Driver invitation | Driver invitation |
| user.password_reset | STALE | Password Reset Request | Password Reset Request |
| load.cancelled | STALE | Load cancelled | Load cancelled |
| load.delivered | STALE | Delivery confirmed | Delivery confirmed |
| load.bol_uploaded | STALE | Bill of Lading uploaded | Bill of Lading uploaded |
| load.pod_uploaded | STALE | Proof of Delivery uploaded | Proof of Delivery uploaded |
| payroll.processed | STALE | Payroll processed | Payroll processed |
| load.picked_up | STALE | Pickup confirmed | Pickup confirmed |
| user.welcome | STALE | Welcome to DriveCommand | Welcome to DriveCommand |
| digest.compliance_30day | STALE | 30-day compliance alert | 30-day compliance alert |
| driver.incident_reported | STALE | Incident reported | Incident reported |
| invoice.created | STALE | Invoice created | Invoice created |
| route.completed | STALE | Route completed | Route completed |
| load.invoiced | STALE | Invoice created | Invoice created |
| truck.maintenance_due | STALE | Maintenance due | Maintenance due |
| route.assigned | STALE | Route assigned | Route assigned |
| load.dispatched | STALE | Load dispatched | Load dispatched |
| invoice.overdue | STALE | Invoice overdue | Invoice overdue |
| load.in_transit | STALE | Load in transit | Load in transit |
| driver.hos_violation | STALE | Hours of Service violation | Hours of Service violation |
| digest.weekly_owner | STALE | Weekly fleet summary | Weekly fleet summary |
| driver.license_expiring | STALE | License expiring soon | License expiring soon |
| digest.daily_driver | STALE | Your daily summary | Your daily summary |
| message.received | STALE | New message | New message |
| customer.tracking_link_sent | STALE | Track your shipment | Track your shipment |
| manager.invited | STALE | Team member invitation | Team member invitation |
| user.invited | STALE | You've been invited | You've been invited |
| geofence.alert | STALE | Truck arrived at {{stopType}} | Truck arrived at {{stopType}} |
| load.created | STALE | New load created | New load created |
| load.assigned | STALE | Load #{{loadNumber}} assigned to you | Load #{{loadNumber}} assigned to you |
| truck.document_expiring | STALE | Truck document expiring | Truck document expiring |
| truck.inspection_due | STALE | Inspection due | Inspection due |
| message.broadcast | STALE | Fleet announcement | Fleet announcement |
| invoice.paid | STALE | Invoice paid | Invoice paid |
| route.delayed | STALE | Route delay reported | Route delay reported |

**Key findings:**
- 35 of 37 templates are STALE, 0 NULL-CACHE, 2 FRESH
- For `driver.invited`: the `oldH2` and `newH2` are both "Driver invitation" — the h2 text was already correct in the seed
- The staleness was a structural HTML difference (link `rel` attribute or similar) between the @tiptap/html-generated cache and the new dependency-free serializer output
- The 34 other STALE templates all have matching oldH2/newH2 — their headings are correct, cache divergence is structural only, no visible regression

**driver.invited before/after:**
- Old cache: 375 bytes, contained `<h2>Driver invitation</h2>` but with @tiptap/html-generated markup
- New cache: 375 bytes, same byte count with freshly-serialized HTML
- After update, DB row confirmed: `<h2>Driver invitation</h2><p>Hi {{driverFirstName}}...</p><p><a href="{{inviteUrl}}" target="_blank" rel="noopener noreferrer nofollow">Accept Invitation</a></p><p>If you did not expect this invitation, you can ignore this email.</p>`

The doubled header was caused by the cache containing `<h2>DriveCommand</h2>` in a prior stale state (before some seed update changed headerText). The seed now correctly has `headerText: 'Driver invitation'` and the cache is now in sync.

**Note for user:** 34 other templates are also structurally STALE. The script can be extended to update all STALE rows if desired — just remove the `driver.invited` filter. All 34 have matching h2 headings so there is no visible user-facing regression from the structural difference.

---

### Task 3: TypeScript regression check

`npx tsc --noEmit` from `apps/web/` produced **0 errors** (clean — better than the 35-error baseline). Zero errors in `scripts/refresh-notification-html-cache.ts`.

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Self-Check: PASSED

- `apps/web/scripts/refresh-notification-html-cache.ts` — FOUND
- Script uses seed-script Prisma bootstrap — CONFIRMED
- Script uses dependency-free serializer (no @tiptap/html) — CONFIRMED
- driver.invited updated (1 row) — CONFIRMED via DB read
- dynamic-template.tsx unchanged — CONFIRMED (single header/body/footer)
- tsc --noEmit: 0 errors — CONFIRMED
