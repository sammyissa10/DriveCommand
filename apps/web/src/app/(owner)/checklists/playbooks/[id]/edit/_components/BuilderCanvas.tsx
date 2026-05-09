'use client';

import type { PhaseType } from '@drivecommand/validation';
import { PhaseSection } from './PhaseSection';
import { BuilderStepRow } from './BuilderStepRow';
import type { PlaybookStepItem } from './BuilderClient';

interface BuilderCanvasProps {
  steps: PlaybookStepItem[];
  playbookId: string;
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
}

const PHASE_ORDER: PhaseType[] = ['PRE_START', 'DAY_1', 'WEEK_1', 'ONGOING', 'NONE'];

const PHASE_LABELS: Record<PhaseType, string> = {
  PRE_START: 'Before Start',
  DAY_1: 'Day 1',
  WEEK_1: 'First Week',
  ONGOING: 'Ongoing',
  NONE: 'Unassigned',
};

export function BuilderCanvas({
  steps,
  playbookId,
  selectedStepId,
  onSelectStep,
}: BuilderCanvasProps) {
  // Group steps by phase, sorted by sequence within each phase
  const stepsByPhase = PHASE_ORDER.reduce<Record<PhaseType, PlaybookStepItem[]>>(
    (acc, phase) => {
      acc[phase] = steps
        .filter((s) => s.playbookPhase === phase)
        .sort((a, b) => a.sequence - b.sequence);
      return acc;
    },
    {} as Record<PhaseType, PlaybookStepItem[]>,
  );

  return (
    <div className="flex flex-col gap-3 overflow-y-auto">
      {PHASE_ORDER.map((phase) => {
        const phaseSteps = stepsByPhase[phase];
        return (
          <PhaseSection
            key={phase}
            phase={phase}
            label={PHASE_LABELS[phase]}
            stepIds={phaseSteps.map((s) => s.id)}
          >
            {phaseSteps.map((step) => (
              <BuilderStepRow
                key={step.id}
                step={step}
                playbookId={playbookId}
                isSelected={selectedStepId === step.id}
                onSelect={onSelectStep}
              />
            ))}
          </PhaseSection>
        );
      })}
    </div>
  );
}
