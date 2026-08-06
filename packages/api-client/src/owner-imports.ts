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

export interface ImportResolutionView {
  client: ClientSlotView
  contract: ContractSlotView
  template: { state: 'STUB'; note: string }
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
}
