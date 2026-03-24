---
phase: quick
plan: 101
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/prisma/migrations/20260324000001_make_fleet_message_route_optional/migration.sql
  - apps/web/src/app/api/mobile/driver/messages/route.ts
  - packages/api-client/src/driver.ts
  - apps/mobile/app/(driver)/messages.tsx
autonomous: true

must_haves:
  truths:
    - "Driver can view all messages for their tenant (not just active route)"
    - "Driver can send a message from the mobile app"
    - "Messages display as chat bubbles with sender role differentiation"
    - "FleetMessage.routeId is optional in the database"
  artifacts:
    - path: "apps/web/prisma/migrations/20260324000001_make_fleet_message_route_optional/migration.sql"
      provides: "Schema migration making routeId nullable"
      contains: "ALTER"
    - path: "apps/web/src/app/api/mobile/driver/messages/route.ts"
      provides: "GET and POST endpoints for driver messaging"
      exports: ["GET", "POST"]
    - path: "packages/api-client/src/driver.ts"
      provides: "getMessages and sendMessage methods"
      contains: "getMessages"
    - path: "apps/mobile/app/(driver)/messages.tsx"
      provides: "Chat UI with message bubbles and text input"
      min_lines: 80
  key_links:
    - from: "apps/mobile/app/(driver)/messages.tsx"
      to: "/api/mobile/driver/messages"
      via: "driverApi.getMessages and driverApi.sendMessage"
      pattern: "driverApi\\.(getMessages|sendMessage)"
    - from: "apps/web/src/app/api/mobile/driver/messages/route.ts"
      to: "prisma.fleetMessage"
      via: "database query"
      pattern: "fleetMessage\\.(findMany|create)"
---

<objective>
Add driver-to-dispatcher messaging to the mobile app. This involves making FleetMessage.routeId optional (migration), creating mobile API routes for GET/POST messages, adding api-client methods, and building a full chat UI with bubbles on the existing messages screen.

Purpose: Drivers need to communicate with dispatchers directly from the mobile app without requiring an active route.
Output: Working chat screen with send/receive capability scoped to tenant.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/schema.prisma (FleetMessage model — routeId currently required)
@apps/web/src/app/api/mobile/driver/loads/route.ts (pattern: validateMobileToken, prisma.$transaction, set_config bypass_rls)
@packages/api-client/src/driver.ts (existing driverApi object to extend)
@packages/api-client/src/client.ts (apiRequest helper)
@apps/mobile/app/(driver)/messages.tsx (current placeholder screen to replace)
@apps/web/src/app/(driver)/actions/driver-messages.ts (existing web driver messaging logic for reference)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema migration + API routes + api-client methods</name>
  <files>
    apps/web/prisma/schema.prisma
    apps/web/prisma/migrations/20260324000001_make_fleet_message_route_optional/migration.sql
    apps/web/src/app/api/mobile/driver/messages/route.ts
    packages/api-client/src/driver.ts
  </files>
  <action>
1. **Schema migration** — Make `routeId` optional on FleetMessage:
   - In `apps/web/prisma/schema.prisma`, change `routeId String @db.Uuid` to `routeId String? @db.Uuid` (add the `?`).
   - Create migration file `apps/web/prisma/migrations/20260324000001_make_fleet_message_route_optional/migration.sql` with:
     ```sql
     ALTER TABLE "FleetMessage" ALTER COLUMN "routeId" DROP NOT NULL;
     ```
   - Run `npx prisma generate` from `apps/web/` to regenerate the client.

2. **API routes** — Create `apps/web/src/app/api/mobile/driver/messages/route.ts`:
   - **GET**: Authenticate via `validateMobileToken(req)`. Require `auth.driverId` (403 if missing). Use `prisma.$transaction` with `set_config('app.bypass_rls', 'on', TRUE)` (same pattern as loads route). Query `fleetMessage.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } })`. Return the messages array as JSON. Each message has: id, tenantId, routeId (nullable), senderId, senderRole, body, createdAt.
   - **POST**: Same auth pattern. Accept JSON body `{ body: string }`. Validate body is non-empty string (400 if invalid). Create `fleetMessage.create({ data: { tenantId, senderId: auth.driverId, senderRole: 'DRIVER', body: body.trim() } })` — note: routeId is omitted (null) since messages are tenant-scoped. Return the created message as JSON with status 201.

3. **api-client methods** — Add to `driverApi` in `packages/api-client/src/driver.ts`:
   - Add `FleetMessage` interface: `{ id: string; tenantId: string; routeId: string | null; senderId: string; senderRole: string; body: string; createdAt: string }`
   - Add `getMessages: (token: string) => apiRequest<FleetMessage[]>('/api/mobile/driver/messages', { token })`
   - Add `sendMessage: (token: string, body: string) => apiRequest<FleetMessage>('/api/mobile/driver/messages', { method: 'POST', token, body: JSON.stringify({ body }) })`
   - Export `FleetMessage` type from the module and re-export from `packages/api-client/src/index.ts`.
  </action>
  <verify>
    - `cd apps/web && npx prisma generate` completes without errors
    - `cd apps/web && npx tsc --noEmit` passes (or at least the new route file has no type errors)
    - The migration SQL file exists and contains the ALTER statement
  </verify>
  <done>
    - FleetMessage.routeId is optional in schema with migration ready
    - GET /api/mobile/driver/messages returns tenant-scoped messages
    - POST /api/mobile/driver/messages creates a message with senderRole DRIVER
    - driverApi.getMessages and driverApi.sendMessage are available in the api-client
  </done>
</task>

<task type="auto">
  <name>Task 2: Build chat UI on the messages screen</name>
  <files>
    apps/mobile/app/(driver)/messages.tsx
  </files>
  <action>
Replace the placeholder messages screen with a full chat UI. Use the existing dark theme (bg-slate-900) and NativeWind styling consistent with other driver screens.

**Layout structure:**
- SafeAreaView with flex-1 bg-slate-900
- Header: "Messages" title (text-2xl font-bold text-white, px-4 pt-4 pb-3) — same as current
- Message list: FlatList with inverted={false}, flex-1. Each message is a chat bubble.
- Input area: fixed at bottom with KeyboardAvoidingView (behavior="padding" on iOS). Row with TextInput (flex-1, bg-slate-800, text-white, rounded-xl, px-4 py-3, placeholder "Type a message...") and Send button (bg-sky-500 rounded-xl p-3, Send icon from lucide-react-native, disabled when input empty).

**Message bubbles:**
- Driver messages (senderRole === 'DRIVER'): aligned right, bg-sky-600 rounded-2xl rounded-br-sm, text-white
- Dispatcher/Owner messages (any other senderRole): aligned left, bg-slate-700 rounded-2xl rounded-bl-sm, text-white
- Show senderRole label above bubble in text-xs text-slate-400 (e.g., "Dispatcher", "Owner", "You")
- Show timestamp below bubble in text-xs text-slate-500, formatted as relative time or short time (e.g., "2:30 PM")

**Data flow:**
- Import `useAuthContext` for token and `driverApi` from `@drivecommand/api-client`
- On mount (useEffect), call `driverApi.getMessages(token)` and store in state
- On send: call `driverApi.sendMessage(token, text)`, on success append returned message to state and clear input. Optimistic update is NOT required — wait for server response.
- Add a RefreshControl on the FlatList for pull-to-refresh
- Auto-scroll to bottom on new message via FlatList ref + `scrollToEnd()`

**Empty state:** If no messages, show the existing empty state (MessageSquare icon + "No messages yet" text). Switch to message list once messages exist.

**Error handling:** Wrap API calls in try/catch. Show Alert.alert on send failure. Silently retry on fetch failure (or show subtle error text).

Import KeyboardAvoidingView from 'react-native', Platform from 'react-native'. Use `Platform.OS === 'ios'` for KeyboardAvoidingView behavior prop.
  </action>
  <verify>
    - `cd apps/mobile && npx tsc --noEmit` passes (or no type errors in messages.tsx)
    - The messages.tsx file renders a FlatList, TextInput, and send button
    - Driver messages align right with sky-600 background, dispatcher messages align left with slate-700 background
  </verify>
  <done>
    - Messages screen shows chat bubbles with role-based alignment and colors
    - Text input with send button at bottom, keyboard-aware
    - Pull-to-refresh loads messages from API
    - Sending a message calls the API and appends the result to the list
    - Empty state shown when no messages exist
  </done>
</task>

</tasks>

<verification>
- Schema migration file exists and makes routeId nullable
- GET /api/mobile/driver/messages route exists and returns messages array
- POST /api/mobile/driver/messages route exists and creates messages
- api-client exports getMessages and sendMessage on driverApi
- Mobile messages screen renders chat UI with bubbles, input, and send
- TypeScript compiles without errors in both apps/web and apps/mobile
</verification>

<success_criteria>
- Driver can open Messages tab and see all tenant messages in chat bubble format
- Driver can type and send a message that persists via the API
- Owner/dispatcher messages appear on the left, driver messages on the right
- FleetMessage.routeId is optional — messages can be created without a route
</success_criteria>

<output>
After completion, create `.planning/quick/101-add-driver-dispatcher-messaging-to-the-m/101-SUMMARY.md`
</output>
