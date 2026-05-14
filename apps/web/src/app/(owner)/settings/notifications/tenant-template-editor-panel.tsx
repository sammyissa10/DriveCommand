'use client';

import { useState, useTransition } from 'react';
import { BlockEditor } from '@/components/notifications/block-editor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  customizeTemplate,
  restoreDefault,
} from '@/app/(owner)/actions/tenant-notification-settings';
import type { TenantNotificationSettingRow } from '@/app/(owner)/actions/tenant-notification-settings';
import type { VariableDef } from '@/lib/notifications/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TenantSetting = TenantNotificationSettingRow['tenantSetting'];

interface TenantTemplateEditorPanelProps {
  template: TenantNotificationSettingRow['template'];
  tenantSetting: TenantSetting;
  onClose: () => void;
  onUpdated: (updated: TenantSetting) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TenantTemplateEditorPanel({
  template,
  tenantSetting,
  onClose,
  onUpdated,
}: TenantTemplateEditorPanelProps) {
  const hasCustom = tenantSetting?.customBlockJson != null;

  const [mode, setMode] = useState<'readonly' | 'editing'>(hasCustom ? 'editing' : 'readonly');
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [, startTransition] = useTransition();

  // The BlockEditor template object uses defaultBlockJson/defaultSubject as initial content.
  // When editing, we want to show the custom content if it exists.
  const editorTemplate = {
    id: template.id,
    displayName: template.displayName,
    defaultSubject: tenantSetting?.customSubject ?? template.defaultSubject,
    defaultBlockJson: tenantSetting?.customBlockJson ?? template.defaultBlockJson,
    availableVariables: template.availableVariables as VariableDef[],
  };

  const handleSave = async (blockJson: unknown, subject: string) => {
    const result = await customizeTemplate(template.triggerKey, blockJson, subject);
    if (result.success) {
      toast.success('Template saved');
      onUpdated({
        ...(tenantSetting ?? {
          id: '',
          tenantId: '',
          triggerKey: template.triggerKey,
          isActive: true,
          customHtmlCache: null,
          updatedAt: new Date(),
        }),
        customSubject: subject,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        customBlockJson: blockJson as any,
      });
      onClose();
    } else {
      toast.error(result.error);
    }
  };

  const handleRestore = () => {
    startTransition(async () => {
      const result = await restoreDefault(template.triggerKey);
      if (result.success) {
        toast.success('Restored to default');
        setMode('readonly');
        setShowRestoreConfirm(false);
        onUpdated(
          tenantSetting
            ? { ...tenantSetting, customSubject: null, customBlockJson: null, customHtmlCache: null }
            : null,
        );
      } else {
        toast.error(result.error ?? 'Failed to restore');
      }
    });
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Panel header */}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-gray-900 flex-1 min-w-0 truncate">
          {template.displayName}
        </h2>
        <Badge
          variant="secondary"
          className={`shrink-0 text-xs px-2 py-0.5 ${
            template.category === 'LOAD'
              ? 'bg-orange-100 text-orange-700'
              : template.category === 'DRIVER'
                ? 'bg-green-100 text-green-700'
                : template.category === 'TRUCK'
                  ? 'bg-yellow-100 text-yellow-800'
                  : template.category === 'USER'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-700'
          }`}
        >
          {template.category}
        </Badge>
      </div>

      {/* Readonly banner OR editing controls */}
      {mode === 'readonly' ? (
        <div className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded p-3">
          <p className="text-sm text-yellow-800">
            Currently using DriveCommand default — click Customize to make changes.
          </p>
          <Button
            variant="default"
            size="sm"
            className="ml-3 shrink-0"
            onClick={() => setMode('editing')}
          >
            Customize Template
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-end">
          <Button
            variant="destructive"
            size="sm"
            disabled={tenantSetting?.customBlockJson == null}
            onClick={() => setShowRestoreConfirm(true)}
          >
            Restore to Default
          </Button>
        </div>
      )}

      {/* BlockEditor — always mounted, readOnly switches */}
      <div className="flex-1 min-h-0">
        <BlockEditor
          key={template.triggerKey}
          template={editorTemplate}
          readOnly={mode === 'readonly'}
          onSave={handleSave}
          onCancel={onClose}
        />
      </div>

      {/* Restore-to-default confirmation dialog */}
      <AlertDialog open={showRestoreConfirm} onOpenChange={setShowRestoreConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore to default?</AlertDialogTitle>
            <AlertDialogDescription>
              This will discard your customizations and revert to the DriveCommand default template.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleRestore}
            >
              Restore to Default
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
