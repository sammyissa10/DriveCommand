/**
 * Spreadsheet mapper tests.
 * Spec Section 5: spreadsheets skip vision extraction entirely.
 */

import { describe, it, expect } from 'vitest';
import {
  isMappableField,
  parseSpreadsheet,
  rowToConsignment,
  suggestColumnMapping,
  type ColumnMapping,
} from '../spreadsheet';

const MAPPING: ColumnMapping = {
  Consignee: 'externalCode',
  Name: 'name',
  Address: 'address.line1',
  City: 'address.city',
  State: 'address.state',
  Zip: 'address.postalCode',
  Pieces: 'totals.pieces',
  Weight: 'totals.weight',
  Shipment: 'reference.SHIPMENT',
  Zone: 'groupLabel',
};

const CSV = [
  'Consignee,Name,Address,City,State,Zip,Pieces,Weight,Shipment,Zone',
  '43775,RUSS DARROW NISSAN,11212 W METRO BLVD,MILWAUKEE,WI,53224,4,88,77198347,WEST - MKE',
  '43776,BOUCHER KIA,1421 S MOORLAND RD,WAUKESHA,WI,53186,8,190,77198348,WEST - MKE',
].join('\n');

describe('suggestColumnMapping', () => {
  it('recognises common freight headings', () => {
    const m = suggestColumnMapping(['Consignee', 'Name', 'City', 'Zip', 'Pieces', 'PRO Num']);
    expect(m['Consignee']).toBe('externalCode');
    expect(m['Name']).toBe('name');
    expect(m['City']).toBe('address.city');
    expect(m['Zip']).toBe('address.postalCode');
    expect(m['Pieces']).toBe('totals.pieces');
    expect(m['PRO Num']).toBe('reference.PRO');
  });

  it('is case- and punctuation-insensitive', () => {
    const m = suggestColumnMapping(['SHIP_TO_NAME', 'postal code']);
    expect(m['SHIP_TO_NAME']).toBe('name');
    expect(m['postal code']).toBe('address.postalCode');
  });

  it('does not map one canonical field twice', () => {
    const m = suggestColumnMapping(['Name', 'Customer Name']);
    expect(Object.values(m).filter((v) => v === 'name')).toHaveLength(1);
  });

  it('leaves unrecognised headings unmapped rather than guessing', () => {
    const m = suggestColumnMapping(['Wibble', 'Frobnicate']);
    expect(m['Wibble']).toBeUndefined();
    expect(m['Frobnicate']).toBeUndefined();
  });
});

describe('rowToConsignment', () => {
  it('maps a row onto the canonical shape', () => {
    const c = rowToConsignment(
      {
        Consignee: '43775',
        Name: 'RUSS DARROW NISSAN',
        Address: '11212 W METRO BLVD',
        City: 'MILWAUKEE',
        State: 'WI',
        Zip: '53224',
        Pieces: '4',
        Weight: '88',
        Shipment: '77198347',
        Zone: 'WEST - MKE',
      },
      MAPPING,
      2,
    );

    expect(c).not.toBeNull();
    expect(c!.externalCode).toBe('43775');
    expect(c!.name).toBe('RUSS DARROW NISSAN');
    expect(c!.address.city).toBe('MILWAUKEE');
    expect(c!.totals.pieces).toBe(4);
    expect(c!.totals.weight).toBe(88);
    expect(c!.totals.weightUom).toBe('LBS');
    expect(c!.references).toEqual([{ type: 'SHIPMENT', value: '77198347' }]);
    expect(c!.groupLabel).toBe('WEST - MKE');
    expect(c!.pageNumbers).toEqual([2]);
  });

  it('strips units and separators from numeric cells', () => {
    const c = rowToConsignment({ Name: 'X', Weight: '1,234 lbs', Pieces: '4' }, MAPPING, 2);
    expect(c!.totals.weight).toBe(1234);
  });

  it('returns null when the name cell is empty', () => {
    expect(rowToConsignment({ Name: '   ', Consignee: '1' }, MAPPING, 5)).toBeNull();
  });

  it('ignores a mapped column the row does not contain', () => {
    const c = rowToConsignment({ Name: 'X' }, MAPPING, 2);
    expect(c!.address.city).toBeNull();
    expect(c!.totals.pieces).toBeNull();
  });
});

describe('parseSpreadsheet', () => {
  it('parses a mapped CSV into consignments', () => {
    const r = parseSpreadsheet({ csv: CSV, mapping: MAPPING });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.extraction.consignments).toHaveLength(2);
    expect(r.extraction.documentType).toBe('DELIVERY_SCHEDULE');
    expect(r.extraction.consignments[0].name).toBe('RUSS DARROW NISSAN');
    expect(r.extraction.consignments[1].totals.pieces).toBe(8);
  });

  it('merges a repeated consignee across rows, exactly like the photo path', () => {
    const csv = [
      'Consignee,Name,Pieces,Shipment',
      '43775,RUSS DARROW NISSAN,4,77198347',
      '43775,RUSS DARROW NISSAN,1,77203176',
    ].join('\n');

    const r = parseSpreadsheet({
      csv,
      mapping: { Consignee: 'externalCode', Name: 'name', Pieces: 'totals.pieces', Shipment: 'reference.SHIPMENT' },
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.extraction.consignments).toHaveLength(1);
    expect(r.extraction.consignments[0].totals.pieces).toBe(5);
    expect(r.mergedCount).toBe(1);
  });

  it('asks for a mapping the first time, with a suggestion, rather than guessing', () => {
    const r = parseSpreadsheet({ csv: CSV, mapping: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('NO_MAPPING');
    expect(r.headers).toContain('Consignee');
    expect(r.suggestedMapping?.['Name']).toBe('name');
  });

  it('refuses a mapping with no name column', () => {
    const r = parseSpreadsheet({ csv: CSV, mapping: { Consignee: 'externalCode' } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('NAME_NOT_MAPPED');
  });

  it('warns about a nameless row instead of dropping it silently', () => {
    const csv = ['Consignee,Name,Pieces', '43775,RUSS DARROW,4', '43776,,8'].join('\n');
    const r = parseSpreadsheet({
      csv,
      mapping: { Consignee: 'externalCode', Name: 'name', Pieces: 'totals.pieces' },
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.extraction.consignments).toHaveLength(1);
    expect(r.extraction.extractionWarnings.some((w) => w.code === 'ROW_MISSING_NAME')).toBe(true);
  });

  it('reports an empty file cleanly', () => {
    const r = parseSpreadsheet({ csv: '   ', mapping: MAPPING });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('EMPTY_FILE');
  });

  it('reports a file with headers but no data rows as zero consignments', () => {
    const r = parseSpreadsheet({ csv: 'Consignee,Name,Pieces', mapping: MAPPING });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('ZERO_CONSIGNMENTS');
  });

  it('carries header metadata through to the extraction', () => {
    const r = parseSpreadsheet({
      csv: CSV,
      mapping: MAPPING,
      documentNumber: 'M-77',
      documentDate: '2026-07-27',
      originName: 'DEALER TIRE - CHICAGO WHSE',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.extraction.header.documentNumber).toBe('M-77');
    expect(r.extraction.header.documentDate).toBe('2026-07-27');
    expect(r.extraction.header.originName).toBe('DEALER TIRE - CHICAGO WHSE');
  });
});

describe('isMappableField', () => {
  it('accepts known paths and rejects invented ones', () => {
    expect(isMappableField('address.city')).toBe(true);
    expect(isMappableField('reference.SHIPMENT')).toBe(true);
    expect(isMappableField('address.planet')).toBe(false);
  });
});
