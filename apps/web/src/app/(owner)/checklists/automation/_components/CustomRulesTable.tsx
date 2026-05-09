'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
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

// Plain-English labels for trigger events
const EVENT_LABELS: Record<string, string> = {
  ON_DRIVER_CREATE: 'A driver is added',
  ON_VEHICLE_CREATE: 'A truck is added',
  ON_DISPATCH_CREATE: 'A dispatch is created',
  ON_DISPATCH_DEPART: 'A dispatch departs',
  ON_DISPATCH_DELIVER: 'A dispatch is delivered',
  ON_PARTNER_CREATE: 'A partner is added',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonValue = any;

interface CustomRule {
  id: string;
  triggerEvent: string;
  conditions: JsonValue;
  isActive: boolean;
  playbookId: string;
  playbookName: string;
  createdAt: Date | string;
}

interface CustomRulesTableProps {
  rules: CustomRule[];
  isLoading: boolean;
  onDelete: (triggerId: string) => void;
  deletingId: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatConditions(conditions: any): string {
  if (!conditions || typeof conditions !== 'object' || Array.isArray(conditions)) return 'All';
  const entries = Object.entries(conditions as Record<string, unknown>);
  if (entries.length === 0) return 'All';
  return entries.map(([k, v]) => `${k} = ${String(v)}`).join(', ');
}

export function CustomRulesTable({ rules, isLoading, onDelete, deletingId }: CustomRulesTableProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
          Loading...
        </div>
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="h-40 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <p>No custom rules yet.</p>
          <p className="text-xs">Click &ldquo;Create Custom Rule&rdquo; to add one.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground w-[220px]">When</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">For which records</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Checklist</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground w-[90px]">Status</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground w-[56px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium">
                  {EVENT_LABELS[rule.triggerEvent] ?? rule.triggerEvent}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatConditions(rule.conditions)}
                </td>
                <td className="px-4 py-3">{rule.playbookName}</td>
                <td className="px-4 py-3">
                  <Badge
                    variant={rule.isActive ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {rule.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setConfirmDeleteId(rule.id)}
                    disabled={deletingId === rule.id}
                    aria-label={`Delete rule: ${EVENT_LABELS[rule.triggerEvent] ?? rule.triggerEvent} — ${rule.playbookName}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Confirm delete dialog */}
      <AlertDialog
        open={Boolean(confirmDeleteId)}
        onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this auto-start rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the rule. Any checklists already started by this
              rule will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDeleteId) {
                  onDelete(confirmDeleteId);
                  setConfirmDeleteId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
