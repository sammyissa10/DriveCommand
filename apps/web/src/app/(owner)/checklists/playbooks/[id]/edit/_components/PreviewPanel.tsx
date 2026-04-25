'use client';

import { X, Smartphone, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Minimal step shape needed for preview (sourced from BuilderClient's steps state)
interface PreviewStep {
  id: string;
  name: string;
  stepType: string;
  assigneeRole: string;
  isRequired: boolean;
  isDispatchBlocker: boolean;
  dueWithinHours?: number | null;
  playbookPhase: string;
  sequence: number;
}

interface PreviewPanelProps {
  playbookName: string;
  category: string;
  steps: PreviewStep[];
  onClose: () => void;
}

export function PreviewPanel({ playbookName, category, steps, onClose }: PreviewPanelProps) {
  const estimatedMinutes = steps.length * 5; // rough 5 min/step estimate

  return (
    // position:fixed — does NOT affect DnD flex layout (critical: avoids DragOverlay offset bugs)
    <div
      className="fixed top-0 right-0 h-screen w-[400px] bg-background border-l border-border shadow-2xl z-50 flex flex-col"
      style={{ top: 0 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <span className="font-semibold text-sm">Preview</span>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close preview">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="driver" className="flex flex-col flex-1 min-h-0">
        <TabsList className="mx-4 mt-3 flex-shrink-0">
          <TabsTrigger value="driver" className="flex items-center gap-1.5">
            <Smartphone className="h-3.5 w-3.5" />
            Driver View
          </TabsTrigger>
          <TabsTrigger value="dispatcher" className="flex items-center gap-1.5">
            <ClipboardList className="h-3.5 w-3.5" />
            Dispatcher
          </TabsTrigger>
        </TabsList>

        {/* Driver View — phone frame */}
        <TabsContent value="driver" className="flex-1 overflow-y-auto p-4">
          <div className="flex justify-center">
            {/* CSS phone frame — no external library */}
            <div
              className="relative bg-zinc-900 rounded-[40px] shadow-xl overflow-hidden"
              style={{ width: 375, minHeight: 600, padding: '48px 12px 36px' }}
            >
              {/* Notch */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-24 h-5 bg-black rounded-full" />

              {/* Phone screen content */}
              <div className="bg-background rounded-[28px] overflow-y-auto h-full p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground px-1 pb-1">
                  {playbookName}
                </p>
                {steps.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">No steps yet</p>
                )}
                {steps.map((step) => (
                  <div
                    key={step.id}
                    className="rounded-lg border border-border bg-card px-3 py-2 space-y-1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-medium leading-tight">{step.name}</span>
                      {step.isRequired && (
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">Required</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {step.stepType.replace(/_/g, ' ')}
                      </Badge>
                      {step.dueWithinHours && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          Due in {step.dueWithinHours}h
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Dispatcher tab — summary card */}
        <TabsContent value="dispatcher" className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Playbook</p>
              <p className="font-semibold">{playbookName}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Category</p>
                <p className="text-sm font-medium">{category.replace(/_/g, ' ')}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Steps</p>
                <p className="text-sm font-medium">{steps.length}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Est. time</p>
                <p className="text-sm font-medium">~{estimatedMinutes} min</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Required steps</p>
                <p className="text-sm font-medium">{steps.filter((s) => s.isRequired).length}</p>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Step Summary</p>
            {steps.map((step) => (
              <div key={step.id} className="flex items-center gap-2 text-sm py-1 border-b border-border last:border-0">
                <span className="flex-1 truncate">{step.name}</span>
                <Badge variant="outline" className="text-[10px] flex-shrink-0">
                  {step.assigneeRole}
                </Badge>
              </div>
            ))}
            {steps.length === 0 && (
              <p className="text-xs text-muted-foreground">No steps added yet.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
