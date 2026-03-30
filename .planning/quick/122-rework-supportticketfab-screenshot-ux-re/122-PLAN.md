---
phase: quick-122
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/mobile/components/shared/SupportTicketFAB.tsx
autonomous: true
must_haves:
  truths:
    - "Tapping the FAB shows an Alert asking whether to screenshot before opening"
    - "Choosing Yes captures the current screen via react-native-view-shot captureScreen() then opens the bottom sheet with the screenshot pre-attached"
    - "Choosing No opens the bottom sheet normally with no screenshot"
    - "Screenshot thumbnail is visible in the form with a remove (X) button"
    - "The in-form Attach Screenshot button and its camera/gallery picker are removed"
    - "Submitting with a pre-captured screenshot still uploads and attaches it to the ticket"
  artifacts:
    - path: "apps/mobile/components/shared/SupportTicketFAB.tsx"
      provides: "Reworked screenshot UX with pre-capture Alert flow"
  key_links:
    - from: "SupportTicketFAB FAB onPress"
      to: "Alert.alert → captureScreen → setVisible"
      via: "Alert callback chain"
      pattern: "captureScreen"
---

<objective>
Rework the SupportTicketFAB screenshot UX so the capture happens BEFORE the bottom sheet opens, not inside the form.

Purpose: The current flow forces users to attach screenshots from camera/gallery after opening the form. The new flow lets users capture the exact screen they are looking at before the form covers it, which is more useful for bug reports.

Output: Updated SupportTicketFAB.tsx with Alert-based pre-capture flow.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/mobile/components/shared/SupportTicketFAB.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rework FAB onPress to Alert-based screenshot capture flow</name>
  <files>apps/mobile/components/shared/SupportTicketFAB.tsx</files>
  <action>
Modify SupportTicketFAB.tsx with these changes:

1. **Add import** for `captureScreen` from `react-native-view-shot`:
   ```
   import { captureScreen } from 'react-native-view-shot'
   ```

2. **Remove imports** that are no longer needed:
   - Remove `Camera` from lucide-react-native imports (keep `LifeBuoy` and `X`)
   - Remove ALL expo-image-picker imports (`launchCameraAsync`, `launchImageLibraryAsync`, `requestCameraPermissionsAsync`, `requestMediaLibraryPermissionsAsync`)

3. **Replace the FAB onPress handler**. Instead of `() => setVisible(true)`, create a new handler `handleFabPress` that shows an Alert:
   ```
   Alert.alert(
     'Screenshot this screen?',
     'Capture the current screen before opening the support form?',
     [
       {
         text: 'Yes',
         onPress: async () => {
           try {
             const uri = await captureScreen({ format: 'jpg', quality: 0.8 })
             setForm((f) => ({ ...f, screenshotUri: uri }))
           } catch {
             // Silently continue — screenshot is optional
           }
           setVisible(true)
         },
       },
       {
         text: 'No',
         onPress: () => setVisible(true),
       },
       { text: 'Cancel', style: 'cancel' },
     ]
   )
   ```
   The key detail: `captureScreen()` runs BEFORE `setVisible(true)` so the bottom sheet is not in the screenshot.

4. **Delete the `handleAttachScreenshot` function entirely** (lines 256-304 in current file). This removes the camera/gallery picker flow.

5. **Remove the Attach Screenshot button from the JSX** — delete the entire `attachRow` View block (the Pressable with Camera icon and "Attach Screenshot" text).

6. **Keep the screenshot thumbnail preview and remove button** — the existing preview block with `form.screenshotUri` check, Image, and X remove button stays exactly as-is. This lets users see and remove the pre-captured screenshot.

7. **Clean up styles** — remove `attachRow`, `attachButton`, and `attachButtonText` from the StyleSheet since they are no longer used.

8. **Keep everything else unchanged** — the upload logic in mutationFn, the S3 upload helper, categories, priorities, form validation, submit button — all remain the same.
  </action>
  <verify>
  Run TypeScript check:
  ```
  cd apps/mobile && npx tsc --noEmit --pretty 2>&1 | head -30
  ```
  Verify no import errors for react-native-view-shot or missing references to removed code.
  </verify>
  <done>
  FAB tap shows a 3-option Alert (Yes/No/Cancel). Yes captures screen via captureScreen() then opens sheet with screenshot pre-attached. No opens sheet normally. The in-form Attach Screenshot button is gone. Screenshot thumbnail with remove option remains in the form. TypeScript compiles clean.
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles with no errors
- No references to removed expo-image-picker imports
- No references to removed Camera icon import
- captureScreen import from react-native-view-shot present
- Alert.alert called in FAB onPress with Yes/No/Cancel options
- Screenshot thumbnail + remove button still rendered when screenshotUri is set
</verification>

<success_criteria>
- Tapping FAB shows Alert with "Yes" (capture + open), "No" (just open), "Cancel"
- Yes path: captureScreen() runs before bottom sheet opens, URI stored in form state
- Screenshot preview with remove button visible in form when screenshot was captured
- No Attach Screenshot button in the form
- Clean TypeScript compilation
</success_criteria>

<output>
After completion, create `.planning/quick/122-rework-supportticketfab-screenshot-ux-re/122-SUMMARY.md`
</output>
