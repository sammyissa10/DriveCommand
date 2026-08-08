import { apiRequest, getApiBaseUrl } from './client'

/**
 * Document Import — owner surface.
 *
 * Mirrors `/api/mobile/carrier/owner/document-imports/*`, which mirrors the web
 * `/api/v1/carrier/document-imports/*`. Both server route sets call the same
 * handlers, so this client sees exactly the shapes the web client sees.
 */

// ---------------------------------------------------------------------------
// Types — mirror apps/web/src/lib/document-import/intake.ts
// ---------------------------------------------------------------------------

export type ImportStatus =
  | 'UPLOADED'
  | 'EXTRACTING'
  | 'NEEDS_REVIEW'
  | 'READY'
  | 'COMMITTING'
  | 'COMMITTED'
  | 'FAILED'
  | 'CANCELLED'

export interface ImportPageView {
  pageNumber: number
  filename: string
  mimeType: string
  storageKey: string
  previewUrl: string | null
  status: 'pending' | 'done' | 'failed'
  failureMessage: string | null
}

export interface ImportSummaryView {
  consignmentCount: number
  totalPieces: number | null
  documentType: string | null
  documentNumber: string | null
  documentDate: string | null
  /** Where the freight loads. On a rate confirmation this is NOT the client. */
  originName: string | null
  /** The party being matched to a client — the issuer on a rate confirmation. */
  clientNameOnDocument: string | null
  /** "Dealer Tire manifest". Null when extraction produced neither part. */
  title: string | null
  warnings: Array<{ code: string; message: string; pageNumbers: number[] }>
}

// ---------------------------------------------------------------------------
// Resolution — mirrors apps/web/src/lib/document-import/resolution.ts
//
// Every field here is COMPUTED server-side on each read. Nothing in this block
// is stored, which is why a score shown on this screen is a statement about the
// two strings currently in the row rather than a number frozen at confirmation
// time. See the header of `resolution.ts`.
// ---------------------------------------------------------------------------

export type ResolvedVia =
  | 'EXACT_MATCH'
  | 'PROFILE_ALIAS'
  | 'ONLY_ACTIVE_CONTRACT'
  | 'PROFILE_PIN'
  | 'CHOSEN'
  | 'CREATED'

export interface WhyView {
  via: ResolvedVia
  matchedText: string | null
  documentText: string | null
  /** 0..1, or null when a person set it rather than a match producing it. */
  score: number | null
  detail: string
}

export interface ClientOption {
  id: string
  name: string
  dbaName: string | null
  city: string | null
  state: string | null
  activeContractCount: number
  score: number | null
  matchedText: string | null
  matchedField: 'name' | 'dbaName' | 'alias' | null
}

export interface ContractOption {
  id: string
  contractNumber: string
  contractName: string | null
  contractType: string
  rateType: string
  /** Decimal as a string. Never a float. */
  baseRate: string | null
  effectiveDate: string | null
  expirationDate: string | null
  isOneTime: boolean
}

export interface ClientPrefill {
  name: string
  primaryContact: string | null
  phone: string | null
  email: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  zip: string | null
  country: string | null
}

export interface ClientSlotView {
  state: 'RESOLVED' | 'UNRESOLVED'
  value: ClientOption | null
  why: WhyView | null
  documentText: string | null
  candidates: ClientOption[]
  createPrefill: ClientPrefill
}

export interface SpotOffer {
  totalRate: string | null
  currency: string
  effectiveDate: string
  proposedName: string
  detail: string
}

/**
 * The offer to create the client's first contract inline.
 *
 * Non-null only when the picker is empty AND there is no spot offer — i.e. the
 * state that used to be a dead end. It carries the client and nothing else: a
 * manifest states what moved, not the terms of a standing agreement, so there
 * is nothing honest to pre-fill a rate or a term from.
 */
export interface ContractCreateOffer {
  clientName: string
  detail: string
}

export interface ContractSlotView {
  state: 'RESOLVED' | 'UNRESOLVED' | 'AWAITING_CLIENT'
  value: ContractOption | null
  why: WhyView | null
  candidates: ContractOption[]
  spotOffer: SpotOffer | null
  createOffer: ContractCreateOffer | null
  blockedReason: string | null
}

// ---------------------------------------------------------------------------
// Route template matching — mirrors apps/web/src/lib/document-import/
// template-lookup.ts and template-matching.ts (spec Section 8).
// ---------------------------------------------------------------------------

export type TemplateProvenanceVia =
  | 'AUTO_MATCH'
  | 'MANUAL'
  | 'NONE'
  | 'AUTO_CREATED'
  | 'SAVED_FROM_IMPORT'

export interface TemplateWhyView {
  via: TemplateProvenanceVia
  score: number | null
  matchedText: string | null
  detail: string
}

/** Where a row in the applied list came from — Section 8's three columns. */
export type TemplateStopOrigin = 'MATCHED' | 'IMPORT_ONLY' | 'TEMPLATE_ONLY'

export interface TemplateDiffRow {
  origin: TemplateStopOrigin
  facilityId: string | null
  name: string
  templateSequence: number | null
  importIndex: number | null
}

export interface TemplateDiff {
  rows: TemplateDiffRow[]
  matched: number
  importOnly: number
  templateOnly: number
  /** Stops the ladder has not resolved. They can never match a template stop. */
  unresolved: number
}

export interface TemplateCandidateView {
  id: string
  name: string
  score: number
  /** Rounded server-side, once, so the two surfaces cannot round differently. */
  scorePercent: number
  stopCount: number
  /** True when this candidate came from the CLIENT because the contract had none. */
  widened: boolean
  diffNote: string
  diff: TemplateDiff
  countMismatch: boolean
  /** Auto-created from an import and not yet confirmed by a human. */
  isSuggested: boolean
}

export type TemplateSlotState = 'RESOLVED' | 'CANDIDATES' | 'NONE' | 'DECLINED' | 'BLOCKED'

export interface TemplateSlotView {
  state: TemplateSlotState
  value: TemplateCandidateView | null
  why: TemplateWhyView | null
  candidates: TemplateCandidateView[]
  widened: boolean
  /** False means "derived on this read, not written yet" (the quick-508 shape). */
  persisted: boolean
  /** True once the template's order and standing fields were merged in. */
  applied: boolean
  blockedReason: string | null
  thresholds: { autoApply: number; candidate: number }
}

export interface TemplateApplyResult {
  view: TemplateSlotView
  matched: number
  appended: number
  notOnManifest: number
  windowsApplied: number
  windowsKept: number
  windowsUnavailable: boolean
}

export interface TemplateOfferView {
  kind: 'NONE' | 'UPDATE_TEMPLATE' | 'SAVE_AS_TEMPLATE' | 'AUTO_CREATED'
  templateId: string | null
  templateName: string | null
  changedSummary: string | null
  answered: boolean
}

export interface SaveTemplateResult {
  templateId: string
  templateName: string
  isSuggested: boolean
  stopCount: number
  skippedUnresolved: number
  skippedNotToday: number
  narrowedStopTypes: number
}

export interface ImportResolutionView {
  client: ClientSlotView
  contract: ContractSlotView
  /** Real as of Phase 6 — it was `{ state: 'STUB' }` while Section 8 was unbuilt. */
  template: TemplateSlotView
  documentDate: string | null
  /**
   * `matched` and `created` were `null` while facility resolution did not exist
   * (Phase 3, deliberately — "0 matched" would have been a claim nothing had
   * checked). The facility ladder computes them, so they are real numbers now.
   */
  stops: { total: number; matched: number; created: number; note: string }
  resolved: boolean
}

// ---------------------------------------------------------------------------
// Facility resolution ladder — mirrors apps/web/src/lib/document-import/
// facility-lookup.ts and facility-ladder.ts (spec Section 7).
// ---------------------------------------------------------------------------

/** T1 · T2 · T3 · T4. The rung a stop is on. */
export type FacilityTier = 'T1' | 'T2' | 'T3' | 'T4'

export type StopResolvedVia =
  /** T1 — a confirmed `(tenant, client, code)` external reference. */
  | 'EXTERNAL_REF'
  /** T2 — the document address normalised equal to exactly one facility. */
  | 'NORMALISED_ADDRESS'
  /** T3, and any manual re-pick — a person chose this facility. */
  | 'MANUAL'
  /** T4 — a person created this facility from the pre-filled form. */
  | 'MANUAL_CREATE'

export interface StopWhyView {
  via: StopResolvedVia
  matchedText: string | null
  documentText: string | null
  score: number | null
  detail: string
}

export interface StopFacilityView {
  id: string
  name: string
  address: string
  facilityType: string
}

/** A T3 candidate. A candidate is never a decision — linking needs a POST. */
export interface FacilityProposal {
  facilityId: string
  name: string
  address: string
  /** 0..1. Shown, never acted on. */
  score: number
  /** Plain-language field differences, for the "show score + diffs" rule. */
  differences: string[]
  conflicts: string[]
  nameScore: number
}

export interface FacilityPrefill {
  name: string
  facilityType: string
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  zip: string | null
  sourceCode: string | null
}

export type StopSlotState = 'LINKED' | 'PROPOSED' | 'NEW'

export interface StopSlotView {
  index: number
  documentName: string
  documentAddress: string
  sourceCode: string | null
  tier: FacilityTier
  state: StopSlotState
  facility: StopFacilityView | null
  why: StopWhyView | null
  proposals: FacilityProposal[]
  prefill: FacilityPrefill | null
  /**
   * The hard rule, on the payload: no surface may render a T3 or T4 stop as
   * settled, and nothing may be created without a person pressing something.
   */
  requiresHumanTap: boolean
  /**
   * True when the link is on the import row; false when it has only been
   * computed for this read. A silent T1/T2 is displayed the moment it is
   * derived and written when a mutation next needs it.
   */
  persisted: boolean
}

export interface StopResolutionView {
  stops: StopSlotView[]
  total: number
  matched: number
  created: number
  needsReview: number
  note: string
}

/** What the T4 create form sends. */
export interface CreateStopFacilityInput {
  name: string
  facilityType?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  zip?: string
  country?: string
  contactName?: string
  contactPhone?: string
}

// ---------------------------------------------------------------------------
// Stop review — mirrors apps/web/src/lib/document-import/stop-review.ts
// (spec Section 10).
//
// The facility half of every row is the Phase 4 ladder, recomputed on each read.
// The consignment half is `reviewed_extraction`, which IS the persisted state —
// so a reorder or an edit made on a phone is what a browser sees next, and vice
// versa. Nothing on this screen is local.
// ---------------------------------------------------------------------------

/** Verified against the live `stops_stop_type_check`. Not an invented list. */
export type StopType = 'pickup' | 'delivery' | 'fuel_stop' | 'layover' | 'relay_handoff'

/** `stops` carries `"bolRequired"`/`"podRequired"` (camelCase, verified) and no third column. */
export type RequiredDocument = 'BOL' | 'POD'

export type BulkAppliedField = 'notes' | 'requiredDocuments' | 'appointment' | 'stopType' | 'totals'

export type StopReferenceType =
  | 'SHIPMENT'
  | 'PRO'
  | 'ORDER'
  | 'PO'
  | 'BOL'
  | 'LOAD'
  | 'SEAL'
  | 'OTHER'

export interface StopReference {
  type: StopReferenceType
  value: string
}

export interface StopLineItem {
  sku: string | null
  description: string | null
  quantity: number | null
  uom: string | null
  weight: number | null
  hazmat: boolean | null
}

export interface StopRollup {
  /** What the line items add up to. Null when no item carries the field. */
  computed: number | null
  /** What the stop claims — the typed value, else the computed one. */
  value: number | null
  /** True when a person typed it. The visible mark reads off THIS, not a diff. */
  overridden: boolean
}

export interface StopRollups {
  pieces: StopRollup
  weight: StopRollup
  /** Hand-entered only — line items carry no pallet marker. Never "overridden". */
  pallets: number | null
  weightUom: 'LBS' | 'KG' | null
  /** "5 · 1,200 lbs". What the list row shows. */
  label: string
}

export interface StopAppointment {
  earliest: string | null
  latest: string | null
  isFirm: boolean
}

export interface StopContact {
  name: string | null
  phone: string | null
}

export interface StopReviewRow {
  index: number
  sequence: number

  // facility (Phase 4, computed on read)
  state: StopSlotState
  tier: FacilityTier
  facility: StopFacilityView | null
  why: StopWhyView | null
  proposals: FacilityProposal[]
  prefill: FacilityPrefill | null
  requiresHumanTap: boolean
  persisted: boolean
  documentName: string
  documentAddress: string
  sourceCode: string | null

  // consignment (reviewedExtraction)
  name: string
  stopType: StopType | null
  references: StopReference[]
  referenceCount: number
  lineItems: StopLineItem[]
  rollups: StopRollups
  appointment: StopAppointment | null
  requiredDocuments: RequiredDocument[]
  contact: StopContact | null
  notes: string | null
  pageNumbers: number[]
  bulkAppliedFields: BulkAppliedField[]

  // --- route template application (Phase 6, spec Section 8) -----------------
  /** Where this row came from once a template was applied. Null until one is. */
  templateOrigin: TemplateStopOrigin | null
  /** A template stop that is not on today's document — kept, badged, skipped. */
  skipped: boolean
  /** The template's standing note. Separate from `notes`, which is the import's. */
  templateStandingNotes: string | null
}

export type StopIssueCode =
  | 'UNRESOLVED_FACILITY'
  | 'MISSING_NAME'
  | 'DUPLICATE_FACILITY'
  | 'REPEATED_FACILITY'
  | 'NO_QUANTITIES'
  | 'NO_REFERENCES'
  | 'NO_STOP_TYPE'
  | 'PARTIAL_APPOINTMENTS'
  | 'HAND_EDITED_ROLLUPS'

export interface StopIssue {
  code: StopIssueCode
  /** Already counted and already worded. A surface prints it, never builds it. */
  message: string
  stopIndexes: number[]
}

export interface StopReviewView {
  stops: StopReviewRow[]
  total: number
  matched: number
  created: number
  needsReview: number
  note: string
  /** Hard stops. The primary action is disabled while this is non-empty. */
  blocks: StopIssue[]
  /** One dismissible summary. Never a modal (Section 10). */
  warnings: StopIssue[]
  canProceed: boolean
  /** The sentence printed next to the disabled action. Null when nothing blocks. */
  blockedReason: string | null
}

/** One dispatcher's edit. Only the keys sent are applied. */
export interface StopEditInput {
  name?: string
  stopType?: StopType | null
  references?: StopReference[]
  lineItems?: StopLineItem[]
  /** A number sets an override; null reverts to the line-item total. */
  pieces?: number | null
  weight?: number | null
  pallets?: number | null
  weightUom?: 'LBS' | 'KG' | null
  appointment?: StopAppointment | null
  requiredDocuments?: RequiredDocument[]
  contact?: StopContact | null
  notes?: string | null
  /** Section 8's "one tap to keep" — false puts a skipped template stop back. */
  skipped?: boolean
}

export interface StopBulkInput {
  notes?: string
  requiredDocuments?: RequiredDocument[]
  appointment?: StopAppointment
  stopType?: StopType
  copyQuantitiesFromAbove?: boolean
  /** Takes back only what the bar applied. Never a hand-typed value. */
  clear?: BulkAppliedField[]
}

export interface StopBulkResult {
  view: StopReviewView
  /** How many stops actually changed. What the confirmation should now report. */
  applied: number
  /** Selected stops that had nothing to change. Reported, never hidden. */
  skipped: number[]
  fields: string[]
}

export interface ImportView {
  id: string
  status: ImportStatus
  originalName: string | null
  pageCount: number
  pagesDone: number
  pagesFailed: number
  failureCode: string | null
  failureMessage: string | null
  createdTripId: string | null
  createdAt: string
  updatedAt: string
  pages: ImportPageView[]
  summary: ImportSummaryView | null
  /** Null until extraction has produced something to resolve. */
  resolution: ImportResolutionView | null
}

export interface ImportListItem {
  id: string
  status: ImportStatus
  originalName: string | null
  /** What the document is, when extraction knows. Null before it does. */
  title: string | null
  pageCount: number
  consignmentCount: number | null
  createdAt: string
  createdTripId: string | null
  failureMessage: string | null
}

export interface ImportUploadGrant {
  uploadUrl: string
  storageKey: string
  filename: string
  contentType: string
}

/** A 409 from create — the document has been here before. */
export interface ImportDuplicate {
  error: string
  reason: 'DUPLICATE'
  duplicate: {
    importId: string
    status: ImportStatus
    originalName: string | null
    createdAt: string
    createdTripId: string | null
  }
}

export type CreateImportResult =
  | { ok: true; importId: string }
  | { ok: false; duplicate: ImportDuplicate }

const BASE = '/api/mobile/carrier/owner/document-imports'

// ---------------------------------------------------------------------------

export const ownerImportsApi = {
  listResumable: (token: string) =>
    apiRequest<{ data: { items: ImportListItem[] } }>(`${BASE}?scope=resumable`, { token }).then(
      (r) => r.data.items,
    ),

  listRecent: (token: string) =>
    apiRequest<{ data: { items: ImportListItem[] } }>(`${BASE}?scope=recent`, { token }).then(
      (r) => r.data.items,
    ),

  getUploadUrl: (
    token: string,
    body: { fileName: string; contentType: string; sizeBytes: number },
  ) =>
    apiRequest<{ data: ImportUploadGrant }>(`${BASE}/upload-url`, {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    }).then((r) => r.data),

  /**
   * Create the import from the ordered storage keys.
   *
   * A duplicate is a 409, which `apiRequest` would turn into a thrown Error and
   * lose the body with it — and that body carries the two actions the user
   * needs. So this one call is made with plain fetch.
   */
  create: async (
    token: string,
    storageKeys: string[],
    mode: 'new' | 'correction' = 'new',
  ): Promise<CreateImportResult> => {
    const res = await fetch(`${getApiBaseUrl()}${BASE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ storageKeys, mode }),
    })
    const json = await res.json().catch(() => ({}))

    if (res.status === 409 && json?.duplicate) {
      return { ok: false, duplicate: json as ImportDuplicate }
    }
    if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
    return { ok: true, importId: json.data.importId as string }
  },

  get: (token: string, importId: string) =>
    apiRequest<{ data: ImportView }>(`${BASE}/${importId}`, { token }).then((r) => r.data),

  extract: (token: string, importId: string) =>
    apiRequest<{ data: { ok: boolean; status: ImportStatus; message?: string; import: ImportView | null } }>(
      `${BASE}/${importId}/extract`,
      { method: 'POST', token },
    ).then((r) => r.data),

  cancel: (token: string, importId: string) =>
    apiRequest<{ data: { cancelled: boolean } }>(`${BASE}/${importId}`, {
      method: 'DELETE',
      token,
    }),

  reshootPage: (token: string, importId: string, pageNumber: number, storageKey: string) =>
    apiRequest<{ data: { replaced: number } }>(`${BASE}/${importId}/pages`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ pageNumber, storageKey }),
    }),

  // -------------------------------------------------------------------------
  // Resolution
  //
  // Every one of these returns the WHOLE resolution view, not an acknowledgement.
  // That is what makes creating a client or a contract mid-flow safe: the
  // screen's next state arrives with the write, so there is no moment where the
  // entity exists and the screen does not know, and nothing local to lose.
  // -------------------------------------------------------------------------

  /** Search the client picker. `GET /[id]` already carries the unsearched view. */
  getResolution: (token: string, importId: string, query?: string) =>
    apiRequest<{ data: ImportResolutionView }>(
      `${BASE}/${importId}/resolution${query ? `?q=${encodeURIComponent(query)}` : ''}`,
      { token },
    ).then((r) => r.data),

  setClient: (token: string, importId: string, clientId: string) =>
    apiRequest<{ data: ImportResolutionView }>(`${BASE}/${importId}/resolution`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ clientId }),
    }).then((r) => r.data),

  setContract: (token: string, importId: string, contractId: string) =>
    apiRequest<{ data: ImportResolutionView }>(`${BASE}/${importId}/resolution`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ contractId }),
    }).then((r) => r.data),

  setDocumentDate: (token: string, importId: string, documentDate: string | null) =>
    apiRequest<{ data: ImportResolutionView }>(`${BASE}/${importId}/resolution`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ documentDate }),
    }).then((r) => r.data),

  createClient: (token: string, importId: string, input: ClientPrefill) =>
    apiRequest<{ data: ImportResolutionView }>(`${BASE}/${importId}/resolution/client`, {
      method: 'POST',
      token,
      body: JSON.stringify(input),
    }).then((r) => r.data),

  /** The one-time rate-confirmation contract. `baseRate` stays a string. */
  createSpotContract: (token: string, importId: string, baseRate: string) =>
    apiRequest<{ data: ImportResolutionView }>(`${BASE}/${importId}/resolution/contract`, {
      method: 'POST',
      token,
      body: JSON.stringify({ spot: true, baseRate }),
    }).then((r) => r.data),

  /**
   * A standing contract for a client that has none — the way out of the empty
   * picker. `spot: false` is the whole difference the server sees; the rate and
   * the term are left unset because the document does not state them.
   */
  createContract: (token: string, importId: string, contractName?: string) =>
    apiRequest<{ data: ImportResolutionView }>(`${BASE}/${importId}/resolution/contract`, {
      method: 'POST',
      token,
      body: JSON.stringify({ spot: false, ...(contractName ? { contractName } : {}) }),
    }).then((r) => r.data),

  // -------------------------------------------------------------------------
  // Facility resolution ladder (spec Section 7)
  //
  // Three calls, and the split between them is the safety rule: the GET decides
  // and describes without writing, `linkStopFacility` links a facility a person
  // chose, and `createStopFacility` is the ONLY one that can bring a facility
  // into existence. T1 and T2 need none of them — they resolve silently and are
  // committed server-side at the next mutation.
  // -------------------------------------------------------------------------

  /** Read-only. Opening the stop list cannot commit anything. */
  getStops: (token: string, importId: string) =>
    apiRequest<{ data: StopResolutionView }>(`${BASE}/${importId}/stops`, { token })
      .then((r) => r.data),

  /** The T3 exit — a person tapped a proposal, or re-picked a resolved stop. */
  linkStopFacility: (token: string, importId: string, stopIndex: number, facilityId: string) =>
    apiRequest<{ data: StopResolutionView }>(`${BASE}/${importId}/stops`, {
      method: 'POST',
      token,
      body: JSON.stringify({ stopIndex, facilityId }),
    }).then((r) => r.data),

  /**
   * The T4 exit, and the only call in this client that creates a facility.
   * Requires a name a person saw and accepted — spec Section 7's hard rule.
   */
  createStopFacility: (
    token: string,
    importId: string,
    stopIndex: number,
    input: CreateStopFacilityInput,
  ) =>
    apiRequest<{ data: StopResolutionView }>(`${BASE}/${importId}/stops/facility`, {
      method: 'POST',
      token,
      body: JSON.stringify({ stopIndex, ...input }),
    }).then((r) => r.data),

  // -------------------------------------------------------------------------
  // Stop review (spec Section 10)
  //
  // Four calls, and every mutating one returns the whole view — so the screen's
  // next state arrives with the write and there is nothing local to reconcile.
  // That is what makes a reorder survive backgrounding the app: the order is on
  // the row before the animation has finished.
  // -------------------------------------------------------------------------

  /** Read-only. Opening the review screen cannot commit anything. */
  getStopReview: (token: string, importId: string) =>
    apiRequest<{ data: StopReviewView }>(`${BASE}/${importId}/stops/review`, { token }).then(
      (r) => r.data,
    ),

  /** One dispatcher's edit to one stop. */
  updateStop: (token: string, importId: string, stopIndex: number, input: StopEditInput) =>
    apiRequest<{ data: StopReviewView }>(`${BASE}/${importId}/stops/review`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ stopIndex, ...input }),
    }).then((r) => r.data),

  /**
   * Persist a new running order.
   *
   * `order` is the FULL permutation — the old index of each stop in its new
   * position — not a move delta. Idempotent under a retry, and validated as a
   * permutation server-side, so a stale client cannot move the wrong stop.
   */
  reorderStops: (token: string, importId: string, order: number[]) =>
    apiRequest<{ data: StopReviewView }>(`${BASE}/${importId}/stops/order`, {
      method: 'POST',
      token,
      body: JSON.stringify({ order }),
    }).then((r) => r.data),

  /**
   * Apply one field across the selection.
   *
   * `stopIndexes` IS the selection. The server acts on every index named and
   * never asks which of them were on screen — a selected stop scrolled out of
   * view receives the change because nothing below this line knows what a
   * viewport is.
   */
  bulkApplyStops: (
    token: string,
    importId: string,
    stopIndexes: number[],
    input: StopBulkInput,
  ) =>
    apiRequest<{ data: StopBulkResult }>(`${BASE}/${importId}/stops/bulk`, {
      method: 'POST',
      token,
      body: JSON.stringify({ stopIndexes, ...input }),
    }).then((r) => r.data),

  // -------------------------------------------------------------------------
  // Route template matching (spec Section 8)
  // -------------------------------------------------------------------------

  /** The template row: the collapsed match, the ranked candidates, or neither. */
  getTemplate: (token: string, importId: string) =>
    apiRequest<{ data: TemplateSlotView }>(`${BASE}/${importId}/template`, { token }).then(
      (r) => r.data,
    ),

  /** Pick one of the ranked candidates. Checked against the candidate set server-side. */
  selectTemplate: (token: string, importId: string, templateId: string) =>
    apiRequest<{ data: TemplateSlotView }>(`${BASE}/${importId}/template`, {
      method: 'POST',
      token,
      body: JSON.stringify({ action: 'select', templateId }),
    }).then((r) => r.data),

  /** "Continue without a template." A recorded decision, not an absence. */
  declineTemplate: (token: string, importId: string) =>
    apiRequest<{ data: TemplateSlotView }>(`${BASE}/${importId}/template`, {
      method: 'POST',
      token,
      body: JSON.stringify({ action: 'decline' }),
    }).then((r) => r.data),

  /**
   * Merge the selected template into the stop list.
   *
   * Rewrites the running order, so it is always an explicit tap — selecting a
   * template never applies it.
   */
  applyTemplate: (token: string, importId: string) =>
    apiRequest<{ data: TemplateApplyResult }>(`${BASE}/${importId}/template`, {
      method: 'POST',
      token,
      body: JSON.stringify({ action: 'apply' }),
    }).then((r) => r.data),

  /** The post-commit question, as recorded. `kind: 'NONE'` means render nothing. */
  getTemplateOffer: (token: string, importId: string) =>
    apiRequest<{ data: TemplateOfferView }>(`${BASE}/${importId}/template/offer`, { token }).then(
      (r) => r.data,
    ),

  /** One-tap "Save as route template" on the commit success screen. */
  saveAsRouteTemplate: (token: string, importId: string) =>
    apiRequest<{ data: SaveTemplateResult }>(`${BASE}/${importId}/template/offer`, {
      method: 'POST',
      token,
      body: JSON.stringify({ action: 'save' }),
    }).then((r) => r.data),

  /** Answer "the trip differed — update the template?". Asked once, never repeated. */
  answerTemplateOffer: (token: string, importId: string, action: 'update' | 'dismiss') =>
    apiRequest<{ data: TemplateOfferView }>(`${BASE}/${importId}/template/offer`, {
      method: 'POST',
      token,
      body: JSON.stringify({ action }),
    }).then((r) => r.data),
}
