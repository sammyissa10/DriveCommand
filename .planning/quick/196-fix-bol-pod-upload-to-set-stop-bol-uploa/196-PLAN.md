---
phase: quick-196
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
  - apps/web/src/lib/carrier/stop-completion.ts
autonomous: true
must_haves:
  truths:
    - "After uploading a BOL document on a pickup stop, the page refreshes and shows a green check with '(uploaded)'"
    - "After uploading a BOL document on a pickup stop where bolRequired=true, the Complete Stop button becomes enabled"
    - "After uploading a POD document on a delivery stop where podRequired=true, the Complete Stop button becomes enabled"
    - "The server-side completeStop function allows completion when a BOL/POD document exists, even if bolNumber/podNumber is not yet filled in"
  artifacts:
    - path: "apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx"
      provides: "router.refresh() call after document upload success"
    - path: "apps/web/src/lib/carrier/stop-completion.ts"
      provides: "Relaxed BOL/POD check — document OR number satisfies requirement"
  key_links:
    - from: "StopTimelineCard.tsx DocumentUploadModal onSuccess"
      to: "router.refresh()"
      via: "direct call in onSuccess callback"
      pattern: "router\\.refresh\\(\\)"
    - from: "completeStop"
      to: "CarrierDocument count query"
      via: "prisma.carrierDocument.count"
      pattern: "hasBolDoc.*hasBolNumber"
---

<objective>
Fix document upload on dispatch detail page so that uploading a BOL/POD document actually enables the Complete Stop button without requiring a manual page reload.

Purpose: Two bugs prevent the upload-then-complete flow from working:
1. **UI does not refresh after upload** — `StopTimelineCard` passes `onStopUpdated?.()` as the upload success callback, but `onStopUpdated` is never wired (StopTimeline.tsx does not pass it). The page never re-fetches `stopDocCounts`, so `bolUploaded` stays false and Complete Stop stays disabled.
2. **Server requires both bolNumber AND bolDoc** — `completeStop()` in stop-completion.ts line 91 checks `if (!hasBolNumber || !hasBolDoc)`, meaning even with a document uploaded, if the stop's `bolNumber` field is null, completion fails. The requirement should be: having EITHER a document OR a number satisfies the compliance check (using OR instead of AND).

Output: Working upload-to-complete flow on dispatch detail page.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
@apps/web/src/components/carrier/dispatches/StopTimeline.tsx
@apps/web/src/lib/carrier/stop-completion.ts
@apps/web/src/lib/carrier/documents.ts
@apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix page refresh after document upload and relax server-side BOL/POD check</name>
  <files>
    apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
    apps/web/src/lib/carrier/stop-completion.ts
  </files>
  <action>
**Fix 1 — StopTimelineCard.tsx: refresh page after upload**

In `StopTimelineCard.tsx`, the `DocumentUploadModal` components (around lines 403-408 and 432-436) use `onSuccess={() => onStopUpdated?.()}` as the success callback. The `onStopUpdated` prop is optional and is NEVER passed by `StopTimeline.tsx`, so this is always a no-op.

Change both `DocumentUploadModal` `onSuccess` callbacks from:
```tsx
onSuccess={() => onStopUpdated?.()}
```
to:
```tsx
onSuccess={() => { router.refresh(); onStopUpdated?.(); }}
```

The component already has `const router = useRouter()` (line 134), so `router.refresh()` is available. This forces the RSC page to re-render server-side, re-fetching `stopDocCounts` from the database, which will now include the newly uploaded document. The `bolUploaded` / `podUploaded` props will update, enabling the Complete Stop button.

Keep the `onStopUpdated?.()` call as well for future extensibility.

**Fix 2 — stop-completion.ts: relax BOL/POD compliance check**

In `completeStop()` (apps/web/src/lib/carrier/stop-completion.ts), the BOL check at lines 84-93 currently requires BOTH `hasBolNumber` (stop.bolNumber is not null) AND `hasBolDoc` (CarrierDocument count > 0):

```ts
if (!hasBolNumber || !hasBolDoc) {
  return { error: 'BOL document required before completing this stop.', status: 422 };
}
```

Change to require EITHER a document OR a number (having one satisfies the compliance requirement):

```ts
if (!hasBolNumber && !hasBolDoc) {
  return { error: 'BOL document or BOL number required before completing this stop.', status: 422 };
}
```

Apply the same fix to the POD check at lines 99-108:

Change from:
```ts
if (!hasPodNumber || !hasPodDoc) {
  return { error: 'POD document required before completing this stop.', status: 422 };
}
```
to:
```ts
if (!hasPodNumber && !hasPodDoc) {
  return { error: 'POD document or POD number required before completing this stop.', status: 422 };
}
```

This means: uploading a BOL document alone is sufficient, OR entering a BOL number alone is sufficient. Both together is ideal but not required.
  </action>
  <verify>
1. `cd apps/web && npx tsc --noEmit` passes with no errors
2. On a dispatch detail page with a pickup stop that has bolRequired=true and no bolNumber:
   - Upload a BOL document — page refreshes automatically, green check appears, Complete Stop button becomes enabled
3. On a dispatch detail page with a delivery stop that has podRequired=true:
   - Upload a POD document — page refreshes automatically, green check appears, Complete Stop button becomes enabled
4. Click Complete Stop after uploading BOL — should succeed (200 response), stop status changes to completed
  </verify>
  <done>
Uploading a BOL/POD document on a stop immediately refreshes the UI to show the upload status and enables the Complete Stop button. The server-side completion check accepts either a document upload or a reference number as sufficient compliance evidence.
  </done>
</task>

</tasks>

<verification>
- Upload BOL on pickup stop with bolRequired=true, no bolNumber — Complete Stop becomes clickable and succeeds
- Upload POD on delivery stop with podRequired=true, no podNumber — Complete Stop becomes clickable and succeeds
- Enter bolNumber without uploading doc — Complete Stop still works (backward compatible)
- `npx tsc --noEmit` passes
</verification>

<success_criteria>
- Document upload triggers automatic page refresh showing updated BOL/POD status indicators
- Complete Stop button is enabled after document upload without needing manual page reload
- Server accepts document OR number as sufficient for BOL/POD compliance
- No TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/196-fix-bol-pod-upload-to-set-stop-bol-uploa/196-SUMMARY.md`
</output>
