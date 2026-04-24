'use client';

import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';

interface InspectionItemConfig {
  instruction?: string;
  requirePhotoOnFail?: boolean;
}

interface InspectionItemEditorProps {
  config: InspectionItemConfig;
  onChange: (config: InspectionItemConfig) => void;
}

export function InspectionItemEditor({ config, onChange }: InspectionItemEditorProps) {
  return (
    <div className="space-y-4">
      {/* Instruction */}
      <div className="space-y-1.5">
        <Label htmlFor="insp-instruction" className="text-xs font-medium">
          Instruction
        </Label>
        <Textarea
          id="insp-instruction"
          placeholder="e.g. Inspect all four tires for wear, damage, and proper inflation."
          value={config.instruction ?? ''}
          onChange={(e) =>
            onChange({ ...config, instruction: e.target.value })
          }
          rows={4}
          maxLength={500}
          className="text-sm resize-none"
        />
        <p className="text-xs text-muted-foreground text-right">
          {(config.instruction ?? '').length}/500
        </p>
      </div>

      {/* Require photo on fail */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Require photo on fail</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Driver must attach a photo when marking this step as failed
          </p>
        </div>
        <Switch
          checked={config.requirePhotoOnFail ?? false}
          onCheckedChange={(checked) =>
            onChange({ ...config, requirePhotoOnFail: checked })
          }
        />
      </div>
    </div>
  );
}
