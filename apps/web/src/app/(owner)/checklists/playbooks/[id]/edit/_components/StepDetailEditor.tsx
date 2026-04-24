'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTRPC } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { StepType, AssigneeRole } from '@drivecommand/validation';
import type { PlaybookStepItem } from './BuilderClient';
import { FormFillEditor } from './stepConfigEditors/FormFillEditor';
import { InspectionItemEditor } from './stepConfigEditors/InspectionItemEditor';
import {
  DocumentUploadEditor,
  SignatureEditor,
  TrainingAckEditor,
  ApprovalEditor,
  ThirdPartyEditor,
  CustomNoteEditor,
} from './stepConfigEditors/SimpleEditors';

interface StepDetailEditorProps {
  playbookId: string;
  step: PlaybookStepItem;
  onClose: () => void;
}

const STEP_TYPE_LABELS: Record<StepType, string> = {
  DOCUMENT_UPLOAD: 'Document',
  FORM_FILL: 'Form',
  INSPECTION_ITEM: 'Inspection',
  SIGNATURE: 'Signature',
  TRAINING_ACK: 'Training',
  APPROVAL: 'Approval',
  THIRD_PARTY: 'External',
  CUSTOM_NOTE: 'Note',
};

const ASSIGNEE_ROLE_LABELS: Record<AssigneeRole, string> = {
  DRIVER: 'Driver',
  DISPATCHER: 'Dispatcher',
  MECHANIC: 'Mechanic',
  SAFETY_MANAGER: 'Safety Manager',
  THIRD_PARTY: 'Third Party',
};

export function StepDetailEditor({ playbookId, step, onClose }: StepDetailEditorProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [config, setConfig] = useState<Record<string, unknown>>(
    (step.overrideConfig as Record<string, unknown>) ?? {},
  );

  const updateStepMutation = useMutation(
    trpc.workflows.playbook.updateStep.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: trpc.workflows.playbook.getById.queryKey({ id: playbookId }),
        });
        toast.success('Step saved');
      },
    }),
  );

  function handleSave() {
    updateStepMutation.mutate(
      { playbookId, stepId: step.id, overrideConfig: config },
      { onError: (err) => toast.error(err.message ?? 'Failed to save step') },
    );
  }

  function renderEditor() {
    const stepType = step.stepTemplate.stepType;
    switch (stepType) {
      case 'FORM_FILL':
        return (
          <FormFillEditor
            config={config as Parameters<typeof FormFillEditor>[0]['config']}
            onChange={(c) => setConfig(c as Record<string, unknown>)}
          />
        );
      case 'INSPECTION_ITEM':
        return (
          <InspectionItemEditor
            config={config as Parameters<typeof InspectionItemEditor>[0]['config']}
            onChange={(c) => setConfig(c as Record<string, unknown>)}
          />
        );
      case 'DOCUMENT_UPLOAD':
        return (
          <DocumentUploadEditor
            config={config as Parameters<typeof DocumentUploadEditor>[0]['config']}
            onChange={(c) => setConfig(c as Record<string, unknown>)}
          />
        );
      case 'SIGNATURE':
        return (
          <SignatureEditor
            config={config as Parameters<typeof SignatureEditor>[0]['config']}
            onChange={(c) => setConfig(c as Record<string, unknown>)}
          />
        );
      case 'TRAINING_ACK':
        return (
          <TrainingAckEditor
            config={config as Parameters<typeof TrainingAckEditor>[0]['config']}
            onChange={(c) => setConfig(c as Record<string, unknown>)}
          />
        );
      case 'APPROVAL':
        return (
          <ApprovalEditor
            config={config as Parameters<typeof ApprovalEditor>[0]['config']}
            onChange={(c) => setConfig(c as Record<string, unknown>)}
          />
        );
      case 'THIRD_PARTY':
        return (
          <ThirdPartyEditor
            config={config as Parameters<typeof ThirdPartyEditor>[0]['config']}
            onChange={(c) => setConfig(c as Record<string, unknown>)}
          />
        );
      case 'CUSTOM_NOTE':
        return (
          <CustomNoteEditor
            config={config as Parameters<typeof CustomNoteEditor>[0]['config']}
            onChange={(c) => setConfig(c as Record<string, unknown>)}
          />
        );
      default:
        return (
          <p className="text-xs text-muted-foreground italic">
            No configuration options for this step type.
          </p>
        );
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            Edit Step
          </p>
          <h3 className="text-sm font-semibold text-foreground leading-tight">
            {step.stepTemplate.name}
          </h3>
          <div className="flex items-center gap-1.5 mt-1.5">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
              {STEP_TYPE_LABELS[step.stepTemplate.stepType]}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {ASSIGNEE_ROLE_LABELS[step.stepTemplate.assigneeRole]}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors mt-0.5"
          aria-label="Close editor"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Config editor body */}
      <div className="flex-1 overflow-y-auto p-4">
        {renderEditor()}
      </div>

      {/* Footer: Save button */}
      <div className="px-4 py-3 border-t border-border flex-shrink-0">
        <Button
          className="w-full"
          onClick={handleSave}
          disabled={updateStepMutation.isPending}
        >
          {updateStepMutation.isPending ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving…
            </span>
          ) : (
            'Save'
          )}
        </Button>
      </div>
    </div>
  );
}
