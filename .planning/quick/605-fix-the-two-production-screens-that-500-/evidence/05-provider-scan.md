# quick-605 · 05 — the generalisation scan

**Question:** is any OTHER provider or context mounted in one route group while a consumer of it
lives in another? That is the shape of the nuqs defect, and it is answered here by an enumeration
rather than an opinion.

**REPORT ONLY. Nothing below was fixed.** Widening an already-live fix is how this goes wrong; a
named follow-up is worth more than a rushed second change.

Produced by `apps/web/scripts/audit/605-provider-scan.ts`, which reuses the same import graph as
`605-nuqs-coverage.ts`. Raw output: `05-provider-scan.raw.txt`.

---

## Every `layout.tsx` under `src/app`, and what it renders

There are **eleven**, and only **two** mount anything provider-shaped.

| layout | renders | mounts a provider? |
|---|---|---|
| `src/app/layout.tsx` | `AuthProvider`, **`NuqsAdapter`**, `SupportTicketModal`, `Toaster` | **yes — two** |
| `src/app/(owner)/layout.tsx` | `OwnerShell`, **`TRPCReactProvider`** | **yes — one** |
| `src/app/(admin)/layout.tsx` | `AppLogo`, `DriveCommandWordmark`, `Link`, `UserMenu` | no |
| `src/app/(admin)/docs/layout.tsx` | `AdminDocSearch`, `BookOpen`, `Cog`, `Link` | no |
| `src/app/(driver)/layout.tsx` | `AppLogo`, `DriveCommandWordmark`, `DriverBottomNav`, `DriverGpsPing`, `DriverNav`, `DriverNotificationBell`, `UserMenu` | no |
| `src/app/(owner)/carrier/layout.tsx` | `CarrierBreadcrumb` | no |
| `src/app/(auth)/layout.tsx` | — | no |
| `src/app/(driver-fullscreen)/layout.tsx` | — | no |
| `src/app/(owner)/help/layout.tsx` | — | no |
| `src/app/(owner)/settings/layout.tsx` | — | no |
| `src/app/(shared)/layout.tsx` | — | no |

Three provider mounts in the whole application. The scan is therefore exhaustive, not a sample.

---

## Provider 1 — `AuthProvider`

Mounted at **`src/app/layout.tsx`** (root). 7 modules call `useAuth()`; the pages that reach them
span `(admin)`, `(driver)`, `(owner)` and root-level routes.

**Verdict: SAFE by construction.** A root mount cannot have a route-group mismatch. This is the
shape the nuqs adapter now has.

---

## Provider 2 — `TRPCReactProvider` — the named lead

Mounted at **`src/app/(owner)/layout.tsx:79`**. This is the one with the nuqs SHAPE: a
route-group-scoped provider.

**17 modules call `useTRPC()`.** Fifteen live under `(owner)` and are structurally safe. **Two live
in `src/components` and are shared**, which is what makes them worth chasing:

- `src/components/carrier/dispatches/NewDispatchForm.tsx` (`:5` import, `:94` `useTRPC()`)
- `src/components/carrier/loads/DispatchLoadModal.tsx` (`:6` import, `:120` `useTRPC()`)

BFS up the import graph from all 17 reaches **7 pages**, and every one is in `(owner)`:

| route group | route |
|---|---|
| `(owner)` | `/carrier/loads/[id]` |
| `(owner)` | `/carrier/trips/new` |
| `(owner)` | `/checklists` |
| `(owner)` | `/checklists/analytics` |
| `(owner)` | `/checklists/automation` |
| `(owner)` | `/checklists/instances/[id]` |
| `(owner)` | `/checklists/playbooks/[id]/edit` |

**Pages outside `(owner)` that reach a `useTRPC()` consumer: 0.**

**Verdict: NOT BROKEN TODAY, and structurally exposed.** The mount is group-scoped and two of its
consumers are in the shared `src/components` tree, so the day someone renders `DispatchLoadModal` or
`NewDispatchForm` from `(driver)`, `(admin)`, `(shared)`, `(auth)` or a root-level route, that page
throws the tRPC equivalent of `nuqs requires an adapter` — at runtime, invisibly to `tsc`, invisibly
to `next build` (both groups are dynamic), and invisibly to the e2e suite for the same reasons §4 of
the audit gives.

`DispatchLoadModal` is the nearer of the two: `src/components/carrier/imports/AssignmentScreen.tsx`
and `src/lib/document-import/assignment-options.ts` both name it in their headers as "the other
consumer" of shared logic, so it is already understood as a component with more than one home.

**Not fixed here, deliberately.** Two options exist and they are not equivalent — hoist the mount to
the root the way `NuqsAdapter` now is, or keep it group-scoped and add a guard equivalent to
`nuqs-adapter-coverage.test.ts` for tRPC. The first changes where a React Query client lives for
every route in the app, including `(auth)` and `(driver)`, and that is its own review. Recommended
follow-up: the **guard first**, since it costs nothing and fails red the moment the exposure becomes
real.

---

## Provider 3 — `NuqsAdapter`

Was `src/app/(dev)/layout.tsx` — a route group with zero pages. Now `src/app/layout.tsx`. Fixed by
this task; see `docs/audits/nuqs-adapter-render-failure.md`.

---

## What this scan does not cover

- **React contexts created and consumed entirely below `src/app`** — e.g. a provider a component
  renders around its own subtree. Those cannot have a route-group mismatch, because the provider and
  the consumer are in the same tree by construction, which is why the scan is scoped to layouts.
- **`src/app/global-error.tsx`**, which replaces the root layout and is therefore below none of the
  three mounts. Checked in §5 of the audit: it has zero imports and reaches no provider consumer.
- Anything mounted at runtime rather than in a layout. `grep` for `Provider|Adapter` JSX across all
  eleven layouts found the three above and nothing else.
