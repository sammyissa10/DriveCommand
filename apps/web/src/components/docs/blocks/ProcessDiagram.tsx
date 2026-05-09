import React from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface ProcessStep {
  label: string;
  description?: string;
}

interface ProcessDiagramProps {
  steps: ProcessStep[];
}

export function ProcessDiagram({ steps }: ProcessDiagramProps) {
  return (
    <div className="my-6">
      {/* Desktop: horizontal layout */}
      <div className="hidden sm:flex items-center gap-4">
        {steps.map((step, index) => (
          <React.Fragment key={index}>
            {/* Step box */}
            <div className="flex-1 flex flex-col items-center">
              <div className="w-full rounded bg-card border border-border p-3 text-center">
                <div className="font-semibold text-foreground text-sm">
                  {step.label}
                </div>
                {step.description && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {step.description}
                  </div>
                )}
              </div>
            </div>

            {/* Arrow - skip on last item */}
            {index < steps.length - 1 && (
              <ChevronRight className="flex-shrink-0 h-5 w-5 text-muted-foreground" />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Mobile: vertical layout */}
      <div className="flex sm:hidden flex-col gap-4">
        {steps.map((step, index) => (
          <React.Fragment key={index}>
            {/* Step box */}
            <div className="rounded bg-card border border-border p-3">
              <div className="font-semibold text-foreground text-sm">
                {step.label}
              </div>
              {step.description && (
                <div className="text-xs text-muted-foreground mt-1">
                  {step.description}
                </div>
              )}
            </div>

            {/* Arrow - skip on last item */}
            {index < steps.length - 1 && (
              <div className="flex justify-center">
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
