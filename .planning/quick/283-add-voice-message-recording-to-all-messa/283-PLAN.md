---
phase: quick-283
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/prisma/migrations/20260423000001_add_audio_url_to_fleet_message/migration.sql
  - apps/web/src/lib/storage/presigned.ts
  - apps/web/src/app/api/v1/messages/upload-audio/route.ts
  - apps/web/src/app/api/v1/messages/[id]/audio-url/route.ts
  - apps/web/src/components/carrier/messages/VoiceMessageRecorder.tsx
  - apps/web/src/components/carrier/messages/AudioMessageBubble.tsx
  - apps/web/src/components/carrier/messages/MessageThread.tsx
  - apps/web/src/components/carrier/dispatches/DispatchMessages.tsx
  - apps/web/src/components/carrier/stops/StopDetailMessages.tsx
  - apps/web/src/components/driver/messaging-panel.tsx
  - apps/web/src/app/api/v1/messages/send/route.ts
  - apps/web/src/app/api/v1/messages/thread/route.ts
  - apps/web/src/app/(driver)/actions/driver-messages.ts
autonomous: true
must_haves:
  truths:
    - "Users see a microphone button next to the send button in all message threads"
    - "Clicking the mic button starts recording with a pulsing red indicator and timer"
    - "Recording auto-stops at 2 minutes"
    - "After stopping, user sees a preview with play/pause, send, and discard buttons"
    - "Sent voice messages appear as playable audio bubbles in the thread"
    - "Audio files are stored in R2 with tenant isolation"
    - "Fresh signed URLs are generated on render for audio playback"
  artifacts:
    - path: "apps/web/src/components/carrier/messages/VoiceMessageRecorder.tsx"
      provides: "Reusable voice recording component with idle/recording/preview states"
    - path: "apps/web/src/components/carrier/messages/AudioMessageBubble.tsx"
      provides: "Audio playback bubble for voice messages"
    - path: "apps/web/src/app/api/v1/messages/upload-audio/route.ts"
      provides: "Audio file upload endpoint with R2 storage"
    - path: "apps/web/src/app/api/v1/messages/[id]/audio-url/route.ts"
      provides: "Signed URL generation for audio playback"
  key_links:
    - from: "VoiceMessageRecorder.tsx"
      to: "/api/v1/messages/upload-audio"
      via: "FormData POST with audio blob"
    - from: "AudioMessageBubble.tsx"
      to: "/api/v1/messages/[id]/audio-url"
      via: "fetch on mount to get signed URL"
    - from: "All message thread components"
      to: "VoiceMessageRecorder + AudioMessageBubble"
      via: "Import and render in compose area + message list"
---

<objective>
Add voice message recording and playback to all message threads across the app (owner Messages page, dispatch detail messages, stop detail messages, driver portal messages).

Purpose: Enable owners and drivers to send audio messages when typing is inconvenient, improving communication speed especially for drivers on the road.
Output: VoiceMessageRecorder component, AudioMessageBubble component, audio upload API, audio URL API, schema migration, all 4 message threads updated.
</objective>

<context>
@apps/web/prisma/schema.prisma (FleetMessage model around line 1162)
@apps/web/src/components/carrier/messages/MessageThread.tsx
@apps/web/src/components/carrier/dispatches/DispatchMessages.tsx
@apps/web/src/components/carrier/stops/StopDetailMessages.tsx
@apps/web/src/components/driver/messaging-panel.tsx
@apps/web/src/app/api/v1/messages/send/route.ts
@apps/web/src/app/api/v1/messages/thread/route.ts
@apps/web/src/app/(driver)/actions/driver-messages.ts
@apps/web/src/lib/storage/presigned.ts
@apps/web/src/lib/storage/s3-client.ts
@apps/web/src/app/api/support/upload-attachment/route.ts (pattern reference for upload)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema migration + audio upload/URL API endpoints</name>
  <files>
    apps/web/prisma/schema.prisma
    apps/web/prisma/migrations/20260423000001_add_audio_url_to_fleet_message/migration.sql
    apps/web/src/lib/storage/presigned.ts
    apps/web/src/app/api/v1/messages/upload-audio/route.ts
    apps/web/src/app/api/v1/messages/[id]/audio-url/route.ts
    apps/web/src/app/api/v1/messages/send/route.ts
    apps/web/src/app/api/v1/messages/thread/route.ts
    apps/web/src/app/(driver)/actions/driver-messages.ts
  </files>
  <action>
    1. **Schema migration:** Add `audioUrl String? @map("audio_url")` to the FleetMessage model in schema.prisma, placed after the `stopId` field. Create migration SQL:
       ```sql
       ALTER TABLE "FleetMessage" ADD COLUMN IF NOT EXISTS "audio_url" TEXT;
       ```
       Run `npx prisma migrate deploy` and `npx prisma generate` from apps/web.

    2. **Update presigned.ts:** Add `'messages'` to the `DocumentCategory` type union so audio files can use the existing presigned URL pattern.

    3. **POST /api/v1/messages/upload-audio:** Create new route that:
       - Requires auth via `getSession()` (OWNER, MANAGER, or DRIVER role)
       - Accepts multipart FormData with a single `audio` file field
       - Validates: max 10MB file size, content type must be one of `audio/webm`, `audio/mp4`, `audio/ogg`, `audio/mpeg`
       - Uses `generateUploadUrl()` from presigned.ts with category `'messages'` and tenant-prefixed path: `tenant-{tenantId}/messages/audio/{nanoid}-{filename}`
       - Uploads the file buffer directly to R2 using PutObjectCommand (NOT presigned — the server has the blob from FormData)
       - Returns `{ audioUrl: s3Key }` (the R2 key, NOT a signed URL)
       - Use Upstash rate limiting (`uploadLimiter`) to prevent abuse
       - Pattern reference: `apps/web/src/app/api/support/upload-attachment/route.ts` but this route receives the actual file (not just requesting a presigned URL), so use `PutObjectCommand` directly with the buffer from `formData.get('audio')`

    4. **GET /api/v1/messages/[id]/audio-url:** Create new route that:
       - Requires auth via `getSession()`
       - Looks up FleetMessage by id, verifies `tenantId` matches session tenant (tenant isolation)
       - If message has no `audioUrl`, returns 404
       - Generates a fresh presigned download URL using `generateDownloadUrl(message.audioUrl)` from presigned.ts
       - Returns `{ url: signedUrl }`

    5. **Update send route:** In `/api/v1/messages/send/route.ts`, accept optional `audioUrl` string field in the request body. If provided, include it in the `fleetMessage.create` data. Do NOT change any existing text message logic.

    6. **Update thread route:** In `/api/v1/messages/thread/route.ts`, add `audioUrl: true` to the select clause so audio messages include the storage key in responses.

    7. **Update driver-messages.ts:** In `getDriverMessages()`, the `audioUrl` field will automatically be included since it uses `findMany` without a select clause (returns all fields). In `sendDriverMessage()`, accept an optional `audioUrl` parameter from FormData: `const audioUrl = formData.get('audioUrl') as string | null`. If present, include it in the `fleetMessage.create` data.
  </action>
  <verify>
    - `cd apps/web && npx prisma validate` succeeds
    - `npx tsc --noEmit` passes (from repo root or apps/web)
    - FleetMessage table has `audio_url` column
    - Upload endpoint compiles without errors
    - Audio URL endpoint compiles without errors
  </verify>
  <done>
    FleetMessage schema has audioUrl field, audio upload endpoint stores files in R2 with tenant isolation, audio URL endpoint generates fresh signed URLs, send/thread routes support audioUrl field.
  </done>
</task>

<task type="auto">
  <name>Task 2: VoiceMessageRecorder + AudioMessageBubble components</name>
  <files>
    apps/web/src/components/carrier/messages/VoiceMessageRecorder.tsx
    apps/web/src/components/carrier/messages/AudioMessageBubble.tsx
  </files>
  <action>
    1. **VoiceMessageRecorder.tsx** — `'use client'` component:
       - Props: `onSend: (audioBlob: Blob) => Promise<void>`, `disabled?: boolean`
       - Three states: `idle`, `recording`, `preview`
       - Uses `useRef` for MediaRecorder and audio chunks array, `useState` for state/timer/blob/objectURL
       - **Idle state:** Render a microphone icon button (use `Mic` from lucide-react) styled as a ghost/outline button matching the existing Send button size (h-9 w-9). If `typeof window !== 'undefined' && !navigator.mediaDevices`, return null (hide button if MediaRecorder not supported).
       - **Recording state:**
         - `startRecording()`: Call `navigator.mediaDevices.getUserMedia({ audio: true })`, create MediaRecorder, collect chunks on `ondataavailable`, on `onstop` create Blob with type `audio/webm` and set preview state. Start MediaRecorder. Start a timer interval that counts up seconds from 0.
         - Display: pulsing red dot (use `animate-pulse` on a red circle div), elapsed time formatted as `M:SS`, and a stop button (Square icon from lucide-react, red variant).
         - Auto-stop at 120 seconds (2 minutes).
         - `stopRecording()`: Stop MediaRecorder, stop all tracks on the stream, clear timer interval.
       - **Preview state:**
         - Display: `<audio>` element with `controls` and `src={URL.createObjectURL(blob)}` for local preview playback
         - "Send" button (primary, with Send icon) that calls `onSend(blob)` then resets to idle
         - "Discard" button (ghost/destructive, Trash2 icon) that revokes the object URL and resets to idle
         - Show a loading spinner on the Send button while `onSend` is in-flight
       - **Error handling:** Wrap `getUserMedia` in try/catch. On `NotAllowedError`, show toast: "Microphone access denied. Please allow microphone access in your browser settings." On other errors, show toast: "Failed to start recording."
       - **Cleanup:** In a useEffect cleanup, revoke any object URLs and stop any active MediaRecorder streams.

    2. **AudioMessageBubble.tsx** — `'use client'` component:
       - Props: `messageId: string`, `isOwn: boolean`
       - On mount, fetch `GET /api/v1/messages/${messageId}/audio-url` to get a fresh signed URL
       - States: loading (show small skeleton), error (show "Audio unavailable"), ready (show player)
       - Ready state: Render a div with same bubble styling as text messages (bg-primary/bg-muted, rounded-2xl). Inside: a `Mic` icon (h-4 w-4, muted) + `<audio controls src={signedUrl} className="h-8" />`. Keep it compact — the HTML5 audio controls handle play/pause/seek.
       - Use `preload="none"` on the audio element to avoid fetching audio until user presses play.
  </action>
  <verify>
    - `npx tsc --noEmit` passes
    - VoiceMessageRecorder renders three states correctly (can verify by importing in a test page)
    - AudioMessageBubble fetches signed URL and renders audio player
  </verify>
  <done>
    VoiceMessageRecorder component handles recording lifecycle (idle/recording/preview) with MediaRecorder API, 2-min limit, error handling. AudioMessageBubble fetches fresh signed URLs and renders an inline audio player.
  </done>
</task>

<task type="auto">
  <name>Task 3: Integrate voice messages into all 4 message threads</name>
  <files>
    apps/web/src/components/carrier/messages/MessageThread.tsx
    apps/web/src/components/carrier/dispatches/DispatchMessages.tsx
    apps/web/src/components/carrier/stops/StopDetailMessages.tsx
    apps/web/src/components/driver/messaging-panel.tsx
  </files>
  <action>
    For each of the 4 message thread components, make two changes:

    **A. Add mic button to compose area:**

    1. **MessageThread.tsx** (owner Messages page):
       - Import `VoiceMessageRecorder` and `AudioMessageBubble`
       - Add `VoiceMessageRecorder` next to the Send button in the input bar (line ~218-237). Place it between the textarea and the Send button.
       - The `onSend` callback should: (a) upload blob to `/api/v1/messages/upload-audio` as FormData, (b) call `/api/v1/messages/send` with `body: "Voice message"` and `audioUrl` from upload response, (c) call `fetchMessages()` to refresh thread.
       - Wrap the upload+send in try/catch, toast "Failed to send voice message. Try again" on error.
       - Add a `Message` type field: `audioUrl?: string | null`

    2. **DispatchMessages.tsx** (dispatch detail):
       - Same pattern as MessageThread. Import VoiceMessageRecorder + AudioMessageBubble.
       - Add mic button next to send button in the input area (line ~166-184).
       - `onSend` uploads audio then sends message with `audioUrl` and `dispatchId`.

    3. **StopDetailMessages.tsx** (stop detail):
       - Same pattern. Add mic button next to send button (line ~157-176).
       - `onSend` uploads audio then sends stop message via `POST /api/v1/carrier/stops/${stopId}/messages` with `body: "Voice message"` and `audioUrl`.
       - NOTE: The stop messages endpoint (`/api/v1/carrier/stops/${stopId}/messages`) will need to accept `audioUrl` in the POST body and pass it through to `fleetMessage.create`. Check if this route exists at `apps/web/src/app/api/v1/carrier/stops/[stopId]/messages/route.ts` or similar and update it to accept `audioUrl`.

    4. **messaging-panel.tsx** (driver portal):
       - This uses server actions + form, so the integration is different. Add VoiceMessageRecorder as a separate button next to the form submit button.
       - The `onSend` callback should: (a) upload blob to `/api/v1/messages/upload-audio`, (b) call `sendDriverMessage` action BUT since it uses FormData, create a hidden FormData with `message` set to "Voice message" and `audioUrl` set to the storage key, submit via the action.
       - Alternative simpler approach: Instead of fighting the form action pattern, add a separate `handleVoiceSend` function that directly calls `/api/v1/messages/send` (the driver needs a different endpoint — check if drivers can POST to `/api/v1/messages/send` or if there's a driver-specific send endpoint). If drivers cannot use that endpoint (it requires OWNER/MANAGER), create the voice send as a direct `fetch` to a new or updated driver message endpoint. The simplest path: update `sendDriverMessage` server action to accept an optional audioUrl string parameter, and have the VoiceMessageRecorder call it directly (not via form).
       - Actually, the cleanest approach: Add a NEW client-side `sendVoiceMessage` function in messaging-panel.tsx that: (1) uploads audio to `/api/v1/messages/upload-audio`, (2) calls a new server action `sendDriverVoiceMessage(audioUrl: string)` in `driver-messages.ts` that creates the FleetMessage with body "Voice message" and the audioUrl. Then refresh messages.

    **B. Render audio bubbles for voice messages:**

    In each component's message rendering section, check if the message has `audioUrl`. If it does, render `<AudioMessageBubble messageId={msg.id} isOwn={msg.isOwn} />` BELOW the text body div (the body will show "Voice message" as fallback text, but the audio player is the primary content). Wrap in the same bubble styling container.

    Actually, for cleaner UX: if `msg.audioUrl` is set, render AudioMessageBubble INSTEAD of the text body. The text body "Voice message" is just a fallback for contexts that don't render audio (like push notification previews).

    **For the Message type in each component:** Add `audioUrl?: string | null` to the Message type. The thread API already returns it after Task 1 updates.
  </action>
  <verify>
    - `npx tsc --noEmit` passes
    - Owner Messages page shows mic button next to send button
    - Dispatch detail messages section shows mic button
    - Stop detail messages section shows mic button
    - Driver portal messages page shows mic button
    - Voice messages render as audio player bubbles in all threads
  </verify>
  <done>
    All 4 message thread components have a microphone button for voice recording. Voice messages appear as playable audio bubbles. Text message logic is unchanged. Audio files stored in R2 with tenant-isolated paths, signed URLs generated fresh on render.
  </done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx prisma validate` — schema is valid
2. `npx tsc --noEmit` — no TypeScript errors
3. Open owner Messages page — mic button visible, can record/preview/send/discard
4. Open a dispatch detail — messages section has mic button
5. Open a stop detail — messages section has mic button
6. Open driver portal messages — mic button visible
7. Send a voice message from owner — appears as audio bubble in thread
8. Send a voice message from driver — appears as audio bubble
9. Refresh page — voice messages still playable (signed URLs regenerated)
10. Try recording > 2 minutes — auto-stops at 2:00
</verification>

<success_criteria>
- FleetMessage has nullable audioUrl column
- VoiceMessageRecorder component handles idle/recording/preview states with 2-min limit
- Audio files upload to R2 at tenant-isolated paths via POST /api/v1/messages/upload-audio
- GET /api/v1/messages/[id]/audio-url returns fresh signed URLs
- All 4 message threads (owner messages, dispatch messages, stop messages, driver messages) have mic button
- Voice messages render as audio player bubbles, not as text
- Text message functionality unchanged
- No TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/283-add-voice-message-recording-to-all-messa/283-SUMMARY.md`
</output>
