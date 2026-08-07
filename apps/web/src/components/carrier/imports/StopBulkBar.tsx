'use client';

/**
 * The bulk apply bar (spec Section 10).
 *
 * ```
 *  | [x] 3 selected  Note v  Docs v  Window v  Clear  |
 * ```
 *
 * ---------------------------------------------------------------------------
 * IT OPERATES ON THE SELECTION, NOT ON THE ROWS
 * ---------------------------------------------------------------------------
 * This component is handed `selected: number[]` and sends exactly that. It has
 * no access to the rendered list, no ref to a viewport and no notion of a page,
 * so "a selected stop scrolled out of view must receive it" is not something it
 * can get wrong — there is no code path here that could intersect the selection
 * with what is visible. The server then walks the whole consignment array. Phase
 * 5's stated drift risk is closed by that shape rather than by care.
 *
 * ---------------------------------------------------------------------------
 * EVERY ACTION CONFIRMS, WITH THE COUNT AND THE FIELDS
 * ---------------------------------------------------------------------------
 * Section 10: *Apply "Call ahead 30 min" to 7 stops?* Nothing here fires from a
 * menu selection; the menu composes a value and the confirm step names the count
 * and what is about to change. That is one dialog, not a modal per stop, and it
 * is the only dialog on this screen — warnings are a summary, never a modal.
 *
 * DESIGN (Section 15). The bar is a surface, not a bordered box; spacing is
 * 8/12/16; the confirm button is the one accent in the dialog. `Clear` is
 * neutral and NOT red — it takes back a bulk value, which is a correction, not a
 * destructive action.
 */

import { useState } from 'react';
import { CalendarClock, Check, FileCheck2, Loader2, StickyNote, Tag, Copy, Undo2, X } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type {
  CanonicalBulkAppliedField,
  CanonicalRequiredDocument,
  CanonicalStopType,
} from '@drivecommand/validation';
import { STOP_TYPE_LABEL } from './StopReviewRow';

type Panel = 'note' | 'docs' | 'window' | 'type' | 'copy' | 'clear' | null;

const FIELD_LABEL: Record<CanonicalBulkAppliedField, string> = {
  notes: 'note',
  requiredDocuments: 'required documents',
  appointment: 'appointment window',
  stopType: 'stop type',
  totals: 'quantities',
};

export interface BulkPayload {
  notes?: string;
  requiredDocuments?: CanonicalRequiredDocument[];
  appointment?: { earliest: string | null; latest: string | null; isFirm: boolean };
  stopType?: CanonicalStopType;
  copyQuantitiesFromAbove?: boolean;
  clear?: CanonicalBulkAppliedField[];
}

export function StopBulkBar({
  selected,
  busy,
  onApply,
  onClearSelection,
}: {
  /** The selection. The whole input to every action on this bar. */
  selected: number[];
  busy: boolean;
  onApply: (payload: BulkPayload, confirmation: string) => Promise<void>;
  onClearSelection: () => void;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [note, setNote] = useState('');
  const [docs, setDocs] = useState<CanonicalRequiredDocument[]>([]);
  const [earliest, setEarliest] = useState('');
  const [latest, setLatest] = useState('');
  const [isFirm, setIsFirm] = useState(false);
  const [stopType, setStopType] = useState<CanonicalStopType>('delivery');
  const [clearFields, setClearFields] = useState<CanonicalBulkAppliedField[]>([]);
  const [pending, setPending] = useState<{ payload: BulkPayload; question: string } | null>(null);

  const count = selected.length;
  if (count === 0) return null;

  const stops = `${count} stop${count === 1 ? '' : 's'}`;

  /** Compose, then ask. Nothing is sent from this function. */
  function propose(payload: BulkPayload, question: string) {
    setPanel(null);
    setPending({ payload, question });
  }

  async function confirm() {
    if (!pending) return;
    await onApply(pending.payload, pending.question);
    setPending(null);
    setNote('');
    setDocs([]);
    setEarliest('');
    setLatest('');
    setClearFields([]);
  }

  return (
    <>
      <div className="sticky bottom-0 z-40 -mx-4 mt-4 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="rounded-xl bg-muted p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm font-medium text-foreground">{count} selected</span>

            <BarButton icon={StickyNote} label="Note" active={panel === 'note'} onClick={() => setPanel(panel === 'note' ? null : 'note')} />
            <BarButton icon={FileCheck2} label="Docs" active={panel === 'docs'} onClick={() => setPanel(panel === 'docs' ? null : 'docs')} />
            <BarButton icon={CalendarClock} label="Window" active={panel === 'window'} onClick={() => setPanel(panel === 'window' ? null : 'window')} />
            <BarButton icon={Tag} label="Type" active={panel === 'type'} onClick={() => setPanel(panel === 'type' ? null : 'type')} />
            <BarButton
              icon={Copy}
              label="Copy quantities"
              active={false}
              onClick={() =>
                propose(
                  { copyQuantitiesFromAbove: true },
                  `Copy the quantities from the stop above onto ${stops}?`,
                )
              }
            />
            <BarButton icon={Undo2} label="Clear" active={panel === 'clear'} onClick={() => setPanel(panel === 'clear' ? null : 'clear')} />

            <Button
              variant="ghost"
              size="sm"
              className="ml-auto min-h-[44px] text-muted-foreground"
              onClick={onClearSelection}
            >
              <X className="mr-1 h-4 w-4" />
              Clear selection
            </Button>
          </div>

          {/* ---- the composer for whichever field is open ---- */}
          {panel === 'note' ? (
            <Panel>
              <Textarea
                rows={2}
                autoFocus
                aria-label="Note to apply"
                placeholder="Call ahead 30 min"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <ApplyButton
                disabled={!note.trim()}
                onClick={() =>
                  propose({ notes: note.trim() }, `Apply “${note.trim()}” to ${stops}?`)
                }
              />
            </Panel>
          ) : null}

          {panel === 'docs' ? (
            <Panel>
              <div className="flex flex-wrap gap-4">
                {(['BOL', 'POD'] as CanonicalRequiredDocument[]).map((doc) => (
                  <label key={doc} className="flex min-h-[44px] items-center gap-2 text-sm">
                    <Checkbox
                      checked={docs.includes(doc)}
                      aria-label={doc}
                      onCheckedChange={(v) =>
                        setDocs(v === true ? [...docs, doc] : docs.filter((d) => d !== doc))
                      }
                    />
                    {doc}
                  </label>
                ))}
              </div>
              <ApplyButton
                onClick={() =>
                  propose(
                    { requiredDocuments: docs },
                    docs.length === 0
                      ? `Require no documents at ${stops}?`
                      : `Require ${docs.join(' and ')} at ${stops}?`,
                  )
                }
              />
            </Panel>
          ) : null}

          {panel === 'window' ? (
            <Panel>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="h-11 w-44"
                  type="datetime-local"
                  aria-label="Earliest"
                  value={earliest}
                  onChange={(e) => setEarliest(e.target.value)}
                />
                <span className="text-muted-foreground">→</span>
                <Input
                  className="h-11 w-44"
                  type="datetime-local"
                  aria-label="Latest"
                  value={latest}
                  onChange={(e) => setLatest(e.target.value)}
                />
                <label className="flex min-h-[44px] items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox checked={isFirm} onCheckedChange={(v) => setIsFirm(v === true)} aria-label="Firm window" />
                  Firm
                </label>
              </div>
              <ApplyButton
                disabled={!earliest && !latest}
                onClick={() =>
                  propose(
                    {
                      appointment: {
                        earliest: earliest || null,
                        latest: latest || null,
                        isFirm,
                      },
                    },
                    `Apply the ${isFirm ? 'firm ' : ''}window ${earliest || 'any time'} → ${latest || 'any time'} to ${stops}?`,
                  )
                }
              />
            </Panel>
          ) : null}

          {panel === 'type' ? (
            <Panel>
              <Select value={stopType} onValueChange={(v) => setStopType(v as CanonicalStopType)}>
                <SelectTrigger className="h-11 max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STOP_TYPE_LABEL) as CanonicalStopType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {STOP_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ApplyButton
                onClick={() =>
                  propose(
                    { stopType },
                    `Set ${stops} to ${STOP_TYPE_LABEL[stopType]}?`,
                  )
                }
              />
            </Panel>
          ) : null}

          {panel === 'clear' ? (
            <Panel>
              <p className="text-xs text-muted-foreground">
                Only takes back what this bar applied. A value someone typed on a stop is left
                alone.
              </p>
              <div className="flex flex-wrap gap-4">
                {(Object.keys(FIELD_LABEL) as CanonicalBulkAppliedField[]).map((field) => (
                  <label key={field} className="flex min-h-[44px] items-center gap-2 text-sm">
                    <Checkbox
                      checked={clearFields.includes(field)}
                      aria-label={FIELD_LABEL[field]}
                      onCheckedChange={(v) =>
                        setClearFields(
                          v === true ? [...clearFields, field] : clearFields.filter((f) => f !== field),
                        )
                      }
                    />
                    {FIELD_LABEL[field]}
                  </label>
                ))}
              </div>
              <ApplyButton
                disabled={clearFields.length === 0}
                onClick={() =>
                  propose(
                    { clear: clearFields },
                    `Clear the bulk-applied ${clearFields.map((f) => FIELD_LABEL[f]).join(', ')} on ${stops}?`,
                  )
                }
              />
            </Panel>
          ) : null}
        </div>
      </div>

      {/* The confirmation. Names the count and the fields, per Section 10. */}
      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pending?.question}</DialogTitle>
            <DialogDescription>
              This applies to all {count} selected {count === 1 ? 'stop' : 'stops'}, including any
              scrolled out of view.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" className="min-h-[44px]" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </Button>
            <Button className="min-h-[44px]" onClick={() => void confirm()} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Apply to {stops}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 space-y-3 rounded-lg bg-background p-4">{children}</div>;
}

function BarButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof StickyNote;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={active ? 'secondary' : 'ghost'}
      size="sm"
      className="min-h-[44px]"
      onClick={onClick}
      aria-expanded={active}
    >
      <Icon className="mr-1.5 h-4 w-4" />
      {label}
    </Button>
  );
}

function ApplyButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button variant="secondary" size="sm" className="min-h-[44px]" onClick={onClick} disabled={disabled}>
      Review and apply
    </Button>
  );
}
