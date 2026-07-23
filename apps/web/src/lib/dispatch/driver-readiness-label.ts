// Pure, framework-free helper that maps a driver readiness object (as returned
// by trpc.workflows.instance.getDriverReadiness) to a 3-state UI label.
//
// Order matters: NO_ONBOARDING_INSTANCE must be checked FIRST because that
// warning is returned alongside isReady: true (deliberate quick-497 behavior —
// see project_workflow_driver_readiness_wiring memory note). If we checked
// isReady first, a driver who never started onboarding would show as "ready".

export interface DriverReadinessInput {
  isReady: boolean;
  blockerStepNames: string[];
  openInstanceId: string | null;
  userId: string | null;
  warning?: 'NO_ONBOARDING_INSTANCE';
}

export interface DriverReadinessLabel {
  tone: 'ready' | 'not_started' | 'incomplete';
  title: string;
  detail?: string;
  href?: string;
}

export function driverReadinessLabel(r: DriverReadinessInput): DriverReadinessLabel {
  if (r.warning === 'NO_ONBOARDING_INSTANCE') {
    return { tone: 'not_started', title: 'Onboarding not started', href: '/checklists' };
  }

  if (!r.isReady) {
    return {
      tone: 'incomplete',
      title: 'Onboarding incomplete',
      detail: r.blockerStepNames.join(', ') || undefined,
      href: r.openInstanceId ? `/checklists/instances/${r.openInstanceId}` : undefined,
    };
  }

  return { tone: 'ready', title: 'Dispatch Ready' };
}

/**
 * Client-side preflight predicate — mirrors the server dispatch gate so the
 * "Create Dispatch" / "Create Trip" preflight check agrees with the 409 the
 * server would otherwise return for a NO_ONBOARDING_INSTANCE driver.
 */
export function canDispatchClientSide(r: DriverReadinessInput | undefined | null): boolean {
  return r ? (r.isReady && r.warning !== 'NO_ONBOARDING_INSTANCE') : true;
}
