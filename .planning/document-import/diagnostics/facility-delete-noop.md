# quick-532 — Facility delete confirm dialog fires no request

**Type:** READ-ONLY diagnostic. No code changed, no DDL, no database writes, no Supabase calls.
**Date:** 2026-08-24
**Branch:** feature/document-import
**Reported:** browser-verified on localhost against production Supabase, reproduced twice.

---

## Verdict in one line

**The delete handler is an unimplemented stub that only calls `console.warn`.** The dialog, the
route handler, `softDeleteFacility` and the `deleted_at` column are all correct and complete — the
UI simply never calls any of them. `FacilitiesGrid.tsx` is the **only file in the repository** still
carrying these stubs.

The premise in the brief — *"quick-530's work is believed correct; the defect is that nothing invokes
it"* — is confirmed exactly. quick-530 and quick-531 are not implicated in any way.

---

## 1. The row trash icon → its handler · **ANSWERED**

**Chain:** `FacilitiesGrid.renderQuickActions` → `<QuickActions actions={…} />` →
`shared/QuickActions.handleAction` → dialog.

`apps/web/src/app/(owner)/carrier/facilities/_grid/FacilitiesGrid.tsx:62-86` builds the action list.
The delete entry, lines **76-84**:

```tsx
{
  id: 'delete',
  label: 'Delete',
  icon: Trash2,
  onClick: () => {
    // TODO: Wire to delete mutation
    console.warn('Delete not implemented');
  },
  destructive: true,
},
```

**That is the whole handler.** There is no fetch, no server action, no mutation, no router call.

The icon itself is rendered by `apps/web/src/components/data-grid/shell/shared/QuickActions.tsx:155-166`,
whose `onClick` is `(e) => handleAction(action, e)`. `handleAction` (line **123**) is:

```tsx
const handleAction = (action: QuickAction, e: React.MouseEvent) => {
  e.stopPropagation(); // Prevent row selection
  if (action.disabled) return;
  if (action.destructive) {
    setDeleteConfirm(action);      // ← destructive: opens the dialog instead of calling onClick
  } else {
    action.onClick();
  }
};
```

So the trash icon opens the dialog and deliberately does **not** call `onClick` yet. That is correct
behaviour.

### Which `QuickActions` — there are two, and only one is live

This matters, because reading the wrong file makes the bug look absent:

| File | Exported by the barrel? | Has a real delete path? |
|---|---|---|
| `shell/shared/QuickActions.tsx` | **YES** — `shell/index.ts:19` | takes `actions[]`, confirms internally |
| `shell/QuickActions.tsx` | **no** | takes `onDelete`, uses `DeleteConfirmDialog` |

`FacilitiesGrid.tsx:25` imports from `@/components/data-grid/shell`, and `shell/index.ts:19` re-exports
`./shared/QuickActions`. **The non-`shared/` `QuickActions.tsx` is dead code — grep finds no importer
anywhere in the repo.** The same is true of its sibling `shell/BulkActionsBar.tsx` and of
`shell/DeleteConfirmDialog.tsx`, which is imported only by those two dead files.

Ambiguity stated rather than resolved: **why two parallel implementations exist is not determinable
from the code.** Both are plausible-looking; one is simply unreferenced. Nothing marks the dead pair
as deprecated.

---

## 2. The dialog's Delete button → its onClick · **ANSWERED**

**It calls the stub. The dialog wiring is correct; its target is empty.**

`shared/QuickActions.tsx:182-196` renders the dialog. Note the default strings — they are exactly what
was seen on screen, which confirms this is the dialog in question, since `FacilitiesGrid` supplies
neither `confirmTitle` nor `confirmDescription`:

```tsx
<AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>
        {deleteConfirm?.confirmTitle || 'Are you sure?'}
      </AlertDialogTitle>
      <AlertDialogDescription>
        {deleteConfirm?.confirmDescription || 'This action cannot be undone.'}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleConfirmDelete}>Delete</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

`handleConfirmDelete` (line **133**):

```tsx
const handleConfirmDelete = () => {
  if (deleteConfirm) {
    deleteConfirm.onClick();   // ← FacilitiesGrid's console.warn stub
    setDeleteConfirm(null);    // ← closes the dialog unconditionally
  }
};
```

**Answer: it calls neither a mutation nor a server action.** It calls
`deleteConfirm.onClick()`, which for facilities is `console.warn('Delete not implemented')`, then
closes the dialog. Every observed symptom follows directly:

| Observation | Explained by |
|---|---|
| zero network requests | nothing in the chain issues one |
| `deleted_at` still NULL, `updated_at` unchanged | no write is attempted |
| row remains, count unchanged | the page is a server component; nothing invalidates or refetches |
| no error toast | nothing threw — `console.warn` is not a throw |
| dialog dismisses as if successful | `setDeleteConfirm(null)` runs unconditionally, with no success check |

### One reported observation that does not match, and is worth re-checking

The report says **"no console error."** That is consistent — this is `console.warn`, not
`console.error`, so it would not appear under a console filtered to Errors.

**Checkable prediction:** with the console set to show Warnings, clicking Delete should print
exactly `Delete not implemented`. If that warning does **not** appear, this diagnosis is wrong and
the click is not reaching `handleConfirmDelete` at all. Recommended as the one-second confirmation
before any fix is written.

---

## 3. Is `softDeleteFacility` called from anywhere? · **ANSWERED**

**Exactly one caller, and it is not the UI.** Full grep across `apps/web/src`, `apps/mobile` and
`packages`:

```
apps/web/src/app/api/v1/carrier/facilities/[id]/route.ts:5    — import
apps/web/src/app/api/v1/carrier/facilities/[id]/route.ts:106  — the ONLY call site
apps/web/src/lib/carrier/facilities.ts:176                    — the definition
apps/web/src/lib/carrier/facilities.ts:187                    — its own log line
apps/web/src/lib/document-import/facility-lookup.ts:161       — a comment, not a call
```

**No component, hook, server action, or mobile screen calls it.** Its single caller is the DELETE
route handler, which nothing in the UI requests.

---

## 4. Is there a DELETE route for a single facility? · **ANSWERED**

**Yes, and it is complete and correct.** `apps/web/src/app/api/v1/carrier/facilities/[id]/route.ts:94-118`:

```ts
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    const db = await getTenantPrismaForOrg(orgId, session.userId);
    const result = await softDeleteFacility(orgId, id, await viewerFromSession(db, orgId, session));
    if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ data: { id: result.id, status: 'inactive' } });
  } catch (err) { … 500 … }
}
```

Auth, tenant scoping, the residence viewer, and the 404-on-miss are all present. **The entire backend
for this feature is built. The gap is one `fetch` call in the client.**

### Minor residue noticed, not a defect

The success payload still says `status: 'inactive'` — vocabulary from the pre-quick-530 era when soft
delete was an `inactive_` prefix on `facility_type`. Nothing consumes this field today (there is no
caller at all), so it is cosmetic. Flagged so it is corrected whenever the response is first consumed,
rather than becoming a second thing that describes the mechanism wrongly.

---

## 5. The "1 selected" side effect · **ANSWERED**

**Cause: React portal event bubbling. The trash icon is *not* inside the selection control, and the
dismissal path does *not* toggle selection.** Both hypotheses in the brief are wrong; the real
mechanism is a third one.

### The mechanism

`shell/desktop/GridRow.tsx:98` puts row selection on the row's root element:

```tsx
onClick={onSelect}
```

`quickActions` is rendered inside that row, in the actions cell (GridRow.tsx:121-124).

Inside `shared/QuickActions.tsx` the JSX is:

```tsx
<TooltipProvider>
  <div className={…} onClick={(e) => e.stopPropagation()}>   {/* line 143-144 — the ICONS */}
    … the trash button …
  </div>

  <AlertDialog …>                                            {/* line 182 — a SIBLING */}
    <AlertDialogContent> … <AlertDialogAction onClick={handleConfirmDelete}>Delete</… >
  </AlertDialog>
</TooltipProvider>
```

The guard `onClick={(e) => e.stopPropagation()}` protects **the icon row only**. The `<AlertDialog>`
is its **sibling**, not its descendant, so it is not covered.

`AlertDialogContent` is rendered through a Radix **portal** into `document.body`. In the DOM it is
nowhere near the row. But **React synthetic events propagate along the React tree, not the DOM tree** —
so a click on the dialog's Delete button bubbles:

```
AlertDialogAction → AlertDialogContent → AlertDialog → TooltipProvider
  → GridRow's actions cell → GridRow root  →  onClick={onSelect}  →  "1 selected"
```

The row is selected by the click on the *dialog button*, which is why selection appears only after the
dialog is dismissed and looks like a dismissal side effect.

**Second checkable prediction: clicking Cancel should select the row too**, since `AlertDialogCancel`
sits in the same portal and has no stopPropagation either. If Cancel also produces "1 selected", the
mechanism is confirmed. The report only mentions Delete, so this has not yet been observed.

### Is it the same class as quick-513?

**Related, but a different mechanism — and the distinction matters for the fix.**

- **quick-513** was an **HTML content-model violation**: a `<button>` nested inside another `<button>`.
  The *parser* restructured the DOM, so the inner control never received the click. The fix was
  structural — a childless absolutely-positioned overlay button.
- **quick-532** involves **no invalid HTML and no parser involvement**. The DOM is well-formed; the
  DOM and React trees simply disagree about containment, and React's synthetic event system follows
  the React tree.

The shared family is *"the element's apparent containment is not its effective containment."* The
codebase already knows about the DOM-nested case — `GridRow.tsx:117` puts `onClick={(e) => e.stopPropagation()}`
on the selection checkbox for exactly this reason. The portal case slipped through because the dialog
**does not look nested**, and in the DOM it isn't.

Stated as ambiguity rather than inferred: **whether this affects other grids is not established here.**
`shared/QuickActions.tsx` is shared by every grid, so the same bubbling is structurally present
wherever a destructive quick action is used inside a selectable row — but only facilities was
browser-verified, and confirming the others requires clicking them.

---

## 6. Does the bulk-action bar's Delete reach `softDeleteFacility`? · **ANSWERED**

**No. It is the same kind of stub, and it is worse — it does not even confirm.**

`FacilitiesGrid.tsx:104-116`:

```tsx
const bulkActions = useMemo(
  () => [
    {
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      onClick: () => {
        // TODO: Wire to bulk delete mutation
        console.warn('Bulk delete not implemented');
      },
      destructive: true,
    },
  ],
  []
);
```

And `shared/BulkActionsBar.tsx` calls `onClick={action.onClick}` **directly** (line 127 desktop, line
165 mobile) with no confirmation dialog — `destructive: true` only changes the button's colour there.

**Plainly, as requested: the bulk path does not work either.** Neither path reaches
`softDeleteFacility`. There is no working delete path for facilities anywhere in the UI, so there is
no "one works, one doesn't" asymmetry to exploit.

---

## Context that scopes any future fix (reported, not prescribed)

**A canonical pattern already exists and facilities does not use it.**
`ClientsGrid.tsx:30,31,52,98,125,166` uses the `useSoftDelete` hook plus the shared
`DeleteConfirmationDialog`, wiring both the row action (`requestDelete(row.id)`) and the bulk action
(`requestDelete(Array.from(selectedIds))`) into one confirm-and-undo flow.

**But that hook cannot currently accept a facility.** `useSoftDelete` takes
`entityType: SoftDeletableEntity`, and `lib/carrier/soft-delete.ts:4-12` defines that union as:

```ts
'CarrierClient' | 'CarrierContract' | 'CarrierDriver' | 'CarrierTruck' | 'Route' | 'Trip' | 'CarrierLoad'
```

`CarrierFacility` is **absent**. So there are two visibly different routes to a fix — reuse the hook
(which requires extending that union, the two display-name maps, and the `softDeleteRecords` /
`restoreRecords` server actions), or call the already-working `DELETE /api/v1/carrier/facilities/[id]`
directly from the grid. **This diagnostic deliberately does not choose between them**; the second is
smaller, the first is consistent with five sibling grids, and the trade-off is a product decision.

Worth noting for whichever is chosen: the existing DELETE route takes **one id**, so a bulk path over
it means N requests unless a bulk endpoint is added.

---

## Per-item audit

| # | Question | Verdict | Basis |
|---|---|---|---|
| 1 | Trace trash icon → handler, quote both | **ANSWERED** | `FacilitiesGrid.tsx:76-84` quoted; `shared/QuickActions.tsx:123-131` quoted; the two-`QuickActions` ambiguity resolved via `shell/index.ts:19` |
| 2 | Dialog Delete → onClick: mutation, action, or nothing? | **ANSWERED** | `shared/QuickActions.tsx:182-196` and `:133-138` quoted. **Nothing** — it calls the stub, then closes unconditionally |
| 3 | Is `softDeleteFacility` called anywhere? | **ANSWERED** | Exactly one caller, the DELETE route (`facilities/[id]/route.ts:106`). No UI caller anywhere |
| 4 | Does a single-facility DELETE route exist? | **ANSWERED** | Yes — `api/v1/carrier/facilities/[id]/route.ts:94-118`, complete and correct |
| 5 | Explain "1 selected"; same class as quick-513? | **ANSWERED** | React portal event bubbling to `GridRow.tsx:98`. **Neither** of the brief's two hypotheses. Related to 513 but a different mechanism — no invalid HTML, no parser |
| 6 | Does bulk Delete reach `softDeleteFacility`? | **ANSWERED** | No. Also a stub (`FacilitiesGrid.tsx:104-116`), and `BulkActionsBar` fires it with no confirmation at all |

All six **ANSWERED**. No question was left partial.

---

## Open items and stated ambiguity

1. **Unverified prediction A** — `Delete not implemented` should appear in the console at Warning
   level. If absent, this diagnosis is wrong. One second to check; recommended before any fix.
2. **Unverified prediction B** — Cancel should also produce "1 selected". Confirms the portal
   mechanism.
3. **Not established** — whether the portal bubbling affects other grids. Structurally it should,
   since `shared/QuickActions.tsx` is shared, but only facilities was browser-verified.
4. **Not determinable from code** — why two parallel `QuickActions` / `BulkActionsBar` /
   `DeleteConfirmDialog` implementations exist, one set entirely unreferenced. Neither is marked
   deprecated.
5. **Not chosen here** — which of the two fix routes to take. Deliberately left as a product decision.

## Constraints honoured

Read-only throughout: no file modified, no DDL, no database write, no Supabase call, no dev server
started. Diagnosis only — no fix attempted, and the fix decision is explicitly left open.
