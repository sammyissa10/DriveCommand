/**
 * Resolution provenance — how each slot on an import came to hold its value.
 *
 * Stored in `document_imports.resolution_provenance` (jsonb, added by
 * `20260806040500_add_resolution_provenance`). **Recorded at write time, never
 * inferred at read time**, which is the whole reason it exists: once the system
 * commits a value on the user's behalf (quick-508 for the client, quick-510 for
 * the contract, this phase for stops), a set id no longer tells the read path
 * whether a person decided or a machine did, and the affordance whose entire job
 * is to explain a decision was misattributing it.
 *
 * Extracted from `resolution.ts` when the stop ladder arrived, so that the
 * read-only stop view and the client/contract mutations can share one
 * vocabulary without importing each other. Nothing here touches Prisma, and
 * nothing here decides anything — it is the shape and the parsing, only.
 *
 * NO NEW COLUMNS. The stop ladder extends this object with a `stops` key rather
 * than adding a table or a column, per the phase constraint. `resolution_provenance`
 * is jsonb and was designed for exactly this.
 */

import type { ImportRecord } from './persistence';

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * Deliberately a different vocabulary from the view's `ResolvedVia`.
 * `ResolvedVia` says what the card should render; this says what actually
 * happened, and conflating the two is what produced the bug quick-509 fixed.
 */
export type ClientProvenanceVia =
  /** A human picked an existing client from the list. */
  | 'MANUAL'
  /** A human created the client during this import. */
  | 'MANUAL_CREATE'
  /** Committed by the system: a name saved on the client's document profile. */
  | 'PROFILE_ALIAS'
  /** Committed by the system: exactly one active client matched exactly. */
  | 'EXACT_MATCH';

export type ContractProvenanceVia =
  /** A human picked an existing contract. */
  | 'MANUAL'
  /** Committed because the client had exactly one active contract. */
  | 'SINGLE_ACTIVE'
  /** Committed because the client's profile pins it for this document type. */
  | 'PROFILE_PIN'
  /** Created by this import — spot, or the plain create-and-use path. */
  | 'CREATED_THIS_IMPORT';

/**
 * How a stop came to point at a facility — the four rungs of spec Section 7.
 *
 * `EXTERNAL_REF` is T1 and `NORMALISED_ADDRESS` is T2; both are silent, both are
 * committed by the system, and both carry the evidence that decided (the code,
 * or the stored address that normalised equal).
 *
 * T3 and T4 have no machine via **because they have no machine outcome**. A
 * proposal that a human accepted is `MANUAL`; a facility a human created from
 * the pre-filled form is `MANUAL_CREATE`. Both carry the score that was on
 * screen when the person tapped, which is the number that explains what they
 * were shown — and for `MANUAL_CREATE` it is null, because nothing was
 * proposed. Keeping the human tiers under one `MANUAL` family, rather than
 * inventing `T3`/`T4` vias, matches the client vocabulary above and keeps the
 * one distinction that changes the sentence a reader gets: linked, or created.
 */
export type StopProvenanceVia =
  /** T1 — a confirmed `(tenant, client, code)` external reference. */
  | 'EXTERNAL_REF'
  /** T2 — the document address normalised equal to exactly one facility. */
  | 'NORMALISED_ADDRESS'
  /** T3, and any manual re-pick — a person chose this facility. */
  | 'MANUAL'
  /** T4 — a person created this facility from the pre-filled form. */
  | 'MANUAL_CREATE';

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/**
 * One slot's record. `score` and `matchedText` are the evidence a machine via
 * has and a human one does not: the alias that answered cannot be re-derived
 * later from the chosen client alone, which is exactly why it is stored rather
 * than recomputed.
 */
export interface SlotProvenance<V extends string> {
  via: V;
  /** 0..1 for a scored match; null for a human choice, which is not a guess. */
  score: number | null;
  matchedText: string | null;
  /** Who, when it was a person; the actor whose request committed it otherwise. */
  byUserId: string | null;
  /** ISO 8601. */
  at: string;
}

export type ClientProvenance = SlotProvenance<ClientProvenanceVia>;
export type ContractProvenance = SlotProvenance<ContractProvenanceVia>;

/**
 * One stop's record — a slot record plus the link it authorises.
 *
 * `facilityId` lives here rather than in a column because there is no stop row
 * to put it on: stops become `CarrierStop` records at commit (Phase 8), and
 * until then a stop is an index into `reviewedExtraction`. This is the storage,
 * and it is why the ladder can be re-read without being re-decided.
 *
 * `stopFingerprint` is what makes an index safe to key on. It is a hash of the
 * consignment the decision was actually about; if stop review (Phase 5) reorders
 * or edits the stops, the fingerprint at that index no longer matches and the
 * record is treated as absent rather than silently re-bound to a different
 * consignee. A stale link to the wrong facility is exactly the failure this
 * module exists to prevent.
 */
export interface StopProvenance extends SlotProvenance<StopProvenanceVia> {
  facilityId: string;
  /** The external reference code that resolved it, or that was backfilled. */
  sourceCode: string | null;
  stopFingerprint: string;
}

/**
 * How this import came to point at a route template — or at none (spec Section 8).
 *
 * `NONE` is a recorded decision rather than an absence, and that distinction is
 * the whole reason it is in the vocabulary: "nobody has looked at templates yet"
 * and "a dispatcher chose to run without one" are different states, and only the
 * second may stop the card re-asking. It is also what the auto-create step reads
 * to know that no template was applied.
 */
export type TemplateProvenanceVia =
  /** Committed by the system: exactly one template scored at or above 0.75. */
  | 'AUTO_MATCH'
  /** A human picked one of the ranked candidates. */
  | 'MANUAL'
  /** A human chose "Continue without a template". */
  | 'NONE'
  /** Created from this import by the tenant's auto-create setting. */
  | 'AUTO_CREATED'
  /** Created from this import by a human tapping "Save as route template". */
  | 'SAVED_FROM_IMPORT';

/**
 * The post-commit "update the template?" offer (spec Section 8: *"Offered once,
 * never silent"*).
 *
 * Stored, because "once" is a claim about history that cannot be derived from
 * the current row: an import whose trip differs from its template looks
 * identical whether the dispatcher was asked and said no, or was never asked.
 * Without this record the offer either nags on every visit or is skipped
 * entirely, and both are worse than asking once.
 */
export interface TemplateOfferRecord {
  offeredAt: string;
  respondedAt: string | null;
  response: 'UPDATED' | 'DISMISSED' | null;
  /** What actually differed, so the offer states it rather than merely asking. */
  changedSummary: string | null;
}

export interface TemplateProvenance extends SlotProvenance<TemplateProvenanceVia> {
  /** Null for `NONE`, set for every other via. */
  templateId: string | null;
  templateName: string | null;
  /**
   * ISO 8601, set when the template's order / windows / documents / standing
   * notes were merged into the stops — NOT when the template was selected.
   *
   * Two separate moments on purpose. Selection auto-collapses at 0.75 and is
   * committed at the mutation boundary the way the client and the contract are
   * (quick-508 / quick-510). Application rewrites the running order, which is a
   * change a dispatcher must ask for. A card that showed a template and silently
   * reordered twelve stops would be the worst possible reading of "collapse".
   */
  appliedAt: string | null;
  offer: TemplateOfferRecord | null;
}

export interface ResolutionProvenance {
  client?: ClientProvenance;
  contract?: ContractProvenance;
  /** Keyed by consignment index, as a string. See `StopProvenance`. */
  stops?: Record<string, StopProvenance>;
  template?: TemplateProvenance;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const CLIENT_VIAS: readonly string[] = ['MANUAL', 'MANUAL_CREATE', 'PROFILE_ALIAS', 'EXACT_MATCH'];
const CONTRACT_VIAS: readonly string[] = ['MANUAL', 'SINGLE_ACTIVE', 'PROFILE_PIN', 'CREATED_THIS_IMPORT'];
const STOP_VIAS: readonly string[] = ['EXTERNAL_REF', 'NORMALISED_ADDRESS', 'MANUAL', 'MANUAL_CREATE'];
const TEMPLATE_VIAS: readonly string[] = ['AUTO_MATCH', 'MANUAL', 'NONE', 'AUTO_CREATED', 'SAVED_FROM_IMPORT'];

/** The stored object, or `{}` for a legacy row or anything malformed. */
export function provenanceOf(record: ImportRecord): ResolutionProvenance {
  const raw = record.resolutionProvenance;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as ResolutionProvenance;
}

/**
 * One slot's record, or null.
 *
 * An unrecognised `via` is treated as absent rather than rendered. A row written
 * by a newer deploy and read by an older one is a real possibility, and falling
 * back to the legacy copy is honest where inventing a sentence for a via this
 * build has never heard of is not.
 */
export function slotProvenance<V extends string>(
  slot: SlotProvenance<V> | undefined,
  allowed: readonly string[],
): SlotProvenance<V> | null {
  if (!slot || typeof slot !== 'object') return null;
  if (typeof slot.via !== 'string' || !allowed.includes(slot.via)) return null;
  return slot;
}

export const clientProvenanceOf = (record: ImportRecord): ClientProvenance | null =>
  slotProvenance(provenanceOf(record).client, CLIENT_VIAS);

export const contractProvenanceOf = (record: ImportRecord): ContractProvenance | null =>
  slotProvenance(provenanceOf(record).contract, CONTRACT_VIAS);

/**
 * The template record, or null.
 *
 * A record whose via is anything other than `NONE` must carry a `templateId` —
 * a record claiming a template without naming one is not a decision, and it is
 * discarded here rather than reaching a caller that would trust it. Same guard,
 * and same reasoning, as `stopProvenanceOf`'s `facilityId` check.
 */
export function templateProvenanceOf(record: ImportRecord): TemplateProvenance | null {
  const slot = slotProvenance(provenanceOf(record).template, TEMPLATE_VIAS);
  if (!slot) return null;
  const template = slot as TemplateProvenance;
  if (template.via !== 'NONE' && (typeof template.templateId !== 'string' || !template.templateId)) return null;
  return template;
}

/**
 * Every stop record on the row, keyed by index, with the malformed ones dropped.
 *
 * A record without a `facilityId` is not a link, whatever else it says, so it is
 * discarded here rather than reaching a caller that would trust the id.
 */
export function stopProvenanceOf(record: ImportRecord): Record<string, StopProvenance> {
  const raw = provenanceOf(record).stops;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const out: Record<string, StopProvenance> = {};
  for (const [key, value] of Object.entries(raw)) {
    const slot = slotProvenance(value as StopProvenance | undefined, STOP_VIAS);
    if (!slot) continue;
    const stop = slot as StopProvenance;
    if (typeof stop.facilityId !== 'string' || !stop.facilityId) continue;
    out[key] = stop;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/** What a caller states about a write; `byUserId` and `at` are stamped here. */
export interface ProvenanceInput<V extends string> {
  via: V;
  score?: number | null;
  matchedText?: string | null;
}

export function stamp<V extends string>(input: ProvenanceInput<V>, userId: string): SlotProvenance<V> {
  return {
    via: input.via,
    score: input.score ?? null,
    matchedText: input.matchedText ?? null,
    byUserId: userId,
    at: new Date().toISOString(),
  };
}

export interface StopProvenanceInput extends ProvenanceInput<StopProvenanceVia> {
  facilityId: string;
  sourceCode?: string | null;
  stopFingerprint: string;
}

export function stampStop(input: StopProvenanceInput, userId: string): StopProvenance {
  return {
    ...stamp(input, userId),
    facilityId: input.facilityId,
    sourceCode: input.sourceCode ?? null,
    stopFingerprint: input.stopFingerprint,
  };
}

export interface TemplateProvenanceInput extends ProvenanceInput<TemplateProvenanceVia> {
  templateId: string | null;
  templateName: string | null;
  appliedAt?: string | null;
  offer?: TemplateOfferRecord | null;
}

export function stampTemplate(input: TemplateProvenanceInput, userId: string): TemplateProvenance {
  return {
    ...stamp(input, userId),
    templateId: input.templateId,
    templateName: input.templateName,
    appliedAt: input.appliedAt ?? null,
    offer: input.offer ?? null,
  };
}

/**
 * A stop's identity, independent of its position.
 *
 * Cheap and deterministic — the consignee code when there is one, otherwise the
 * normalised name and address key. Not a cryptographic hash: it does not need to
 * resist an attacker, only to notice that the consignment at index 3 is no
 * longer the consignment the link was made about.
 */
export function stopFingerprint(parts: { sourceCode: string | null; name: string; addressKey: string }): string {
  const code = (parts.sourceCode ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const name = parts.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return code ? `c:${code}` : `n:${name}|${parts.addressKey}`;
}
