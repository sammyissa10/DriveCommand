# quick-539 — Which client do drivers use, and where did Phase 9 land?

**Read-only diagnostic.** No code changed, no DDL, no Supabase writes, no dev server started.
Date: 2026-08-25. Phase 9 commit under examination: `ec31b515`.

---

## Headline

**The web driver portal is real, complete enough to run a trip, and it has an ungated
trip-start path.** A web driver can move a trip from `planned` to `in_progress` with
`requirePreTripInspection = true` and **no inspection gate fires at all**. That is not a
porting gap — the gate exists, is tested, and is simply not on that code path. Details in
Q3, which is the answer that matters most in this document.

Phase 9's *server* half is client-neutral and already serves both surfaces. Phase 9's
*driver-facing UI* half landed only in `apps/mobile`.

---

## Q1 — Every route in the web driver portal

All of these live in the route group **`src/app/(driver)/`**, whose `layout.tsx`
(`src/app/(driver)/layout.tsx:28-35`) redirects to `/sign-in` without a session and to
`/unauthorized` unless `getRole() === UserRole.DRIVER`. The group name is parenthesised,
so it contributes **nothing to the URL**.

| URL | File | What it does |
|---|---|---|
| `/` | `(driver)/page.tsx` | Redirect shim to `/home` |
| `/home` | `(driver)/home/page.tsx` | Dashboard. Server component; renders `DriverDashboard` → `DriverDispatchCard`. **Carries the Start Trip button.** |
| `/my-route` | `(driver)/my-route/page.tsx` | "Driver Route tab — Carrier Ops edition." Active/History tabs over the driver's dispatches. **Also wired to `startTrip`.** |
| `/my-load` | `(driver)/my-load/page.tsx` | CarrierLoads from the driver's active dispatches. Read-mostly — load status cascades from stop completion, not direct edits. |
| `/tasks` | `(driver)/tasks/page.tsx` | **Open `StepInstance` rows — the checklist engine.** See Q7. |
| `/tasks/[id]` | `(driver)/tasks/[id]/page.tsx` | One step, with a per-`stepType` completion UI (`task-completion-client.tsx`). |
| `/documents` | `(driver)/documents/page.tsx` | View route + truck documents, download via signed URL. |
| `/hours` | `(driver)/hours/page.tsx` | Hours of Service. |
| `/incidents` | `(driver)/incidents/page.tsx` | Incident report form. |
| `/messages` | `(driver)/messages/page.tsx` | Fleet messages. |
| `/pay` | `(driver)/pay/page.tsx` | Driver pay summary. |
| `/pay/settlements/[id]` | `(driver)/pay/settlements/[id]/page.tsx` | One settlement. |
| `/my-tickets` | `(driver)/my-tickets/page.tsx` | Support tickets raised by this driver. |
| `/my-tickets/[id]` | `(driver)/my-tickets/[id]/page.tsx` | One ticket. |
| `/more` | `(driver)/more/page.tsx` | Overflow menu. |
| `/carrier/driver/trips` | `(driver)/carrier/driver/trips/page.tsx` | **Orphaned.** A second "My Trips" list — see the ambiguity note below. |

**Navigation** comes from two components with **different item lists**:

- `src/components/driver/driver-nav.tsx` (desktop, `hidden lg:flex`) — Dashboard, My Route,
  **Tasks**, Pay, Messages, More. This matches what you saw.
- `src/components/driver/driver-bottom-nav.tsx` (mobile, `lg:hidden`) — Dashboard, Route,
  Pay, Messages, More. **`Tasks` is absent**, and `ClipboardList` is imported but unused
  (`driver-bottom-nav.tsx:5`).

> **Stated as ambiguity, not inferred:** I cannot tell from the code whether the missing
> Tasks tab on the narrow-viewport nav is deliberate or an oversight. The unused
> `ClipboardList` import is suggestive of an omission but is not proof. **A driver on a
> phone-width browser has no navigation link to `/tasks`** — the route works if reached
> directly or by link, but nothing in the bottom bar points at it.

> **Second ambiguity:** `/carrier/driver/trips` has **zero inbound links** — a repo-wide
> grep for `carrier/driver/trips` returns only its own file. Its "Start" affordance
> (`page.tsx:202`) is a `<span>` label inside a `<Link>`, **not a control**; the card
> navigates, it does not start anything. Whether this page is superseded by `/my-route` or
> is unfinished, I cannot tell.

---

## Q2 — What can a web driver actually do today?

| Capability | Exists? | Where |
|---|---|---|
| See assigned trips | **YES** | `/home` (active dispatch card), `/my-route` (Active/History), plus the orphaned `/carrier/driver/trips` |
| **Start a trip** | **YES** | `startTrip()` server action, `(driver)/actions/driver-routes.ts:171`. Button: "Start Trip & Navigate", `driver-dispatch-card.tsx:276-280` |
| Complete stops | **YES** | `arriveAtStop()` (`driver-routes.ts:214`) and `completeCurrentStop()` (`driver-routes.ts:258`) |
| Capture a signature | **PARTIAL — typed, not drawn** | `SignatureCompletion`, `task-completion-client.tsx:640`. A text input plus a confirmation checkbox; submits `{ signatureUrl: \`esig:${name}\` }`. **No canvas, no drawn signature, no timestamp rendered.** |
| Upload documents | **PARTIAL** | Task-attached uploads only: `uploadTaskFile()` (`driver-tasks.ts:94`) for `DOCUMENT_UPLOAD` steps and inspection-fail photos. `/documents` is **view + download only** — `driver-documents.ts` exposes `getMyRouteDocuments`, `getMyTruckDocuments`, `getDriverDownloadUrl` and no upload. |

**One divergence worth recording:** `uploadTaskFile` writes to **Supabase Storage**
(`supabaseAdmin.storage.from('drivecommand-files')`, `driver-tasks.ts:112-116`), while the
mobile task photo path uses **Cloudflare R2 via presigned PUT**
(`/api/mobile/driver/tasks/upload-photo` → `generateUploadUrl`). The two clients put
inspection photos in **two different object stores**. Reported, not judged.

---

## Q3 — THE SAFETY QUESTION

**The gate is NOT enforced on every start path. Three of five paths bypass it, including
the one the web driver portal uses.**

There are five ways a trip reaches `in_progress`. Here is each, quoted.

### ✅ GATED — `POST /api/v1/carrier/dispatches/[id]/start`

`src/app/api/v1/carrier/dispatches/[id]/start/route.ts:32`
```ts
const result = await handleStartTrip({
  orgId,
  dispatchId: id,
  userId: session.userId,
});
```
`handleStartTrip` runs `evaluateTripGate` and only reaches `transitionTripStatus` on an
ALLOWED verdict. **Caller:** `TripSuccessBanner.tsx:82` (owner, post-creation banner).

### ✅ GATED — `POST /api/mobile/carrier/driver/dispatches/[id]/start`

`src/app/api/mobile/carrier/driver/dispatches/[id]/start/route.ts:27`
```ts
const result = await handleStartTrip({ orgId: tenantId, dispatchId, userId })
```
**Caller:** `apps/mobile` `TripStartCard`. React Native only.

### ❌ NOT GATED — `startTrip()` server action  ← **the web driver's path**

`src/app/(driver)/actions/driver-routes.ts:199`
```ts
const result = await transitionTripStatus(session.tenantId, dispatchId, 'in_progress');
revalidatePath('/my-route');
return result;
```
The function above it verifies **ownership only** — that the dispatch belongs to this
driver (`driver-routes.ts:175-195`). Its own doc comment says so:

```
 * Transition the dispatch from 'planned' to 'in_progress'.
 * Verifies the dispatch belongs to the authenticated driver before delegating.
 * SECURITY: Verifies dispatch.primaryDriverId = carrierDriver.id AND orgId = session.tenantId.
```

There is no call to `evaluateTripGate`, `handleStartTrip`, or anything in
`lib/carrier/inspection-*`. A repo-wide grep for `evaluateTripGate` outside the inspection
module returns **nothing**.

**Callers — both driver-facing, both reachable from the tabs you saw:**
- `src/components/driver/driver-dashboard.tsx:93` → `DriverDispatchCard` on **`/home`**
- `src/app/(driver)/my-route/page.tsx:55` → `startAction={startTrip}` on **`/my-route`**

### ❌ NOT GATED — `PATCH /api/v1/carrier/dispatches/[id]/status`

`src/app/api/v1/carrier/dispatches/[id]/status/route.ts:32`
```ts
const result = await transitionTripStatus(
  orgId,
  id,
  parsed.data.status,   // z.enum(['in_progress', 'completed', 'cancelled', 'tonu'])
  parsed.data.notes
);
```
**Callers:** `DispatchHeader.tsx:399` (`await patchStatus('in_progress')`, owner desktop
trip detail) and `TripDetailMobile.tsx:670` (`runStatus('in_progress', …)` → `patchStatus`,
owner mobile-web trip detail).

### ❌ NOT GATED — direct `tenantPrisma.trip.update` inside `transitionTripStatus`

`src/lib/carrier/trips.ts:579-587` is the single write. It enforces the status state
machine and nothing else. Reaching it by any route above that is not `/start` skips the
gate entirely.

### Plainly

> **A web driver signed in at `http://localhost:3000/home`, in a tenant with
> `requirePreTripInspection = true` and `blockTripStartOnFailedInspection = true`, can
> press "Start Trip & Navigate" and the trip starts. No inspection is required, no
> checklist opens, no gate is consulted, and no defect or override is recorded.**
>
> The same is true of the owner's "Start Trip" button on trip detail, on both layouts.
>
> **This is a hole, not a porting gap.** The gate is written, tested (47 tests) and
> client-neutral; three of the five doors into `in_progress` simply do not go through it.

**Why it happened, stated factually:** Phase 9 modified the one endpoint whose name says
"start". `startTrip()` and the `status` PATCH also start trips, and neither was found
because neither is called `/start`. I built the gate and did not enumerate the callers of
`transitionTripStatus` before wiring it — the grep that would have caught this is
`grep -rn "transitionTripStatus" src`, which returns both immediately.

---

## Q4 — Phase 9 deliverables, by client

| Deliverable | Web | Mobile (RN) | Equivalent on the other client? |
|---|---|---|---|
| **Trip start gate** (server) | **Endpoint exists and is gated**, but the web driver UI does not use it | Gated and used | Server logic is shared and client-neutral — `lib/carrier/inspection-{gate,lookup,service,handlers}.ts`. The gap is purely which caller invokes it. |
| **Full-screen checklist** | **NO** | `TripInspectionScreen.tsx`, `(driver)/inspection/[dispatchId]` | Web has `/tasks` — one item per page, not a section-paged takeover. See Q7. |
| **Pass / Fail / N-A** | **Pass and Fail only. No N/A.** `InspectionCompletion`, `task-completion-client.tsx:193-215` — two buttons | All three | The N/A verb is server-side and shared (`/tasks/[id]/skip` + `skipReason`). Web simply does not render a third button. |
| **Photo upload at capture** | **NO — uploaded at submit.** `handleFail()` (`task-completion-client.tsx:154-176`) holds a `File` in state and calls `uploadTaskFile` only when Submit is pressed | **YES** — presigned PUT awaited before the thumbnail renders | Web has the drift the phase warned about: kill the tab after choosing a photo and nothing is in the bucket. |
| **Signature** | **Typed name only** — `esig:${name}`, no canvas, no timestamp printed | Drawn, `SignaturePad` (react-native-svg + view-shot), name + timestamp beneath | Both write to `StepInstance.result.signatureUrl`, so the server accepts either. They are not the same artifact. |
| **Blocked-driver screen** | **NO** | `InspectionBlockedScreen.tsx`, `(driver)/inspection/blocked` | Web has no equivalent — and cannot reach a blocked state anyway, because its start path never consults the gate. |
| **Owner override** | **YES — web only** | Not present in `apps/mobile` | `TripInspectionPanel.tsx`, rendered at `(owner)/carrier/trips/[id]/page.tsx:379` (desktop) and `TripDetailMobile.tsx:708` (mobile-web). Mobile RN owner portal has no override UI. |

**Summary:** of seven deliverables, **one (owner override) is web-only**, **four are
mobile-only** (checklist, N/A, upload-at-capture, blocked screen), **one (signature) exists
in both in materially different forms**, and **one (the gate) is shared server-side but
wired to only two of five callers.**

---

## Q5 — What PORTAL ACCESS controls, and what an invitation grants

**Component:** `src/components/carrier/fleet/PortalAccessControls.tsx`, rendered on the
owner's driver detail page under `/carrier/fleet/drivers/[id]`.

**It is a derived state, not a stored flag.** `computeAccessState`
(`PortalAccessControls.tsx:32-47`) returns one of four values from three inputs:

```ts
if (userId && userIsActive === false) return 'suspended';
if (userId && userIsActive !== false) return 'active';
if (!userId && invitationStatus === 'PENDING') return 'pending';
return 'none';
```

Its three buttons POST to `/api/v1/carrier/fleet/drivers/[id]/{resend-invitation,
revoke-access,restore-access}` (`PortalAccessControls.tsx:74`).

**What an invitation grants** — `src/app/api/auth/accept-invitation/route.ts`:

- A **Supabase Auth user** with `role` in `app_metadata` (`:188`, `:248`), defaulting to
  `DRIVER` (`:172`).
- `licenseNumber` copied across when the role is DRIVER (`:251`).
- `ON_DRIVER_CREATE` playbooks fired (`:295-304`) — which is how a driver gets checklist
  steps at all.
- Sign-in, then **redirect to `/home`** (`:312`):
  ```ts
  const redirectUrl = user.role === 'OWNER' || user.role === 'MANAGER' ? '/carrier/dashboard' : '/home';
  ```

**The decisive point for this ticket:** the invitation grants a **role**, not a **client**.
The web portal authorises on `getRole() === UserRole.DRIVER` from the session cookie
(`(driver)/layout.tsx:33`); mobile authorises on the same `app_metadata.role` read out of a
Bearer token (`lib/auth/mobile-auth.ts:70`). **One credential opens both.** There is no
per-driver setting anywhere that says "this driver uses web" or "this driver uses mobile" —
and the invitation's own redirect points at **`/home`, the web portal**.

---

## Q6 — What Section 12 would need on web

Assuming the decision is that the driver experience is web. Each item, with what already
exists.

| # | Needed | Starting point |
|---|---|---|
| 1 | **Put the gate on the web driver's start path** | Smallest and most urgent. `startTrip()` (`driver-routes.ts:171`) calls `handleStartTrip` instead of `transitionTripStatus`; the return type already carries `code` for routing. Same for the `status` PATCH when `status === 'in_progress'`. **This alone closes Q3's hole and needs no new UI.** |
| 2 | Full-screen checklist route | New route **outside `(driver)/`** — the driver layout always renders the header and both navs, so a page inside it cannot take over the view. A sibling group (e.g. `(driver-fullscreen)/`) or a top-level route with its own layout and its own DRIVER guard. |
| 3 | Section-per-screen paging + progress | `handleGetChecklist` already returns `sections[]` grouped and ordered, plus `signature` state. **The server side is done and client-neutral** — this is presentation only. |
| 4 | N/A button | `POST /api/v1/…` equivalent of `/tasks/[id]/skip`, or a `skipDriverTask` server action beside the existing `completeDriverTask` / `failDriverInspection` in `driver-tasks.ts`. The verb and its `skipReason` already exist server-side. |
| 5 | Note required on fail | Currently `Notes (optional)` (`task-completion-client.tsx:239`). `FAIL_NOTE_MIN_LENGTH` is already exported from `inspection-constants.ts`. |
| 6 | Photo upload at capture | Move `uploadTaskFile` from `handleFail` to the `onChange` of the file input. Also decide Supabase Storage vs R2 (see Q2) — the two clients currently disagree. |
| 7 | Blocked-driver screen | New page. `InspectionGateView` already carries `failures`, `criticalFailures`, `message` and `override`; `GET /api/v1/carrier/dispatches/[id]/inspection` already serves it to a cookie session. |
| 8 | Owner override | **Already done on web.** No work. |

### What cannot port directly — flagged as asked

- **`react-native-svg` signature capture.** Does not exist for the DOM. The repo has **no
  web signature library** — `package.json` contains `html2canvas`, `@react-pdf/renderer`
  and `pdfjs-dist`, and none is a signature pad. Three options, none free: (a) keep the
  existing typed-name `esig:` signature and accept it is not a drawn one; (b) write a
  `<canvas>` + pointer-events pad in-house (~100 lines, no dependency, `toBlob()` gives the
  PNG directly); (c) install a library, which Section 15's "Stack: locked" forbids without
  a flag. **(b) is the only option that both matches the mobile artifact and installs
  nothing.**
- **`react-native-view-shot`.** Not needed on web at all if (b) is chosen — `canvas.toBlob()`
  is the native equivalent and is strictly simpler. `html2canvas` is present and could
  rasterise an SVG pad, but it is the wrong tool if the pad is already a canvas.
- **MMKV offline queue.** `apps/mobile/lib/offline-queue.ts` is MMKV-backed and has **no web
  equivalent in this repo** — a grep for an offline queue under `apps/web` finds nothing.
  The web driver portal is **currently online-only**: every driver action is a server action
  or `fetch`, with no queue, no retry and no `navigator.onLine` handling anywhere I found.
  Porting Section 12's "works offline and queues" to web means IndexedDB (or a Service
  Worker with Background Sync) written from scratch. **This is the single largest item on
  the list and it is not a port — it is new.** Note the mobile queue could not carry photos
  either, so the offline gap is narrower than it looks: it is JSON answers only.

---

## Q7 — Does the web Tasks tab already render inspection steps?

**Yes.** `/tasks` queries `StepInstance` directly
(`(driver)/tasks/page.tsx:150-176`) for rows where the parent `PlaybookInstance` is in the
session tenant, status is `NOT_STARTED` or `IN_PROGRESS`, and the step is assigned to this
user or role-assigned to `DRIVER`. `INSPECTION_ITEM` is a labelled step type
(`page.tsx:29`), and `/tasks/[id]` dispatches on `stepType` to `InspectionCompletion`
(`task-completion-client.tsx:72-77`).

**So the web already has a working, tenant-scoped inspection-item UI over the same engine.**
Measured against Phase 9 item 2:

| Item 2 requirement | Met? | Evidence |
|---|---|---|
| One section per screen | **NO** | One **item** per page, reached from a flat list. There is no section concept — `/tasks` renders every open step for the driver across all playbooks, sorted by `dueDate` then `createdAt` (`page.tsx:162`), with no grouping by inspection or by trip. |
| Progress indicator across the top | **NO** | The list header says `{n} open tasks assigned to you` (`page.tsx:87-89`). No bar, no "section 3 of 6", no per-inspection completion state. |
| Pass / Fail / **N-A** | **PARTIAL** | Pass and Fail only — two buttons, `task-completion-client.tsx:193-215`. No N/A. The `SKIPPED` verb exists server-side and is unused here. |
| A failed item requires a note | **NO** | The field is explicitly optional: `<Label htmlFor="fail-note">Notes (optional)</Label>` (`:239`), and `handleFail` sends `note: note.trim() \|\| undefined` (`:182`) with no length check. Only a **photo** can be mandatory, and only when `defaultConfig.requiresPhoto` is set — which the starter seed does **not** set (it writes `requiresPhotoOnFail`), so in practice nothing is required. |
| Photo uploads at capture | **NO** | The `File` sits in React state (`setPhotoFile`, `:257`) and is uploaded inside `handleFail` when Submit is pressed (`:161-172`). This is exactly the drift the phase named. |
| Back navigation preserved | **PARTIAL** | There is a "Back to Tasks" link (`tasks/[id]/page.tsx:129-135`) and each answer is written server-side on submit, so answers persist. But there is no *within-checklist* back — no notion of a checklist being walked, so nothing to step back through. |
| Signature with name and timestamp beneath | **PARTIAL** | A SIGNATURE step renders `SignatureCompletion` (`:640`) — typed full name plus a confirmation checkbox, submitted as `esig:${name}`. **No timestamp is captured or displayed**, and it is not a drawn signature. It is also not tied to the end of an inspection: it is just another item in the flat list. |
| Full-screen | **NO** | `/tasks/[id]` renders inside `(driver)/layout.tsx`, which always draws the branded header, `DriverNav` (desktop) and `DriverBottomNav` (mobile). Content is further constrained to `max-w-lg` (`tasks/[id]/page.tsx:126`). |

**Score: 0 of 8 fully met, 3 partial.** But the important finding is the opposite of
discouraging — **the data layer, the auth scoping, the three server actions
(`completeDriverTask`, `failDriverInspection`, `uploadTaskFile`) and a per-`stepType`
rendering switch all already exist on web.** What is missing is the *choreography*:
grouping steps into an inspection, paging it, requiring the note, moving the upload
earlier, and taking over the screen.

---

## Per-item audit

| Q | Question | Status |
|---|---|---|
| 1 | Enumerate every route under `/home`, what each does, which route group | **ANSWERED** — 16 routes, all in `src/app/(driver)/`, with two ambiguities flagged (Tasks missing from the narrow-viewport nav; `/carrier/driver/trips` orphaned) rather than resolved |
| 2 | What can a driver DO on web — trips, start, stops, signature, documents | **ANSWERED** — all five stated as exists / partial, with the file and line for each, plus the Supabase-Storage-vs-R2 divergence |
| 3 | Is `evaluateTripStartGate` enforced on every start path? | **ANSWERED** — all five paths enumerated and quoted; 2 gated, 3 not; the web driver's path named as a hole in plain language |
| 4 | Each Phase 9 deliverable, which client, equivalent on the other | **ANSWERED** — all seven, both directions |
| 5 | What PORTAL ACCESS controls, what an invitation grants | **ANSWERED** — derived four-state, three endpoints; invitation grants a role and redirects to `/home`, and grants no client preference either way |
| 6 | What to build for Section 12 on web; flag what cannot port | **ANSWERED** — eight items; all three named blockers addressed, with the offline queue called out as new work rather than a port |
| 7 | Does Tasks already render checklist steps; which of item 2's eight it meets | **ANSWERED** — yes it does; all eight requirements assessed individually with evidence |

---

## What I did not determine

Stated rather than inferred:

- **Whether `apps/mobile` is intended to remain a driver client.** The prompt says not to
  assume it is abandoned, and nothing in the code decides it. Both clients authenticate the
  same DRIVER role against the same tables; both are live. That is Sir's call.
- **Whether the missing Tasks entry in `driver-bottom-nav.tsx` is deliberate.** The unused
  `ClipboardList` import is a hint, not evidence.
- **Whether `/carrier/driver/trips` is superseded or unfinished.** It has no inbound links
  and no start control.
- **Whether the typed-name `esig:` signature is considered legally sufficient by this
  business.** That is a compliance question, not a code one. I have recorded only that it
  differs materially from the drawn signature Phase 9 built on mobile.
- **Whether any tenant currently has `requirePreTripInspection = true`.** Checking would
  have meant querying production, which the read-only constraint permits but which would
  not change the finding: the hole in Q3 exists regardless of whether it is currently armed.
