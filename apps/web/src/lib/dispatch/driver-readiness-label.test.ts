import { describe, expect, it } from 'vitest';
import { canDispatchClientSide, driverReadinessLabel } from './driver-readiness-label';

describe('driverReadinessLabel', () => {
  it('ready: isReady true, no warning, no blockers -> tone ready, no href', () => {
    const label = driverReadinessLabel({
      isReady: true,
      blockerStepNames: [],
      openInstanceId: null,
      userId: 'u1',
    });

    expect(label.tone).toBe('ready');
    expect(label.title).toBe('Dispatch Ready');
    expect(label.href).toBeUndefined();
    expect(label.detail).toBeUndefined();
  });

  it('not_started: isReady true + NO_ONBOARDING_INSTANCE warning -> tone not_started, href /checklists', () => {
    const label = driverReadinessLabel({
      isReady: true,
      warning: 'NO_ONBOARDING_INSTANCE',
      blockerStepNames: [],
      openInstanceId: null,
      userId: 'u1',
    });

    expect(label.tone).toBe('not_started');
    expect(label.title).toBe('Onboarding not started');
    expect(label.href).toBe('/checklists');
  });

  it('incomplete: isReady false with blockers + openInstanceId -> tone incomplete, joined detail, instance href', () => {
    const label = driverReadinessLabel({
      isReady: false,
      blockerStepNames: ['CDL Upload', 'Drug Test'],
      openInstanceId: 'inst-9',
      userId: 'u1',
    });

    expect(label.tone).toBe('incomplete');
    expect(label.title).toBe('Onboarding incomplete');
    expect(label.detail).toBe('CDL Upload, Drug Test');
    expect(label.href).toBe('/checklists/instances/inst-9');
  });

  it('incomplete with null openInstanceId -> href undefined', () => {
    const label = driverReadinessLabel({
      isReady: false,
      blockerStepNames: ['CDL Upload'],
      openInstanceId: null,
      userId: 'u1',
    });

    expect(label.tone).toBe('incomplete');
    expect(label.href).toBeUndefined();
  });

  it('canDispatchClientSide returns false for a NO_ONBOARDING_INSTANCE driver', () => {
    expect(
      canDispatchClientSide({
        isReady: true,
        warning: 'NO_ONBOARDING_INSTANCE',
        blockerStepNames: [],
        openInstanceId: null,
        userId: 'u1',
      })
    ).toBe(false);
  });

  it('canDispatchClientSide returns true for a clean ready driver', () => {
    expect(
      canDispatchClientSide({
        isReady: true,
        blockerStepNames: [],
        openInstanceId: null,
        userId: 'u1',
      })
    ).toBe(true);
  });
});
