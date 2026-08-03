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
  originName: string | null
  clientNameOnDocument: string | null
  warnings: Array<{ code: string; message: string; pageNumbers: number[] }>
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
}

export interface ImportListItem {
  id: string
  status: ImportStatus
  originalName: string | null
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
}
