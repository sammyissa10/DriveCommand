# Raw Prisma Usage Audit

**Generated:** 2026-05-15T06:06:45.343Z
**Scanned:** apps/web/src, packages/\*/src
**Spec reference:** docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md §2.6

## Summary

| Classification | Count |
|---|---|
| INTENTIONAL_ALLOWED | 297 |
| LEAK_RISK | 0 |
| **Total** | **297** |

## LEAK_RISK (must fix — bypasses tenant-scoped client)

None — audit passes

## INTENTIONAL_ALLOWED (infrastructure / migrations / reporting with requireTenantContext)

### apps/web/src/actions/doc-feedback.ts

| Line | Pattern | Code |
|---|---|---|
| 32 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/actions/support-tickets.ts

| Line | Pattern | Code |
|---|---|---|
| 98 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 169 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 217 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 239 | $queryRaw | `// Use $queryRaw — raw SQL bypasses RLS entirely, no set_config needed.` |
| 270 | $queryRawUnsafe | `const tickets = await prisma.$queryRawUnsafe<RawTicket[]>(` |
| 285 | $queryRaw | `prisma.$queryRaw<RawUser[]>`` |
| 289 | $queryRaw | `? prisma.$queryRaw<RawTenant[]>`SELECT id, name FROM "Tenant" WHERE id = ANY(${tenantIds}::uuid[])`` |
| 291 | $queryRaw | `prisma.$queryRaw<RawAuthUser[]>`` |
| 341 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 371 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 410 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 475 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 486 | $queryRaw | `const users = await tx.$queryRaw<RawUser[]>`` |
| 542 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 562 | $queryRaw | `const result = await prisma.$queryRaw<RawResult[]>`` |

### apps/web/src/app/(admin)/actions/automations.ts

| Line | Pattern | Code |
|---|---|---|
| 107 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 141 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 151 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/(admin)/actions/tenants.ts

| Line | Pattern | Code |
|---|---|---|
| 564 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/(auth)/sign-up/actions.tsx

| Line | Pattern | Code |
|---|---|---|
| 189 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/(driver)/actions/driver-dashboard.ts

| Line | Pattern | Code |
|---|---|---|
| 74 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 86 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/(driver)/actions/driver-load.ts

| Line | Pattern | Code |
|---|---|---|
| 40 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/(driver)/actions/driver-routes.ts

| Line | Pattern | Code |
|---|---|---|
| 45 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 121 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 178 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 220 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 264 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/(driver)/tasks/page.tsx

| Line | Pattern | Code |
|---|---|---|
| 148 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/(driver)/tasks/[id]/page.tsx

| Line | Pattern | Code |
|---|---|---|
| 181 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/(owner)/carrier/dashboard/page.tsx

| Line | Pattern | Code |
|---|---|---|
| 22 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 28 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx

| Line | Pattern | Code |
|---|---|---|
| 97 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/(owner)/carrier/dispatches/[id]/stops/page.tsx

| Line | Pattern | Code |
|---|---|---|
| 102 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/(owner)/carrier/stops/[id]/page.tsx

| Line | Pattern | Code |
|---|---|---|
| 76 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 95 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 105 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/(owner)/fuel/actions.ts

| Line | Pattern | Code |
|---|---|---|
| 74 | $queryRaw | `? tx.$queryRaw`` |
| 84 | $queryRaw | `: tx.$queryRaw`` |
| 133 | $queryRaw | `? tx.$queryRaw`` |
| 145 | $queryRaw | `: tx.$queryRaw`` |
| 210 | $queryRaw | `? tx.$queryRaw`` |
| 225 | $queryRaw | `: tx.$queryRaw`` |
| 284 | $queryRaw | `? tx.$queryRaw`` |
| 299 | $queryRaw | `: tx.$queryRaw`` |
| 362 | $queryRaw | `? tx.$queryRaw`` |
| 379 | $queryRaw | `: tx.$queryRaw`` |

### apps/web/src/app/(owner)/layout.tsx

| Line | Pattern | Code |
|---|---|---|
| 42 | $queryRaw | `const rows = await prisma.$queryRaw<{ name: string }[]>`` |

### apps/web/src/app/(owner)/live-map/actions.ts

| Line | Pattern | Code |
|---|---|---|
| 44 | $queryRaw | `tx.$queryRaw`` |
| 78 | $queryRaw | `tx.$queryRaw`` |
| 97 | $queryRaw | `tx.$queryRaw`` |
| 360 | $queryRaw | `tx.$queryRaw`` |
| 379 | $queryRaw | `tx.$queryRaw`` |
| 400 | $queryRaw | `tx.$queryRaw`` |

### apps/web/src/app/(owner)/safety/actions.ts

| Line | Pattern | Code |
|---|---|---|
| 58 | $queryRaw | `? tx.$queryRaw`` |
| 65 | $queryRaw | `: tx.$queryRaw`` |
| 115 | $queryRaw | `? await tx.$queryRaw`` |
| 123 | $queryRaw | `: await tx.$queryRaw`` |
| 132 | $queryRaw | `? await tx.$queryRaw`` |
| 139 | $queryRaw | `: await tx.$queryRaw`` |
| 182 | $queryRaw | `? tx.$queryRaw`` |
| 190 | $queryRaw | `: tx.$queryRaw`` |
| 258 | $queryRaw | `? tx.$queryRaw`` |
| 276 | $queryRaw | `: tx.$queryRaw`` |

### apps/web/src/app/api/auth/accept-invitation/route.ts

| Line | Pattern | Code |
|---|---|---|
| 42 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 119 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 154 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 211 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/auth/login/route.ts

| Line | Pattern | Code |
|---|---|---|
| 143 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/cron/auto-close-tickets/route.ts

| Line | Pattern | Code |
|---|---|---|
| 24 | $queryRaw | `const tickets = await prisma.$queryRaw<RawTicket[]>`` |
| 53 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/cron/automations/route.ts

| Line | Pattern | Code |
|---|---|---|
| 179 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/cron/carrier-compliance-alerts/route.ts

| Line | Pattern | Code |
|---|---|---|
| 38 | $executeRawUnsafe | `await prisma.$executeRawUnsafe(`` |
| 88 | $executeRaw | `await prisma.$executeRaw(Prisma.sql`` |

### apps/web/src/app/api/cron/digest-compliance-30day/route.ts

| Line | Pattern | Code |
|---|---|---|
| 42 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/cron/digest-daily-driver/route.ts

| Line | Pattern | Code |
|---|---|---|
| 42 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/cron/digest-weekly-owner/route.ts

| Line | Pattern | Code |
|---|---|---|
| 42 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/cron/send-reminders/route.ts

| Line | Pattern | Code |
|---|---|---|
| 62 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/cron/workflow-digest/route.ts

| Line | Pattern | Code |
|---|---|---|
| 50 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 73 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 93 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 164 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 173 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/cron/workflow-notifications/route.ts

| Line | Pattern | Code |
|---|---|---|
| 57 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 81 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 96 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 121 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/driver/gps-ping/route.ts

| Line | Pattern | Code |
|---|---|---|
| 68 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/driver/stops/[stopId]/documents/route.ts

| Line | Pattern | Code |
|---|---|---|
| 117 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 176 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 241 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/driver/stops/[stopId]/messages/route.ts

| Line | Pattern | Code |
|---|---|---|
| 39 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 63 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 89 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 102 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 180 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 204 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 214 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/driver-pay/me/settlements/[id]/dispute/route.ts

| Line | Pattern | Code |
|---|---|---|
| 60 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 108 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/email-confirm/[token]/route.ts

| Line | Pattern | Code |
|---|---|---|
| 52 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/gps/report/route.ts

| Line | Pattern | Code |
|---|---|---|
| 88 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 120 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/integrations/motive/sync/route.ts

| Line | Pattern | Code |
|---|---|---|
| 54 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/integrations/samsara/sync/route.ts

| Line | Pattern | Code |
|---|---|---|
| 54 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/carrier/driver/dispatches/route.ts

| Line | Pattern | Code |
|---|---|---|
| 37 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/expenses/route.ts

| Line | Pattern | Code |
|---|---|---|
| 98 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/route.ts

| Line | Pattern | Code |
|---|---|---|
| 43 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/carrier/driver/stops/[stopId]/documents/route.ts

| Line | Pattern | Code |
|---|---|---|
| 111 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 157 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/driver/dashboard/route.ts

| Line | Pattern | Code |
|---|---|---|
| 30 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`` |

### apps/web/src/app/api/mobile/driver/documents/route.ts

| Line | Pattern | Code |
|---|---|---|
| 55 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 201 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/driver/documents/[id]/url/route.ts

| Line | Pattern | Code |
|---|---|---|
| 48 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/driver/hos/route.ts

| Line | Pattern | Code |
|---|---|---|
| 29 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`` |
| 174 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`` |

### apps/web/src/app/api/mobile/driver/incidents/route.ts

| Line | Pattern | Code |
|---|---|---|
| 38 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 134 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/driver/loads/route.ts

| Line | Pattern | Code |
|---|---|---|
| 55 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/driver/loads/[id]/rate-confirmation/route.ts

| Line | Pattern | Code |
|---|---|---|
| 53 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/driver/loads/[id]/revert/route.ts

| Line | Pattern | Code |
|---|---|---|
| 59 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/driver/loads/[id]/route.ts

| Line | Pattern | Code |
|---|---|---|
| 48 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/driver/loads/[id]/status/route.ts

| Line | Pattern | Code |
|---|---|---|
| 98 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/driver/messages/route-thread/route.ts

| Line | Pattern | Code |
|---|---|---|
| 45 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 114 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/driver/messages/route.ts

| Line | Pattern | Code |
|---|---|---|
| 31 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`` |
| 109 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`` |

### apps/web/src/app/api/mobile/driver/messages/unread-count/route.ts

| Line | Pattern | Code |
|---|---|---|
| 49 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/driver/route/route.ts

| Line | Pattern | Code |
|---|---|---|
| 40 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/driver/tasks/route.ts

| Line | Pattern | Code |
|---|---|---|
| 26 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`` |

### apps/web/src/app/api/mobile/driver/tracking-token/route.ts

| Line | Pattern | Code |
|---|---|---|
| 43 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/owner/compliance/route.ts

| Line | Pattern | Code |
|---|---|---|
| 45 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/owner/crm/route.ts

| Line | Pattern | Code |
|---|---|---|
| 42 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/owner/crm/[id]/route.ts

| Line | Pattern | Code |
|---|---|---|
| 41 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 194 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/owner/customers/route.ts

| Line | Pattern | Code |
|---|---|---|
| 41 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 96 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/owner/dashboard/route.ts

| Line | Pattern | Code |
|---|---|---|
| 30 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`` |

### apps/web/src/app/api/mobile/owner/drivers/active/route.ts

| Line | Pattern | Code |
|---|---|---|
| 41 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/owner/drivers/invite/route.ts

| Line | Pattern | Code |
|---|---|---|
| 66 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 79 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 88 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 107 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/owner/drivers/route.ts

| Line | Pattern | Code |
|---|---|---|
| 55 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`` |

### apps/web/src/app/api/mobile/owner/drivers/[id]/route.ts

| Line | Pattern | Code |
|---|---|---|
| 76 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 269 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/owner/fleet/messages/route.ts

| Line | Pattern | Code |
|---|---|---|
| 44 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 93 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 115 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 129 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 278 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 303 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts

| Line | Pattern | Code |
|---|---|---|
| 50 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 126 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 143 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 153 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 164 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 243 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 286 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/owner/fleet-positions/route.ts

| Line | Pattern | Code |
|---|---|---|
| 40 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 42 | $queryRaw | `return tx.$queryRaw<any[]>`` |

### apps/web/src/app/api/mobile/owner/fuel/route.ts

| Line | Pattern | Code |
|---|---|---|
| 37 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 153 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/owner/invoices/route.ts

| Line | Pattern | Code |
|---|---|---|
| 39 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 160 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/owner/invoices/[id]/route.ts

| Line | Pattern | Code |
|---|---|---|
| 34 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/owner/loads/route.ts

| Line | Pattern | Code |
|---|---|---|
| 65 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 185 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/owner/loads/[id]/assign-truck/route.ts

| Line | Pattern | Code |
|---|---|---|
| 55 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/owner/loads/[id]/route.ts

| Line | Pattern | Code |
|---|---|---|
| 53 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 177 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 221 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/owner/maintenance/route.ts

| Line | Pattern | Code |
|---|---|---|
| 81 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/owner/map/vehicles/route.ts

| Line | Pattern | Code |
|---|---|---|
| 44 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 46 | $queryRaw | `return tx.$queryRaw<any[]>`` |

### apps/web/src/app/api/mobile/owner/payroll/route.ts

| Line | Pattern | Code |
|---|---|---|
| 38 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 175 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/owner/payroll/[id]/route.ts

| Line | Pattern | Code |
|---|---|---|
| 41 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/owner/profit-predictor/route.ts

| Line | Pattern | Code |
|---|---|---|
| 66 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/owner/routes/route.ts

| Line | Pattern | Code |
|---|---|---|
| 61 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 208 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/owner/routes/[id]/route.ts

| Line | Pattern | Code |
|---|---|---|
| 44 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 140 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/owner/safety/route.ts

| Line | Pattern | Code |
|---|---|---|
| 49 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/owner/trucks/route.ts

| Line | Pattern | Code |
|---|---|---|
| 76 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 142 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/owner/trucks/[id]/maintenance/route.ts

| Line | Pattern | Code |
|---|---|---|
| 39 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 157 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/owner/trucks/[id]/route.ts

| Line | Pattern | Code |
|---|---|---|
| 40 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 202 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/owner/trucks/[id]/scheduled-service/route.ts

| Line | Pattern | Code |
|---|---|---|
| 84 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 206 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 319 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/mobile/support/ticket/route.ts

| Line | Pattern | Code |
|---|---|---|
| 39 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 97 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/push-tokens/route.ts

| Line | Pattern | Code |
|---|---|---|
| 54 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/v1/carrier/dashboard/drivers-status/route.ts

| Line | Pattern | Code |
|---|---|---|
| 62 | $queryRaw | `const hosRows = await prisma.$queryRaw<HosRow[]>(` |

### apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts

| Line | Pattern | Code |
|---|---|---|
| 112 | $queryRaw | `tx.$queryRaw`` |
| 142 | $queryRaw | `tx.$queryRaw`` |
| 181 | $queryRaw | `tx.$queryRaw`` |
| 206 | $queryRaw | `tx.$queryRaw`` |
| 228 | $queryRaw | `tx.$queryRaw`` |
| 260 | $queryRaw | `tx.$queryRaw`` |
| 275 | $queryRaw | `tx.$queryRaw`` |
| 338 | $queryRaw | `tx.$queryRaw`` |
| 363 | $queryRaw | `tx.$queryRaw`` |
| 390 | $queryRaw | `tx.$queryRaw`` |
| 403 | $queryRaw | `tx.$queryRaw`` |

### apps/web/src/app/api/v1/carrier/stops/[id]/messages/route.ts

| Line | Pattern | Code |
|---|---|---|
| 36 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 46 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 73 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 86 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 167 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 196 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/v1/messages/broadcast/route.ts

| Line | Pattern | Code |
|---|---|---|
| 54 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/v1/messages/conversations/route.ts

| Line | Pattern | Code |
|---|---|---|
| 38 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 74 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 94 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/v1/messages/send/route.ts

| Line | Pattern | Code |
|---|---|---|
| 64 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 76 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/v1/messages/thread/route.ts

| Line | Pattern | Code |
|---|---|---|
| 79 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 105 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 118 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/v1/messages/[id]/audio-url/route.ts

| Line | Pattern | Code |
|---|---|---|
| 36 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/app/api/warmup/route.ts

| Line | Pattern | Code |
|---|---|---|
| 15 | $queryRaw | `await prisma.$queryRaw`SELECT 1`;` |

### apps/web/src/app/onboarding/welcome/page.tsx

| Line | Pattern | Code |
|---|---|---|
| 18 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 44 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 58 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 174 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/lib/auth/supabase.ts

| Line | Pattern | Code |
|---|---|---|
| 146 | $executeRaw | `prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`,` |

### apps/web/src/lib/automations/evaluator.ts

| Line | Pattern | Code |
|---|---|---|
| 95 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 203 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/lib/carrier/facilities.ts

| Line | Pattern | Code |
|---|---|---|
| 51 | $queryRaw | `const rows = await prisma.$queryRaw<{ id: string }[]>`` |

### apps/web/src/lib/carrier/fleet-trucks.ts

| Line | Pattern | Code |
|---|---|---|
| 63 | $queryRawUnsafe | `const rows = await prisma.$queryRawUnsafe<Array<{ vehicle_id: string }>>(` |

### apps/web/src/lib/carrier/reports.ts

| Line | Pattern | Code |
|---|---|---|
| 133 | $queryRaw | `rows = await prisma.$queryRaw<RawRevenueRow[]>(Prisma.sql`` |
| 150 | $queryRaw | `rows = await prisma.$queryRaw<RawRevenueRow[]>(Prisma.sql`` |
| 276 | $queryRaw | `const rows = await prisma.$queryRaw<RawAgingRow[]>(Prisma.sql`` |
| 380 | $queryRaw | `rows = await prisma.$queryRaw<RawPerformanceRow[]>(Prisma.sql`` |
| 389 | $queryRaw | `rows = await prisma.$queryRaw<RawPerformanceRow[]>(Prisma.sql`` |
| 397 | $queryRaw | `rows = await prisma.$queryRaw<RawPerformanceRow[]>(Prisma.sql`` |
| 405 | $queryRaw | `rows = await prisma.$queryRaw<RawPerformanceRow[]>(Prisma.sql`` |

### apps/web/src/lib/context/tenant-context.ts

| Line | Pattern | Code |
|---|---|---|
| 40 | $queryRaw | `* Execute a callback containing raw SQL queries ($queryRaw / $executeRaw)` |
| 40 | $executeRaw | `* Execute a callback containing raw SQL queries ($queryRaw / $executeRaw)` |
| 53 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;` |

### apps/web/src/lib/db/prisma.ts

| Line | Pattern | Code |
|---|---|---|
| 44 | new PrismaClient( | `export const prisma = globalForPrisma.prisma \|\| new PrismaClient({ adapter });` |

### apps/web/src/lib/db/repositories/tenant.repository.ts

| Line | Pattern | Code |
|---|---|---|
| 33 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 66 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 87 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/lib/driver-pay/require-driver.ts

| Line | Pattern | Code |
|---|---|---|
| 105 | $executeRaw | `await (tx as unknown as { $executeRaw: (tpl: TemplateStringsArray) => Promise<unknown> })` |
| 106 | $executeRaw | `.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/lib/driver-pay/settlement-generator.ts

| Line | Pattern | Code |
|---|---|---|
| 129 | $queryRaw | `// Use $queryRaw with FOR UPDATE for row-level locking.` |
| 133 | $queryRaw | `const lockedRows = await (tx as unknown as { $queryRaw: PrismaClient['$queryRaw'] }).$queryRaw<` |

### apps/web/src/lib/email/send-geofence-alert.ts

| Line | Pattern | Code |
|---|---|---|
| 52 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/lib/geofencing/geofence-check.ts

| Line | Pattern | Code |
|---|---|---|
| 46 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 81 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 97 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 138 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 153 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 184 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 214 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 230 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/lib/integrations/motive.ts

| Line | Pattern | Code |
|---|---|---|
| 116 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;` |
| 174 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;` |

### apps/web/src/lib/integrations/samsara.ts

| Line | Pattern | Code |
|---|---|---|
| 109 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;` |
| 169 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;` |

### apps/web/src/lib/notifications/audit-log.ts

| Line | Pattern | Code |
|---|---|---|
| 44 | $executeRawUnsafe | `await tx.$executeRawUnsafe(` |

### apps/web/src/lib/notifications/send-push.ts

| Line | Pattern | Code |
|---|---|---|
| 27 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 68 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 111 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 158 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/lib/onboarding/activation-tracker.ts

| Line | Pattern | Code |
|---|---|---|
| 47 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 146 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/lib/onboarding/hydrate-tenant.ts

| Line | Pattern | Code |
|---|---|---|
| 13 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 36 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/lib/onboarding/provision-tenant.ts

| Line | Pattern | Code |
|---|---|---|
| 30 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 93 | $executeRaw | `const updated = await tx.$executeRaw`` |

### apps/web/src/lib/security/audit-log.ts

| Line | Pattern | Code |
|---|---|---|
| 55 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/server/api/routers/workflows/analytics.ts

| Line | Pattern | Code |
|---|---|---|
| 26 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 34 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 42 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 71 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 110 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 126 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 142 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/server/api/routers/workflows/instance.ts

| Line | Pattern | Code |
|---|---|---|
| 101 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/server/services/workflows/generatePlaybookInstance.ts

| Line | Pattern | Code |
|---|---|---|
| 59 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |

### apps/web/src/server/services/workflows/notifications.ts

| Line | Pattern | Code |
|---|---|---|
| 49 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 62 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 80 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 95 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 106 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 127 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 149 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 251 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 316 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
| 557 | $executeRaw | `await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;` |
