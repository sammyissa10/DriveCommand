/**
 * Merge logic tests.
 *
 * The headline case is spec Section 1.3 and Phase 1 verify check #1:
 * consignee 43775 twice, quantities 4 and 1 → ONE stop, quantity 5, both pages.
 */

import { describe, it, expect } from 'vitest';
import type { CanonicalConsignment, PageExtraction } from '@drivecommand/validation';
import { assemblePages, consigneeKey, mergeConsignmentPair, shipmentRefOf } from '../merge';

// ---------------------------------------------------------------------------
// Fixtures — modelled on the real page in spec Section 1.2
// ---------------------------------------------------------------------------

function consignment(over: Partial<CanonicalConsignment> = {}): CanonicalConsignment {
  return {
    pageNumbers: [],
    externalCode: null,
    name: 'TEST CONSIGNEE',
    address: {},
    contact: null,
    groupLabel: null,
    appointment: null,
    references: [],
    totals: {},
    lineItems: [],
    notes: null,
    fieldConfidence: {},
    ...over,
  };
}

/** BLOCK 1 from spec Section 1.3: shipment 77198347, 4 pieces, 88 lbs. */
const RUSS_DARROW_BLOCK_1 = consignment({
  pageNumbers: [4],
  externalCode: '43775',
  name: 'RUSS DARROW NISSAN',
  address: { line1: '11212 W METRO BLVD', city: 'MILWAUKEE', state: 'WI', postalCode: '53224' },
  groupLabel: 'WEST - MKE',
  references: [{ type: 'SHIPMENT', value: '77198347' }],
  totals: { pieces: 4, pallets: 0, weight: 88, weightUom: 'LBS' },
  lineItems: [{ sku: 'Item 157230', description: 'Loose Tires @ 77.5', quantity: 4, weight: 88 }],
});

/** BLOCK 2, same page, same consignee, DIFFERENT shipment: 1 piece, 26 lbs. */
const RUSS_DARROW_BLOCK_2 = consignment({
  pageNumbers: [4],
  externalCode: '43775',
  name: 'RUSS DARROW NISSAN',
  address: { line1: '11212 W METRO BLVD', city: 'MILWAUKEE', state: 'WI', postalCode: '53224' },
  references: [{ type: 'SHIPMENT', value: '77203176' }],
  totals: { pieces: 1, pallets: 0, weight: 26, weightUom: 'LBS' },
  lineItems: [{ sku: 'Item 157230', description: 'Loose Tires', quantity: 1, weight: 26 }],
});

function page(pageNumber: number, consignments: CanonicalConsignment[]): {
  pageNumber: number;
  extraction: PageExtraction;
} {
  return {
    pageNumber,
    extraction: {
      documentType: 'MANIFEST',
      header: {},
      consignments,
      extractionWarnings: [],
    },
  };
}

// ---------------------------------------------------------------------------

describe('consigneeKey', () => {
  it('keys on external code when present, ignoring name and address noise', () => {
    const a = consignment({ externalCode: '43775', name: 'RUSS DARROW NISSAN' });
    const b = consignment({ externalCode: '43775', name: 'Russ Darrow Nissan Inc.' });
    expect(consigneeKey(a)).toBe(consigneeKey(b));
  });

  it('falls back to name + postcode when no code is present', () => {
    const a = consignment({ name: 'HALL FORD', address: { postalCode: '53072' } });
    const b = consignment({ name: 'Hall  Ford', address: { postalCode: '53072' } });
    expect(consigneeKey(a)).toBe(consigneeKey(b));
  });

  it('does not collide two different codes', () => {
    expect(consigneeKey(consignment({ externalCode: '43775' })))
      .not.toBe(consigneeKey(consignment({ externalCode: '43776' })));
  });
});

describe('shipmentRefOf', () => {
  it('prefers SHIPMENT over PRO', () => {
    const c = consignment({
      references: [
        { type: 'PRO', value: 'P123' },
        { type: 'SHIPMENT', value: 'S999' },
      ],
    });
    expect(shipmentRefOf(c)).toBe('SHIPMENT:s999');
  });

  it('returns null when no distinguishing reference exists', () => {
    expect(shipmentRefOf(consignment({ references: [{ type: 'PO', value: 'JEFF GREEN' }] }))).toBeNull();
  });
});

describe('the case that proves the design (spec 1.3)', () => {
  it('merges consignee 43775 twice into ONE stop with quantity 5 and both pages', () => {
    const { extraction, mergedCount } = assemblePages([
      page(4, [RUSS_DARROW_BLOCK_1, RUSS_DARROW_BLOCK_2]),
    ]);

    expect(extraction.consignments).toHaveLength(1);
    expect(mergedCount).toBe(1);

    const stop = extraction.consignments[0];
    expect(stop.name).toBe('RUSS DARROW NISSAN');
    expect(stop.externalCode).toBe('43775');

    // 4 + 1 = 5 tires. The truck goes once and drops five.
    expect(stop.totals.pieces).toBe(5);
    expect(stop.totals.weight).toBe(114); // 88 + 26
    expect(stop.totals.weightUom).toBe('LBS');

    // Both shipment numbers survive — the warehouse will ask for them.
    const shipmentValues = stop.references.filter((r) => r.type === 'SHIPMENT').map((r) => r.value);
    expect(shipmentValues).toEqual(['77198347', '77203176']);

    // pages [4, 4] deduplicates to [4]
    expect(stop.pageNumbers).toEqual([4]);

    // Per-shipment line-item breakdown is preserved, not collapsed.
    expect(stop.lineItems).toHaveLength(2);
  });
});

describe('page spans vs repeats', () => {
  it('does NOT sum when the same shipment ref spans a page break', () => {
    const first = consignment({
      pageNumbers: [4],
      externalCode: '43775',
      name: 'RUSS DARROW NISSAN',
      references: [{ type: 'SHIPMENT', value: '77198347' }],
      totals: { pieces: 4, weight: 88, weightUom: 'LBS' },
    });
    // Same shipment, continued onto page 5. Summing here would double-count.
    const continued = consignment({
      pageNumbers: [5],
      externalCode: '43775',
      name: 'RUSS DARROW NISSAN',
      references: [{ type: 'SHIPMENT', value: '77198347' }],
      totals: { pieces: 4, weight: 88, weightUom: 'LBS' },
    });

    const { extraction } = assemblePages([page(4, [first]), page(5, [continued])]);

    expect(extraction.consignments).toHaveLength(1);
    expect(extraction.consignments[0].totals.pieces).toBe(4);
    expect(extraction.consignments[0].totals.weight).toBe(88);
    expect(extraction.consignments[0].pageNumbers).toEqual([4, 5]);
  });

  it('DOES sum across pages when shipment refs differ', () => {
    const { extraction } = assemblePages([
      page(4, [RUSS_DARROW_BLOCK_1]),
      page(9, [{ ...RUSS_DARROW_BLOCK_2, pageNumbers: [9] }]),
    ]);

    expect(extraction.consignments).toHaveLength(1);
    expect(extraction.consignments[0].totals.pieces).toBe(5);
    expect(extraction.consignments[0].pageNumbers).toEqual([4, 9]);
  });

  it('warns and does not sum when a repeat has no shipment reference at all', () => {
    const a = consignment({ pageNumbers: [1], externalCode: '999', name: 'ACME', totals: { pieces: 3 } });
    const b = consignment({ pageNumbers: [2], externalCode: '999', name: 'ACME', totals: { pieces: 2 } });

    const { extraction } = assemblePages([page(1, [a]), page(2, [b])]);

    expect(extraction.consignments).toHaveLength(1);
    expect(extraction.consignments[0].totals.pieces).toBe(3); // not 5 — ambiguous
    expect(extraction.extractionWarnings.some((w) => w.code === 'AMBIGUOUS_REPEAT')).toBe(true);
  });
});

describe('assembly', () => {
  it('preserves first-appearance order across pages', () => {
    const { extraction } = assemblePages([
      page(2, [consignment({ externalCode: 'B', name: 'BOUCHER KIA' })]),
      page(1, [consignment({ externalCode: 'A', name: 'RUSS DARROW' })]),
      page(3, [consignment({ externalCode: 'C', name: 'HALL FORD' })]),
    ]);
    // Pages are sorted before assembly, so document order wins over input order.
    expect(extraction.consignments.map((c) => c.name)).toEqual([
      'RUSS DARROW',
      'BOUCHER KIA',
      'HALL FORD',
    ]);
  });

  it('takes header fields from the first page that carries them', () => {
    const { extraction } = assemblePages([
      {
        pageNumber: 1,
        extraction: {
          documentType: 'MANIFEST',
          header: { documentDate: '2026-07-27', originName: 'DEALER TIRE - CHICAGO WHSE' },
          consignments: [consignment({ externalCode: 'A' })],
          extractionWarnings: [],
        },
      },
      {
        pageNumber: 2,
        extraction: {
          documentType: 'MANIFEST',
          header: { totalPages: 16 },
          consignments: [consignment({ externalCode: 'B' })],
          extractionWarnings: [],
        },
      },
    ]);

    expect(extraction.header.documentDate).toBe('2026-07-27');
    expect(extraction.header.originName).toBe('DEALER TIRE - CHICAGO WHSE');
    expect(extraction.header.totalPages).toBe(16);
  });

  it('stamps the page number when the model omitted it', () => {
    const { extraction } = assemblePages([page(7, [consignment({ externalCode: 'X', pageNumbers: [] })])]);
    expect(extraction.consignments[0].pageNumbers).toEqual([7]);
  });

  it('carries page warnings up to the document', () => {
    const { extraction } = assemblePages([
      {
        pageNumber: 3,
        extraction: {
          documentType: 'MANIFEST',
          header: {},
          consignments: [consignment({ externalCode: 'A' })],
          extractionWarnings: [{ code: 'HANDWRITING', message: 'green M in margin', pageNumbers: [] }],
        },
      },
    ]);
    const w = extraction.extractionWarnings.find((x) => x.code === 'HANDWRITING');
    expect(w?.pageNumbers).toEqual([3]);
  });

  it('handles an empty page list without throwing', () => {
    const { extraction } = assemblePages([]);
    expect(extraction.consignments).toEqual([]);
  });
});

describe('mergeConsignmentPair', () => {
  it('refuses to add weights across different units, and warns', () => {
    const lbs = consignment({ externalCode: 'A', totals: { weight: 100, weightUom: 'LBS' } });
    const kg = consignment({ externalCode: 'A', totals: { weight: 50, weightUom: 'KG' } });

    const { consignment: merged, warnings } = mergeConsignmentPair(lbs, kg, true);

    expect(merged.totals.weight).toBe(100); // not 150
    expect(warnings.some((w) => w.code === 'MIXED_WEIGHT_UNITS')).toBe(true);
  });

  it('keeps the lower confidence for a field seen twice', () => {
    const a = consignment({ externalCode: 'A', fieldConfidence: { name: 0.99, 'address.city': 0.8 } });
    const b = consignment({ externalCode: 'A', fieldConfidence: { name: 0.4 } });

    const { consignment: merged } = mergeConsignmentPair(a, b, true);
    expect(merged.fieldConfidence.name).toBe(0.4);
    expect(merged.fieldConfidence['address.city']).toBe(0.8);
  });

  it('fills address gaps from the second block', () => {
    const a = consignment({ externalCode: 'A', address: { line1: '11212 W METRO BLVD' } });
    const b = consignment({ externalCode: 'A', address: { city: 'MILWAUKEE', postalCode: '53224' } });

    const { consignment: merged } = mergeConsignmentPair(a, b, true);
    expect(merged.address.line1).toBe('11212 W METRO BLVD');
    expect(merged.address.city).toBe('MILWAUKEE');
    expect(merged.address.postalCode).toBe('53224');
  });

  it('de-duplicates identical references', () => {
    const a = consignment({ externalCode: 'A', references: [{ type: 'PRO', value: 'P1' }] });
    const b = consignment({ externalCode: 'A', references: [{ type: 'PRO', value: 'P1' }] });
    const { consignment: merged } = mergeConsignmentPair(a, b, true);
    expect(merged.references).toHaveLength(1);
  });

  it('joins differing notes rather than dropping one', () => {
    const a = consignment({ externalCode: 'A', notes: 'Call ahead' });
    const b = consignment({ externalCode: 'A', notes: 'Dock 4' });
    const { consignment: merged } = mergeConsignmentPair(a, b, true);
    expect(merged.notes).toBe('Call ahead\nDock 4');
  });

  it('keeps zero-quantity substitution rows (spec 1.2 callout 14)', () => {
    const a = consignment({
      externalCode: 'A',
      lineItems: [
        { sku: 'Item 157230', quantity: 4 },
        { sku: 'Item 197592 subs', quantity: 0 },
        { sku: 'NMFC# 150390-04', description: 'Wooden Pallet', quantity: 0 },
      ],
    });
    const b = consignment({ externalCode: 'A', lineItems: [{ sku: 'Item 157230', quantity: 1 }] });

    const { consignment: merged } = mergeConsignmentPair(a, b, true);
    expect(merged.lineItems).toHaveLength(4);
    expect(merged.lineItems.filter((li) => li.quantity === 0)).toHaveLength(2);
  });
});
