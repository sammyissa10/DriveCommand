/**
 * Canonical extraction schema for the Document Import module.
 *
 * Spec: docs/specs/DocumentImport_TechnicalSpec_v1.md Section 5.
 *
 * ONE shape for every document type. A manifest with 16 pages, a 2-page rate
 * confirmation, a spreadsheet, and a packing list all land here — that is what
 * makes the module universal rather than tire-specific, and it means nothing
 * below the extraction layer has to branch on document type.
 *
 * Everything is advisory except a consignment's `name`, plus either a resolvable
 * `address` or an already-resolved facility. Extraction is best-effort by nature;
 * the human is the approver (spec Section 1.6), so a missing field is a thing to
 * show someone, never a parse failure.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Named `canonical*` to avoid colliding with `documentTypeEnum` in ./document. */
export const canonicalDocumentTypeEnum = z.enum([
  'MANIFEST',
  'RATE_CONFIRMATION',
  'DELIVERY_SCHEDULE',
  'PACKING_LIST',
  'UNKNOWN',
]);
export type CanonicalDocumentType = z.infer<typeof canonicalDocumentTypeEnum>;

/**
 * Reference types seen on freight paperwork. Spec Section 5.
 * `OTHER` is the catch-all so an unrecognised label is still captured rather
 * than dropped — the dispatcher can retype it, but only if we kept it.
 */
export const referenceTypeEnum = z.enum([
  'SHIPMENT',
  'PRO',
  'ORDER',
  'PO',
  'BOL',
  'LOAD',
  'SEAL',
  'OTHER',
]);
export type ReferenceType = z.infer<typeof referenceTypeEnum>;

/** Weight units. Documents mix these freely; normalise at the rollup, not here. */
export const weightUomEnum = z.enum(['LBS', 'KG']);

// ---------------------------------------------------------------------------
// Leaf shapes
// ---------------------------------------------------------------------------

/**
 * A postal address as printed. Deliberately NOT normalised — normalisation is
 * Phase 4's shared utility, and keeping the raw form here preserves the evidence
 * a human needs when confirming a fuzzy match.
 */
export const addressSchema = z.object({
  line1: z.string().nullish(),
  line2: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  postalCode: z.string().nullish(),
  country: z.string().nullish(),
});
export type CanonicalAddress = z.infer<typeof addressSchema>;

export const contactSchema = z.object({
  name: z.string().nullish(),
  phone: z.string().nullish(),
  email: z.string().nullish(),
});

export const referenceSchema = z.object({
  type: referenceTypeEnum,
  value: z.string().min(1),
});
export type CanonicalReference = z.infer<typeof referenceSchema>;

/**
 * An appointment window. `isFirm` decides whether Phase 7's optimiser treats it
 * as a hard constraint or a soft penalty (spec Section 9).
 */
export const appointmentSchema = z.object({
  earliest: z.string().nullish(),
  latest: z.string().nullish(),
  isFirm: z.boolean().nullish(),
});

/**
 * Quantities as printed. A substitution row with quantity 0 is real and must be
 * kept — spec 1.2 callout (14): "Item 197592 subs" ships nothing but exists for
 * reference, and dropping it loses information the dispatcher may need.
 */
export const lineItemSchema = z.object({
  sku: z.string().nullish(),
  description: z.string().nullish(),
  quantity: z.number().nullish(),
  uom: z.string().nullish(),
  weight: z.number().nullish(),
  hazmat: z.boolean().nullish(),
});
export type CanonicalLineItem = z.infer<typeof lineItemSchema>;

export const totalsSchema = z.object({
  pieces: z.number().nullish(),
  pallets: z.number().nullish(),
  weight: z.number().nullish(),
  weightUom: weightUomEnum.nullish(),
});
export type CanonicalTotals = z.infer<typeof totalsSchema>;

/**
 * Per-field confidence, keyed by dotted path into the consignment
 * (e.g. "address.postalCode"). Drives the confidence-collapse behaviour in
 * spec Section 4.2 and the "why" affordance that shows a real score.
 */
export const fieldConfidenceSchema = z.record(z.string(), z.number().min(0).max(1));

export const extractionWarningSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  pageNumbers: z.array(z.number().int().nonnegative()).default([]),
});
export type ExtractionWarning = z.infer<typeof extractionWarningSchema>;

// ---------------------------------------------------------------------------
// Consignment
// ---------------------------------------------------------------------------

/**
 * One delivery destination on the document.
 *
 * NOTE: a consignment is not a stop. Two consignments to the same consignee
 * become ONE stop with summed quantities (spec Section 1.3) — that merge happens
 * in the extraction service, not here.
 */
export const consignmentSchema = z.object({
  /** Every source page this consignment was seen on. A merged consignment keeps all of them. */
  pageNumbers: z.array(z.number().int().nonnegative()).default([]),

  /**
   * The gold key. Dealer Tire's permanent id for a dealership ("43775") — stable
   * across years, unlike names and addresses. Tier 1 of the facility ladder is an
   * exact match on this (spec Sections 1.2, 7).
   */
  externalCode: z.string().nullish(),

  /** The only always-required field. Everything else is advisory. */
  name: z.string().min(1, 'Consignment name is required'),

  address: addressSchema.default({}),
  contact: contactSchema.nullish(),

  /** Routing zone as printed, e.g. "WEST - MKE". Used to name auto-created templates. */
  groupLabel: z.string().nullish(),

  appointment: appointmentSchema.nullish(),
  references: z.array(referenceSchema).default([]),
  totals: totalsSchema.default({}),
  lineItems: z.array(lineItemSchema).default([]),
  notes: z.string().nullish(),

  fieldConfidence: fieldConfidenceSchema.default({}),
});
export type CanonicalConsignment = z.infer<typeof consignmentSchema>;

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

export const extractionHeaderSchema = z.object({
  documentNumber: z.string().nullish(),
  /**
   * Spec 1.2 callout (3): a DATE can sit in a field labelled "Number". Never
   * assume a field named "number" contains one — this is separate on purpose.
   */
  documentDate: z.string().nullish(),
  totalPages: z.number().int().positive().nullish(),

  originName: z.string().nullish(),
  originAddress: addressSchema.nullish(),
  originContact: contactSchema.nullish(),

  /** Rate confirmations only. Money stays a STRING here and becomes Decimal at
   *  persistence — never a float (spec Section 15). */
  currency: z.string().nullish(),
  totalRate: z.string().nullish(),
});
export type CanonicalHeader = z.infer<typeof extractionHeaderSchema>;

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export const canonicalExtractionSchema = z.object({
  documentType: canonicalDocumentTypeEnum.default('UNKNOWN'),
  header: extractionHeaderSchema.default({}),
  consignments: z.array(consignmentSchema).default([]),
  extractionWarnings: z.array(extractionWarningSchema).default([]),
});
export type CanonicalExtraction = z.infer<typeof canonicalExtractionSchema>;

/**
 * What a single page returns before assembly. Same shape minus the parts that
 * only make sense for a whole document.
 */
export const pageExtractionSchema = z.object({
  documentType: canonicalDocumentTypeEnum.default('UNKNOWN'),
  header: extractionHeaderSchema.partial().default({}),
  consignments: z.array(consignmentSchema).default([]),
  extractionWarnings: z.array(extractionWarningSchema).default([]),
});
export type PageExtraction = z.infer<typeof pageExtractionSchema>;

// ---------------------------------------------------------------------------
// Commit readiness
// ---------------------------------------------------------------------------

/**
 * Spec Section 5: "Required for commit: `name`, plus either a resolvable
 * `address` or a resolved facility."
 *
 * Kept separate from `consignmentSchema` on purpose. Extraction must accept a
 * half-read consignment so a human can fix it; only the commit path demands
 * this much. Validating at extraction time would throw away recoverable work.
 */
export function isCommitReady(
  consignment: CanonicalConsignment,
  resolvedFacilityId?: string | null,
): boolean {
  if (!consignment.name || consignment.name.trim().length === 0) return false;
  if (resolvedFacilityId) return true;

  const a = consignment.address ?? {};
  // "Resolvable" means enough to geocode or fuzzy-match: a street line plus
  // either a city or a postal code.
  const hasStreet = Boolean(a.line1 && a.line1.trim());
  const hasLocality = Boolean((a.city && a.city.trim()) || (a.postalCode && a.postalCode.trim()));
  return hasStreet && hasLocality;
}

/** Consignments that cannot commit yet, with the reason, for the review screen. */
export function findUncommittableConsignments(
  extraction: CanonicalExtraction,
  resolvedFacilityIds: Record<number, string | null | undefined> = {},
): Array<{ index: number; name: string; reason: string }> {
  const out: Array<{ index: number; name: string; reason: string }> = [];
  extraction.consignments.forEach((c, i) => {
    if (isCommitReady(c, resolvedFacilityIds[i])) return;
    const reason = !c.name || !c.name.trim()
      ? 'missing name'
      : 'needs a facility or a resolvable address';
    out.push({ index: i, name: c.name || '(unnamed)', reason });
  });
  return out;
}
