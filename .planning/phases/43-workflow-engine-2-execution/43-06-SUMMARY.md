---
phase: 43-workflow-engine-2-execution
plan: "06"
subsystem: mobile-driver-tasks
tags:
  - mobile
  - workflow-engine
  - driver-tasks
  - react-native
  - expo-router
dependency_graph:
  requires:
    - 43-05  # mobile task API endpoints and profile checklists
  provides:
    - driver-tasks-tab
    - my-tasks-feed-screen
    - document-upload-action-screen
    - form-fill-action-screen
    - signature-action-screen
    - task-action-dispatcher
  affects:
    - apps/mobile/app/(driver)/_layout.tsx
    - driver tab navigator (6 tabs now)
tech_stack:
  added:
    - react-native-svg (PanResponder signature paths)
    - react-native-view-shot (signature PNG capture)
    - expo-image-picker (document photo/library upload)
  patterns:
    - useFocusEffect for tab-focus refetch
    - PanResponder gesture capture for freehand signature
    - Animated.Value width interpolation for progress bar
    - Direct fetch (not api-client) for workflow endpoints
key_files:
  created:
    - apps/mobile/app/(driver)/tasks/index.tsx
    - apps/mobile/app/(driver)/tasks/[id].tsx
    - apps/mobile/components/driver/workflows/MyTasksScreen.tsx
    - apps/mobile/components/driver/workflows/TaskActionDispatcher.tsx
    - apps/mobile/components/driver/workflows/DocumentUploadScreen.tsx
    - apps/mobile/components/driver/workflows/FormFillScreen.tsx
    - apps/mobile/components/driver/workflows/SignatureScreen.tsx
  modified:
    - apps/mobile/app/(driver)/_layout.tsx
decisions:
  - "Screen components placed in components/driver/workflows/ (not src/screens/) — mobile app has no src/screens/ directory; components/ is the correct location per existing codebase structure"
  - "TaskActionDispatcher fetches full task list and filters by id — avoids needing a single-task GET endpoint not yet built"
  - "SignatureScreen uploads PNG via react-native-view-shot captureRef with JSON path fallback — both packages confirmed installed in package.json"
metrics:
  duration_seconds: 344
  tasks_completed: 2
  files_created: 7
  files_modified: 1
  completed_date: "2026-04-24"
---

# Phase 43 Plan 06: Mobile Driver Tasks UI Summary

Mobile driver tasks tab with Tasks feed (FlashList), task action dispatcher, and three action screens (Document Upload, Form Fill, Signature) — all tap targets ≥56px, TypeScript clean.

## What Was Built

### Task 1: Tasks tab + My Tasks screen (commit 188279b)

**`apps/mobile/app/(driver)/_layout.tsx`** — Added 6th tab "Tasks" (CheckSquare icon from lucide-react-native) between Messages and More. Added `openTaskCount` state with `fetchTaskCount` callback using direct fetch to `/api/mobile/driver/tasks`. Badge renders identically to the Messages unread badge. Tab count refreshes on mount, on AppState active, and on tab focus (via MyTasksScreen's useFocusEffect). Added hidden `tasks/[id]` route.

**`apps/mobile/app/(driver)/tasks/index.tsx`** — Thin route entry rendering `<MyTasksScreen />` from components/driver/workflows/.

**`apps/mobile/app/(driver)/tasks/[id].tsx`** — Thin route entry using `useLocalSearchParams` to extract `id` and pass to `<TaskActionScreen stepInstanceId={id} />`.

**`apps/mobile/components/driver/workflows/MyTasksScreen.tsx`** — Full My Tasks feed screen:
- Fetches `/api/mobile/driver/tasks` on mount + `useFocusEffect`
- Summary bar with animated progress track (Animated.Value width interpolation)
- FlashList of task cards, each with: context label (playbookSnapshot.name + entityType), step name (24px bold), description (1 line truncated), due badge (Overdue/Due Today/Due Tomorrow/No Due Date in red/green/yellow/gray), full-width action button `height: 56` with label per stepType
- Loading skeleton (3 gray card placeholders)
- Empty state: "You're all caught up. No open tasks right now." centered with CheckSquare icon

### Task 2: Task action screens + dispatcher (commit 8273c91)

**`apps/mobile/components/driver/workflows/TaskActionDispatcher.tsx`** — Fetches step instance list, filters by `stepInstanceId`, then dispatches by `stepSnapshot.stepType`:
- `DOCUMENT_UPLOAD` → `<DocumentUploadScreen />`
- `FORM_FILL` → `<FormFillScreen />`
- `SIGNATURE` → `<SignatureScreen />`
- `TRAINING_ACK` → inline `<TrainingAckScreen />` (instruction + "I acknowledge" button)
- `INSPECTION_ITEM` → `<InspectionPlaceholderScreen />` ("Full inspection mode coming soon")
- `APPROVAL` → `<GenericNoteScreen actionLabel="Review & Approve" />`
- `THIRD_PARTY`, `CUSTOM_NOTE`, fallback → `<GenericNoteScreen actionLabel="Add Note" />`

**`apps/mobile/components/driver/workflows/DocumentUploadScreen.tsx`**:
- expo-image-picker: "Choose from Library" + "Take a Photo" buttons in dashed upload area `height: 200`
- expo-image thumbnail preview once file selected; "Replace" button
- Submit button `height: 56`, disabled (opacity: 0.4) until file selected
- Upload flow: GET presigned URL from `/api/mobile/driver/documents/upload-url` → PUT to S3 → POST to `/api/mobile/driver/tasks/[id]/complete` with `result: { fileUrls: [s3Key] }`

**`apps/mobile/components/driver/workflows/FormFillScreen.tsx`**:
- Renders `stepSnapshot.formSchema` fields dynamically
- `boolean` → side-by-side YES/NO TouchableOpacity, each `height: 56`, green YES / red NO when selected
- `text` / `number` / `date` → TextInput `height: 56`
- `select` → TouchableOpacity trigger + inline SelectSheet (modal overlay with option list)
- KeyboardAvoidingView for keyboard handling
- Submit validates required fields inline on press, shows red error text below failed fields
- POST to `/api/mobile/driver/tasks/[id]/complete` with `result: { formData: { [fieldId]: value } }`

**`apps/mobile/components/driver/workflows/SignatureScreen.tsx`**:
- PanResponder captures touch gestures → accumulates Point[] strokes
- react-native-svg renders completed strokes + current stroke as `<Path>` elements
- Canvas area `height: 220` dashed border, "Sign here" hint text when empty
- Header: Back button (left) + Clear button (right)
- "I confirm and sign" button `height: 56`, disabled until at least one stroke recorded
- Submit: `captureRef` via react-native-view-shot → PNG upload to S3 → fallback to JSON path data upload → POST complete with `result: { signatureUrl: s3Key }`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FlashList `estimatedItemSize` prop not in this version's types**
- **Found during:** Task 1 TypeScript check
- **Issue:** FlashList 2.0.2 types don't expose `estimatedItemSize` as a named prop
- **Fix:** Removed the prop; existing FlashList usage in the codebase doesn't use it either
- **Commit:** 188279b (fixed before commit)

**2. [Rule 3 - Blocking] Screen files use `components/driver/workflows/` not `src/screens/workflows/`**
- **Found during:** Task 1 setup
- **Issue:** The plan referenced `apps/mobile/src/screens/workflows/` but the mobile app has no `src/` directory — all code lives in `components/`, `hooks/`, `lib/`, etc. at the app root
- **Fix:** Created `apps/mobile/components/driver/workflows/` directory, placed all screen components there. Route files import from `../../../components/driver/workflows/` accordingly.
- **Impact:** All key_links in the plan still satisfied; import paths adjusted

## Self-Check: PASSED

All 8 files verified on disk. Both commits (188279b, 8273c91) confirmed in git log.
