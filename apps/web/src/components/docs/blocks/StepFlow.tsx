import React from 'react';

interface StepProps {
  title: string;
  children: React.ReactNode;
}

function Step({ title, children }: StepProps) {
  return <div>{children}</div>;
}

interface StepFlowProps {
  children: React.ReactNode;
}

export function StepFlow({ children }: StepFlowProps) {
  const steps = React.Children.toArray(children);

  return (
    <div className="space-y-8">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;

        // Extract props from step element
        const stepElement = step as React.ReactElement<StepProps>;
        const { title, children: stepChildren } = stepElement.props;

        return (
          <div key={index} className="relative pl-12">
            {/* Connector line - skip on last item */}
            {!isLast && (
              <div className="absolute left-4 top-8 bottom-0 w-0.5 bg-border -mb-8" />
            )}

            {/* Number circle */}
            <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
              {index + 1}
            </div>

            {/* Content */}
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {title}
              </h3>
              <div className="text-muted-foreground">{stepChildren}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Compound component pattern
StepFlow.Step = Step;
