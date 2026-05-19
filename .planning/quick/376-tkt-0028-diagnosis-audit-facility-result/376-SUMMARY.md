---
phase: quick
plan: "376"
subsystem: carrier/stops
tags: [diagnosis, tkt-0028, facility-search, stop-builder]
dependency_graph:
  requires: []
  provides: ["TKT-0028 verdict"]
  affects: []
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified: []
decisions:
  - "TKT-0028 already resolved — the facility result click chain is intact end-to-end as of quick-185 and quick-314"
metrics:
  duration: "~10 min"
  completed: "2026-05-19"
---

# Phase quick Plan 376: TKT-0028 Diagnosis — Facility Result Click in FacilitySearchModal

## Ticket

**TKT-0028** — On `/carrier/templates/new`, clicking an existing facility result (e.g. "QA Warehouse Chicago") inside the FacilitySearchModal closes the modal but no stop is added to the Route Stops section.

Filed: Apr 5, 2026. Filed by: owner@test.com.

Sister ticket: TKT-0027 (Create New Facility button, same modal) — confirmed resolved in quick-185 + quick-314 (diagnosed in quick-375).

---

## Files Audited

| File | Full Path |
|------|-----------|
| FacilitySearchModal | `apps/web/src/components/carrier/facilities/FacilitySearchModal.tsx` |
| StopBuilderAddModal | `apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx` |
| StopBuilder | `apps/web/src/components/carrier/stops/StopBuilder.tsx` |
| RouteTemplateForm | `apps/web/src/components/carrier/templates/RouteTemplateForm.tsx` |

---

## FacilitySearchModal Row Click Handler (Verbatim)

The clickable element for an existing facility result (lines 142–165 of FacilitySearchModal.tsx):

```tsx
{results.map((f) => (
  <li key={f.id}>
    <button
      type="button"
      onClick={() => handleSelect(f)}
      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{f.name}</p>
        {(f.city || f.state) && (
          <p className="text-xs text-muted-foreground">
            {f.city && f.state
              ? `${f.city}, ${f.state}`
              : f.city ?? f.state}
          </p>
        )}
      </div>
      {f.facilityType && (
        <Badge ...>{getFacilityTypeLabel(f.facilityType)}</Badge>
      )}
    </button>
  </li>
))}
```

`handleSelect` (lines 93–100):

```ts
function handleSelect(facility: FacilitySearchResult) {
  onSelect(facility);
  // Do NOT call onOpenChange(false) here — the parent controls modal state.
  // For StopBuilderAddModal: onSelect sets step→2, unmounting this Dialog
  // and rendering the step-2 Dialog instead (open prop stays true).
  // Closing here would trigger StopBuilderAddModal's reset useEffect
  // and wipe selectedFacility before step 2 can render.
}
```

**Key finding:** The modal does NOT close itself before or after calling the callback. It deliberately delegates all state management to the parent (`StopBuilderAddModal`). The comment was added during quick-185 as an explicit fix.

---

## Callback Signature and Parent Wiring

**Prop declared in FacilitySearchModal:**

```ts
interface FacilitySearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (facility: FacilitySearchResult) => void;  // <-- the callback
  onCreateNew?: () => void;
}
```

Callback signature: `onSelect(facility: FacilitySearchResult)` — passes the full `FacilitySearchResult` object `{ id, name, city, state, facilityType }`.

**How StopBuilderAddModal wires it (lines 91–94 and 129–136):**

```ts
function handleFacilitySelect(facility: FacilitySearchResult) {
  setSelectedFacility(facility);
  setStep(2);
}

// Render (step === 1 branch):
<FacilitySearchModal
  open={open}
  onOpenChange={onOpenChange}
  onSelect={handleFacilitySelect}   // <-- correctly wired
  onCreateNew={() => { setShowFacilitySheet(true); }}
/>
```

When `handleFacilitySelect` is called:
1. It stores the full facility object in `selectedFacility` state
2. It advances `step` from 1 to 2
3. The component re-renders: the `step === 1` branch (which renders `FacilitySearchModal`) is replaced by the step-2 branch (a `Dialog` showing the quick-add form)
4. The step-2 Dialog has an "Add Stop" button that calls `handleAdd()`, which calls `onAdd(stop)` and then `onOpenChange(false)`

**StopBuilderAddModal does NOT call `setShowSearchModal(false)` or any equivalent** — the modal visibility transition from search→form is entirely handled by the `step` state flip (1→2).

---

## 4-Step Click → State Update Trace

| Step | Actor | Action | Status |
|------|-------|--------|--------|
| **Step 1** | User clicks facility result row in `FacilitySearchModal` | `handleSelect(f)` fires → calls `onSelect(facility)` prop | **Intact** — handler always fires, no guards or early returns |
| **Step 2** | `StopBuilderAddModal.handleFacilitySelect(facility)` | Sets `selectedFacility = facility`, sets `step = 2` — FacilitySearchModal unmounts, step-2 Dialog mounts | **Intact** — `onSelect` is correctly wired to `handleFacilitySelect` (no prop name mismatch) |
| **Step 3** | User fills the quick-add form and clicks "Add Stop" → `handleAdd()` | Constructs a `StopBuilderStop` object from `selectedFacility` + form state, calls `onAdd(stop)` then `onOpenChange(false)` | **Intact** — `selectedFacility` is guaranteed non-null at this point (guard: `if (!selectedFacility) return`) |
| **Step 4 (final)** | `StopBuilder.handleAdd(stop)` called via `onAdd` prop | `const newStops = [...stops, stop]; onChange(resequence(newStops));` → bubbles up to `RouteTemplateForm`'s `setStops(updated)` | **Intact** — `StopBuilder` wires `onAdd={handleAdd}` and `onChange` correctly propagates to form state |

**No break found** in any step of the chain.

---

## Modal Close Timing

The modal does NOT close at step 1 (facility selection). `open` stays `true` throughout. The visual transition (search→form) is driven by `step` state, not `open`. The modal only closes at step 3 when the user clicks "Add Stop" — `onOpenChange(false)` fires at that point.

This is the deliberate fix applied in **quick-185** (commit `c0c9aed0`). Before that fix, `handleSelect` was calling `onOpenChange(false)` which triggered the `useEffect(() => { if (!open) { setStep(1); setSelectedFacility(null); ... } }, [open])` reset — wiping `selectedFacility` before step 2 could render it, causing the "no stop added" symptom.

---

## Most Recent Commits Per File

| File | Commit | Message | Date |
|------|--------|---------|------|
| `FacilitySearchModal.tsx` | `c0c9aed0` | fix(quick-185): fix facility search modal bugs in stop builder | 2026-04-05 |
| `StopBuilderAddModal.tsx` | `77e9f868` | fix(quick-314): Bug 42 - make FacilityForm Cancel context-aware via onCancel prop | 2026-05-14 |
| `StopBuilder.tsx` | `afd6bb02` | chore: commit regenerated Prisma client and outstanding src fixes | 2026-04-16 |
| `RouteTemplateForm.tsx` | `cd9f8238` | fix(quick-314): Bug 43 - redirect to /carrier/templates after template save | 2026-05-14 |

**Relevant history on these files:**
- `c0c9aed0` (quick-185, 2026-04-05) — The root fix for this exact symptom: removed the premature `onOpenChange(false)` call from `handleSelect` and added the explanatory comment
- `77e9f868` and `cd9f8238` (quick-314, 2026-05-14) — Follow-up fixes for TKT-0027 (Create New Facility path) and template save redirect; did not touch the facility selection path
- `8157571f` (quick-166) — Original creation of StopBuilder and StopBuilderAddModal (pre-fix state)

---

## Status Verdict

**TKT-0028 already resolved.**

The end-to-end chain from "user clicks facility result row" to "stops state updated" is intact with no breaks. The root cause of TKT-0028 was the same as TKT-0027: in the pre-quick-185 code, `handleSelect` in `FacilitySearchModal` called `onOpenChange(false)`, which triggered the reset `useEffect` in `StopBuilderAddModal` and wiped `selectedFacility` before step 2 could render — making it appear that selecting a facility did nothing.

Commit `c0c9aed0` (quick-185, 2026-04-05) removed that premature close call and added an explicit code comment documenting the intent. That commit resolves both TKT-0027's "Create New Facility" path and TKT-0028's "existing facility result" path in a single fix.

TKT-0028 can be closed as **fixed in quick-185 (2026-04-05)**.

---

## Deviations from Plan

None — plan executed exactly as written. Diagnosis only; no source code modified.

## Self-Check: PASSED

- All 4 files located and read
- FacilitySearchModal.tsx: exists at confirmed path
- StopBuilderAddModal.tsx: exists at confirmed path
- StopBuilder.tsx: exists at confirmed path
- RouteTemplateForm.tsx: exists at confirmed path
- git log commands returned results for all 4 files
- Zero source code modifications (diagnosis only)

Diagnosis complete.
