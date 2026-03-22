---
phase: quick-96
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/documents/driver-document-list.tsx
autonomous: true
must_haves:
  truths:
    - "View button works on iOS Safari without being blocked as a popup"
    - "Mobile document cards show a clean 2-row layout instead of cluttered 3-button row"
    - "Edit form (isEditing branch) is completely unchanged"
  artifacts:
    - path: "src/components/documents/driver-document-list.tsx"
      provides: "Fixed handleView + redesigned mobile card layout"
      contains: "window.open('', '_blank')"
  key_links:
    - from: "handleView"
      to: "window.open"
      via: "synchronous open before async fetch"
      pattern: "const win = window\\.open\\('', '_blank'\\)"
---

<objective>
Fix iOS Safari popup blocker issue on View button and redesign the mobile document card layout for driver documents.

Purpose: iOS Safari blocks window.open() after async calls; the current 3-button row is too cramped on mobile.
Output: Updated driver-document-list.tsx with both fixes.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/documents/driver-document-list.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix iOS Safari handleView and redesign mobile document card</name>
  <files>src/components/documents/driver-document-list.tsx</files>
  <action>
Two changes in this file. Do NOT touch the edit form (isEditing branch) at all.

**Change 1 — handleView iOS Safari fix:**

Replace the handleView function (lines 52-68) with this pattern that opens the window synchronously in the user gesture handler, then sets location after the async fetch:

```typescript
const handleView = async (docId: string, fileName: string) => {
  const win = window.open('', '_blank');
  if (!win) { return; }
  setViewing(docId);
  try {
    const result = await getDownloadUrl(docId);
    if ('error' in result) {
      win.close();
      alert(`Failed to open document: ${result.error}`);
      return;
    }
    win.location.href = result.downloadUrl;
  } catch (error) {
    win.close();
    alert(`Failed to open document: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    setViewing(null);
  }
};
```

**Change 2 — Add formatShortDate helper:**

Add this helper next to the existing formatDate function:

```typescript
const formatShortDate = (date: Date | string): string => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};
```

**Change 3 — Redesign regular document display (the non-editing li):**

Replace the regular document display `<li>` (lines 295-348) with a clean 2-row card layout:

- Row 1: `flex items-center justify-between gap-2`
  - Left: file-type badge (existing getFileTypeBadge/color) + truncated filename (`truncate text-sm font-medium text-gray-900`)
  - Right: View button — blue, flex-shrink-0, same onClick/disabled logic, text "View" / "Opening..."
    - Classes: `rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0`

- Row 2: `mt-1.5 flex items-center justify-between gap-2`
  - Left side: `flex items-center gap-2 text-xs text-gray-500 min-w-0`
    - Document type badge (existing docTypeBadge with same styling)
    - File size (formatFileSize)
    - Dot separator: `·`
    - Short date (formatShortDate(doc.createdAt))
  - Right side: `flex items-center gap-3 flex-shrink-0`
    - Edit: `<button>` with `text-xs text-gray-500 hover:text-gray-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed` — text "Edit", same onClick={() => startEdit(doc)}, disabled={isPending}
    - Delete: `<button>` with `text-xs text-red-500 hover:text-red-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed` — text={isDeleting ? 'Deleting...' : 'Delete'}, same onClick/disabled logic

- Below row 2 (conditional lines):
  - If doc.expiryDate: `<div className="mt-1.5"><ExpiryStatusBadge expiryDate={doc.expiryDate} /></div>`
  - If doc.notes: `<p className="mt-1 text-xs text-gray-600 italic">{doc.notes}</p>`
  </action>
  <verify>Run `npx next build` or `npx tsc --noEmit` to confirm no type errors. Visually inspect in browser on mobile viewport.</verify>
  <done>handleView opens blank window synchronously (iOS Safari safe). Mobile card shows 2-row layout: row 1 = badge + filename + View button, row 2 = doc-type + size + date + Edit/Delete text links. Edit form unchanged.</done>
</task>

</tasks>

<verification>
- TypeScript compiles without errors
- handleView contains `window.open('', '_blank')` before any async call
- Regular display li has 2-row layout, not the old 3-button column layout
- Edit form (isEditing branch) is identical to before
</verification>

<success_criteria>
- View button works on iOS Safari (no popup blocked)
- Mobile document cards are clean and readable with 2-row layout
- No regressions in edit or delete functionality
</success_criteria>

<output>
After completion, create `.planning/quick/96-tkt-0043-fix-ios-view-button-and-redesig/96-SUMMARY.md`
</output>
