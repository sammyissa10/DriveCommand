---
phase: quick-166
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/carrier/stops/StopBuilder.tsx
  - apps/web/src/components/carrier/stops/StopCard.tsx
  - apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx
autonomous: true
must_haves:
  truths:
    - "Dispatcher can reorder stops via drag-and-drop and sequence_order updates automatically"
    - "Dispatcher can add a stop by searching facilities and filling quick-add fields"
    - "Dispatcher can inline-edit any stop's details by clicking the card body"
    - "Dispatcher can remove a stop with confirmation"
    - "No auto-sort logic exists — order is exclusively dispatcher-controlled"
  artifacts:
    - path: "apps/web/src/components/carrier/stops/StopBuilder.tsx"
      provides: "Drag-and-drop sortable stop list with @dnd-kit/sortable"
    - path: "apps/web/src/components/carrier/stops/StopCard.tsx"
      provides: "Individual stop card with drag handle, badges, inline edit panel"
    - path: "apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx"
      provides: "Add stop modal integrating FacilitySearchModal + quick-add form"
  key_links:
    - from: "StopBuilder.tsx"
      to: "StopCard.tsx"
      via: "SortableContext renders StopCard per stop"
      pattern: "SortableContext.*StopCard"
    - from: "StopBuilderAddModal.tsx"
      to: "FacilitySearchModal.tsx"
      via: "import and render FacilitySearchModal"
      pattern: "FacilitySearchModal"
---

<objective>
Build the reusable Stop Builder drag-and-drop component for Carrier Ops.

Purpose: This shared component is required by both Route Templates and Loads create/edit pages. It must exist before those pages can be built.
Output: Three components in apps/web/src/components/carrier/stops/ — StopBuilder, StopCard, StopBuilderAddModal.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/carrier/facilities/FacilitySearchModal.tsx
@apps/web/src/components/carrier/clients/ClientForm.tsx
@apps/web/src/components/ui/dialog.tsx
@apps/web/src/components/ui/badge.tsx
@apps/web/src/components/ui/switch.tsx
@apps/web/src/components/ui/select.tsx
@apps/web/src/components/ui/sheet.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install @dnd-kit and create StopCard with inline edit</name>
  <files>
    apps/web/src/components/carrier/stops/StopCard.tsx
  </files>
  <action>
First, install @dnd-kit dependencies in apps/web:
```
cd apps/web && npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Create StopCard.tsx as a 'use client' component.

**Props:**
```typescript
interface StopCardProps {
  stop: StopBuilderStop;
  index: number; // 0-based, display as index+1
  mode: 'template' | 'load';
  onUpdate: (updated: StopBuilderStop) => void;
  onRemove: () => void;
}
```

Export the StopBuilderStop interface from this file (it will be re-exported from StopBuilder).

**StopBuilderStop type** — use the exact interface from the task spec (id, facility_id, facility_name, facility_city, facility_state, sequence_order, stop_type, contact_name, contact_phone, expected_dwell_minutes, commodity_description, bol_required, pod_required, special_instructions, appt_window_start_offset_min, appt_window_end_offset_min, appointment_start, appointment_end).

**Card layout (collapsed state):**
- Use `useSortable` from @dnd-kit/sortable. Apply `attributes`, `listeners` to drag handle, `setNodeRef` to the card wrapper, `transform`/`transition` via CSS.transform utility.
- Left: drag handle icon (GripVertical from lucide-react) with `listeners` and `attributes` spread + cursor-grab styling.
- Sequence number badge: rounded-full bg-muted w-7 h-7 flex items-center justify-center text-sm font-medium, showing `index + 1`.
- Stop type badge: pickup=blue (bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300), delivery=green, fuel_stop=gray, layover=amber. Use Badge variant="outline" with colored border classes matching the carrier pattern.
- Facility name (font-medium) and city/state (text-muted-foreground text-xs) in a flex-1 div.
- Appointment window: show if set — for template mode show offset as "+Xh Ym", for load mode show date/time. Text-xs text-muted-foreground.
- Expected dwell: show "{N} min dwell" if set, text-xs.
- BOL required: small badge "BOL" in blue if bol_required is true.
- POD required: small badge "POD" in green if pod_required is true.
- Remove button: X icon button, on click show a simple confirm (window.confirm is fine — "Remove this stop?"), then call onRemove.

**Inline edit panel (expanded state):**
- Track `isExpanded` in local state, toggle on card body click (NOT on drag handle, NOT on remove button).
- When expanded, render below the collapsed row within the same card border, with a border-t separator.
- Fields using shadcn Input, Select, Switch, Textarea:
  - contact_name (Input)
  - contact_phone (Input)
  - For template mode: appt_window_start_offset_min and appt_window_end_offset_min as number Inputs (label: "Appointment Offset Start/End (minutes)")
  - For load mode: appointment_start and appointment_end as datetime-local Inputs
  - expected_dwell_minutes (number Input)
  - commodity_description (Input)
  - bol_required (Switch)
  - pod_required (Switch)
  - special_instructions (Textarea, 2 rows)
- All fields call onUpdate with the updated stop on change (controlled via parent).
- Use a 2-column grid (grid grid-cols-2 gap-3) for the form fields, special_instructions spans full width.

Style the card: rounded-lg border border-border bg-card p-3. When dragging, add ring-2 ring-ring shadow-lg opacity-90.
  </action>
  <verify>
Run `cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -30` — no errors from StopCard.tsx. Confirm @dnd-kit packages are in package.json.
  </verify>
  <done>StopCard renders with drag handle, all badges, inline edit panel with mode-aware fields, and remove with confirmation. @dnd-kit packages installed.</done>
</task>

<task type="auto">
  <name>Task 2: Create StopBuilder and StopBuilderAddModal</name>
  <files>
    apps/web/src/components/carrier/stops/StopBuilder.tsx
    apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx
  </files>
  <action>
**StopBuilder.tsx** — 'use client' component.

Re-export StopBuilderStop from StopCard.tsx so consumers import from StopBuilder.

Props:
```typescript
interface StopBuilderProps {
  stops: StopBuilderStop[];
  onChange: (stops: StopBuilderStop[]) => void;
  mode: 'template' | 'load';
}
```

Implementation:
- Wrap children in `DndContext` from @dnd-kit/core with `closestCenter` collision strategy.
- Use `SortableContext` with `verticalListSortingStrategy` from @dnd-kit/sortable.
- Use `useSensors` + `useSensor(PointerSensor, { activationConstraint: { distance: 5 } })` to avoid accidental drags on click.
- Also add `useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })` for keyboard accessibility.
- `onDragEnd` handler: get `active.id` and `over.id`, find old/new indexes via `arrayMove` from @dnd-kit/sortable, create reordered array, recompute sequence_order as 1-based integers (map with index+1), call onChange.
- CRITICAL: No auto-sort by stop_type. No sort button. The sequence is 100% dispatcher-controlled via drag-and-drop or add order.
- Render each stop as `<StopCard>` passing: stop, index, mode, onUpdate (replaces stop in array by id, calls onChange), onRemove (filters stop out by id, recomputes sequence_order as 1-based, calls onChange).
- Below the list: "Add Stop" button (Button variant="outline", Plus icon) that opens the add modal.
- Track `showAddModal` state locally.
- If stops array is empty, show an empty state: dashed border rounded-lg p-8, "No stops added yet" text + the Add Stop button centered.
- Use `DragOverlay` with a clone of the dragged StopCard for smooth visual feedback.

**StopBuilderAddModal.tsx** — 'use client' component.

Props:
```typescript
interface StopBuilderAddModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (stop: StopBuilderStop) => void;
  mode: 'template' | 'load';
}
```

Implementation — two-step flow inside a Dialog:
1. **Step 1 — Facility selection:** Render FacilitySearchModal (import from @/components/carrier/facilities/FacilitySearchModal). When facility is selected, store it and advance to step 2. Pass `onCreateNew` to open the facility create side Sheet (use the Sheet component — render FacilityForm from @/components/carrier/facilities/FacilityForm inside the Sheet. After create, use the new facility and advance to step 2).
2. **Step 2 — Quick-add form:** Show selected facility name/city/state at top (non-editable, with a "Change" button to go back to step 1). Form fields:
   - stop_type: Select with options pickup, delivery, fuel_stop, layover
   - bol_required: Switch (default false, auto-set true when stop_type is pickup or delivery)
   - pod_required: Switch (default false, auto-set true when stop_type is delivery)
   - commodity_description: Input (optional)
   - special_instructions: Textarea (optional, 2 rows)
   - "Add Stop" Button (default variant). On click: generate a crypto.randomUUID() for id, build the StopBuilderStop object with facility data + form values + sequence_order=0 (parent will fix), call onAdd, close modal, reset state.

Reset internal state (step, facility, form values) when modal closes.

Style consistently with existing carrier modals — use Dialog/DialogContent from shadcn, same spacing patterns as FacilitySearchModal.
  </action>
  <verify>
Run `cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -30` — no TypeScript errors from any of the three stop components. Verify all three files exist: `ls apps/web/src/components/carrier/stops/`.
  </verify>
  <done>StopBuilder renders a drag-and-drop sortable list of StopCards, recomputes sequence_order on every reorder, provides Add Stop via StopBuilderAddModal with facility search + quick-add form. Component is fully controlled (stops prop + onChange callback). No auto-sort logic exists anywhere.</done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` passes with zero errors
- All three files exist at apps/web/src/components/carrier/stops/
- @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities in apps/web/package.json
- StopBuilderStop type is exported from StopBuilder.tsx
- No auto-sort logic in any file (grep for "sort" should find only arrayMove usage in onDragEnd)
- FacilitySearchModal is imported and used in StopBuilderAddModal
</verification>

<success_criteria>
- StopBuilder is a fully controlled component accepting stops[] and onChange
- Drag-and-drop reordering works via @dnd-kit/sortable with sequence_order recomputation
- StopCard shows all specified badges/indicators and has inline edit panel
- StopBuilderAddModal integrates FacilitySearchModal and provides quick-add form
- Mode prop ('template' | 'load') toggles appointment fields correctly
- Zero auto-sort logic — dispatcher order is final
</success_criteria>

<output>
After completion, create `.planning/quick/166-carrier-ops-stop-builder-drag-and-drop-c/166-SUMMARY.md`
</output>
