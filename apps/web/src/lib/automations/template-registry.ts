/**
 * Template registry for the automation send_email action.
 *
 * Maps a templateKey (from actionsJson) to:
 *   - subject: function that returns the email subject line
 *   - buildElement: function that returns a React element for the email body
 *
 * Plan 52-01 registers: welcome-owner, activation-celebration
 * Plan 52-02 registers: no-progress-nudge, add-driver-nudge, dispatch-load-nudge, trial-ending-soon
 */

import React from 'react';
import { WelcomeOwnerEmail } from '@/emails/welcome-owner';
import { ActivationCelebrationEmail } from '@/emails/activation-celebration';
import { getAppBaseUrl } from '@/lib/app-url';

export interface TemplateContext {
  tenantId: string;
  ownerEmail: string;
  firstName: string;
  companyName: string;
  trialEndsAt?: string; // formatted date string, e.g. "May 30, 2026"
  daysLeft?: number;
}

type TemplateEntry = {
  subject: (ctx: TemplateContext) => string;
  buildElement: (ctx: TemplateContext) => React.ReactElement;
};

export const TEMPLATE_REGISTRY: Record<string, TemplateEntry> = {
  'welcome-owner': {
    subject: () => 'Welcome to DriveCommand — your fleet platform is ready',
    buildElement: (ctx) =>
      React.createElement(WelcomeOwnerEmail, {
        firstName: ctx.firstName,
        companyName: ctx.companyName,
        trialEndsAt: ctx.trialEndsAt ?? '',
        dashboardUrl: `${getAppBaseUrl()}/dashboard`,
      }),
  },
  'activation-celebration': {
    subject: (ctx) => `${ctx.companyName} just completed onboarding — here's what's next`,
    buildElement: (ctx) =>
      React.createElement(ActivationCelebrationEmail, {
        firstName: ctx.firstName,
        companyName: ctx.companyName,
        dashboardUrl: `${getAppBaseUrl()}/dashboard`,
      }),
  },
};
