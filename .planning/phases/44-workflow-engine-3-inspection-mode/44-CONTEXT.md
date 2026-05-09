# Phase 44: Workflow Engine 3 — Inspection Mode - Context

**Gathered:** 2026-04-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 delivers the product's signature mobile UX: a full-screen, chrome-free card-by-card Inspection Mode where drivers PASS or FAIL each VEHICLE_INSPECTION step with in-place fail capture (up to 3 photos + note), between-step micro-moments, and a full-screen completion summary. The `failInspectionItem` service records the failure, auto-creates an ad-hoc mechanic APPROVAL step (VEHICLE_INSPECTION only), blocks the PlaybookInstance, fires STEP_FAILED push notifications to dispatchers and mechanics, then calls `computeDispatchReadiness` which flips `Truck.isDispatchReady = false`. The web side gains a mechanic ApproveDialog on Active Checklist detail and a dispatch-readiness badge on the truck profile; mechanic approval re-triggers `computeDispatchReadiness` to flip the truck back to ready.

No Phase 4 work: no `fireEvent`, no auto-start rules, no trigger wiring.

</domain>

<decisions>
## Implementation Decisions

### Full-screen takeover approach
- Use Expo Router `fullScreenModal` Stack screen — add `app/(driver)/tasks/inspect/[instanceId].tsx` as a dedicated Stack screen with `presentation: 'fullScreenModal'`, `headerShown: false`, `gestureEnabled: false`
- `TaskActionDispatcher` navigates via `router.push()` instead of rendering `InspectionModeScreen` inline
- **Why:** `fullScreenModal` renders above the Tab.Navigator — tab bar fully gone, not visually overlaid. Android back gesture is controlled. z-index overlay approach is rejected (fights SafeAreaView + Android back gesture)
- Spec Section 9.2 is the authority: "No tab bar. No navigation chrome. Mirrors Calm/Headspace focused-session UX"

### Card transition animation
- `react-native-reanimated` is the only animation dependency — already installed and in use in `InspectionModeScreen.tsx`
- PASS: `withTiming(-SCREEN_WIDTH, {duration: 280})` → slide out left, reset to `+SCREEN_WIDTH`, `withTiming(0)` → slide new card in from right
- No new animation libraries under any circumstances

### Tap targets
- All interactive elements ≥56px — enforced. PASS and FAIL buttons are full half-width of the action area (≥56px height)
- Back arrow, photo buttons, "Submit & Continue" all ≥56px

### failInspectionItem interaction order (locked — do not reorder)
Steps must execute in this exact sequence:
1. Photo validation guard (`requiresPhoto` → reject if `photoUrls` empty)
2. `StepInstance.status = 'FAILED'`, persist `result`
3. If `VEHICLE_INSPECTION`: create ad-hoc APPROVAL step (`stepTemplateId: null`, `assigneeRole: 'MECHANIC'` as display label)
4. `PlaybookInstance.status = 'BLOCKED'`
5. `sendStepFailed(DISPATCHER)` push
6. If `VEHICLE_INSPECTION`: `sendStepFailed(MECHANIC)` push + `sendApprovalNeeded(OWNER/MANAGER)` push
7. `computeDispatchReadiness(playbookInstanceId)` → `Truck.isDispatchReady = false`

`computeDispatchReadiness` runs **last** so the ad-hoc APPROVAL step (created in step 3) is already in the DB and counted as a blocker in the readiness query.

### Notifications — push only in Phase 3
- STEP_FAILED → dispatcher push (always) + mechanic push (VEHICLE_INSPECTION only)
- APPROVAL_NEEDED → OWNER/MANAGER push (VEHICLE_INSPECTION only)
- SMS delivery (`TODO(phase-5)`) remains deferred to Phase 5 — push-only is the Phase 3 DoD requirement
- STEP_ASSIGNED push is also in scope for Phase 3

### MECHANIC role design (permanent)
- No MECHANIC user type exists or is planned in the system
- `assigneeRole: 'MECHANIC'` in the ad-hoc step snapshot is display copy only (shown in the ApproveDialog step name)
- APPROVAL_NEEDED push is delivered to OWNER/MANAGER dispatchers — they are the permanent approvers for mechanic sign-offs

### Vehicle isDispatchReady — web only for Phase 3
- `Truck.isDispatchReady` already exists in schema (added Phase 43)
- `computeDispatchReadiness` already updates `Truck.isDispatchReady` via `updateEntityReadiness('VEHICLE', entityId, tenantId)`
- Web ApproveDialog on ChecklistDetailClient is the mechanic approval interface — no mobile approve screen in Phase 3
- `isDispatchReady` badge surfaced on truck profile (web) — existing Phase 44-05 work

### Fail-capture UX (in-place, no navigation)
- Fail capture expands in-place on the current card — does not navigate to a new screen
- Up to 3 photos via `expo-image-picker` (existing pattern, already in use in `InspectionModeScreen.tsx`)
- Note field optional; keyboard auto-opens on fail-capture expand
- "Submit & Continue" validates `requiresPhoto`, saves, advances to next card

### Completion screen
- Full-screen (not a toast) — same modal route, replaces card view
- Large animated checkmark + playbook name + "Submitted at HH:MM · Truck #XXX"
- Summary: "N passed · M failed" or "N passed · M flagged" if failures
- If failures: "M item(s) flagged — your dispatcher has been notified"
- Single CTA: "Back to My Tasks" → `router.back()`

### Micro-moments (between-step)
- Progress bar thin line below top bar, width = `(currentIndex / total) * 100%`, animated with `withTiming`
- Encouragement every 3 steps: milestone-based copy ("Halfway there! 6 of 12") — exact copy is Claude's discretion matching spec Section 9.2 pattern
- Pass → subtle checkmark animation + brief green flash on progress bar segment

### Claude's Discretion
- Exact encouragement copy text (spec gives pattern, not literals)
- Progress bar color-fill animation duration
- Error state styling within fail-capture (within existing NativeWind token system)
- Loading state on "Submit & Continue" button during photo upload

</decisions>

<specifics>
## Specific Ideas

- Spec Section 9.2 explicitly references Calm/Headspace focused-session UX as the design reference: distraction-free, full attention on the current card
- Card slide direction: PASS always slides left (forward), completing a FAIL and continuing also slides left — direction is consistent, never right (no "going back" feeling during normal flow)
- Exit confirmation: "Exit inspection? Your progress is saved." — user must confirm before leaving mid-session

</specifics>

<deferred>
## Deferred Ideas

- SMS delivery for STEP_FAILED — Phase 5 (`TODO(phase-5)` comment already in `failInspectionItem.ts`)
- Mobile owner approve screen for mechanic sign-offs — Phase 4+ scope
- E2E Detox/Maestro test for 12-step DVIR with one intentional fail — Phase 5 testing scope

</deferred>

---

*Phase: 44-workflow-engine-3-inspection-mode*
*Context gathered: 2026-04-25*
