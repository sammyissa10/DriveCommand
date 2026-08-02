/**
 * Spreadsheet path — CSV to the canonical shape, with no vision model.
 *
 * Spec: docs/specs/DocumentImport_TechnicalSpec_v1.md Section 5.
 * "Spreadsheets skip vision extraction entirely: parse the sheet, map columns
 *  once per client, save the mapping to the document profile, reuse silently."
 *
 * SCOPE LIMIT — .xlsx is NOT supported in v1.
 * No spreadsheet library is installed in either app (audit C14/D1) and this
 * module may not add one. `.xlsx` is rejected upstream in `pages.ts` with a
 * message naming CSV. CSV is parsed with `papaparse`, which IS installed and is
 * already used elsewhere in the app.
 *
 * Once a mapping exists on the client's document profile it is applied silently,
 * which is the whole point: map once, reuse 300 times.
 */

import Papa from 'papaparse';
import {
  canonicalExtractionSchema,
  referenceTypeEnum,
  type CanonicalConsignment,
  type CanonicalExtraction,
  type CanonicalReference,
  type ExtractionWarning,
  type ReferenceType,
} from '@drivecommand/validation';
import { assemblePages } from './merge';

// ---------------------------------------------------------------------------
// Column mapping
// ---------------------------------------------------------------------------

/**
 * Canonical destinations a spreadsheet column can be mapped to. Kept as a flat
 * list of dotted paths so the mapping stored on the document profile is plain
 * JSON a human can read and hand-edit.
 */
export const MAPPABLE_FIELDS = [
  'externalCode',
  'name',
  'address.line1',
  'address.line2',
  'address.city',
  'address.state',
  'address.postalCode',
  'address.country',
  'contact.name',
  'contact.phone',
  'groupLabel',
  'appointment.earliest',
  'appointment.latest',
  'totals.pieces',
  'totals.pallets',
  'totals.weight',
  'notes',
  'reference.SHIPMENT',
  'reference.PRO',
  'reference.ORDER',
  'reference.PO',
  'reference.BOL',
  'reference.LOAD',
  'reference.SEAL',
  'reference.OTHER',
] as const;

export type MappableField = (typeof MAPPABLE_FIELDS)[number];

/** header text (as it appears in the file) -> canonical field path */
export type ColumnMapping = Record<string, MappableField>;

export function isMappableField(value: string): value is MappableField {
  return (MAPPABLE_FIELDS as readonly string[]).includes(value);
}

/** Header comparison ignores case, spaces, underscores, and punctuation. */
function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Best-effort first-time guess at a mapping, offered to the human for
 * confirmation. It is never applied silently — only a saved profile mapping is,
 * which keeps the module's governing rule intact: the system never guesses
 * silently (spec Section 1.6).
 */
const HEADER_SYNONYMS: Record<MappableField, string[]> = {
  externalCode: ['consignee', 'consigneecode', 'consigneeid', 'customercode', 'customerid', 'code', 'storecode'],
  name: ['name', 'consigneename', 'customername', 'dealer', 'dealername', 'shipto', 'shiptoname'],
  'address.line1': ['address', 'address1', 'addressline1', 'street', 'streetaddress', 'shiptoaddress'],
  'address.line2': ['address2', 'addressline2', 'suite', 'unit'],
  'address.city': ['city', 'town', 'shiptocity'],
  'address.state': ['state', 'province', 'st', 'shiptostate'],
  'address.postalCode': ['zip', 'zipcode', 'postal', 'postalcode', 'shiptozip'],
  'address.country': ['country'],
  'contact.name': ['contact', 'contactname', 'attn'],
  'contact.phone': ['phone', 'phonenumber', 'telephone', 'tel', 'contactphone'],
  groupLabel: ['zone', 'route', 'routezone', 'group', 'region', 'area'],
  'appointment.earliest': ['appointment', 'apptstart', 'earliest', 'windowstart', 'deliveryfrom'],
  'appointment.latest': ['apptend', 'latest', 'windowend', 'deliveryto'],
  'totals.pieces': ['pieces', 'pcs', 'qty', 'quantity', 'cartons', 'units'],
  'totals.pallets': ['pallets', 'plt', 'skids'],
  'totals.weight': ['weight', 'weightlbs', 'lbs', 'grossweight'],
  notes: ['notes', 'comments', 'instructions', 'specialinstructions', 'remarks'],
  'reference.SHIPMENT': ['shipment', 'shipmentnum', 'shipmentnumber', 'shipmentno'],
  'reference.PRO': ['pro', 'pronum', 'pronumber'],
  'reference.ORDER': ['order', 'ordernum', 'ordernumber', 'so', 'salesorder'],
  'reference.PO': ['po', 'ponum', 'ponumber', 'customerpo', 'purchaseorder'],
  'reference.BOL': ['bol', 'bolnum', 'bolnumber', 'billoflading'],
  'reference.LOAD': ['load', 'loadnum', 'loadnumber'],
  'reference.SEAL': ['seal', 'sealnum', 'sealnumber'],
  'reference.OTHER': [],
};

export function suggestColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const taken = new Set<MappableField>();

  for (const header of headers) {
    const n = normalizeHeader(header);
    if (!n) continue;
    for (const [field, synonyms] of Object.entries(HEADER_SYNONYMS) as Array<[MappableField, string[]]>) {
      if (taken.has(field)) continue;
      if (synonyms.includes(n)) {
        mapping[header] = field;
        taken.add(field);
        break;
      }
    }
  }
  return mapping;
}

// ---------------------------------------------------------------------------
// Row → consignment
// ---------------------------------------------------------------------------

function toNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const cleaned = value.replace(/[^0-9.\-]/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function text(value: string | undefined): string | null {
  const t = value?.trim();
  return t ? t : null;
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let node = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (typeof node[key] !== 'object' || node[key] === null) node[key] = {};
    node = node[key] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]] = value;
}

/**
 * One spreadsheet row becomes one consignment. Repeat consignees across rows are
 * merged afterwards by the same `assemblePages` used for photos — one merge
 * implementation, not two.
 */
export function rowToConsignment(
  row: Record<string, string>,
  mapping: ColumnMapping,
  rowNumber: number,
): CanonicalConsignment | null {
  const draft: Record<string, unknown> = {};
  const references: CanonicalReference[] = [];

  for (const [header, field] of Object.entries(mapping)) {
    const raw = row[header];
    if (raw === undefined) continue;

    if (field.startsWith('reference.')) {
      const type = field.slice('reference.'.length);
      const parsedType = referenceTypeEnum.safeParse(type);
      const value = text(raw);
      if (parsedType.success && value) {
        references.push({ type: parsedType.data as ReferenceType, value });
      }
      continue;
    }

    if (field === 'totals.pieces' || field === 'totals.pallets' || field === 'totals.weight') {
      setPath(draft, field, toNumber(raw));
      continue;
    }

    setPath(draft, field, text(raw));
  }

  const name = typeof draft.name === 'string' ? draft.name.trim() : '';
  // No name means no stop. Reported as a warning by the caller rather than
  // dropped in silence.
  if (!name) return null;

  const totals = (draft.totals as Record<string, unknown>) ?? {};
  const address = (draft.address as Record<string, unknown>) ?? {};

  return {
    pageNumbers: [rowNumber],
    externalCode: (draft.externalCode as string | null) ?? null,
    name,
    // Spelled out rather than spread, so an unmapped column is an explicit null
    // and the shape matches what the vision path produces. Downstream merge and
    // persistence both read this JSON; two shapes for "absent" invites bugs.
    address: {
      line1: (address.line1 as string | null) ?? null,
      line2: (address.line2 as string | null) ?? null,
      city: (address.city as string | null) ?? null,
      state: (address.state as string | null) ?? null,
      postalCode: (address.postalCode as string | null) ?? null,
      country: (address.country as string | null) ?? null,
    },
    contact: (draft.contact as CanonicalConsignment['contact']) ?? null,
    groupLabel: (draft.groupLabel as string | null) ?? null,
    appointment: (draft.appointment as CanonicalConsignment['appointment']) ?? null,
    references,
    totals: {
      pieces: (totals.pieces as number | null) ?? null,
      pallets: (totals.pallets as number | null) ?? null,
      weight: (totals.weight as number | null) ?? null,
      weightUom: totals.weight != null ? 'LBS' : null,
    },
    lineItems: [],
    notes: (draft.notes as string | null) ?? null,
    // A parsed cell is read exactly, not inferred — unlike a vision result,
    // there is no uncertainty to report.
    fieldConfidence: { name: 1 },
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export type SpreadsheetFailureCode =
  | 'EMPTY_FILE'
  | 'NO_HEADERS'
  | 'NO_MAPPING'
  | 'NAME_NOT_MAPPED'
  | 'ZERO_CONSIGNMENTS';

export interface SpreadsheetSuccess {
  ok: true;
  extraction: CanonicalExtraction;
  rowCount: number;
  mergedCount: number;
}

export interface SpreadsheetFailure {
  ok: false;
  code: SpreadsheetFailureCode;
  message: string;
  /** Present on NO_MAPPING so the UI can offer a pre-filled mapping screen. */
  headers?: string[];
  suggestedMapping?: ColumnMapping;
}

export type SpreadsheetResult = SpreadsheetSuccess | SpreadsheetFailure;

export interface ParseSpreadsheetOptions {
  csv: string;
  /** Saved mapping from the client's document profile. Absent on first sight. */
  mapping?: ColumnMapping | null;
  documentNumber?: string | null;
  documentDate?: string | null;
  originName?: string | null;
}

export function parseSpreadsheet(opts: ParseSpreadsheetOptions): SpreadsheetResult {
  const { csv, mapping, documentNumber, documentDate, originName } = opts;

  if (!csv || !csv.trim()) {
    return { ok: false, code: 'EMPTY_FILE', message: 'That file is empty.' };
  }

  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });

  const headers = (parsed.meta.fields ?? []).filter((h) => h && h.trim());
  if (headers.length === 0) {
    return {
      ok: false,
      code: 'NO_HEADERS',
      message: 'That file has no column headings. The first row must name the columns.',
    };
  }

  if (!mapping || Object.keys(mapping).length === 0) {
    return {
      ok: false,
      code: 'NO_MAPPING',
      message: 'This client has no saved column mapping yet. Match the columns once and it will be reused.',
      headers,
      suggestedMapping: suggestColumnMapping(headers),
    };
  }

  if (!Object.values(mapping).includes('name')) {
    return {
      ok: false,
      code: 'NAME_NOT_MAPPED',
      message: 'The column mapping has no consignee name. Map a column to the name before continuing.',
      headers,
      suggestedMapping: suggestColumnMapping(headers),
    };
  }

  const warnings: ExtractionWarning[] = [];
  const consignments: CanonicalConsignment[] = [];

  parsed.data.forEach((row, i) => {
    // +2: one for the header row, one because humans count from 1.
    const rowNumber = i + 2;
    const c = rowToConsignment(row, mapping, rowNumber);
    if (!c) {
      warnings.push({
        code: 'ROW_MISSING_NAME',
        message: `Row ${rowNumber} has no consignee name and was skipped.`,
        pageNumbers: [rowNumber],
      });
      return;
    }
    consignments.push(c);
  });

  if (consignments.length === 0) {
    return {
      ok: false,
      code: 'ZERO_CONSIGNMENTS',
      message: 'No delivery stops were found in that file. Check that the columns are mapped correctly.',
    };
  }

  // Reuse the photo merge so "same consignee twice" behaves identically whether
  // it arrived as two rows or two blocks on a page.
  const assembled = assemblePages([
    {
      pageNumber: 1,
      extraction: {
        documentType: 'DELIVERY_SCHEDULE',
        header: {},
        consignments,
        extractionWarnings: [],
      },
    },
  ]);

  const extraction = canonicalExtractionSchema.parse({
    documentType: 'DELIVERY_SCHEDULE',
    header: {
      documentNumber: documentNumber ?? null,
      documentDate: documentDate ?? null,
      totalPages: 1,
      originName: originName ?? null,
    },
    consignments: assembled.extraction.consignments,
    extractionWarnings: [...warnings, ...assembled.extraction.extractionWarnings],
  });

  return {
    ok: true,
    extraction,
    rowCount: parsed.data.length,
    mergedCount: assembled.mergedCount,
  };
}
