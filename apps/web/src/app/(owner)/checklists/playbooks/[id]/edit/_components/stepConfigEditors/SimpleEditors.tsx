'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AssigneeRole } from '@drivecommand/validation';

// ─────────────────────────────────────────────────────────────
// DocumentUploadEditor
// ─────────────────────────────────────────────────────────────

interface DocumentUploadConfig {
  acceptedMimeTypes?: string;
  maxSizeMb?: number;
  instructions?: string;
}

interface DocumentUploadEditorProps {
  config: DocumentUploadConfig;
  onChange: (config: DocumentUploadConfig) => void;
}

export function DocumentUploadEditor({ config, onChange }: DocumentUploadEditorProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="doc-mimes" className="text-xs font-medium">
          Accepted file types
        </Label>
        <Textarea
          id="doc-mimes"
          placeholder="e.g. application/pdf, image/jpeg, image/png"
          value={config.acceptedMimeTypes ?? ''}
          onChange={(e) => onChange({ ...config, acceptedMimeTypes: e.target.value })}
          rows={2}
          className="text-sm resize-none"
        />
        <p className="text-xs text-muted-foreground">Comma-separated MIME types</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="doc-maxsize" className="text-xs font-medium">
          Max file size (MB)
        </Label>
        <Input
          id="doc-maxsize"
          type="number"
          min={1}
          max={500}
          placeholder="e.g. 10"
          value={config.maxSizeMb ?? ''}
          onChange={(e) =>
            onChange({ ...config, maxSizeMb: e.target.value ? Number(e.target.value) : undefined })
          }
          className="text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="doc-instr" className="text-xs font-medium">
          Instructions
        </Label>
        <Textarea
          id="doc-instr"
          placeholder="Describe what document to upload"
          value={config.instructions ?? ''}
          onChange={(e) => onChange({ ...config, instructions: e.target.value })}
          rows={3}
          className="text-sm resize-none"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SignatureEditor
// ─────────────────────────────────────────────────────────────

interface SignatureConfig {
  signatureLabel?: string;
  consentText?: string;
}

interface SignatureEditorProps {
  config: SignatureConfig;
  onChange: (config: SignatureConfig) => void;
}

export function SignatureEditor({ config, onChange }: SignatureEditorProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="sig-label" className="text-xs font-medium">
          Signature label
        </Label>
        <Input
          id="sig-label"
          placeholder="e.g. Driver signature"
          value={config.signatureLabel ?? ''}
          onChange={(e) => onChange({ ...config, signatureLabel: e.target.value })}
          className="text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sig-consent" className="text-xs font-medium">
          Consent text
        </Label>
        <Textarea
          id="sig-consent"
          placeholder="I confirm that all information provided is accurate and complete."
          value={config.consentText ?? ''}
          onChange={(e) => onChange({ ...config, consentText: e.target.value })}
          rows={3}
          className="text-sm resize-none"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TrainingAckEditor
// ─────────────────────────────────────────────────────────────

interface TrainingAckConfig {
  trainingUrl?: string;
  minSecondsToAcknowledge?: number;
}

interface TrainingAckEditorProps {
  config: TrainingAckConfig;
  onChange: (config: TrainingAckConfig) => void;
}

export function TrainingAckEditor({ config, onChange }: TrainingAckEditorProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="tr-url" className="text-xs font-medium">
          Training URL
        </Label>
        <Input
          id="tr-url"
          type="url"
          placeholder="https://example.com/training-video"
          value={config.trainingUrl ?? ''}
          onChange={(e) => onChange({ ...config, trainingUrl: e.target.value })}
          className="text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tr-minsecs" className="text-xs font-medium">
          Minimum time before acknowledgment (seconds)
        </Label>
        <Input
          id="tr-minsecs"
          type="number"
          min={0}
          placeholder="e.g. 60"
          value={config.minSecondsToAcknowledge ?? ''}
          onChange={(e) =>
            onChange({
              ...config,
              minSecondsToAcknowledge: e.target.value
                ? Number(e.target.value)
                : undefined,
            })
          }
          className="text-sm"
        />
        <p className="text-xs text-muted-foreground">
          0 = no minimum. Leave blank to use default.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ApprovalEditor
// ─────────────────────────────────────────────────────────────

const APPROVER_ROLE_OPTIONS: Array<{ value: AssigneeRole; label: string }> = [
  { value: 'DRIVER', label: 'Driver' },
  { value: 'DISPATCHER', label: 'Dispatcher' },
  { value: 'MECHANIC', label: 'Mechanic' },
  { value: 'SAFETY_MANAGER', label: 'Safety Manager' },
  { value: 'THIRD_PARTY', label: 'Third Party' },
];

interface ApprovalConfig {
  approverRole?: AssigneeRole;
  instructions?: string;
}

interface ApprovalEditorProps {
  config: ApprovalConfig;
  onChange: (config: ApprovalConfig) => void;
}

export function ApprovalEditor({ config, onChange }: ApprovalEditorProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="appr-role" className="text-xs font-medium">
          Approver role
        </Label>
        <Select
          value={config.approverRole ?? ''}
          onValueChange={(v) => onChange({ ...config, approverRole: v as AssigneeRole })}
        >
          <SelectTrigger id="appr-role" className="text-sm">
            <SelectValue placeholder="Select approver role" />
          </SelectTrigger>
          <SelectContent>
            {APPROVER_ROLE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="appr-instr" className="text-xs font-medium">
          Instructions
        </Label>
        <Textarea
          id="appr-instr"
          placeholder="Describe what the approver should check"
          value={config.instructions ?? ''}
          onChange={(e) => onChange({ ...config, instructions: e.target.value })}
          rows={3}
          className="text-sm resize-none"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ThirdPartyEditor
// ─────────────────────────────────────────────────────────────

interface ThirdPartyConfig {
  partyName?: string;
  contactEmail?: string;
  instructions?: string;
}

interface ThirdPartyEditorProps {
  config: ThirdPartyConfig;
  onChange: (config: ThirdPartyConfig) => void;
}

export function ThirdPartyEditor({ config, onChange }: ThirdPartyEditorProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="tp-name" className="text-xs font-medium">
          Party name
        </Label>
        <Input
          id="tp-name"
          placeholder="e.g. DOT Inspection Agency"
          value={config.partyName ?? ''}
          onChange={(e) => onChange({ ...config, partyName: e.target.value })}
          className="text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tp-email" className="text-xs font-medium">
          Contact email
        </Label>
        <Input
          id="tp-email"
          type="email"
          placeholder="contact@example.com"
          value={config.contactEmail ?? ''}
          onChange={(e) => onChange({ ...config, contactEmail: e.target.value })}
          className="text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tp-instr" className="text-xs font-medium">
          Instructions
        </Label>
        <Textarea
          id="tp-instr"
          placeholder="Describe what the external party needs to do"
          value={config.instructions ?? ''}
          onChange={(e) => onChange({ ...config, instructions: e.target.value })}
          rows={3}
          className="text-sm resize-none"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CustomNoteEditor
// ─────────────────────────────────────────────────────────────

interface CustomNoteConfig {
  note?: string;
}

interface CustomNoteEditorProps {
  config: CustomNoteConfig;
  onChange: (config: CustomNoteConfig) => void;
}

export function CustomNoteEditor({ config, onChange }: CustomNoteEditorProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="note-text" className="text-xs font-medium">
        Note content
      </Label>
      <Textarea
        id="note-text"
        placeholder="Enter the note or instruction text that will be displayed to the assignee"
        value={config.note ?? ''}
        onChange={(e) => onChange({ ...config, note: e.target.value })}
        rows={6}
        className="text-sm resize-none"
      />
    </div>
  );
}
