'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, MapPin, Trash2 } from 'lucide-react';
import {
  SectionHeader,
  SheetContainer,
  FieldGroup,
  PrimaryButton,
  EmptyState,
  type FieldDef,
} from '@/components/ui/ds';
import type { StopBuilderStop } from '@/components/carrier/stops/StopCard';

export interface FacilityOption {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}

type StopType = StopBuilderStop['stop_type'];

const STOP_TYPE_OPTIONS: { label: string; value: StopType }[] = [
  { label: 'Pickup', value: 'pickup' },
  { label: 'Delivery', value: 'delivery' },
  { label: 'Fuel stop', value: 'fuel_stop' },
  { label: 'Layover', value: 'layover' },
];
const STOP_TYPE_LABEL: Record<string, string> = {
  pickup: 'Pickup',
  delivery: 'Delivery',
  fuel_stop: 'Fuel stop',
  layover: 'Layover',
};

const DEFAULT_FORM = {
  facilityId: '',
  stopType: 'pickup' as StopType,
  bolRequired: true,
  podRequired: false,
  commodityDescription: '',
  specialInstructions: '',
};

/** Sequence is always the array order — recomputed on every change. */
function resequence(stops: StopBuilderStop[]): StopBuilderStop[] {
  return stops.map((s, i) => ({ ...s, sequence_order: i + 1 }));
}

/**
 * Template stops, ds-style. The desktop builder reorders by drag (dnd-kit), which
 * fights the page scroll on touch — here order is changed with explicit up/down
 * controls instead.
 */
export function TemplateStopsEditor({
  stops,
  onChange,
  facilities,
  error,
}: {
  stops: StopBuilderStop[];
  onChange: (stops: StopBuilderStop[]) => void;
  facilities: FacilityOption[];
  error?: string;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);

  function setStopType(value: string) {
    const v = value as StopType;
    // Same auto-defaults as the desktop add modal.
    setForm((prev) => ({
      ...prev,
      stopType: v,
      bolRequired: v === 'pickup' || v === 'delivery' ? true : prev.bolRequired,
      podRequired: v === 'delivery' ? true : prev.podRequired,
    }));
  }

  function addStop() {
    const facility = facilities.find((f) => f.id === form.facilityId);
    if (!facility) return;
    const stop: StopBuilderStop = {
      id: crypto.randomUUID(),
      facility_id: facility.id,
      facility_name: facility.name,
      facility_city: facility.city,
      facility_state: facility.state,
      sequence_order: 0, // resequenced below
      stop_type: form.stopType,
      contact_name: null,
      contact_phone: null,
      expected_dwell_minutes: null,
      commodity_description: form.commodityDescription || null,
      bol_required: form.bolRequired,
      pod_required: form.podRequired,
      special_instructions: form.specialInstructions || null,
      appt_window_start_offset_min: null,
      appt_window_end_offset_min: null,
      appointment_start: null,
      appointment_end: null,
    };
    onChange(resequence([...stops, stop]));
    setForm(DEFAULT_FORM);
    setAddOpen(false);
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...stops];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(resequence(next));
  }

  function remove(id: string) {
    onChange(resequence(stops.filter((s) => s.id !== id)));
  }

  const addFields: FieldDef[] = [
    {
      key: 'facilityId',
      label: 'Facility *',
      input: {
        value: form.facilityId,
        onChange: (v) => setForm((p) => ({ ...p, facilityId: v })),
        options: [
          { label: 'Select facility…', value: '' },
          ...facilities.map((f) => ({
            label: [f.name, [f.city, f.state].filter(Boolean).join(', ')].filter(Boolean).join(' — '),
            value: f.id,
          })),
        ],
      },
    },
    {
      key: 'stopType',
      label: 'Stop type',
      input: { value: form.stopType, onChange: setStopType, options: STOP_TYPE_OPTIONS },
    },
  ];
  const detailFields: FieldDef[] = [
    {
      key: 'commodityDescription',
      label: 'Commodity',
      input: {
        value: form.commodityDescription,
        onChange: (v) => setForm((p) => ({ ...p, commodityDescription: v })),
        placeholder: 'e.g. Dry goods',
      },
    },
    {
      key: 'specialInstructions',
      label: 'Special instructions',
      input: {
        value: form.specialInstructions,
        onChange: (v) => setForm((p) => ({ ...p, specialInstructions: v })),
        multiline: true,
        placeholder: 'Any special handling notes…',
      },
    },
  ];

  return (
    <div>
      <SectionHeader
        title={stops.length > 0 ? `${stops.length} stop${stops.length === 1 ? '' : 's'}` : 'Stops'}
        action={facilities.length > 0 ? { label: 'Add', onClick: () => setAddOpen(true) } : undefined}
      />

      {stops.length === 0 ? (
        facilities.length === 0 ? (
          <div className="rounded-[20px] bg-ds-warning/[0.14] p-4">
            <p className="text-[15px] font-semibold text-ds-warning">No facilities yet</p>
            <p className="mt-0.5 text-[13px] text-ds-txt2">
              A route is built from facilities. Add one first, then come back.
            </p>
          </div>
        ) : (
          <EmptyState icon={MapPin} title="No stops yet" message="A route template needs at least one stop. Tap Add to place the first." />
        )
      ) : (
        <div className="space-y-3">
          {stops.map((s, i) => {
            const place = [s.facility_city, s.facility_state].filter(Boolean).join(', ');
            return (
              <div key={s.id} className="rounded-[20px] bg-ds-card p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ds-elevated text-[13px] font-semibold text-ds-txt2">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-ds-txt">
                      {STOP_TYPE_LABEL[s.stop_type] ?? s.stop_type}
                    </div>
                    <div className="mt-0.5 truncate text-[15px] text-ds-txt2">
                      {s.facility_name}
                      {place ? <span className="text-ds-txt3"> · {place}</span> : null}
                    </div>
                    {s.bol_required || s.pod_required ? (
                      <div className="mt-0.5 text-[13px] text-ds-txt3">
                        {[s.bol_required ? 'BOL required' : null, s.pod_required ? 'POD required' : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={`Move stop ${i + 1} earlier`}
                    className="flex h-11 flex-1 items-center justify-center rounded-[12px] bg-ds-elevated text-ds-txt2 transition active:opacity-75 disabled:opacity-35"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === stops.length - 1}
                    aria-label={`Move stop ${i + 1} later`}
                    className="flex h-11 flex-1 items-center justify-center rounded-[12px] bg-ds-elevated text-ds-txt2 transition active:opacity-75 disabled:opacity-35"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(s.id)}
                    aria-label={`Remove stop ${i + 1}`}
                    className="flex h-11 flex-1 items-center justify-center rounded-[12px] bg-ds-danger/[0.14] text-ds-danger transition active:opacity-75"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error ? <p className="mt-2 px-1 text-[13px] text-ds-danger">{error}</p> : null}

      {/* Add stop */}
      <SheetContainer
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        title="Add Stop"
        subtitle={`Stop ${stops.length + 1} on this route`}
      >
        <div className="space-y-4">
          <FieldGroup fields={addFields} isEditing />

          <div>
            <SectionHeader title="Paperwork" />
            <div className="flex gap-2">
              {(
                [
                  { key: 'bolRequired', label: 'BOL required' },
                  { key: 'podRequired', label: 'POD required' },
                ] as const
              ).map(({ key, label }) => {
                const on = form[key];
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setForm((p) => ({ ...p, [key]: !p[key] }))}
                    className={`h-11 flex-1 rounded-[12px] text-[15px] font-semibold transition active:opacity-75 ${
                      on ? 'bg-ds-accent text-white' : 'bg-ds-input text-ds-txt2'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <SectionHeader title="Details" />
            <FieldGroup fields={detailFields} isEditing />
          </div>

          <PrimaryButton label="Add Stop" onClick={addStop} disabled={!form.facilityId} />
        </div>
      </SheetContainer>
    </div>
  );
}
