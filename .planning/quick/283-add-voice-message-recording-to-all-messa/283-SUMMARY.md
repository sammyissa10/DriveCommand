---
phase: quick-283
plan: 01
subsystem: messaging
tags: [voice-messages, audio, r2-storage, mediarecorder, fleet-messages]
dependency_graph:
  requires:
    - FleetMessage table (existing)
    - R2 storage (existing)
    - presigned.ts (existing)
    - Supabase auth (existing)
  provides:
    - Voice message recording and playback in all 4 message threads
    - POST /api/v1/messages/upload-audio
    - GET /api/v1/messages/[id]/audio-url
    - VoiceMessageRecorder component
    - AudioMessageBubble component
    - sendDriverVoiceMessage server action
  affects:
    - MessageThread.tsx
    - DispatchMessages.tsx
    - StopDetailMessages.tsx
    - messaging-panel.tsx
tech_stack:
  added:
    - MediaRecorder API (browser-native, no new dependencies)
    - PutObjectCommand direct upload pattern (server-side R2 upload)
  patterns:
    - Server-side audio blob upload (FormData -> R2 PutObjectCommand)
    - Fresh signed URL on render (no cached audio URLs stored)
    - Three-state recorder (idle/recording/preview) with useRef for MediaRecorder lifecycle
key_files:
  created:
    - apps/web/prisma/migrations/20260423000001_add_audio_url_to_fleet_message/migration.sql
    - apps/web/src/app/api/v1/messages/upload-audio/route.ts
    - apps/web/src/app/api/v1/messages/[id]/audio-url/route.ts
    - apps/web/src/components/carrier/messages/VoiceMessageRecorder.tsx
    - apps/web/src/components/carrier/messages/AudioMessageBubble.tsx
  modified:
    - apps/web/prisma/schema.prisma (audioUrl field on FleetMessage)
    - apps/web/src/lib/storage/presigned.ts (added 'messages' to DocumentCategory)
    - apps/web/src/app/api/v1/messages/send/route.ts (audioUrl in create + select)
    - apps/web/src/app/api/v1/messages/thread/route.ts (audioUrl in select + result)
    - apps/web/src/app/api/v1/carrier/stops/[stopId]/messages/route.ts (audioUrl in GET select/result + POST create)
    - apps/web/src/app/(driver)/actions/driver-messages.ts (audioUrl in sendDriverMessage + new sendDriverVoiceMessage)
    - apps/web/src/components/carrier/messages/MessageThread.tsx (VoiceMessageRecorder + AudioMessageBubble)
    - apps/web/src/components/carrier/dispatches/DispatchMessages.tsx (VoiceMessageRecorder + AudioMessageBubble)
    - apps/web/src/components/carrier/stops/StopDetailMessages.tsx (VoiceMessageRecorder + AudioMessageBubble)
    - apps/web/src/components/driver/messaging-panel.tsx (VoiceMessageRecorder + AudioMessageBubble)
decisions:
  - Driver voice messages use a new sendDriverVoiceMessage server action rather than fighting the useActionState form pattern — cleaner separation
  - Audio stored as R2 key (not signed URL) in FleetMessage.audioUrl — fresh URLs generated on each render to avoid expiry issues
  - VoiceMessageRecorder placed between textarea and send button so recording controls expand in-place without layout shift
  - Used PutObjectCommand directly (server holds blob from FormData) rather than presigned upload URL pattern used by documents
metrics:
  duration: ~40 minutes
  completed: 2026-04-23
  tasks_completed: 3
  files_created: 5
  files_modified: 10
---

# Phase quick-283: Voice Message Recording Summary

Voice message recording and playback added to all message threads using MediaRecorder API, R2 storage, and fresh signed URLs on render.

## Tasks Completed

| # | Task | Commit | Key Deliverables |
|---|------|--------|-----------------|
| 1 | Schema migration + audio upload/URL API endpoints | 5d94153 | migration.sql, audioUrl on FleetMessage, POST upload-audio, GET audio-url, send/thread/stop route updates, driver-messages action update |
| 2 | VoiceMessageRecorder + AudioMessageBubble components | 22ce910 | VoiceMessageRecorder (idle/recording/preview), AudioMessageBubble (signed URL fetch + HTML5 audio player) |
| 3 | Integrate voice messages into all 4 message threads | 9d80b87 | MessageThread, DispatchMessages, StopDetailMessages, MessagingPanel all have mic button + audio bubble rendering |

## What Was Built

**Schema:** Added nullable `audio_url TEXT` column to `FleetMessage` table via migration. Prisma model updated with `audioUrl String? @map("audio_url")`.

**Storage:** `presigned.ts` updated to include `'messages'` in `DocumentCategory`. Audio files stored at `tenant-{tenantId}/messages/audio/{nanoid}-{filename}` for tenant isolation.

**API Endpoints:**
- `POST /api/v1/messages/upload-audio` — Accepts multipart FormData with `audio` field, validates type (webm/mp4/ogg/mpeg) and size (10MB max), uploads directly to R2 via PutObjectCommand, returns `{ audioUrl: s3Key }`. Rate-limited with `uploadLimiter`.
- `GET /api/v1/messages/[id]/audio-url` — Looks up FleetMessage by id with tenant isolation check, generates fresh presigned download URL via `generateDownloadUrl()`, returns `{ url: signedUrl }`.

**Components:**
- `VoiceMessageRecorder` — Three-state (idle/recording/preview) client component. Idle: mic icon button. Recording: pulsing red dot + elapsed timer + stop button, auto-stops at 120s. Preview: HTML5 audio preview + Send (with loading spinner) + Discard buttons. Handles `NotAllowedError` for mic permission denial.
- `AudioMessageBubble` — Fetches signed URL on mount, shows skeleton while loading, "Audio unavailable" on error, compact audio player with Mic icon when ready.

**Thread Integration (all 4):**
- Owner Messages (`MessageThread.tsx`): mic button in input bar, `handleVoiceSend` uploads + sends with audioUrl
- Dispatch detail (`DispatchMessages.tsx`): same pattern  
- Stop detail (`StopDetailMessages.tsx`): uploads + sends to stop messages endpoint
- Driver portal (`messaging-panel.tsx`): uploads audio, calls `sendDriverVoiceMessage` server action

All threads render `<AudioMessageBubble>` instead of text body when `msg.audioUrl` is set.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

**Minor implementation note:** The driver portal uses a hybrid approach — audio is uploaded client-side to `/api/v1/messages/upload-audio`, then the returned R2 key is passed to the `sendDriverVoiceMessage` server action. This avoids refactoring the existing `useActionState` form pattern while keeping the voice send clean.

## Self-Check: PASSED

All created files exist on disk. All 3 task commits confirmed in git log.

| Check | Result |
|-------|--------|
| migration.sql exists | FOUND |
| upload-audio/route.ts exists | FOUND |
| [id]/audio-url/route.ts exists | FOUND |
| VoiceMessageRecorder.tsx exists | FOUND |
| AudioMessageBubble.tsx exists | FOUND |
| Commit 5d94153 (Task 1) | FOUND |
| Commit 22ce910 (Task 2) | FOUND |
| Commit 9d80b87 (Task 3) | FOUND |
| Migration applied to DB | PASSED (20260423000001 applied) |
| TypeScript: no errors | PASSED |
