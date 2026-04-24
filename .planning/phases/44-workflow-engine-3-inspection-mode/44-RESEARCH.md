# Phase 44: Workflow Engine 3 — Inspection Mode — Research

**Researched:** 2026-04-24
**Domain:** Mobile DVIR inspection UX, failInspectionItem service, mechanic sign-off flow, push notifications, Vehicle readiness
**Confidence:** HIGH — all findings sourced from codebase inspection and the workflow engine spec

---

## Summary

Phase 44 adds the DVIR signature experience to DriveCommand: a full-screen mobile Inspection Mode where drivers tap PASS/FAIL card-by-card, failed items auto-create mechanic APPROVAL steps, and the vehicle's `isDispatchReady` flag is enforced. Phase 43 built the entire execution layer (completeStep, computeDispatchReadiness, mobile Tasks tab, DocumentUploadScreen, FormFillScreen, SignatureScreen) — Phase 44 only builds what is explicitly listed in the Phase 3 spec section. Do not rebuild anything from Phase 43.

The critical finding is a schema divergence from the spec: the spec references `VEHICLE_INSPECTION` as a `PlaybookCategory` enum value, but Phase 43's migration created the enum as `ONBOARDING | SAFETY | OPERATIONS | COMPLIANCE | PARTNER | CUSTOM`. The Pre-Trip Inspection seed playbook uses `category: 'SAFETY'`. This means `failInspectionItem` must check for the `SAFETY` category (not `VEHICLE_INSPECTION`) OR a new enum value must be added via migration. The spec is authoritative — the planner must decide the resolution strategy before tasks are written.

Push notification infrastructure (expo-server-sdk, `sendPushToUser`, `sendPushToOrg`) is fully operational from Phase 43. SMS does not exist anywhere in the codebase — no Twilio, no Vonage, no any SMS library. The spec says SMS is required for `STEP_ASSIGNED` to drivers. Phase 3 scope says "push + SMS for STEP_ASSIGNED and STEP_FAILED." Implementing SMS requires adding a provider (Twilio is the standard). However, the spec also says "Do not add new providers" in Section 13. This is a genuine conflict that needs a planner decision. Best resolution: implement push-only for Phase 44, stub SMS with a TODO, and deliver full SMS in Phase 5 Polish (where the spec explicitly says "SMS confirmed in staging").

**Primary recommendation:** Build `failInspectionItem` as a new service file in `apps/web/src/server/services/workflows/`, add `fail`/`requestApproval`/`approve` procedures to the existing `stepInstanceRouter`, implement the full-screen `InspectionModeScreen` replacing the current `InspectionPlaceholderScreen` in `TaskActionDispatcher`, and wire `Vehicle.isDispatchReady` surfacing on the truck profile web page. Push notifications for `STEP_FAILED` and `APPROVAL_NEEDED` use the existing `sendPushToUser` utility.

---

## What Phase 43 Already Built (DO NOT Rebuild)

| Item | File/Location | Status |
|------|---------------|--------|
| DB migration (PlaybookInstance, StepInstance, PlaybookNotification) | `migrations/20260423200001_workflow_engine_execution` | Complete |
| `generatePlaybookInstance.ts` | `apps/web/src/server/services/workflows/` | Complete |
| `computeDispatchReadiness.ts` | `apps/web/src/server/services/workflows/` | Complete, updates Truck.isDispatchReady |
| `completeStep.ts` (rejects INSPECTION_ITEM with USE_FAIL_ENDPOINT) | `apps/web/src/server/services/workflows/` | Complete |
| `skipStep.ts` | `apps/web/src/server/services/workflows/` | Complete |
| `instance.ts` tRPC router | `apps/web/src/server/api/routers/workflows/` | Complete |
| `stepInstance.ts` tRPC router (complete/skip/getForDriver) | `apps/web/src/server/api/routers/workflows/` | Complete |
| REST APIs for mobile tasks | `apps/web/src/app/api/mobile/driver/tasks/` | Complete: GET tasks, POST [id]/complete, POST [id]/skip |
| `MyTasksScreen.tsx` | `apps/mobile/components/driver/workflows/` | Complete |
| `TaskActionDispatcher.tsx` | `apps/mobile/components/driver/workflows/` | Complete — routes by stepType; INSPECTION_ITEM shows `InspectionPlaceholderScreen` |
| `DocumentUploadScreen.tsx` | `apps/mobile/components/driver/workflows/` | Complete |
| `FormFillScreen.tsx` | `apps/mobile/components/driver/workflows/` | Complete |
| `SignatureScreen.tsx` | `apps/mobile/components/driver/workflows/` | Complete |
| Active Checklist Detail page | `apps/web/src/app/(owner)/checklists/instances/[id]/` | Complete |
| Truck.isDispatchReady field | `prisma/schema.prisma` line 249 | Complete — field exists, already updated by computeDispatchReadiness |
| User.isDispatchReady field | `prisma/schema.prisma` line 195 | Complete |
| `sendPushToUser` / `sendPushToOrg` | `apps/web/src/lib/notifications/send-push.ts` | Complete |
| PlaybookNotification model | DB + tRPC | Complete |

---

## Critical Schema Gap: PlaybookCategory Mismatch

**The problem:** The spec (Section 6.4) says `failInspectionItem` creates a mechanic step only when `parent Playbook category is 'VEHICLE_INSPECTION'`. The spec (Section 5.1) defines `PlaybookCategory` as including `VEHICLE_INSPECTION`. But Phase 43's migration defined `PlaybookCategory` as `ONBOARDING | SAFETY | OPERATIONS | COMPLIANCE | PARTNER | CUSTOM`. The seed data seeds the Pre-Trip Inspection as `category: 'SAFETY'`.

**Resolution options (planner must pick one):**
1. Add a DB migration to add `VEHICLE_INSPECTION` to the enum, update the Pre-Trip Inspection seed/existing data. Aligned with spec.
2. In `failInspectionItem`, treat `SAFETY` category as the vehicle inspection trigger. Simpler but diverges from spec.
3. Use the `playbookSnapshot.category` field stored at instance-generation time — if it's `SAFETY`, create the mechanic step. Document this as a spec deviation in tech-debt.

**Recommendation:** Option 1 — add `VEHICLE_INSPECTION` to the enum via migration. The spec is the source of truth (Section 16.3). The Pre-Trip Inspection seeded data's category will need updating too (a one-time data migration or separate query in the migration file).

---

## Standard Stack

### Core (all already installed — no new packages needed for core path)

| Library | Version | Purpose | Already Present |
|---------|---------|---------|----------------|
| `react-native-reanimated` | 4.2.1 | Card slide animations for Inspection Mode | Yes — used in BottomSheet, Skeleton, AnimatedScreen |
| `expo-image-picker` | ~55.0.14 | Photo capture for fail-capture flow | Yes — used in IncidentPhotoCapture, DocumentUploadScreen |
| `expo-haptics` | ~55.0.9 | Haptic feedback on PASS/FAIL taps | Yes — `haptic.ts` wraps this |
| `expo-server-sdk` | ^6.1.0 | Push notification delivery | Yes — in `send-push.ts` |
| `react-native-toast-message` | ^2.3.3 | Completion feedback toast | Yes — used across all task screens |

### SMS Gap

| Need | Current State | Phase 44 Action |
|------|--------------|-----------------|
| SMS for STEP_ASSIGNED and STEP_FAILED | Zero SMS infrastructure exists — no Twilio, no env vars, no provider | Implement push-only; add `// TODO(phase-5): SMS delivery` comment in notification helpers. SMS is explicitly a Phase 5 concern per spec Section 14. |

**Note:** The spec Section 10 says drivers get push + SMS. Section 14 Phase 5 says "SMS confirmed in staging." Implementing SMS in Phase 44 would require adding Twilio (new provider), which conflicts with Section 13 "Do not add new providers." Phase 44 should deliver push; Phase 5 delivers SMS.

---

## Architecture Patterns

### Existing File Locations (follow exactly)

```
apps/web/src/server/services/workflows/
  completeStep.ts           ← exists
  computeDispatchReadiness.ts ← exists
  generatePlaybookInstance.ts ← exists
  skipStep.ts               ← exists
  failInspectionItem.ts     ← NEW in Phase 44

apps/web/src/server/api/routers/workflows/
  stepInstance.ts           ← exists — add fail/requestApproval/approve procedures
  instance.ts               ← exists
  index.ts                  ← exists — merge router

apps/web/src/app/api/mobile/driver/tasks/
  [id]/complete/route.ts    ← exists
  [id]/skip/route.ts        ← exists
  [id]/fail/route.ts        ← NEW — POST endpoint for INSPECTION_ITEM fail
  route.ts                  ← exists

apps/mobile/components/driver/workflows/
  MyTasksScreen.tsx         ← exists
  TaskActionDispatcher.tsx  ← exists — replace InspectionPlaceholderScreen with real screen
  DocumentUploadScreen.tsx  ← exists
  FormFillScreen.tsx        ← exists
  SignatureScreen.tsx        ← exists
  InspectionModeScreen.tsx  ← NEW — full-screen takeover component

packages/validation/src/workflows/
  stepInstance.ts           ← exists — add failInspectionItemSchema
```

### Pattern 1: Full-Screen Inspection Mode Navigation (No Tab Bar)

The driver layout (`apps/mobile/app/(driver)/_layout.tsx`) uses Expo Router `<Tabs>`. The tasks stack is `name="tasks"` with `tasks/[id]` as a hidden screen via `options={{ href: null }}`.

The Inspection Mode screen needs to be a full-screen takeover with no tab bar visible. There are two approaches in Expo Router:

**Chosen approach: Modal presentation in the tasks stack.** The `tasks/[id]` route already navigates without tab bar because it's a hidden stack screen. When `stepType === 'INSPECTION_ITEM'`, `TaskActionDispatcher` should render `InspectionModeScreen` full-screen. Since `tasks/[id]` already hides the tab bar (it's not a tab), the inspection mode just needs to handle its own back navigation via an exit confirmation `Alert`.

**Navigation approach:**
```
tasks/ (tab, shown)
  index.tsx → MyTasksScreen
  [id].tsx → TaskActionDispatcher → routes to InspectionModeScreen for INSPECTION_ITEM
```

`InspectionModeScreen` is a React component rendered inside `[id].tsx` — not a separate route file. This avoids any navigator complexity and matches the pattern used by DocumentUploadScreen, FormFillScreen, and SignatureScreen.

### Pattern 2: Card Slide Animation (Reanimated)

Use `react-native-reanimated` (already installed, version 4.2.1). The existing `BottomSheet` component uses `SlideInDown.springify()`. For card transitions:

- PASS → card slides left: `withTiming(translateX, { toValue: -width, duration: 280 })`
- Next card slides in from right: `withTiming(translateX, { toValue: 0, duration: 280 })`
- FAIL → card expands in place: no slide, instead animate a `height` or reveal the fail-capture section below using `withTiming`

The existing `AnimatedScreen` uses `FadeIn.duration(200)` from Reanimated. The skeleton loader uses `useSharedValue` + `useAnimatedStyle` + `withTiming` + `withRepeat`. Use the same Reanimated API (not `Animated` from `react-native`) for consistency.

```typescript
// Source: apps/mobile/components/ui/Skeleton.tsx (existing pattern)
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withRepeat } from 'react-native-reanimated'

const translateX = useSharedValue(0)
const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }))

// On PASS:
translateX.value = withTiming(-screenWidth, { duration: 280 }, () => {
  runOnJS(goToNextStep)()
})
```

### Pattern 3: failInspectionItem Service

```typescript
// apps/web/src/server/services/workflows/failInspectionItem.ts
async function failInspectionItem(args: {
  stepInstanceId: string;
  userId: string;
  tenantId: string;
  result: { photoUrls: string[]; note?: string };
}): Promise<void>
```

**Steps (per spec Section 6.4):**
1. Load StepInstance + PlaybookInstance (tenant-scoped via playbookInstance.tenantId)
2. Load the Playbook to read its `category`
3. Validate: if `requiresPhoto=true` (from stepSnapshot) and `photoUrls` empty → throw `BAD_REQUEST: PHOTO_REQUIRED`
4. Set StepInstance `status=FAILED`, persist `result`
5. If Playbook `category === 'VEHICLE_INSPECTION'` (or `'SAFETY'` pending migration decision): create ad-hoc StepInstance of type `APPROVAL`, `assigneeRole=MECHANIC`, name `Repair sign-off: ${stepName}`, attached to same PlaybookInstance
6. Set PlaybookInstance `status=BLOCKED`
7. Find mechanics in tenant → `sendPushToUser` for each → log `PlaybookNotification` (type: `STEP_FAILED`, channel: `PUSH`)
8. Find dispatchers (role: OWNER or MANAGER) → `sendPushToUser` → log `PlaybookNotification` (type: `STEP_FAILED`)
9. Call `computeDispatchReadiness(instanceId)` → vehicle flips not-ready

**Note:** The step template's `requiresPhoto` is stored in the stepSnapshot under the `defaultConfig` JSON. During Phase 43 seed, inspection items were created without a `requiresPhoto` top-level field on `StepTemplate`. The field must be read from `stepSnapshot.defaultConfig.requiresPhoto` or added as a top-level snapshot field. Check what Phase 43's `buildStepSnapshot` actually serializes.

### Pattern 4: tRPC stepInstance.fail/requestApproval/approve

Add to `apps/web/src/server/api/routers/workflows/stepInstance.ts`:

```typescript
const fail = tenantMemberProcedure
  .input(failInspectionItemSchema)  // new Zod schema in packages/validation
  .mutation(async ({ ctx, input }) => {
    return failInspectionItem({
      stepInstanceId: input.stepInstanceId,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      result: input.result,
    })
  })

const requestApproval = tenantMemberProcedure
  .input(z.object({ stepInstanceId: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    // Set status=IN_PROGRESS, notify approver (MECHANIC role user)
    // Creates PlaybookNotification: APPROVAL_NEEDED
  })

const approve = tenantMemberProcedure
  .input(z.object({ stepInstanceId: z.string().uuid(), note: z.string().optional() }))
  .mutation(async ({ ctx, input }) => {
    // Validate: caller must have MECHANIC (or ADMIN) role
    // Set status=COMPLETE, completedByUserId, completedAt
    // Call computeDispatchReadiness → vehicle flips ready
  })
```

### Pattern 5: REST endpoint for mobile fail

Follow the exact pattern of `/api/mobile/driver/tasks/[id]/complete/route.ts`:

```
POST /api/mobile/driver/tasks/[id]/fail
Body: { result: { photoUrls: string[], note?: string } }
Uses: withMobileAuth({ allowedRoles: ['DRIVER'] })
Calls: failInspectionItem service
```

### Pattern 6: Photo Upload for Fail Capture

The `IncidentPhotoCapture` component (`apps/mobile/components/driver/IncidentPhotoCapture.tsx`) uses `expo-image-picker` to capture or pick images, then uploads to R2 via a presigned URL endpoint. The incident photo upload endpoint is at `POST /api/mobile/driver/incidents/upload-photo`.

For inspection fail photos, reuse the **same pattern** but call a new endpoint `POST /api/mobile/driver/tasks/upload-photo` (mirrors the incident pattern). The upload endpoint returns `{ uploadUrl, s3Key }`. Mobile uploads directly to R2, then includes the `s3Key` in the `photoUrls` array when calling the fail endpoint.

Up to 3 photos per spec Section 9.2.

### Anti-Patterns to Avoid

- **Do not navigate to a new route for Inspection Mode.** `InspectionModeScreen` is a component rendered inside `tasks/[id].tsx`, same as DocumentUploadScreen. No new file in `apps/mobile/app/`.
- **Do not use `Animated` from `react-native` for card slides.** The project uses `react-native-reanimated` for animated components (BottomSheet, Skeleton). Mixing APIs creates reconciler conflicts.
- **Do not call `completeStep` for INSPECTION_ITEM passes.** The spec says completeStep rejects INSPECTION_ITEM with `USE_FAIL_ENDPOINT`. But a PASS still needs to record `passOrFail: 'pass'`. Create a separate pass endpoint or use completeStep with a special `passOrFail: 'pass'` result that bypasses the rejection. Check: completeStep currently throws `USE_FAIL_ENDPOINT` for ALL INSPECTION_ITEM calls including passes. **This is a bug in Phase 43** that Phase 44 must fix — either remove the blanket rejection for passes, or route passes through the new `fail` endpoint pattern with `passOrFail: 'pass'`.
- **Do not hardcode the Playbook category check** without resolving the `VEHICLE_INSPECTION` vs `SAFETY` gap first.
- **Do not show tab bar during Inspection Mode.** The spec mandates full-screen takeover. Since `tasks/[id]` is already hidden from tabs, this is automatic — but verify with a screenshot test.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Photo upload to R2 | Custom multipart uploader | `generateUploadUrl` from `apps/web/src/lib/storage/presigned.ts` + direct PUT from mobile | R2 presigned upload pattern already exists and is tested (incidents use it) |
| Push notification delivery | Custom push service | `sendPushToUser` from `apps/web/src/lib/notifications/send-push.ts` | Already handles Expo push token lookup, chunking, invalid token cleanup, error logging |
| Notification audit log | Custom logging | `prisma.playbookNotification.create` | PlaybookNotification model exists and is indexed |
| Card animations | CSS or Animated API | `react-native-reanimated` (already installed) | Project standard; Reanimated v4 has thread-safe animations |
| Back navigation confirmation | Custom modal | `Alert.alert` from React Native | Matches existing project pattern for confirmation dialogs (HOS screen, status update flows) |

---

## Common Pitfalls

### Pitfall 1: INSPECTION_ITEM PASS uses wrong endpoint

**What goes wrong:** `completeStep` currently rejects INSPECTION_ITEM with `USE_FAIL_ENDPOINT` (line 108 in completeStep.ts). But a driver tapping PASS in Inspection Mode is completing the step — not failing it. If Phase 44 adds a `fail` endpoint but leaves `completeStep` broken for passes, the PASS button will 400 error.

**Why it happens:** Phase 43 intentionally blocked INSPECTION_ITEM in `completeStep` to defer to Phase 44. The spec says "if fail → failInspectionItem" but for pass, it still needs a completion path.

**How to avoid:** Fix `completeStep` to handle INSPECTION_ITEM passes: when `result.passOrFail === 'pass'`, proceed normally (no photo required, set status=COMPLETE). Only route to `failInspectionItem` when `passOrFail === 'fail'`. The tRPC `fail` procedure is for explicit failure captures; the tRPC `complete` procedure handles passes for INSPECTION_ITEM.

**Warning signs:** 400 error with "USE_FAIL_ENDPOINT" on the PASS tap path.

### Pitfall 2: PlaybookCategory enum mismatch blocks failInspectionItem

**What goes wrong:** `failInspectionItem` reads `playbookInstance.category` to decide whether to create a mechanic step. If the check is `=== 'VEHICLE_INSPECTION'` but the DB value is `'SAFETY'`, no mechanic steps are ever created — the test "failInspectionItem creates exactly one mechanic APPROVAL step when category=VEHICLE_INSPECTION" will fail.

**Why it happens:** Phase 43's migration diverged from the spec on PlaybookCategory enum values.

**How to avoid:** Add a migration to add `VEHICLE_INSPECTION` to the enum. Update the Pre-Trip Inspection seed. Load category from `playbookInstance.playbookId` → `playbook.category` (live record, not snapshot — category is not in the playbookSnapshot by default, though `buildPlaybookSnapshot` does include `category`). Actually the snapshot does include `category` — read from `playbookInstance.playbookSnapshot.category`.

**Warning signs:** Phase 44 test `failInspectionItem creates exactly one mechanic APPROVAL step` failing with zero steps created.

### Pitfall 3: requiresPhoto field not in stepSnapshot

**What goes wrong:** `failInspectionItem` must validate `photoUrls.length > 0` when `requiresPhoto=true`. But Phase 43's `buildStepSnapshot` copies `stepTemplate.defaultConfig` as a JSON blob, not as top-level fields. So `stepSnapshot.requiresPhoto` is `undefined` — validation never triggers.

**Why it happens:** The `StepTemplate` model has no top-level `requiresPhoto` field — Phase 43 did not add it (the spec shows it but Phase 43 may have stored it inside `defaultConfig`).

**How to avoid:** Read from `(stepSnapshot.defaultConfig as { requiresPhoto?: boolean }).requiresPhoto`. Or add a migration to add `requiresPhoto Boolean @default(false)` to `StepTemplate` and include it in `buildStepSnapshot`. Check the actual DB schema — the model as shown in the spec includes `requiresPhoto` top-level but the actual Phase 43 schema may only have `defaultConfig: Json`.

**Warning signs:** `PHOTO_REQUIRED` error never fires even when photo is missing and `requiresPhoto` should be true.

### Pitfall 4: Ad-hoc mechanic StepInstance missing stepTemplateId

**What goes wrong:** `StepInstance.stepTemplateId` is a required FK to `StepTemplate`. When `failInspectionItem` creates an ad-hoc mechanic APPROVAL step, it needs a `stepTemplateId`. There's no pre-seeded "Mechanic Approval" step template to reference.

**Why it happens:** The spec says "create an ad-hoc StepInstance of type APPROVAL" but StepInstance.stepTemplateId is required in the schema.

**How to avoid two options:**
1. Create a tenant-scoped ad-hoc StepTemplate at fail time (`"Repair sign-off: [step name]"`, type=APPROVAL, role=MECHANIC), then reference it in the StepInstance. This is the cleanest approach but creates a StepTemplate row per failure.
2. Make `stepTemplateId` nullable in the schema via migration for ad-hoc steps. The spec describes ad-hoc steps as not coming from templates.

**Recommendation:** Option 2 (make `stepTemplateId` nullable on `StepInstance`) aligns with the spec's "ad-hoc" language. Add a migration. The stepSnapshot for this ad-hoc step includes everything needed (name, type, role) without needing a real template row.

**Warning signs:** DB constraint violation when creating the mechanic approval step.

### Pitfall 5: Completion screen shows before all photos are uploaded

**What goes wrong:** If the completion screen fires immediately after the last step is marked complete, but photo upload to R2 is still in-flight (the mobile client uploads directly via presigned URL), the user sees the completion screen but the photos haven't actually been saved.

**Why it happens:** Two-step upload (presigned URL → R2 PUT → then include s3Key in fail payload) is async. If the UI advances before the PUT completes, the `photoUrls` will be empty.

**How to avoid:** The fail flow must: (1) request presigned URL, (2) PUT file to R2, (3) only then call the fail API with the s3Keys. Show a loading state during step 2. Block "Submit & Continue" button until all photos are uploaded. This matches exactly how `DocumentUploadScreen` works.

---

## Code Examples

### failInspectionItem service skeleton

```typescript
// apps/web/src/server/services/workflows/failInspectionItem.ts
import { prisma } from '@/lib/db/prisma';
import { TRPCError } from '@trpc/server';
import { computeDispatchReadiness } from './computeDispatchReadiness';
import { sendPushToUser } from '@/lib/notifications/send-push';

export async function failInspectionItem(args: {
  stepInstanceId: string;
  userId: string;
  tenantId: string;
  result: { photoUrls: string[]; note?: string };
}): Promise<void> {
  const { stepInstanceId, userId, tenantId, result } = args;

  const stepInstance = await prisma.stepInstance.findFirst({
    where: { id: stepInstanceId, playbookInstance: { tenantId } },
    include: {
      playbookInstance: {
        include: { playbook: { select: { category: true } } },
      },
    },
  });
  if (!stepInstance) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });

  const snap = stepInstance.stepSnapshot as {
    name?: string;
    defaultConfig?: { requiresPhoto?: boolean };
  };

  // 1. Validate photo requirement
  const requiresPhoto = snap.defaultConfig?.requiresPhoto === true;
  if (requiresPhoto && (!result.photoUrls || result.photoUrls.length === 0)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'PHOTO_REQUIRED' });
  }

  // 2. Mark step failed
  await prisma.stepInstance.update({
    where: { id: stepInstanceId },
    data: { status: 'FAILED', result: result as object },
  });

  // 3. If VEHICLE_INSPECTION category: create ad-hoc mechanic approval step
  const category = stepInstance.playbookInstance.playbook.category;
  if (category === 'VEHICLE_INSPECTION') {  // or 'SAFETY' pending migration
    const stepName = snap.name ?? 'Inspection Item';
    await prisma.stepInstance.create({
      data: {
        playbookInstanceId: stepInstance.playbookInstanceId,
        stepTemplateId: null,  // ad-hoc — requires stepTemplateId nullable migration
        stepSnapshot: {
          name: `Repair sign-off: ${stepName}`,
          stepType: 'APPROVAL',
          assigneeRole: 'MECHANIC',
          isDispatchBlocker: true,
        },
        assigneeRole: 'MECHANIC',
        status: 'NOT_STARTED',
      },
    });
  }

  // 4. Block the instance
  await prisma.playbookInstance.update({
    where: { id: stepInstance.playbookInstanceId },
    data: { status: 'BLOCKED' },
  });

  // 5. Notify dispatcher + mechanic (best-effort push, log to PlaybookNotification)
  await notifyOnFail(stepInstance, tenantId);

  // 6. Recompute readiness — vehicle flips not-ready
  await computeDispatchReadiness(stepInstance.playbookInstanceId);
}
```

### Reanimated card slide (Inspection Mode)

```typescript
// Source: apps/mobile/components/ui/Skeleton.tsx (existing Reanimated v4 pattern)
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated'
import { Dimensions } from 'react-native'

const { width: screenWidth } = Dimensions.get('window')
const translateX = useSharedValue(0)
const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }))

function handlePass() {
  haptic.success()
  translateX.value = withTiming(-screenWidth, { duration: 280 }, (finished) => {
    if (finished) {
      runOnJS(advanceToNextStep)()
    }
  })
}
```

### Photo upload pattern (reuse incident pattern)

```typescript
// Source: apps/web/src/app/api/mobile/driver/incidents/upload-photo/route.ts (existing)
// Step 1: Request presigned URL
const { uploadUrl, s3Key } = await fetch(
  `${API_BASE}/api/mobile/driver/tasks/upload-photo`,
  {
    method: 'POST',
    body: JSON.stringify({ fileName, contentType, sizeBytes }),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  }
).then(r => r.json())

// Step 2: PUT file directly to R2
await fetch(uploadUrl, { method: 'PUT', body: fileBlob, headers: { 'Content-Type': contentType } })

// Step 3: Include s3Key in fail payload
await fetch(`${API_BASE}/api/mobile/driver/tasks/${stepInstanceId}/fail`, {
  method: 'POST',
  body: JSON.stringify({ result: { photoUrls: [s3Key], note } }),
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
})
```

### Exit confirmation pattern (existing Alert.alert usage)

```typescript
// Source: Pattern used in HOS status change modal
import { Alert } from 'react-native'

function handleBackPress() {
  Alert.alert(
    'Exit inspection?',
    'Your progress is saved.',
    [
      { text: 'Stay', style: 'cancel' },
      { text: 'Exit', style: 'destructive', onPress: () => router.back() },
    ]
  )
}
```

---

## Mobile Inspection Mode UX Specification (from spec Section 9.2)

This section documents exactly what must be built, in implementation order:

### Screen structure
- Full-screen — no navigation chrome, no tab bar (already guaranteed by `tasks/[id]` being a hidden route)
- Top bar: back arrow (→ exit confirmation), playbook name (muted center), progress counter "4 / 12" (right), thin progress bar below
- Step card (80% of screen): step number badge, step name (large bold), instruction (1-2 sentences)
- Action area (bottom 20%, always visible): two side-by-side buttons ≥56px each, full half-width

### PASS button behavior
- Green button labeled "PASS"
- Tap → haptic.success() → card slides left (withTiming, 280ms) → next step slides in from right → progress counter increments → subtle checkmark animation + green flash on progress bar
- Every 3rd step: tiny encouragement text "Halfway there! 6 of 12"

### FAIL button behavior
- Red button labeled "FAIL"
- Tap → haptic.error() → card expands in-place (no navigation), reveal fail-capture area:
  - Red "Issue Found" header
  - Camera button "Take Photo (Required)" — up to 3 photos, thumbnail preview per photo, X to remove
  - Notes field (optional), keyboard auto-opens
  - "Submit & Continue" button — disabled until photo uploaded if requiresPhoto=true
  - On submit: calls `fail` API → advances to next step (same slide animation)

### Completion screen (not a toast — full screen)
- Animated large checkmark (use Reanimated FadeIn or a lottie-style spring)
- "[Playbook name] Complete" — e.g., "Pre-Trip Inspection Complete"
- "Submitted at [time] · [Entity label]" — e.g., "Submitted at 7:42 AM · Truck #104"
- Summary: "12 passed · 0 failed" or "11 passed · 1 flagged"
- If failures: "1 item flagged — your dispatcher has been notified"
- Single button: "Back to My Tasks" → `router.back()`

---

## Web: Mechanic Approval UI

The mechanic sign-off UI lives on the **existing** Active Checklist Detail page at `/checklists/instances/[id]`. The ad-hoc APPROVAL step created by `failInspectionItem` will appear in the step list with status `NOT_STARTED`, assigneeRole `MECHANIC`.

The existing `ChecklistDetailClient.tsx` already has the action button logic:

```typescript
// Existing pattern (ChecklistDetailClient.tsx ~line 150)
| IN_PROGRESS + APPROVAL | approver | "Review & Approve" |
```

For Phase 44, the web UI needs to handle the `approve` action for APPROVAL-type steps. This requires:
1. The tRPC `stepInstance.approve` procedure (new in Phase 44)
2. An "Approve" button (or expand the existing SkipDialog pattern) that calls `approve`
3. After approval, `computeDispatchReadiness` flips vehicle back to ready

The ChecklistDetailClient already has a `SkipDialog` component with the Sheet + mutation pattern — reuse this pattern for the `ApproveDialog`.

---

## Vehicle.isDispatchReady Surfacing

Phase 43's `computeDispatchReadiness` already updates `Truck.isDispatchReady` (line 133: `prisma.truck.update({ where: { id: entityId }, data: { isDispatchReady: entityReady } })`). The field exists in the schema (line 249: `isDispatchReady Boolean @default(false)`).

What Phase 44 must do:
1. Surface `isDispatchReady` badge on the **web Truck profile page** (like Driver profile already shows it)
2. Verify the Truck profile has a "Checklists" tab (Phase 43 notes say "Truck profile Checklists section" was built but not Vehicle.isDispatchReady computation — computeDispatchReadiness already does the computation, so only the web display badge is missing)

---

## Testing Requirements (from spec Section 15, Phase 3)

| Test | What to verify |
|------|----------------|
| Unit: `failInspectionItem` with VEHICLE_INSPECTION category | Creates exactly ONE mechanic APPROVAL step |
| Unit: `failInspectionItem` with non-VEHICLE_INSPECTION category (e.g., ONBOARDING) | Creates ZERO mechanic steps |
| Unit: readiness after fail | `isDispatchReady` flips to false |
| Unit: readiness after mechanic approval | `isDispatchReady` flips back to true |
| Unit: photo validation | Rejects when `requiresPhoto=true` and `photoUrls` empty; passes when photo provided |
| E2E mobile: complete 12-step DVIR with 1 intentional fail | Completion screen shows "11 passed · 1 flagged" |
| E2E mobile: verify no tab bar during inspection | Screenshot assertion or `tabBarStyle.display === 'none'` check |
| Naming lint (existing) | No internal names in `.tsx` JSX text — `InspectionModeScreen` must say "Inspection" not "InspectionMode" in user-facing copy |
| Tap target audit (existing) | PASS/FAIL buttons ≥56px height |

---

## Open Questions

1. **VEHICLE_INSPECTION vs SAFETY category**
   - What we know: schema uses `SAFETY`; spec says `VEHICLE_INSPECTION`; seed uses `SAFETY`
   - What's unclear: was this an intentional simplification in Phase 43, or an oversight?
   - Recommendation: add `VEHICLE_INSPECTION` to the enum via migration; update seed; this aligns with spec Section 16.3 ("Spec is truth")

2. **stepTemplateId nullable for ad-hoc steps**
   - What we know: `StepInstance.stepTemplateId` is a required FK in the schema
   - What's unclear: spec says ad-hoc mechanic steps — no template — but schema requires a template ID
   - Recommendation: migration to make `stepTemplateId` nullable on `StepInstance`; create a special `ad-hoc-step` sentinel OR create the mechanic step template on-the-fly per fail

3. **INSPECTION_ITEM PASS path through completeStep**
   - What we know: `completeStep` throws `USE_FAIL_ENDPOINT` for ALL INSPECTION_ITEM (line 108)
   - What's unclear: spec says PASS should complete the step; the blanket rejection blocks passes too
   - Recommendation: update `completeStep` INSPECTION_ITEM case — allow when `result.passOrFail === 'pass'`; only throw `USE_FAIL_ENDPOINT` when `passOrFail === 'fail'` or `passOrFail` is missing

4. **Mechanic user identification for approval**
   - What we know: `assigneeRole: 'MECHANIC'` is set on ad-hoc step; `generatePlaybookInstance` has assignee resolution logic
   - What's unclear: does the tenant have a MECHANIC role user? The User role enum uses `OWNER | DRIVER | MANAGER | ADMIN` — there is no `MECHANIC` user role. Mechanics may not have app accounts.
   - Recommendation: create the ad-hoc step with `assignedUserId: null` (same as when multiple dispatchers exist); dispatcher handles it manually via the web Active Checklist Detail. Push notification goes to all OWNER/MANAGER users.

5. **requiresPhoto field location in schema**
   - What we know: StepTemplate model in spec has `requiresPhoto Boolean @default(false)` as a top-level field; actual Phase 43 schema may only have `defaultConfig: Json`
   - Recommendation: check current StepTemplate model carefully before writing failInspectionItem; if `requiresPhoto` is only in defaultConfig, read from there

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `apps/web/prisma/schema.prisma` — all model definitions, enum values, field presence
- `apps/web/src/server/services/workflows/completeStep.ts` — INSPECTION_ITEM rejection pattern, TODO(phase-44) hook
- `apps/web/src/server/services/workflows/computeDispatchReadiness.ts` — Truck.isDispatchReady already updated here
- `apps/web/src/server/services/workflows/generatePlaybookInstance.ts` — playbookSnapshot shape, buildStepSnapshot
- `apps/web/src/server/api/routers/workflows/stepInstance.ts` — existing procedures, auth middleware pattern
- `apps/mobile/components/driver/workflows/TaskActionDispatcher.tsx` — InspectionPlaceholderScreen location
- `apps/mobile/app/(driver)/_layout.tsx` — tasks tab setup, `tasks/[id]` hidden route
- `apps/mobile/components/driver/IncidentPhotoCapture.tsx` — expo-image-picker pattern for fail photos
- `apps/web/src/app/api/mobile/driver/incidents/upload-photo/route.ts` — presigned URL pattern for photo upload
- `apps/web/src/lib/notifications/send-push.ts` — sendPushToUser/sendPushToOrg API
- `apps/mobile/package.json` — react-native-reanimated 4.2.1 installed, expo-image-picker ~55.0.14 installed
- `apps/web/package.json` — expo-server-sdk installed, no Twilio
- `apps/mobile/components/ui/AnimatedScreen.tsx` — FadeIn Reanimated pattern
- `apps/mobile/components/ui/Skeleton.tsx` — useSharedValue/useAnimatedStyle/withTiming pattern
- `docs/specs/DriveCommand_Workflow_Engine_v2.md` — spec Sections 6.4, 9.2, 10, 14 Phase 3, 15 Phase 3
- `apps/web/src/server/services/workflows/seedStarterPlaybooks.ts` — SAFETY category used for Pre-Trip Inspection
- `packages/validation/src/workflows/stepInstance.ts` — existing Zod schemas

### Secondary (MEDIUM confidence)
- Phase 43 RESEARCH.md / SUMMARY files (via git log context) — confirms what was and wasn't built

---

## Metadata

**Confidence breakdown:**
- failInspectionItem logic: HIGH — spec is explicit, existing completeStep pattern is clear
- Mobile Inspection Mode UX: HIGH — spec Section 9.2 is fully prescriptive; animation libraries confirmed installed
- Notification delivery: HIGH — sendPushToUser already works; SMS confirmed absent
- PlaybookCategory gap: HIGH confidence the gap exists; resolution strategy is MEDIUM (migration needed)
- stepTemplateId nullable question: HIGH confidence it's required; solution is MEDIUM (either approach works)

**Research date:** 2026-04-24
**Valid until:** 2026-05-24 (stable domain — workflow spec and codebase are locked)
