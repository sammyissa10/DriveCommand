'use client';

import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { StatusTone } from './StatusPill';

/** Collapse a long identifier to head…tail so it fits on one line. */
function middleTruncate(s: string, head = 9, tail = 6): string {
  return s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;
}

const VALUE_TINT: Record<StatusTone, string> = {
  success: 'text-ds-success',
  accent: 'text-ds-accent',
  warning: 'text-ds-warning',
  danger: 'text-ds-danger',
  neutral: 'text-ds-txt',
  vip: 'text-ds-vip',
};

export interface FieldEditConfig {
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  placeholder?: string;
  error?: string;
  multiline?: boolean;
  autoCapitalize?: string;
  maxLength?: number;
  /** Numeric fields: strip formatting on focus, reformat (e.g. add commas) on blur. */
  onFocus?: () => void;
  onBlur?: () => void;
  /** Renders a native select (enums / booleans) instead of a text input. */
  options?: { label: string; value: string }[];
}

export interface FieldDef {
  key: string;
  /** Owner's words, never a column name. */
  label: string;
  /** View-mode value. Empty/undefined renders as an em dash. */
  value?: string | null;
  /** Tints the value (status / expiry fields) in view mode. */
  tone?: StatusTone;
  /** Edit control config. Omit + `editable: false` for computed fields. */
  input?: FieldEditConfig;
  /** Computed/immutable fields: shown locked in edit mode, never an input. */
  editable?: boolean;
  /** One-line reason shown under a locked field in edit mode. */
  lockReason?: string;
  /**
   * Long identifier (VIN, vehicle ID): view mode renders it middle-truncated as
   * a tap-to-copy button that copies this full string and toasts "Copied".
   */
  copyValue?: string;
}

/**
 * The view/edit parity primitive. Same fields, same order, same card in both
 * modes — the ONLY difference is layout:
 *  - view: 52-high rows, label left / value right, hairline dividers inset 18.
 *  - edit: 13pt label stacked above a full-width input, no hairlines.
 */
export function FieldGroup({ fields, isEditing }: { fields: FieldDef[]; isEditing: boolean }) {
  return (
    <div className="overflow-hidden rounded-[20px] bg-ds-card">
      {fields.map((f, i) => {
        const last = i === fields.length - 1;
        const display = f.value && f.value.length > 0 ? f.value : '—';

        if (isEditing) {
          const editable = f.editable !== false && f.input;
          return (
            <div key={f.key} className="space-y-1.5 px-4 py-2.5">
              <label htmlFor={`field-${f.key}`} className="block text-[13px] text-ds-txt2">
                {f.label}
              </label>
              {editable ? (
                f.input!.options ? (
                  <select
                    id={`field-${f.key}`}
                    value={f.input!.value}
                    onChange={(e) => f.input!.onChange(e.target.value)}
                    className="h-11 w-full rounded-[10px] bg-ds-input px-3 text-[16px] text-ds-txt outline-none"
                  >
                    {f.input!.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : f.input!.multiline ? (
                  <textarea
                    id={`field-${f.key}`}
                    value={f.input!.value}
                    onChange={(e) => f.input!.onChange(e.target.value)}
                    placeholder={f.input!.placeholder}
                    rows={3}
                    className="w-full resize-none rounded-[10px] bg-ds-input px-3 py-2.5 text-[16px] text-ds-txt outline-none placeholder:text-ds-txt3"
                  />
                ) : (
                  <input
                    id={`field-${f.key}`}
                    value={f.input!.value}
                    onChange={(e) => f.input!.onChange(e.target.value)}
                    type={f.input!.type ?? 'text'}
                    inputMode={f.input!.inputMode}
                    placeholder={f.input!.placeholder}
                    autoCapitalize={f.input!.autoCapitalize}
                    maxLength={f.input!.maxLength}
                    onFocus={f.input!.onFocus}
                    onBlur={f.input!.onBlur}
                    aria-invalid={f.input!.error ? true : undefined}
                    className="h-11 w-full rounded-[10px] bg-ds-input px-3 text-[16px] text-ds-txt outline-none placeholder:text-ds-txt3"
                  />
                )
              ) : (
                <>
                  <p className={cn('text-[16px]', f.tone ? VALUE_TINT[f.tone] : 'text-ds-txt2')}>
                    {display}
                  </p>
                  {f.lockReason ? <p className="text-[13px] text-ds-txt3">{f.lockReason}</p> : null}
                </>
              )}
              {f.input?.error ? (
                <p className="text-[13px] text-ds-danger">{f.input.error}</p>
              ) : null}
            </div>
          );
        }

        return (
          <div key={f.key}>
            <div className="flex h-[52px] items-center justify-between px-4">
              <span className="text-[15px] text-ds-txt2">{f.label}</span>
              {f.copyValue && display !== '—' ? (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(f.copyValue!);
                    toast.success('Copied');
                  }}
                  aria-label={`Copy ${f.label}`}
                  className="ml-4 flex items-center gap-1.5 text-right text-[15px] font-medium text-ds-txt transition active:opacity-75"
                >
                  <span className="font-mono">{middleTruncate(display)}</span>
                  <Copy className="h-3.5 w-3.5 shrink-0 text-ds-txt3" />
                </button>
              ) : (
                <span
                  className={cn(
                    'ml-4 truncate text-right text-[15px] font-medium',
                    f.tone ? VALUE_TINT[f.tone] : 'text-ds-txt',
                  )}
                >
                  {display}
                </span>
              )}
            </div>
            {last ? null : <div className="ml-[18px] h-px bg-ds-hairline" />}
          </div>
        );
      })}
    </div>
  );
}
