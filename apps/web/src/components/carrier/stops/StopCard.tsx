'use client';

import { useState } from 'react';
import { GripVertical, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface StopBuilderStop {
  id: string;
  facility_id: string;
  facility_name: string;
  facility_city: string | null;
  facility_state: string | null;
  sequence_order: number;
  stop_type: 'pickup' | 'delivery' | 'fuel_stop' | 'layover';
  contact_name: string | null;
  contact_phone: string | null;
  expected_dwell_minutes: number | null;
  commodity_description: string | null;
  bol_required: boolean;
  pod_required: boolean;
  special_instructions: string | null;
  // template mode — offset in minutes from route start
  appt_window_start_offset_min: number | null;
  appt_window_end_offset_min: number | null;
  // load mode — absolute datetime
  appointment_start: string | null;
  appointment_end: string | null;
}

interface StopCardProps {
  stop: StopBuilderStop;
  index: number;
  mode: 'template' | 'load';
  onUpdate: (updated: StopBuilderStop) => void;
  onRemove: () => void;
  /** When true the card is being used as the DragOverlay clone — no interactivity */
  isDragOverlay?: boolean;
}

const STOP_TYPE_CLASSES: Record<StopBuilderStop['stop_type'], string> = {
  pickup: 'border-blue-500 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  delivery: 'border-green-500 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  fuel_stop: 'border-slate-500 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  layover: 'border-amber-500 bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
};

function stopTypeLabel(type: StopBuilderStop['stop_type']): string {
  return type === 'fuel_stop' ? 'Fuel Stop' : type.charAt(0).toUpperCase() + type.slice(1);
}

function formatOffsetMinutes(minutes: number | null): string {
  if (minutes === null) return '';
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  return h > 0 ? `+${h}h ${m}m` : `+${m}m`;
}

export function StopCard({
  stop,
  index,
  mode,
  onUpdate,
  onRemove,
  isDragOverlay = false,
}: StopCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stop.id, disabled: isDragOverlay });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();
    if (window.confirm('Remove this stop?')) {
      onRemove();
    }
  }

  function handleCardBodyClick() {
    if (!isDragOverlay) setIsExpanded((v) => !v);
  }

  function update(patch: Partial<StopBuilderStop>) {
    onUpdate({ ...stop, ...patch });
  }

  // Appointment display text
  let apptText = '';
  if (mode === 'template') {
    const hasOffsets =
      stop.appt_window_start_offset_min !== null || stop.appt_window_end_offset_min !== null;
    if (hasOffsets) {
      apptText = `${formatOffsetMinutes(stop.appt_window_start_offset_min)} – ${formatOffsetMinutes(stop.appt_window_end_offset_min)}`;
    }
  } else {
    if (stop.appointment_start) {
      apptText = new Date(stop.appointment_start).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border border-border bg-card ${
        isDragging ? 'ring-2 ring-ring shadow-lg opacity-90' : ''
      }`}
    >
      {/* Collapsed row */}
      <div
        className="flex items-center gap-2 p-3 cursor-pointer select-none"
        onClick={handleCardBodyClick}
        role="button"
        aria-expanded={isExpanded}
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleCardBodyClick()}
      >
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="cursor-grab active:cursor-grabbing p-1 -ml-1 text-muted-foreground hover:text-foreground shrink-0"
          aria-label="Drag to reorder stop"
        >
          <GripVertical className="h-4 w-4" />
        </div>

        {/* Sequence number */}
        <div className="rounded-full bg-muted w-7 h-7 flex items-center justify-center text-sm font-medium shrink-0">
          {index + 1}
        </div>

        {/* Stop type badge */}
        <Badge
          variant="outline"
          className={`shrink-0 text-xs ${STOP_TYPE_CLASSES[stop.stop_type]}`}
        >
          {stopTypeLabel(stop.stop_type)}
        </Badge>

        {/* Facility info */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{stop.facility_name}</p>
          {(stop.facility_city || stop.facility_state) && (
            <p className="text-xs text-muted-foreground">
              {stop.facility_city && stop.facility_state
                ? `${stop.facility_city}, ${stop.facility_state}`
                : stop.facility_city ?? stop.facility_state}
            </p>
          )}
        </div>

        {/* Indicators */}
        <div className="flex items-center gap-1.5 shrink-0">
          {apptText && (
            <span className="text-xs text-muted-foreground hidden sm:block">{apptText}</span>
          )}
          {stop.expected_dwell_minutes !== null && stop.expected_dwell_minutes > 0 && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              {stop.expected_dwell_minutes} min dwell
            </span>
          )}
          {stop.bol_required && (
            <Badge
              variant="outline"
              className="text-xs border-blue-400 text-blue-600 dark:text-blue-400 px-1.5 py-0"
            >
              BOL
            </Badge>
          )}
          {stop.pod_required && (
            <Badge
              variant="outline"
              className="text-xs border-green-400 text-green-600 dark:text-green-400 px-1.5 py-0"
            >
              POD
            </Badge>
          )}
        </div>

        {/* Expand chevron */}
        <div className="text-muted-foreground shrink-0">
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </div>

        {/* Remove button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={handleRemove}
          aria-label="Remove stop"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Inline edit panel */}
      {isExpanded && !isDragOverlay && (
        <div className="border-t border-border p-3">
          <div className="grid grid-cols-2 gap-3">
            {/* contact_name */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Contact Name</label>
              <Input
                value={stop.contact_name ?? ''}
                onChange={(e) => update({ contact_name: e.target.value || null })}
                placeholder="Contact name"
                className="h-8 text-sm"
              />
            </div>

            {/* contact_phone */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Contact Phone</label>
              <Input
                value={stop.contact_phone ?? ''}
                onChange={(e) => update({ contact_phone: e.target.value || null })}
                placeholder="Contact phone"
                className="h-8 text-sm"
              />
            </div>

            {/* Appointment fields — mode-aware */}
            {mode === 'template' ? (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Appointment Offset Start (minutes)
                  </label>
                  <Input
                    type="number"
                    value={stop.appt_window_start_offset_min ?? ''}
                    onChange={(e) =>
                      update({
                        appt_window_start_offset_min: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                    placeholder="e.g. 480"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Appointment Offset End (minutes)
                  </label>
                  <Input
                    type="number"
                    value={stop.appt_window_end_offset_min ?? ''}
                    onChange={(e) =>
                      update({
                        appt_window_end_offset_min: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                    placeholder="e.g. 600"
                    className="h-8 text-sm"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Appointment Start
                  </label>
                  <Input
                    type="datetime-local"
                    value={stop.appointment_start ?? ''}
                    onChange={(e) =>
                      update({ appointment_start: e.target.value || null })
                    }
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Appointment End
                  </label>
                  <Input
                    type="datetime-local"
                    value={stop.appointment_end ?? ''}
                    onChange={(e) =>
                      update({ appointment_end: e.target.value || null })
                    }
                    className="h-8 text-sm"
                  />
                </div>
              </>
            )}

            {/* expected_dwell_minutes */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Expected Dwell (minutes)
              </label>
              <Input
                type="number"
                value={stop.expected_dwell_minutes ?? ''}
                onChange={(e) =>
                  update({
                    expected_dwell_minutes: e.target.value ? Number(e.target.value) : null,
                  })
                }
                placeholder="e.g. 60"
                className="h-8 text-sm"
              />
            </div>

            {/* commodity_description */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Commodity Description
              </label>
              <Input
                value={stop.commodity_description ?? ''}
                onChange={(e) => update({ commodity_description: e.target.value || null })}
                placeholder="e.g. Dry goods"
                className="h-8 text-sm"
              />
            </div>

            {/* bol_required */}
            <div className="flex items-center gap-3 pt-2">
              <Switch
                checked={stop.bol_required}
                onCheckedChange={(checked) => update({ bol_required: checked })}
                id={`bol-${stop.id}`}
              />
              <label
                htmlFor={`bol-${stop.id}`}
                className="text-sm font-medium cursor-pointer"
              >
                BOL Required
              </label>
            </div>

            {/* pod_required */}
            <div className="flex items-center gap-3 pt-2">
              <Switch
                checked={stop.pod_required}
                onCheckedChange={(checked) => update({ pod_required: checked })}
                id={`pod-${stop.id}`}
              />
              <label
                htmlFor={`pod-${stop.id}`}
                className="text-sm font-medium cursor-pointer"
              >
                POD Required
              </label>
            </div>

            {/* special_instructions — full width */}
            <div className="col-span-2 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Special Instructions
              </label>
              <Textarea
                value={stop.special_instructions ?? ''}
                onChange={(e) => update({ special_instructions: e.target.value || null })}
                placeholder="Any special handling notes…"
                rows={2}
                className="text-sm resize-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
