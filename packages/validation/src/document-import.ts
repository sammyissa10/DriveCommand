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

/**
 * What kind of stop this consignment becomes. Spec Section 10 lists `type` as a
 * per-stop field.
 *
 * THESE FIVE VALUES ARE THE DATABASE'S, NOT AN INVENTION. Verified against
 * production before this schema was written:
 *
 * ```
 * stops_stop_type_check
 *   CHECK (stop_type IN ('pickup','delivery','fuel_stop','layover','relay_handoff'))
 * ```
 *
 * This is the same trap DEC-1 hit with `facility_type` and DEC-14 hit with
 * `facility_external_references.resolved_via`: a vocabulary that reads naturally
 * ("dropoff", "consignee", "stop") is a Postgres 23514 at commit, and a jsonb
 * column will happily store the wrong word for weeks because nothing checks it
 * until Phase 8 tries to write a row. Offering only committable values here is
 * what stops a dispatcher's edit becoming a failed commit later.
 */
export const stopTypeEnum = z.enum([
  'pickup',
  'delivery',
  'fuel_stop',
  'layover',
  'relay_handoff',
]);
export type CanonicalStopType = z.infer<typeof stopTypeEnum>;

/**
 * Paperwork the driver must capture at this stop.
 *
 * Deliberately only two values, and that is a constraint of the target row
 * rather than a shortcut: `stops` carries `"bolRequired"` and `"podRequired"`
 * as booleans and has no third column and no list.
 *
 * (Those two column names are camelCase in the live database — verified, not
 * assumed — where every neighbour on that table is snake_case. Prisma declares
 * them without an `@map`, so `bol_required` does not exist and a Phase 8 raw
 * SQL write against it would be an undefined-column error. Recorded here
 * because the pattern is the same one DEC-1 and DEC-14 taught: read the schema,
 * do not infer it from the convention around it.)
 *
 * Offering "photo of the seal" or
 * "lumper receipt" here would let a dispatcher set a requirement the commit
 * cannot carry and the driver flow (Phase 9) cannot enforce — a promise the
 * system silently drops. If a richer requirement list is wanted it needs a
 * column, which is DDL, which is not this phase's to write.
 */
export const requiredDocumentEnum = z.enum(['BOL', 'POD']);
export type CanonicalRequiredDocument = z.infer<typeof requiredDocumentEnum>;

/**
 * Which rollups a person typed rather than the line items producing.
 *
 * `pallets` is deliberately absent. "Overridden" means *differs from what the
 * line items compute*, and line items carry no pallet marker — there is nothing
 * to differ from, so a pallet count is only ever a typed value and marking it
 * "overridden" would claim a comparison that never happened. Same rule as
 * `MANUAL_CREATE` carrying a null score in Phase 4.
 */
export const rollupFieldEnum = z.enum(['pieces', 'weight']);
export type CanonicalRollupField = z.infer<typeof rollupFieldEnum>;

/**
 * The fields the bulk-apply bar can set, and therefore the fields "clear any
 * bulk-applied field" can take back off (spec Section 10).
 *
 * Recorded per consignment because "clear" has to be able to tell a value a
 * person typed on one stop from a value a bar wrote across seven. Without the
 * marker, clear either wipes hand-typed work or does nothing — both are worse
 * than not offering it.
 */
/**
 * Where a stop came from once a route template has been applied (spec Section 8).
 *
 * The three columns of the merge box, named. `MATCHED` is on both lists,
 * `IMPORT_ONLY` is today's document only (appended at the end, badged New),
 * `TEMPLATE_ONLY` is the template only (kept, badged "Not on today's manifest",
 * defaulted to skipped).
 */
export const templateOriginEnum = z.enum(['MATCHED', 'IMPORT_ONLY', 'TEMPLATE_ONLY']);
export type CanonicalTemplateOrigin = z.infer<typeof templateOriginEnum>;

export const bulkAppliedFieldEnum = z.enum([
  'notes',
  'requiredDocuments',
  'appointment',
  'stopType',
  'totals',
]);
export type CanonicalBulkAppliedField = z.infer<typeof bulkAppliedFieldEnum>;

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

  // -------------------------------------------------------------------------
  // Stop review (spec Section 10). Everything below is set by a person on the
  // review screen, not by extraction — a model never fills these in.
  //
  // They live here rather than in a staging table for the reason Section 6
  // gives: "edits live in `reviewedExtraction`, not a normalised staging table
  // — resume-after-close works for free and there is no second schema to keep
  // in sync". All four are additive keys on an existing jsonb column, so NO DDL
  // was written for any of them.
  // -------------------------------------------------------------------------

  /**
   * Null until someone sets it. Not defaulted to `delivery`, because a default
   * that looks like an answer is how a fuel stop reaches a customer's dock: the
   * review screen shows an unset type as unset and asks.
   */
  stopType: stopTypeEnum.nullish(),

  /**
   * Paperwork required at this stop. Absent or empty means "whatever the trip
   * default is".
   *
   * OPTIONAL, NOT `.default([])`, and the three below are the same — unlike
   * `references` and `lineItems`, which extraction always produces and which are
   * therefore required on the type. Nothing in the extraction pipeline sets a
   * review field, so making them required would force every constructor of a
   * consignment (the spreadsheet parser, the merge step, every fixture) to
   * invent an empty array for a concept it has never heard of. Absent is the
   * honest value for "no person has been here yet".
   */
  requiredDocuments: z.array(requiredDocumentEnum).optional(),

  /**
   * Rollups a person typed over the computed line-item total.
   *
   * Per field rather than one flag, so the screen can mark the *pallet* count as
   * overridden while pieces still tracks the line items. `stops.rollup_overridden`
   * is a single boolean, so Phase 8 collapses this to `length > 0` — lossy in
   * one direction only, and the review screen is where the distinction is
   * actually looked at.
   */
  overriddenTotals: z.array(rollupFieldEnum).optional(),

  /** Which fields the bulk bar last wrote here. See `bulkAppliedFieldEnum`. */
  bulkAppliedFields: z.array(bulkAppliedFieldEnum).optional(),

  // -------------------------------------------------------------------------
  // Route template application (spec Section 8, Phase 6). Three more additive
  // keys on the same jsonb column — still NO DDL.
  // -------------------------------------------------------------------------

  /**
   * Where this row came from once a template was applied, and null until one is.
   *
   * It is what the "New" and "Not on today's manifest" badges read off, and it
   * is stored rather than recomputed because after application there is nothing
   * left to recompute from: the merge is the only moment both lists exist side
   * by side.
   */
  templateOrigin: templateOriginEnum.nullish(),

  /**
   * True for a stop the template has and today's document does not — included,
   * badged, and defaulted to skipped, per Section 8's "one tap to keep".
   *
   * A skipped stop is NOT committed as a trip stop and is NOT written into a
   * template saved from this list. It exists so that a consignee missing from
   * today's manifest is *visible* as missing: the alternative is an absent row,
   * and a page that failed to scan looks exactly like a day off.
   */
  skipped: z.boolean().nullish(),

  /**
   * The template's standing note for this stop.
   *
   * Deliberately NOT merged into `notes`. Section 8 splits them — the template
   * supplies standing notes, the import supplies per-stop notes — and one field
   * holding both would make applying a template destructive the moment a
   * dispatcher had typed anything, which is precisely when they would notice.
   */
  templateStandingNotes: z.string().nullish(),

  /**
   * The template's appointment offsets, in minutes from the route start, carried
   * onto the stop **for display only** (quick-515).
   *
   * These are NOT a window and no window is derived from them here. The offsets
   * anchor to the *trip's* start time, which is chosen on the Finish trip screen
   * and does not exist while an import is being reviewed — so materialising a
   * window at application time is impossible, and inventing one would put an
   * appointment on a stop that nobody agreed to. Phase 8's commit does the
   * arithmetic, against `Trip.scheduledDeparture`, using the code `trips.ts`
   * has always used.
   *
   * They are stored rather than re-read from the template at render time for the
   * same reason `templateStandingNotes` is: the review screen is a function of
   * the consignment array (Phase 5), it holds no template, and re-joining to one
   * after a reorder or an edit would mean re-deriving the merge on every read.
   * Storing a template-supplied FACT is not the same as storing a derived
   * window.
   */
  templateApptOffsetStartMin: z.number().int().nullish(),
  templateApptOffsetEndMin: z.number().int().nullish(),
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

  /**
   * Where the freight is collected from. On a manifest this is the shipper and
   * it is also who the carrier bills; on a rate confirmation it is the PICKUP
   * FACILITY, which is not who pays.
   */
  originName: z.string().nullish(),
  originAddress: addressSchema.nullish(),
  originContact: contactSchema.nullish(),

  /**
   * Who issued the document and owes the money — the broker on a rate
   * confirmation's letterhead.
   *
   * Separate from `origin*` because on a rate confirmation the two are
   * different companies and both matter: the issuer becomes the client, the
   * origin becomes the first stop. Conflating them put "MIDWEST DISTRIBUTION
   * CENTER" (a warehouse) forward as the client of a load that "APEX FREIGHT
   * BROKERAGE LLC" was paying for. Null on document types that have no separate
   * issuer, which is most of them.
   */
  issuerName: z.string().nullish(),
  issuerAddress: addressSchema.nullish(),
  issuerContact: contactSchema.nullish(),

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
