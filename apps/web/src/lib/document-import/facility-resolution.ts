/**
 * The writing half of facility resolution. Everything in this phase that
 * touches the database with an INSERT or an UPDATE is in this file.
 *
 * Spec Section 7. Three entry points, and the difference between them is the
 * whole safety story of the phase:
 *
 * ```
 *   ensureStopsCommitted   T1 + T2 only.  Writes links the ladder DERIVED.
 *                          Cannot create a facility. Not reachable from a GET.
 *
 *   confirmStopFacility    A person tapped a facility.  Links it, records the
 *                          score they were shown, writes the external reference.
 *
 *   createStopFacility     A person tapped "create".  Creates the facility,
 *                          links it, writes the external reference.
 * ```
 *
 * ---------------------------------------------------------------------------
 * THE HARD RULE
 * ---------------------------------------------------------------------------
 * "T3 and T4 never create without a human tap. A polluted facility table is
 * unrecoverable and destroys the value of the external reference table
 * permanently."
 *
 * `createFacility` is called from exactly one place in this module —
 * `createStopFacility`, which takes a facility's details from a request body and
 * is reachable only from a POST. `ensureStopsCommitted` cannot create: it reads
 * link targets through `autoLinkTarget()`, which returns null for every T3 and
 * T4 verdict, and the T3/T4 members of `LadderVerdict` carry no facility id for
 * it to reach even if it tried. That is enforced by the type, by the call graph,
 * and by a test that hands the committer a tenant with zero facilities and a
 * document full of unmatched stops, and asserts the facility table is untouched.
 *
 * ---------------------------------------------------------------------------
 * NO WRITES IN ANY VIEW PATH
 * ---------------------------------------------------------------------------
 * `ensureStopsCommitted` mirrors `ensureClientCommitted` exactly: a silent T1 or
 * T2 is displayed the moment the ladder derives it, and written the first time a
 * mutation needs it to be real. It re-runs the ladder rather than trusting the
 * request, so what gets committed is what the server can still derive — not what
 * a tab decided some minutes ago. A stop the ladder no longer resolves silently
 * is simply left alone, exactly as the client version leaves an ambiguous match
 * alone and lets the caller's guard fire.
 *
 * **Phase 8 must call `ensureStopsCommitted` before reading stop links**, for
 * the same reason quick-510 recorded for `ensureContractCommitted`: an import
 * whose twelve stops all resolved silently and where nobody tapped anything has
 * nothing on its row, and a commit that reads the row would build a trip with no
 * facilities while the card that authorised it showed twelve.
 *
 * NO DDL. The links live in `document_imports.resolution_provenance` under a
 * `stops` key (jsonb, already there) and the confirmations live in
 * `facility_external_references` (Phase 1). Nothing here migrates anything.
 */

import { Prisma } from '@/generated/prisma';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';
import { createFacility, type FacilityCreateInput } from '@/lib/carrier/facilities';

import { normaliseAddress } from './address';
import { scoreNormalisedAddresses } from './facility-matching';
import { FACILITY_TYPE_FOR_ROLE } from './facility-constants';
import { facilityAddress, normaliseSourceCode, autoLinkTarget } from './facility-ladder';
import {
  decideStops,
  fingerprintOf,
  loadExternalReferences,
  loadFacilityCandidates,
  summariseStops,
  type StopResolutionView,
} from './facility-lookup';
import { ensureClientCommitted, ResolutionError } from './resolution';
import { getImportRecord, type ImportRecord } from './persistence';
import {
  provenanceOf,
  stampStop,
  type ResolutionProvenance,
  type StopProvenance,
  type StopProvenanceVia,
} from './provenance';

// ---------------------------------------------------------------------------
// Shared plumbing
// ---------------------------------------------------------------------------

/** Statuses in which stops may still be resolved. Mirrors `resolution.ts`. */
const EDITABLE: readonly string[] = ['NEEDS_REVIEW', 'READY'];

function assertEditable(record: ImportRecord): void {
  if (!EDITABLE.includes(record.status)) {
    throw new ResolutionError(
      `This import is ${record.status.replace(/_/g, ' ').toLowerCase()} and its stops can no longer be changed.`,
      'BAD_STATUS',
    );
  }
}

async function requireRecord(orgId: string, userId: string, importId: string): Promise<ImportRecord> {
  const record = await getImportRecord(orgId, importId, userId);
  if (!record) throw new ResolutionError('Import not found.', 'NOT_FOUND');
  return record;
}

/**
 * Merge stop records into the row's provenance and write them, in one statement.
 *
 * Read-modify-write in memory, the same way `assignClient` does it: Prisma
 * exposes no jsonb `||` operator, and the read has already happened, so the
 * merge costs nothing. The `client` and `contract` keys are carried across
 * untouched — a stop write must never drop the client's provenance, which is
 * the record of who decided the thing every stop hangs off.
 */
async function writeStopProvenance(
  orgId: string,
  userId: string,
  record: ImportRecord,
  entries: Record<string, StopProvenance>,
): Promise<ImportRecord> {
  if (Object.keys(entries).length === 0) return record;

  const db = await getTenantPrismaForOrg(orgId, userId);
  const current = provenanceOf(record);
  const next: ResolutionProvenance = {
    ...current,
    stops: { ...(current.stops ?? {}), ...entries },
  };

  await db.documentImport.updateMany({
    where: { id: record.id, orgId, deletedAt: null },
    data: {
      resolutionProvenance: next as Prisma.InputJsonValue,
      updatedById: userId,
    },
  });

  const fresh = await getImportRecord(orgId, record.id, userId);
  return fresh ?? record;
}

/**
 * Which rung of the ladder produced a confirmed link.
 *
 * **This is not the provenance via, and the difference is enforced by the
 * database.** `facility_external_references.resolved_via` carries a CHECK —
 * `resolved_via IS NULL OR resolved_via IN ('T1','T2','T3','T4')` — matching the
 * column's own documentation ("how this link came to exist: T1/T2/T3/T4 of the
 * resolution ladder"). Writing `EXTERNAL_REF` or `MANUAL` there is a Postgres
 * 23514 on every single confirmation, which is the highest-value write in the
 * module. The richer vocabulary stays where it has somewhere to live: the jsonb
 * provenance on the import row.
 *
 * `MANUAL` maps to `T3` rather than to whatever tier the stop had been on,
 * because what the row records is how the *link* came to exist, and a person
 * picking from a list is T3 whether the list was proposed to them or they went
 * looking for it.
 */
const REFERENCE_TIER: Record<StopProvenanceVia, 'T1' | 'T2' | 'T3' | 'T4'> = {
  EXTERNAL_REF: 'T1',
  NORMALISED_ADDRESS: 'T2',
  MANUAL: 'T3',
  MANUAL_CREATE: 'T4',
};

/**
 * Write the `(tenant, client, code) -> facility` link that makes tomorrow silent.
 *
 * **The point of the entire module.** Day one a person confirms that `43775` is
 * Russ Darrow Nissan; every day after, T1 answers it and nobody is asked.
 *
 * The code is stored normalised because `UNIQUE (org_id, client_id, source_code)`
 * is what deduplicates it, and `43775` and `#43775 ` must not become two rows
 * that disagree. The name as printed is kept alongside in `source_name`, which
 * is the evidence half of the "why".
 *
 * An upsert rather than a create: when a person corrects a link the reference
 * must follow them, or the correction would be undone by T1 on the next import.
 * A stop with no code on the document writes nothing — there is no key to write
 * — and that is a silent no-op by design, not a failure.
 */
async function writeExternalReference(
  orgId: string,
  userId: string,
  args: {
    clientId: string | null;
    sourceCode: string | null;
    sourceName: string | null;
    facilityId: string;
    importId: string;
    via: StopProvenanceVia;
  },
): Promise<boolean> {
  const code = normaliseSourceCode(args.sourceCode);
  if (!code || !args.clientId) return false;

  const db = await getTenantPrismaForOrg(orgId, userId);
  const resolvedVia = REFERENCE_TIER[args.via];

  await db.facilityExternalReference.upsert({
    where: { orgId_clientId_sourceCode: { orgId, clientId: args.clientId, sourceCode: code } },
    create: {
      orgId,
      clientId: args.clientId,
      sourceCode: code,
      facilityId: args.facilityId,
      resolvedVia,
      sourceImportId: args.importId,
      sourceName: args.sourceName,
      confirmedById: userId,
      createdById: userId,
      updatedById: userId,
    },
    update: {
      facilityId: args.facilityId,
      resolvedVia,
      sourceName: args.sourceName,
      confirmedById: userId,
      updatedById: userId,
    },
  });
  return true;
}

async function loadContext(orgId: string, userId: string, record: ImportRecord) {
  const db = await getTenantPrismaForOrg(orgId, userId);
  const [candidates, referencesByCode] = await Promise.all([
    loadFacilityCandidates(db, orgId),
    loadExternalReferences(db, orgId, record.clientId),
  ]);
  return { db, candidates, referencesByCode };
}

async function viewOf(orgId: string, userId: string, record: ImportRecord): Promise<StopResolutionView> {
  const { candidates, referencesByCode } = await loadContext(orgId, userId, record);
  return summariseStops(decideStops(record, { candidates, referencesByCode }));
}

// ---------------------------------------------------------------------------
// T1 + T2 — silent, and committed at the mutation boundary
// ---------------------------------------------------------------------------

/**
 * Persist every stop the ladder resolves on its own, at the moment it first
 * matters.
 *
 * The client is committed first, because the external reference is keyed on it:
 * a T2 backfill with no client has nowhere to go, and T1 cannot even be looked
 * up. `ensureClientCommitted` is reused wholesale rather than reimplemented, so
 * a stop write leaves exactly the trail a client pick leaves. When the client
 * still will not resolve, the silent links are written anyway and the reference
 * rows are skipped — the link is a fact about this import and does not need a
 * client; the reference is a fact about a client and does.
 *
 * **This function cannot create a facility.** See the file header.
 */
export async function ensureStopsCommitted(
  orgId: string,
  userId: string,
  record: ImportRecord,
): Promise<ImportRecord> {
  const withClient = await ensureClientCommitted(orgId, userId, record);
  const { candidates, referencesByCode } = await loadContext(orgId, userId, withClient);
  const decisions = decideStops(withClient, { candidates, referencesByCode });

  const entries: Record<string, StopProvenance> = {};
  let references = 0;

  for (const decision of decisions) {
    if (!decision.verdict) continue; // already on the row
    const auto = autoLinkTarget(decision.verdict);
    if (!auto) continue; // T3 and T4 carry no target, and never will

    const verdict = decision.verdict;
    const via: StopProvenanceVia = auto.tier === 'T1' ? 'EXTERNAL_REF' : 'NORMALISED_ADDRESS';
    const matchedText = verdict.tier === 'T1' ? verdict.sourceCode : verdict.tier === 'T2' ? verdict.matchedText : null;

    entries[String(decision.slot.index)] = stampStop(
      {
        via,
        facilityId: auto.facilityId,
        // Both rungs are exact matches, not guesses. 1 everywhere in this
        // module means "the two normalised values were identical".
        score: 1,
        matchedText,
        sourceCode: decision.slot.sourceCode,
        stopFingerprint: decision.fingerprint,
      },
      userId,
    );

    // The T2 backfill spec Section 7 draws: a stop that matched on address and
    // carried a code becomes a T1 next time, with no tap either time.
    if (auto.tier === 'T2') {
      const wrote = await writeExternalReference(orgId, userId, {
        clientId: withClient.clientId,
        sourceCode: decision.slot.sourceCode,
        sourceName: decision.slot.documentName,
        facilityId: auto.facilityId,
        importId: withClient.id,
        via,
      });
      if (wrote) references++;
    }
  }

  if (Object.keys(entries).length === 0) return withClient;

  const updated = await writeStopProvenance(orgId, userId, withClient, entries);
  logger.info('[document-import] committed auto-resolved stops', {
    importId: withClient.id,
    stops: Object.keys(entries).length,
    referencesBackfilled: references,
  });
  return updated;
}

// ---------------------------------------------------------------------------
// T3 and T4 — a human tapped
// ---------------------------------------------------------------------------

/** The consignment at an index, or a 400. Never a silent no-op. */
function requireStop(record: ImportRecord, orgId: string, userId: string, index: number) {
  if (!Number.isInteger(index) || index < 0) {
    throw new ResolutionError('That stop does not exist on this document.', 'INVALID_STOP');
  }
  return index;
}

/**
 * Link a stop to a facility a person chose.
 *
 * This is the only path out of T3, and it is reachable only from a POST — which
 * is what "requires a human tap" means in practice. The score recorded is the
 * one the person was shown: recomputed here from the same scorer against the
 * same two addresses, so it is the number that was on screen rather than one a
 * client sent, and a client cannot inflate it.
 *
 * Manually re-picking a stop that had already resolved silently goes through
 * here too, and correctly overwrites both the link and the reference: a person
 * correcting the machine is the most important write in the module.
 */
export async function confirmStopFacility(
  orgId: string,
  userId: string,
  importId: string,
  stopIndex: number,
  facilityId: string,
): Promise<StopResolutionView> {
  const record = await requireRecord(orgId, userId, importId);
  assertEditable(record);
  requireStop(record, orgId, userId, stopIndex);

  // The client is what the external reference is keyed on. Committing it here
  // mirrors `assignContract`, and the guard below is the same guard.
  const withClient = await ensureClientCommitted(orgId, userId, record);
  if (!withClient.clientId) {
    throw new ResolutionError('Pick the client before resolving stops.', 'NO_CLIENT');
  }

  const { candidates, referencesByCode } = await loadContext(orgId, userId, withClient);
  const facility = candidates.find((f) => f.id === facilityId);
  // Not found means: not in this tenant, soft-deleted, or a driver residence.
  // All three are the same answer to the caller and none of them says which.
  if (!facility) throw new ResolutionError('That facility is not available.', 'INVALID_FACILITY');

  const decisions = decideStops(withClient, { candidates, referencesByCode });
  const decision = decisions[stopIndex];
  if (!decision) throw new ResolutionError('That stop does not exist on this document.', 'INVALID_STOP');

  const score = scoreNormalisedAddresses(
    normaliseAddress(decision.consignment.address ?? {}),
    normaliseAddress(facilityAddress(facility)),
  );

  // Silent stops are committed alongside, for the same reason the contract
  // mutations commit the client: the moment anything on this import becomes
  // real, everything the card already showed as decided should be real too.
  const committed = await ensureStopsCommitted(orgId, userId, withClient);

  const entry = stampStop(
    {
      via: 'MANUAL',
      facilityId,
      // What the person was looking at when they tapped. A confirmed proposal
      // is not a certainty and the record should not pretend it was one.
      score: score.score,
      matchedText: facility.name,
      sourceCode: decision.slot.sourceCode,
      stopFingerprint: decision.fingerprint,
    },
    userId,
  );

  const updated = await writeStopProvenance(orgId, userId, committed, { [String(stopIndex)]: entry });

  await writeExternalReference(orgId, userId, {
    clientId: withClient.clientId,
    sourceCode: decision.slot.sourceCode,
    sourceName: decision.slot.documentName,
    facilityId,
    importId: importId,
    via: 'MANUAL',
  });

  logger.info('[document-import] stop linked by hand', {
    importId, stopIndex, facilityId, score: score.score,
  });

  return viewOf(orgId, userId, updated);
}

// ---------------------------------------------------------------------------

export interface CreateStopFacilityInput {
  name: string;
  facilityType?: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
}

/**
 * The five values `facilities_facility_type_check` admits for a facility a
 * person creates here.
 *
 * `driver_residence` is admitted by the constraint but not offered: a residence
 * is created from the driver's own record with `isDriverResidence` set, and
 * spec Section 9 makes its visibility a server-side rule. Creating one from a
 * consignee block on a manifest would produce a private facility nobody asked
 * for.
 */
const CREATABLE_TYPES = new Set(['terminal', 'yard', 'warehouse', 'drop_yard', 'customer_site']);

/**
 * Create a facility from the pre-filled form and link the stop to it.
 *
 * The only place in this module that creates a facility, and it is reachable
 * only from a POST carrying a name a person saw and accepted. The type is
 * validated against the live CHECK constraint's vocabulary rather than passed
 * through: an unrecognised value is a Postgres 23514 and a 500, and the spec's
 * own `receiver`/`shipper` are exactly such values (audit B1 / DEC-1).
 *
 * Create-and-link is one request for the same reason create-and-select is for a
 * client (Phase 3, item 6): there is no window in which the facility exists and
 * the import does not know about it, so nothing can be half-done by a reload.
 */
export async function createStopFacility(
  orgId: string,
  userId: string,
  importId: string,
  stopIndex: number,
  input: CreateStopFacilityInput,
): Promise<StopResolutionView> {
  const record = await requireRecord(orgId, userId, importId);
  assertEditable(record);
  requireStop(record, orgId, userId, stopIndex);

  const name = input.name?.trim();
  if (!name) throw new ResolutionError('A facility name is required.', 'INVALID_FACILITY');

  const facilityType = input.facilityType?.trim() || FACILITY_TYPE_FOR_ROLE.consignee;
  if (!CREATABLE_TYPES.has(facilityType)) {
    throw new ResolutionError(
      `"${facilityType}" is not a facility type this system has.`,
      'INVALID_FACILITY',
    );
  }

  const withClient = await ensureClientCommitted(orgId, userId, record);
  if (!withClient.clientId) {
    throw new ResolutionError('Pick the client before resolving stops.', 'NO_CLIENT');
  }

  const { candidates, referencesByCode } = await loadContext(orgId, userId, withClient);
  const decisions = decideStops(withClient, { candidates, referencesByCode });
  const decision = decisions[stopIndex];
  if (!decision) throw new ResolutionError('That stop does not exist on this document.', 'INVALID_STOP');

  // Commit the silent stops first, so a failure creating this facility leaves
  // the ones that needed nobody already settled.
  const committed = await ensureStopsCommitted(orgId, userId, withClient);

  const db = await getTenantPrismaForOrg(orgId, userId);
  const data: FacilityCreateInput = {
    name,
    facilityType,
    addressLine1: input.addressLine1 ?? undefined,
    addressLine2: input.addressLine2 ?? undefined,
    city: input.city ?? undefined,
    state: input.state ?? undefined,
    zip: input.zip ?? undefined,
    country: input.country ?? undefined,
    contactName: input.contactName ?? undefined,
    contactPhone: input.contactPhone ?? undefined,
    createdById: userId,
    updatedById: userId,
  };

  // The existing creation path, extended with a pre-resolved tenant client
  // rather than replaced — the header it would otherwise read does not exist on
  // the mobile surface (DEC-11).
  const facility = await createFacility(orgId, data, db);

  const entry = stampStop(
    {
      via: 'MANUAL_CREATE',
      facilityId: facility.id,
      // Nothing was matched. A created facility has no score, and rendering one
      // would be inventing a comparison that never happened.
      score: null,
      matchedText: facility.name,
      sourceCode: decision.slot.sourceCode,
      stopFingerprint: decision.fingerprint,
    },
    userId,
  );

  const updated = await writeStopProvenance(orgId, userId, committed, { [String(stopIndex)]: entry });

  await writeExternalReference(orgId, userId, {
    clientId: withClient.clientId,
    sourceCode: decision.slot.sourceCode,
    sourceName: decision.slot.documentName,
    facilityId: facility.id,
    importId,
    via: 'MANUAL_CREATE',
  });

  logger.info('[document-import] facility created from import', {
    importId, stopIndex, facilityId: facility.id, facilityType,
  });

  return viewOf(orgId, userId, updated);
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** The stop view for one import. Read-only — the writes are all above. */
export async function getStopResolution(
  orgId: string,
  userId: string,
  importId: string,
): Promise<StopResolutionView | null> {
  const record = await getImportRecord(orgId, importId, userId);
  if (!record) return null;
  return viewOf(orgId, userId, record);
}
