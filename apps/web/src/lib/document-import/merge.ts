/**
 * Consignment assembly and merge.
 *
 * Spec: docs/specs/DocumentImport_TechnicalSpec_v1.md Sections 1.3, 5, 14.
 *
 * THE CASE THIS EXISTS FOR (spec Section 1.3, from page 4 of a real manifest):
 *
 *   BLOCK 1                    BLOCK 2
 *   Consignee: 43775           Consignee: 43775
 *   RUSS DARROW NISSAN         RUSS DARROW NISSAN
 *   Shipment 77198347          Shipment 77203176
 *   4 pieces · 88 lbs          1 piece · 26 lbs
 *        |                          |
 *        +------------+-------------+
 *                     v
 *            ONE STOP · 5 tires · pages [4, 4]
 *
 * The truck goes once and drops five tires. Two shipments, one stop. If this
 * produces two stops, the driver notices on day one.
 *
 * Two different situations both land here and must not be confused:
 *
 *   REPEAT  — the same consignee appears twice with DIFFERENT shipment refs.
 *             Genuinely two shipments to one place. Sum the quantities, keep
 *             both shipment references, keep both page numbers.
 *
 *   SPAN    — one consignment's block is split by a page break, so the same
 *             consignee AND the same shipment ref appear on consecutive pages.
 *             This is ONE shipment printed across two pages. Summing here would
 *             double-count it.
 *
 * The discriminator is the shipment reference. Same consignee + same shipment
 * ref = span (union, do not sum). Same consignee + different shipment ref =
 * repeat (sum).
 */

import type {
  CanonicalConsignment,
  CanonicalExtraction,
  CanonicalLineItem,
  CanonicalReference,
  CanonicalTotals,
  ExtractionWarning,
  PageExtraction,
  ReferenceType,
} from '@drivecommand/validation';

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/** Loose normalisation for grouping only — NOT the Phase 4 address normaliser. */
function normalizeKeyPart(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

/**
 * The identity of a consignee.
 *
 * External code wins whenever present — that is the entire argument of spec
 * Section 1.5: names get typed differently and addresses get abbreviated
 * differently, but 43775 never changes. Falling back to name+postcode when a
 * document has no codes keeps the merge working on documents that lack them.
 */
export function consigneeKey(c: CanonicalConsignment): string {
  const code = normalizeKeyPart(c.externalCode);
  if (code) return `code:${code}`;
  const name = normalizeKeyPart(c.name);
  const postal = normalizeKeyPart(c.address?.postalCode);
  const street = normalizeKeyPart(c.address?.line1);
  return `name:${name}|${postal || street}`;
}

/**
 * The shipment reference that distinguishes a repeat from a page span.
 * SHIPMENT first (it is the per-delivery id, spec 1.2 callout 8), then PRO,
 * then BOL, then ORDER.
 */
const SHIPMENT_REF_PRIORITY: ReferenceType[] = ['SHIPMENT', 'PRO', 'BOL', 'ORDER'];

export function shipmentRefOf(c: CanonicalConsignment): string | null {
  for (const type of SHIPMENT_REF_PRIORITY) {
    const hit = c.references?.find((r) => r.type === type && r.value?.trim());
    if (hit) return `${type}:${normalizeKeyPart(hit.value)}`;
  }
  return null;
}

/** Full merge key: consignee + shipment ref. */
export function mergeKey(c: CanonicalConsignment): string {
  const ship = shipmentRefOf(c);
  return ship ? `${consigneeKey(c)}::${ship}` : consigneeKey(c);
}

// ---------------------------------------------------------------------------
// Field-level combination
// ---------------------------------------------------------------------------

function uniqueSortedPages(...lists: Array<number[] | undefined>): number[] {
  const all = new Set<number>();
  for (const l of lists) for (const n of l ?? []) all.add(n);
  return [...all].sort((a, b) => a - b);
}

/**
 * Union of references, de-duplicated on type+value.
 *
 * Both shipment numbers survive a repeat merge — the dispatcher needs to see
 * 77198347 AND 77203176 on the one stop, because the warehouse will ask.
 */
function unionReferences(
  a: CanonicalReference[] = [],
  b: CanonicalReference[] = [],
): CanonicalReference[] {
  const seen = new Set<string>();
  const out: CanonicalReference[] = [];
  for (const r of [...a, ...b]) {
    if (!r?.value?.trim()) continue;
    const k = `${r.type}:${normalizeKeyPart(r.value)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

/**
 * Line items concatenate rather than merge.
 *
 * Two shipments can legitimately contain the same SKU at different quantities,
 * and collapsing them would destroy the per-shipment breakdown the warehouse
 * printed. Zero-quantity substitution rows are kept for the same reason
 * (spec 1.2 callout 14).
 */
function concatLineItems(
  a: CanonicalLineItem[] = [],
  b: CanonicalLineItem[] = [],
): CanonicalLineItem[] {
  return [...a, ...b];
}

function addNullable(x: number | null | undefined, y: number | null | undefined): number | null {
  if (x === null || x === undefined) return y ?? null;
  if (y === null || y === undefined) return x;
  return x + y;
}

/**
 * Sum totals across a repeat. 4 pieces + 1 piece = 5.
 *
 * Mixed weight units are not silently added — the caller receives a warning and
 * the weight is left on the first unit seen, because guessing a conversion is
 * exactly the kind of silent guess spec Section 1.6 forbids.
 */
function sumTotals(
  a: CanonicalTotals = {},
  b: CanonicalTotals = {},
): { totals: CanonicalTotals; unitConflict: boolean } {
  const aUom = a.weightUom ?? null;
  const bUom = b.weightUom ?? null;
  const unitConflict = Boolean(aUom && bUom && aUom !== bUom);

  return {
    totals: {
      pieces: addNullable(a.pieces, b.pieces),
      pallets: addNullable(a.pallets, b.pallets),
      weight: unitConflict ? (a.weight ?? b.weight ?? null) : addNullable(a.weight, b.weight),
      weightUom: aUom ?? bUom,
    },
    unitConflict,
  };
}

/** Prefer whichever value is actually present; first wins on a tie. */
function coalesce<T>(a: T | null | undefined, b: T | null | undefined): T | null {
  if (a !== null && a !== undefined && a !== '') return a;
  if (b !== null && b !== undefined && b !== '') return b;
  return null;
}

function mergeAddress(
  a: CanonicalConsignment['address'],
  b: CanonicalConsignment['address'],
): CanonicalConsignment['address'] {
  return {
    line1: coalesce(a?.line1, b?.line1),
    line2: coalesce(a?.line2, b?.line2),
    city: coalesce(a?.city, b?.city),
    state: coalesce(a?.state, b?.state),
    postalCode: coalesce(a?.postalCode, b?.postalCode),
    country: coalesce(a?.country, b?.country),
  };
}

function mergeNotes(a: string | null | undefined, b: string | null | undefined): string | null {
  const av = a?.trim();
  const bv = b?.trim();
  if (av && bv) return av === bv ? av : `${av}\n${bv}`;
  return av || bv || null;
}

/** Lower confidence wins: a merged field is only as trustworthy as its worst source. */
function mergeConfidence(
  a: Record<string, number> = {},
  b: Record<string, number> = {},
): Record<string, number> {
  const out: Record<string, number> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = k in out ? Math.min(out[k], v) : v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pairwise merge
// ---------------------------------------------------------------------------

export interface MergeOutcome {
  consignment: CanonicalConsignment;
  warnings: ExtractionWarning[];
}

/**
 * Merge `incoming` into `base`.
 *
 * `sumQuantities` is the span-vs-repeat switch:
 *   true  — a repeat: two shipments to one consignee. Sum.
 *   false — a page span: one shipment printed twice. Union only.
 */
export function mergeConsignmentPair(
  base: CanonicalConsignment,
  incoming: CanonicalConsignment,
  sumQuantities: boolean,
): MergeOutcome {
  const warnings: ExtractionWarning[] = [];
  const pageNumbers = uniqueSortedPages(base.pageNumbers, incoming.pageNumbers);

  let totals: CanonicalTotals;
  if (sumQuantities) {
    const summed = sumTotals(base.totals, incoming.totals);
    totals = summed.totals;
    if (summed.unitConflict) {
      warnings.push({
        code: 'MIXED_WEIGHT_UNITS',
        message: `Consignee "${base.name}" has shipments in different weight units; weights were not added together.`,
        pageNumbers,
      });
    }
  } else {
    // Page span: the same shipment printed across a break. Take the richer of
    // the two rather than adding, or the totals double.
    totals = {
      pieces: coalesce(base.totals?.pieces, incoming.totals?.pieces),
      pallets: coalesce(base.totals?.pallets, incoming.totals?.pallets),
      weight: coalesce(base.totals?.weight, incoming.totals?.weight),
      weightUom: coalesce(base.totals?.weightUom, incoming.totals?.weightUom),
    };
  }

  return {
    consignment: {
      ...base,
      pageNumbers,
      externalCode: coalesce(base.externalCode, incoming.externalCode),
      name: base.name || incoming.name,
      address: mergeAddress(base.address, incoming.address),
      contact: base.contact ?? incoming.contact ?? null,
      groupLabel: coalesce(base.groupLabel, incoming.groupLabel),
      appointment: base.appointment ?? incoming.appointment ?? null,
      references: unionReferences(base.references, incoming.references),
      totals,
      lineItems: sumQuantities
        ? concatLineItems(base.lineItems, incoming.lineItems)
        : // On a span, line items printed twice are the same rows continued —
          // concatenating would duplicate them, so keep whichever list is fuller.
          (base.lineItems?.length ?? 0) >= (incoming.lineItems?.length ?? 0)
          ? base.lineItems
          : incoming.lineItems,
      notes: mergeNotes(base.notes, incoming.notes),
      fieldConfidence: mergeConfidence(base.fieldConfidence, incoming.fieldConfidence),
    },
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Whole-document assembly
// ---------------------------------------------------------------------------

export interface AssembleResult {
  extraction: CanonicalExtraction;
  /** How many consignments collapsed into an existing one. */
  mergedCount: number;
}

export interface PageInput {
  pageNumber: number;
  extraction: PageExtraction;
}

/**
 * Assemble ordered page extractions into one canonical document.
 *
 * Order is preserved: the first appearance of a consignee fixes its position in
 * the list, so stop order follows the document unless a human reorders it.
 */
export function assemblePages(pages: PageInput[]): AssembleResult {
  const ordered = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);

  const byKey = new Map<string, CanonicalConsignment>();
  const order: string[] = [];
  /** Shipment refs already folded in per consignee, to tell span from repeat. */
  const seenShipmentRefs = new Map<string, Set<string>>();

  const warnings: ExtractionWarning[] = [];
  let mergedCount = 0;

  let documentType: CanonicalExtraction['documentType'] = 'UNKNOWN';
  let header: CanonicalExtraction['header'] = {};

  for (const page of ordered) {
    const ex = page.extraction;

    if (documentType === 'UNKNOWN' && ex.documentType && ex.documentType !== 'UNKNOWN') {
      documentType = ex.documentType;
    }
    // Header fields come from whichever page first carried them. On a manifest
    // the origin block repeats on every page; taking the first non-null is both
    // correct and cheap.
    header = {
      documentNumber: coalesce(header.documentNumber, ex.header?.documentNumber),
      documentDate: coalesce(header.documentDate, ex.header?.documentDate),
      totalPages: coalesce(header.totalPages, ex.header?.totalPages),
      originName: coalesce(header.originName, ex.header?.originName),
      originAddress: header.originAddress ?? ex.header?.originAddress ?? null,
      originContact: header.originContact ?? ex.header?.originContact ?? null,
      // The issuer is usually printed once, on page 1 of a rate confirmation.
      // Same first-non-null rule as the origin block.
      issuerName: coalesce(header.issuerName, ex.header?.issuerName),
      issuerAddress: header.issuerAddress ?? ex.header?.issuerAddress ?? null,
      issuerContact: header.issuerContact ?? ex.header?.issuerContact ?? null,
      currency: coalesce(header.currency, ex.header?.currency),
      totalRate: coalesce(header.totalRate, ex.header?.totalRate),
    };

    for (const w of ex.extractionWarnings ?? []) {
      warnings.push({
        ...w,
        pageNumbers: w.pageNumbers?.length ? w.pageNumbers : [page.pageNumber],
      });
    }

    for (const raw of ex.consignments ?? []) {
      // Stamp the page if the model did not.
      const c: CanonicalConsignment = {
        ...raw,
        pageNumbers: raw.pageNumbers?.length ? raw.pageNumbers : [page.pageNumber],
      };

      const ckey = consigneeKey(c);
      const ship = shipmentRefOf(c);
      const existing = byKey.get(ckey);

      if (!existing) {
        byKey.set(ckey, c);
        order.push(ckey);
        seenShipmentRefs.set(ckey, new Set(ship ? [ship] : []));
        continue;
      }

      const refs = seenShipmentRefs.get(ckey)!;
      // No shipment ref anywhere: cannot distinguish span from repeat. Treat as
      // a span (do not sum) and warn — under-counting is visible to the human on
      // the review screen, silent double-counting is not.
      const isSpan = ship === null ? true : refs.has(ship);

      if (ship === null) {
        warnings.push({
          code: 'AMBIGUOUS_REPEAT',
          message: `Consignee "${c.name}" appears more than once with no shipment reference; quantities were not added. Check the totals.`,
          pageNumbers: uniqueSortedPages(existing.pageNumbers, c.pageNumbers),
        });
      }

      const { consignment, warnings: mergeWarnings } = mergeConsignmentPair(
        existing,
        c,
        /* sumQuantities */ !isSpan,
      );
      byKey.set(ckey, consignment);
      warnings.push(...mergeWarnings);
      if (ship) refs.add(ship);
      mergedCount += 1;
    }
  }

  return {
    extraction: {
      documentType,
      header,
      consignments: order.map((k) => byKey.get(k)!),
      extractionWarnings: warnings,
    },
    mergedCount,
  };
}
