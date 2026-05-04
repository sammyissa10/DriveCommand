export const dynamic = 'force-dynamic';

import { getAutomationRules } from '@/app/(admin)/actions/automations';
import { AutomationsListClient } from './automations-list-client';
import { logger } from '@/lib/logger';

export default async function AutomationsPage() {
  let rules: Awaited<ReturnType<typeof getAutomationRules>> = [];
  try {
    rules = await getAutomationRules();
  } catch (err) {
    logger.error('[AutomationsPage] getAutomationRules error:', err);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Automation Rules</h1>
        <p className="mt-1 text-sm text-gray-500">
          {rules.length} rule{rules.length !== 1 ? 's' : ''} — click a rule to inspect runs or manually trigger
        </p>
      </div>
      <AutomationsListClient rules={rules} />
    </div>
  );
}
