---
phase: 36-owner-map-fleet
plan: 02a
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/src/app/api/mobile/owner/fleet/messages/route.ts
  - packages/api-client/src/owner.ts
autonomous: true

must_haves:
  truths:
    - "FleetMessage model supports targeted messages with recipientId and broadcast flag"
    - "Owner can send a message to a specific driver via POST endpoint"
    - "Owner can broadcast a message to all active drivers via POST endpoint"
    - "Owner can retrieve sent message history via GET endpoint"
    - "Sending a message triggers push notification to recipient(s)"
  artifacts:
    - path: "apps/web/prisma/schema.prisma"
      provides: "FleetMessage model with recipientId and isBroadcast fields"
      contains: "recipientId"
    - path: "apps/web/src/app/api/mobile/owner/fleet/messages/route.ts"
      provides: "GET (history) and POST (send) endpoints for fleet messages"
      exports: ["GET", "POST"]
    - path: "packages/api-client/src/owner.ts"
      provides: "getFleetMessages, sendFleetMessage methods and FleetMessageSummary type"
      contains: "getFleetMessages"
  key_links:
    - from: "apps/web/src/app/api/mobile/owner/fleet/messages/route.ts"
      to: "prisma.fleetMessage"
      via: "database query"
      pattern: "prisma\\.fleetMessage\\.(find|create)"
    - from: "packages/api-client/src/owner.ts"
      to: "/api/mobile/owner/fleet/messages"
      via: "apiRequest calls"
      pattern: "api/mobile/owner/fleet/messages"
---

<objective>
Add schema support, REST endpoints, and api-client methods for owner fleet messaging (send to individual driver or broadcast to all).

Purpose: Backend foundation for fleet communication feature — schema migration, API endpoints, and typed client methods.
Output: Working GET/POST endpoints for fleet messages with push notification integration.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@packages/api-client/src/owner.ts
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add recipientId and isBroadcast fields to FleetMessage model</name>
  <files>
    apps/web/prisma/schema.prisma
  </files>
  <action>
Add two new fields to the FleetMessage model in schema.prisma:
- `recipientId  String?  @db.Uuid` — the target driver's userId (null for broadcasts)
- `isBroadcast  Boolean  @default(false)` — true when message sent to all drivers

Add index: `@@index([senderId])` for efficient history queries by sender.

Run migration:
```bash
cd apps/web && npx prisma migrate dev --name add-fleet-message-recipient
```

Then regenerate Prisma client:
```bash
cd apps/web && npx prisma generate
```
  </action>
  <verify>
Migration file created and applied successfully.
`npx prisma validate` passes.
FleetMessage model in generated client includes recipientId and isBroadcast fields.
  </verify>
  <done>
FleetMessage model has recipientId (optional UUID) and isBroadcast (boolean, default false) fields. Migration applied to database.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create GET and POST endpoints for fleet messages</name>
  <files>
    apps/web/src/app/api/mobile/owner/fleet/messages/route.ts
  </files>
  <action>
Create apps/web/src/app/api/mobile/owner/fleet/messages/route.ts with both GET and POST handlers.

GET /api/mobile/owner/fleet/messages:
- Auth: Bearer token → tenantId, require OWNER role
- Query FleetMessage where senderId = authenticated user's ID AND tenantId matches
- Order by createdAt DESC
- For each message, resolve recipientId to a name via User table lookup (or return "All Drivers" if isBroadcast is true)
- Return: { messages: FleetMessageSummary[] }
- FleetMessageSummary shape: { id, recipientName, body, isBroadcast, createdAt }

POST /api/mobile/owner/fleet/messages:
- Auth: Bearer token → tenantId, userId, require OWNER role
- Body: { recipientId?: string, body: string, isBroadcast?: boolean }
- Validate: body is non-empty string, max 500 chars
- If isBroadcast is true: recipientId should be null
- If isBroadcast is false/undefined: recipientId is required
- Create FleetMessage record with senderId = authenticated user ID, senderRole = 'OWNER', tenantId
- After create, send push notification:
  - If broadcast: query all active drivers for tenant, send push to each via sendPushToUser
  - If targeted: send push to recipientId via sendPushToUser
  - Push title: "Fleet Message", push body: first 100 chars of message body
- Return: { message: FleetMessageSummary }

Use existing push notification utility (sendPushToUser from the push notification module created in Phase 33).
  </action>
  <verify>
TypeScript compiles: `cd apps/web && npx tsc --noEmit`
Route file exports GET and POST functions.
  </verify>
  <done>
GET returns owner's sent message history with recipient names. POST creates a fleet message and sends push notification to target driver(s). Both endpoints require OWNER auth.
  </done>
</task>

<task type="auto">
  <name>Task 3: Add fleet messaging methods to api-client</name>
  <files>
    packages/api-client/src/owner.ts
  </files>
  <action>
Add to packages/api-client/src/owner.ts:

Types:
```typescript
export interface FleetMessageSummary {
  id: string
  recipientName: string
  body: string
  isBroadcast: boolean
  createdAt: string
}

export interface SendFleetMessagePayload {
  recipientId?: string
  body: string
  isBroadcast?: boolean
}
```

Methods on ownerApi:
```typescript
getFleetMessages: (token: string) =>
  apiRequest<{ messages: FleetMessageSummary[] }>('/api/mobile/owner/fleet/messages', { token }),

sendFleetMessage: (token: string, payload: SendFleetMessagePayload) =>
  apiRequest<{ message: FleetMessageSummary }>('/api/mobile/owner/fleet/messages', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  }),
```

Export FleetMessageSummary and SendFleetMessagePayload types.
  </action>
  <verify>
TypeScript compiles: `cd packages/api-client && npx tsc --noEmit`
ownerApi has getFleetMessages and sendFleetMessage methods.
  </verify>
  <done>
Api-client exports FleetMessageSummary type, SendFleetMessagePayload type, and ownerApi.getFleetMessages / ownerApi.sendFleetMessage methods.
  </done>
</task>

</tasks>

<verification>
- [ ] Prisma migration applied, FleetMessage has recipientId and isBroadcast
- [ ] GET /api/mobile/owner/fleet/messages returns sent messages with recipient names
- [ ] POST /api/mobile/owner/fleet/messages creates message and triggers push
- [ ] Broadcast messages send push to all active drivers
- [ ] Targeted messages send push to specific driver
- [ ] Api-client methods are typed and callable
</verification>

<success_criteria>
Fleet messaging backend is complete: schema supports targeted/broadcast messages, REST endpoints handle CRUD and push notifications, api-client provides typed methods for mobile consumption.
</success_criteria>

<output>
After completion, create `.planning/phases/36-owner-map-fleet/36-02a-SUMMARY.md`
</output>
