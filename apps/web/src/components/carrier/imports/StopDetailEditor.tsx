'use client';

/**
 * The stop detail editor (spec Section 10).
 *
 * Section 10's field list, in Section 10's order:
 *
 *   facility · sequence · type · references · line items · rollups ·
 *   appointment window · required documents · contact · notes · document pages
 *
 * ---------------------------------------------------------------------------
 * IDENTICAL FIELD ORDER IN VIEW AND EDIT (Section 15)
 * ---------------------------------------------------------------------------
 * Not a convention someone has to remember: `FIELDS` below is ONE array and both
 * modes are a `.map` over it. There is no second list to fall out of step, and
 * adding a field puts it in the same place in both without anyone deciding to.
 * The rule exists because a dispatcher builds a spatial memory of where a value
 * is, and a form that moves it under the pencil makes them re-read the screen
 * every time.
 *
 * ---------------------------------------------------------------------------
 * ROLLUPS
 * ---------------------------------------------------------------------------
 * `computed` is what the line items add up to; `value` is what the stop claims.
 * Typing over it IS the override — there is no separate toggle to get out of
 * step with the number — and an overridden rollup is marked in both modes, with
 * the computed figure shown beside it so the disagreement is visible rather than
 * merely flagged. Clearing the box reverts to the line items.
 */

import { useState } from 'react';
import { Check, Loader2, Lock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { StopReviewRow } from '@/lib/document-import/stop-review';
import type {
  CanonicalLineItem,
  CanonicalReference,
  CanonicalRequiredDocument,
  CanonicalStopType,
} from '@drivecommand/validation';
import { StopFacilityDecision, StopStatus } from './StopResolutionList';
import { WhyPopover } from './WhyPopover';
import { TruncatedText } from './TruncatedText';
import { STOP_TYPE_LABEL } from './StopReviewRow';

const STOP_TYPES: CanonicalStopType[] = ['pickup', 'delivery', 'fuel_stop', 'layover', 'relay_handoff'];
const REFERENCE_TYPES = ['SHIPMENT', 'PRO', 'ORDER', 'PO', 'BOL', 'LOAD', 'SEAL', 'OTHER'] as const;
const REQUIRED_DOCUMENTS: CanonicalRequiredDocument[] = ['BOL', 'POD'];

/** The one field list. Both modes map over this — see the header. */
const FIELDS = [
  'facility',
  'sequence',
  'type',
  'references',
  'lineItems',
  'rollups',
  'appointment',
  'requiredDocuments',
  'contact',
  'notes',
  'pages',
] as const;

type Field = (typeof FIELDS)[number];

const LABEL: Record<Field, string> = {
  facility: 'Facility',
  sequence: 'Sequence',
  type: 'Stop type',
  references: 'References',
  lineItems: 'Line items',
  rollups: 'Quantities',
  appointment: 'Appointment window',
  requiredDocuments: 'Required documents',
  contact: 'Contact',
  notes: 'Notes',
  pages: 'Document pages',
};

interface Draft {
  name: string;
  stopType: CanonicalStopType | null;
  references: CanonicalReference[];
  lineItems: CanonicalLineItem[];
  pieces: string;
  weight: string;
  pallets: string;
  weightUom: 'LBS' | 'KG';
  earliest: string;
  latest: string;
  isFirm: boolean;
  requiredDocuments: CanonicalRequiredDocument[];
  contactName: string;
  contactPhone: string;
  notes: string;
}

function draftOf(row: StopReviewRow): Draft {
  return {
    name: row.name,
    stopType: row.stopType,
    references: row.references.map((r) => ({ ...r })),
    lineItems: row.lineItems.map((i) => ({ ...i })),
    // Only an OVERRIDDEN rollup pre-fills its box. A computed total left in
    // there would be saved back as an override the moment anything else on the
    // stop changed, silently freezing a number that should still be tracking
    // the line items.
    pieces: row.rollups.pieces.overridden ? String(row.rollups.pieces.value ?? '') : '',
    weight: row.rollups.weight.overridden ? String(row.rollups.weight.value ?? '') : '',
    pallets: row.rollups.pallets !== null ? String(row.rollups.pallets) : '',
    weightUom: row.rollups.weightUom ?? 'LBS',
    earliest: row.appointment?.earliest ?? '',
    latest: row.appointment?.latest ?? '',
    isFirm: row.appointment?.isFirm ?? false,
    requiredDocuments: [...row.requiredDocuments],
    contactName: row.contact?.name ?? '',
    contactPhone: row.contact?.phone ?? '',
    notes: row.notes ?? '',
  };
}

function numberOrNull(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

// ---------------------------------------------------------------------------

export function StopDetailEditor({
  importId,
  row,
  onSaved,
  onFacilityResolved,
  onClose,
}: {
  importId: string;
  row: StopReviewRow;
  onSaved: (next: unknown) => void;
  onFacilityResolved: () => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(row));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  function startEditing() {
    setDraft(draftOf(row));
    setError(null);
    setEditing(true);
  }

  async function save() {
    if (!draft.name.trim()) {
      setError('A stop name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const hasWindow = Boolean(draft.earliest.trim() || draft.latest.trim());
      const res = await fetch(`/api/v1/carrier/document-imports/${importId}/stops/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stopIndex: row.index,
          name: draft.name.trim(),
          stopType: draft.stopType,
          references: draft.references,
          lineItems: draft.lineItems,
          pieces: numberOrNull(draft.pieces),
          weight: numberOrNull(draft.weight),
          pallets: numberOrNull(draft.pallets),
          weightUom: draft.weightUom,
          appointment: hasWindow
            ? {
                earliest: draft.earliest.trim() || null,
                latest: draft.latest.trim() || null,
                isFirm: draft.isFirm,
              }
            : null,
          requiredDocuments: draft.requiredDocuments,
          contact:
            draft.contactName.trim() || draft.contactPhone.trim()
              ? { name: draft.contactName.trim() || null, phone: draft.contactPhone.trim() || null }
              : null,
          notes: draft.notes.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Could not save that stop.');
      onSaved(json.data);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that stop.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 rounded-xl bg-muted/40 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Stop {row.sequence}
          </p>
          <div className="mt-0.5 text-base font-semibold text-foreground">
            <TruncatedText value={row.facility?.name ?? row.name ?? 'Unnamed stop'} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!editing ? (
            <button
              type="button"
              onClick={startEditing}
              aria-label="Edit this stop"
              className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <dl className="space-y-4">
        {FIELDS.map((field) => (
          <FieldBlock key={field} label={LABEL[field]}>
            {editing ? (
              <EditField
                field={field}
                row={row}
                draft={draft}
                set={set}
                importId={importId}
                onFacilityResolved={onFacilityResolved}
              />
            ) : (
              <ViewField
                field={field}
                row={row}
                importId={importId}
                onFacilityResolved={onFacilityResolved}
              />
            )}
          </FieldBlock>
        ))}
      </dl>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {editing ? (
        <div className="flex flex-wrap gap-3">
          <Button className="min-h-[44px]" onClick={() => void save()} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Save stop
          </Button>
          <Button
            variant="ghost"
            className="min-h-[44px]"
            onClick={() => setEditing(false)}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt className="pt-1 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm text-foreground">{children}</dd>
    </div>
  );
}

const EMPTY = <span className="text-muted-foreground">—</span>;

function ViewField({
  field,
  row,
  importId,
  onFacilityResolved,
}: {
  field: Field;
  row: StopReviewRow;
  importId: string;
  onFacilityResolved: () => void;
}) {
  switch (field) {
    case 'facility':
      return (
        <FacilityField
          row={row}
          importId={importId}
          onFacilityResolved={onFacilityResolved}
        />
      );

    case 'sequence':
      // Read-only in both modes on purpose: sequence is changed by dragging the
      // list, and a second way to set it would let the two disagree.
      return (
        <span className="tabular-nums">
          {row.sequence} of the running order — drag the list to change it
        </span>
      );

    case 'type':
      return row.stopType ? <span>{STOP_TYPE_LABEL[row.stopType]}</span> : EMPTY;

    case 'references':
      return row.references.length === 0 ? (
        EMPTY
      ) : (
        <ul className="space-y-1">
          {row.references.map((r, i) => (
            <li key={`${r.type}-${r.value}-${i}`} className="flex items-baseline gap-2">
              <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
                {r.type}
              </span>
              <span className="min-w-0 break-words font-medium">{r.value}</span>
            </li>
          ))}
        </ul>
      );

    case 'lineItems':
      return row.lineItems.length === 0 ? (
        EMPTY
      ) : (
        <ul className="space-y-1">
          {row.lineItems.map((item, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {item.sku ? <span className="font-medium tabular-nums">{item.sku}</span> : null}
              <span className="min-w-0 break-words text-muted-foreground">
                {item.description ?? 'No description'}
              </span>
              <span className="tabular-nums">
                {item.quantity ?? '—'} {item.uom ?? ''}
              </span>
              {item.weight != null ? (
                <span className="tabular-nums text-muted-foreground">{item.weight}</span>
              ) : null}
              {item.hazmat ? (
                <Badge variant="warning" className="shrink-0">
                  Hazmat
                </Badge>
              ) : null}
            </li>
          ))}
        </ul>
      );

    case 'rollups':
      return (
        <div className="space-y-1">
          <RollupLine label="Pieces" rollup={row.rollups.pieces} />
          <RollupLine label="Weight" rollup={row.rollups.weight} suffix={row.rollups.weightUom ?? 'LBS'} />
          <div className="flex items-baseline gap-2">
            <span className="w-16 shrink-0 text-muted-foreground">Pallets</span>
            <span className="tabular-nums">{row.rollups.pallets ?? '—'}</span>
          </div>
        </div>
      );

    case 'appointment':
      return row.appointment ? (
        <span className="flex flex-wrap items-center gap-2">
          <span>
            {row.appointment.earliest ?? 'any time'} → {row.appointment.latest ?? 'any time'}
          </span>
          {row.appointment.isFirm ? (
            <Badge variant="info" className="shrink-0">
              Firm
            </Badge>
          ) : null}
        </span>
      ) : (
        EMPTY
      );

    case 'requiredDocuments':
      return row.requiredDocuments.length === 0 ? (
        EMPTY
      ) : (
        <span className="flex flex-wrap gap-2">
          {row.requiredDocuments.map((d) => (
            <Badge key={d} variant="secondary">
              {d}
            </Badge>
          ))}
        </span>
      );

    case 'contact':
      return row.contact ? (
        <span className="break-words">
          {[row.contact.name, row.contact.phone].filter(Boolean).join(' · ')}
        </span>
      ) : (
        EMPTY
      );

    case 'notes':
      return row.notes ? (
        <span className="flex flex-wrap items-start gap-2">
          <span className="min-w-0 break-words">{row.notes}</span>
          {row.bulkAppliedFields.includes('notes') ? <BulkMark /> : null}
        </span>
      ) : (
        EMPTY
      );

    case 'pages':
      // Page slicing is what lets the driver at stop 5 open page 4 rather than a
      // sixteen-page scan (spec Section 11). Shown here so a dispatcher can see
      // which page a value came off when something looks wrong.
      return row.pageNumbers.length === 0 ? (
        EMPTY
      ) : (
        <span className="tabular-nums">
          {row.pageNumbers.length === 1 ? 'Page' : 'Pages'} {row.pageNumbers.join(', ')}
        </span>
      );
  }
}

function RollupLine({
  label,
  rollup,
  suffix,
}: {
  label: string;
  rollup: StopReviewRow['rollups']['pieces'];
  suffix?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      <span className="tabular-nums">
        {rollup.value ?? '—'}
        {rollup.value !== null && suffix ? ` ${suffix.toLowerCase()}` : ''}
      </span>
      {rollup.overridden ? (
        <>
          {/* The visible mark Section 10 asks for. Not red: a hand-typed
              quantity is a decision, not an error. */}
          <Badge variant="secondary" className="shrink-0 gap-1">
            <Lock className="h-3 w-3" />
            Typed
          </Badge>
          {rollup.computed !== null ? (
            <span className="text-xs text-muted-foreground">
              line items add up to {rollup.computed}
            </span>
          ) : null}
        </>
      ) : rollup.computed !== null ? (
        <span className="text-xs text-muted-foreground">from the line items</span>
      ) : null}
    </div>
  );
}

function BulkMark() {
  return (
    <Badge variant="secondary" className="shrink-0">
      Applied in bulk
    </Badge>
  );
}

/**
 * The facility field, and the only place on this screen that can resolve one.
 *
 * A linked stop shows what it linked to and a `why`. An unresolved stop shows
 * the Phase 4 decision component — proposals, or a pre-filled create form —
 * which never resolves without an explicit press. Nothing here fires on mount.
 */
function FacilityField({
  row,
  importId,
  onFacilityResolved,
}: {
  row: StopReviewRow;
  importId: string;
  onFacilityResolved: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1">
          {row.facility ? (
            <TruncatedText value={`${row.facility.name} — ${row.facility.address}`} />
          ) : (
            <span className="text-muted-foreground">
              {row.documentAddress || 'No address on the document'}
            </span>
          )}
        </span>
        <StopStatus stop={row} />
        {row.facility ? <WhyPopover why={row.why} /> : null}
        <Button
          variant={row.requiresHumanTap ? 'default' : 'ghost'}
          size="sm"
          className="min-h-[44px] shrink-0"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {row.requiresHumanTap ? 'Resolve' : 'Change'}
        </Button>
      </div>

      {!row.persisted && row.facility ? (
        <p className="text-xs text-muted-foreground">
          Matched on this read. It is written the moment you change anything on this import.
        </p>
      ) : null}

      {open ? (
        <StopFacilityDecision
          importId={importId}
          stop={row}
          onResolved={() => {
            setOpen(false);
            onFacilityResolved();
          }}
          onCancel={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function EditField({
  field,
  row,
  draft,
  set,
  importId,
  onFacilityResolved,
}: {
  field: Field;
  row: StopReviewRow;
  draft: Draft;
  set: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  importId: string;
  onFacilityResolved: () => void;
}) {
  switch (field) {
    case 'facility':
      // Resolving a facility is its own POST with its own consequences, so it
      // is the same control in both modes rather than something the Save button
      // could sweep up with eleven other fields.
      return <FacilityField row={row} importId={importId} onFacilityResolved={onFacilityResolved} />;

    case 'sequence':
      return (
        <span className="tabular-nums text-muted-foreground">
          {row.sequence} of the running order — drag the list to change it
        </span>
      );

    case 'type':
      return (
        <Select
          value={draft.stopType ?? 'none'}
          onValueChange={(v) => set('stopType', v === 'none' ? null : (v as CanonicalStopType))}
        >
          <SelectTrigger className="h-11 max-w-xs">
            <SelectValue placeholder="Not set" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Not set</SelectItem>
            {STOP_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {STOP_TYPE_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'references':
      return (
        <div className="space-y-2">
          {draft.references.map((ref, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Select
                value={ref.type}
                onValueChange={(v) => {
                  const next = [...draft.references];
                  next[i] = { ...next[i], type: v as CanonicalReference['type'] };
                  set('references', next);
                }}
              >
                <SelectTrigger className="h-11 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REFERENCE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="h-11 min-w-0 flex-1"
                value={ref.value}
                aria-label={`${ref.type} value`}
                onChange={(e) => {
                  const next = [...draft.references];
                  next[i] = { ...next[i], value: e.target.value };
                  set('references', next);
                }}
              />
              <RemoveButton
                label={`Remove ${ref.type} reference`}
                onClick={() => set('references', draft.references.filter((_, j) => j !== i))}
              />
            </div>
          ))}
          <AddButton
            label="Add reference"
            onClick={() => set('references', [...draft.references, { type: 'OTHER', value: '' }])}
          />
        </div>
      );

    case 'lineItems':
      return (
        <div className="space-y-2">
          {draft.lineItems.map((item, i) => {
            const update = (patch: Partial<CanonicalLineItem>) => {
              const next = [...draft.lineItems];
              next[i] = { ...next[i], ...patch };
              set('lineItems', next);
            };
            return (
              /*
               * TWO ROWS, AND THE SPLIT IS THE FIX (quick-512).
               *
               * This was one wrapping row of seven controls, with the
               * description as the only `flex-1`. `flex-1` means
               * `flex: 1 1 0%`, so its hypothetical main size is ZERO — it
               * contributes nothing to flex line-breaking, which means the
               * wrap algorithm can never give it a line of its own. It only
               * ever received whatever free space five fixed-width siblings
               * left over, and on the 520px content box this card actually
               * gets, that was 42px. The `Input` base is `px-4` plus borders,
               * so 34px of that is chrome: the field rendered about one
               * clipped character wide.
               *
               * Splitting identity from quantities leaves the description
               * growing against two fixed siblings instead of five, and
               * `basis-40` gives it a real flex-basis so it both claims width
               * and participates in line-breaking — at a narrow viewport the
               * row now WRAPS rather than crushing the field to nothing.
               *
               * Do not merge these back into one row, and do not give the
               * description `flex-1` without a basis.
               */
              <div key={i} className="space-y-2 rounded-lg bg-background p-3">
                {/* Identity — the description is the primary text and is sized
                    accordingly: everything else on this row is content-sized. */}
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="h-11 w-24 shrink-0"
                    placeholder="SKU"
                    aria-label={`Line item ${i + 1} SKU`}
                    value={item.sku ?? ''}
                    onChange={(e) => update({ sku: e.target.value || null })}
                  />
                  <Input
                    className="h-11 min-w-0 flex-1 basis-40"
                    placeholder="Description"
                    aria-label={`Line item ${i + 1} description`}
                    value={item.description ?? ''}
                    onChange={(e) => update({ description: e.target.value || null })}
                  />
                  <RemoveButton
                    label={`Remove line item ${i + 1}`}
                    onClick={() => set('lineItems', draft.lineItems.filter((_, j) => j !== i))}
                  />
                </div>

                {/* Quantities — every control here is content-sized, so
                    `flex-wrap` behaves correctly and they simply reflow. */}
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="h-11 w-20"
                    inputMode="decimal"
                    placeholder="Qty"
                    aria-label={`Line item ${i + 1} quantity`}
                    value={item.quantity ?? ''}
                    onChange={(e) => update({ quantity: numberOrNull(e.target.value) })}
                  />
                  <Input
                    className="h-11 w-20"
                    placeholder="UOM"
                    aria-label={`Line item ${i + 1} unit`}
                    value={item.uom ?? ''}
                    onChange={(e) => update({ uom: e.target.value || null })}
                  />
                  <Input
                    className="h-11 w-24"
                    inputMode="decimal"
                    placeholder="Weight"
                    aria-label={`Line item ${i + 1} weight`}
                    value={item.weight ?? ''}
                    onChange={(e) => update({ weight: numberOrNull(e.target.value) })}
                  />
                  <label className="flex min-h-[44px] items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={item.hazmat === true}
                      onCheckedChange={(v) => update({ hazmat: v === true })}
                      aria-label={`Line item ${i + 1} hazmat`}
                    />
                    Hazmat
                  </label>
                </div>
              </div>
            );
          })}
          <AddButton
            label="Add line item"
            onClick={() =>
              set('lineItems', [
                ...draft.lineItems,
                { sku: null, description: null, quantity: null, uom: null, weight: null, hazmat: false },
              ])
            }
          />
        </div>
      );

    case 'rollups':
      return (
        <div className="space-y-2">
          <RollupInput
            label="Pieces"
            value={draft.pieces}
            computed={row.rollups.pieces.computed}
            onChange={(v) => set('pieces', v)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <RollupInput
              label="Weight"
              value={draft.weight}
              computed={row.rollups.weight.computed}
              onChange={(v) => set('weight', v)}
            />
            <Select value={draft.weightUom} onValueChange={(v) => set('weightUom', v as 'LBS' | 'KG')}>
              <SelectTrigger className="h-11 w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LBS">lbs</SelectItem>
                <SelectItem value="KG">kg</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 shrink-0 text-muted-foreground">Pallets</span>
            <Input
              className="h-11 w-24"
              inputMode="decimal"
              aria-label="Pallets"
              value={draft.pallets}
              onChange={(e) => set('pallets', e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Leave a box empty to let the line items decide. Type a number to override it — the
            override is marked on the stop.
          </p>
        </div>
      );

    case 'appointment':
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-11 w-44"
            type="datetime-local"
            aria-label="Earliest"
            value={draft.earliest}
            onChange={(e) => set('earliest', e.target.value)}
          />
          <span className="text-muted-foreground">→</span>
          <Input
            className="h-11 w-44"
            type="datetime-local"
            aria-label="Latest"
            value={draft.latest}
            onChange={(e) => set('latest', e.target.value)}
          />
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={draft.isFirm}
              onCheckedChange={(v) => set('isFirm', v === true)}
              aria-label="Firm window"
            />
            Firm
          </label>
        </div>
      );

    case 'requiredDocuments':
      return (
        <div className="flex flex-wrap gap-4">
          {REQUIRED_DOCUMENTS.map((doc) => (
            <label key={doc} className="flex min-h-[44px] items-center gap-2 text-sm">
              <Checkbox
                checked={draft.requiredDocuments.includes(doc)}
                aria-label={doc}
                onCheckedChange={(v) =>
                  set(
                    'requiredDocuments',
                    v === true
                      ? [...draft.requiredDocuments, doc]
                      : draft.requiredDocuments.filter((d) => d !== doc),
                  )
                }
              />
              {doc}
            </label>
          ))}
        </div>
      );

    case 'contact':
      return (
        <div className="flex flex-wrap gap-2">
          <Input
            className="h-11 min-w-0 flex-1"
            placeholder="Name"
            aria-label="Contact name"
            value={draft.contactName}
            onChange={(e) => set('contactName', e.target.value)}
          />
          <Input
            className="h-11 min-w-0 flex-1"
            placeholder="Phone"
            aria-label="Contact phone"
            value={draft.contactPhone}
            onChange={(e) => set('contactPhone', e.target.value)}
          />
        </div>
      );

    case 'notes':
      return (
        <Textarea
          rows={2}
          aria-label="Notes"
          value={draft.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
      );

    case 'pages':
      // Read-only in both modes: page numbers are where the text was found, not
      // a preference. Editing them would break the driver's page slice.
      return (
        <span className="tabular-nums text-muted-foreground">
          {row.pageNumbers.length === 0
            ? '—'
            : `${row.pageNumbers.length === 1 ? 'Page' : 'Pages'} ${row.pageNumbers.join(', ')}`}
        </span>
      );
  }
}

function RollupInput({
  label,
  value,
  computed,
  onChange,
}: {
  label: string;
  value: string;
  computed: number | null;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      <Input
        className={cn('h-11 w-24', value.trim() && 'font-medium')}
        inputMode="decimal"
        aria-label={label}
        placeholder={computed !== null ? String(computed) : '—'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value.trim() ? (
        <Badge variant="secondary" className="shrink-0 gap-1">
          <Lock className="h-3 w-3" />
          Override
        </Badge>
      ) : computed !== null ? (
        <span className="text-xs text-muted-foreground">line items: {computed}</span>
      ) : null}
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="min-h-[44px]" onClick={onClick}>
      <Plus className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
