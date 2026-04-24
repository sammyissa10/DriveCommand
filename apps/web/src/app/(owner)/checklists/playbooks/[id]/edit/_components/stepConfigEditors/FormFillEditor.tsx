'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, X, ChevronUp, ChevronDown } from 'lucide-react';

type FieldType = 'text' | 'number' | 'date' | 'boolean' | 'select';

interface FormField {
  name: string;
  type: FieldType;
  required: boolean;
}

interface FormFillConfig {
  fields?: FormField[];
}

interface FormFillEditorProps {
  config: FormFillConfig;
  onChange: (config: FormFillConfig) => void;
}

const FIELD_TYPE_OPTIONS: Array<{ value: FieldType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'select', label: 'Dropdown' },
];

export function FormFillEditor({ config, onChange }: FormFillEditorProps) {
  const fields: FormField[] = config.fields ?? [];

  function update(index: number, patch: Partial<FormField>) {
    const updated = fields.map((f, i) => (i === index ? { ...f, ...patch } : f));
    onChange({ ...config, fields: updated });
  }

  function addField() {
    onChange({
      ...config,
      fields: [...fields, { name: '', type: 'text', required: false }],
    });
  }

  function removeField(index: number) {
    onChange({ ...config, fields: fields.filter((_, i) => i !== index) });
  }

  function moveField(index: number, direction: 'up' | 'down') {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === fields.length - 1) return;
    const newFields = [...fields];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    [newFields[index], newFields[targetIdx]] = [newFields[targetIdx], newFields[index]];
    onChange({ ...config, fields: newFields });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Form Fields
        </Label>
        <span className="text-xs text-muted-foreground">{fields.length} field{fields.length !== 1 ? 's' : ''}</span>
      </div>

      {fields.length === 0 && (
        <p className="text-xs text-muted-foreground italic text-center py-3">
          No fields yet. Add one below.
        </p>
      )}

      <div className="space-y-2">
        {fields.map((field, idx) => (
          <div
            key={idx}
            className="rounded-md border border-border bg-muted/20 p-3 space-y-2"
          >
            <div className="flex items-center gap-2">
              {/* Move up/down */}
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => moveField(idx, 'up')}
                  disabled={idx === 0}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                  aria-label="Move field up"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => moveField(idx, 'down')}
                  disabled={idx === fields.length - 1}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                  aria-label="Move field down"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>

              {/* Field name */}
              <Input
                placeholder="Field name"
                value={field.name}
                onChange={(e) => update(idx, { name: e.target.value })}
                className="flex-1 h-7 text-xs"
              />

              {/* Remove */}
              <button
                type="button"
                onClick={() => removeField(idx)}
                className="text-muted-foreground hover:text-destructive transition-colors"
                aria-label="Remove field"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              {/* Type */}
              <Select
                value={field.type}
                onValueChange={(v) => update(idx, { type: v as FieldType })}
              >
                <SelectTrigger className="h-7 text-xs flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Required */}
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => update(idx, { required: e.target.checked })}
                  className="h-3.5 w-3.5 rounded border-border accent-primary"
                />
                <span className="text-xs text-muted-foreground">Required</span>
              </label>
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full gap-1.5 text-xs"
        onClick={addField}
      >
        <Plus className="h-3.5 w-3.5" />
        Add Field
      </Button>
    </div>
  );
}
