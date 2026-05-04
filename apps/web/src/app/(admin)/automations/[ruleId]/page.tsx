export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getRuleWithRuns } from '@/app/(admin)/actions/automations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RuleDetailClient } from './rule-detail-client';
import { logger } from '@/lib/logger';

export default async function RuleDetailPage({ params }: { params: Promise<{ ruleId: string }> }) {
  const { ruleId } = await params;

  let rule: Awaited<ReturnType<typeof getRuleWithRuns>> | null = null;
  let fetchError: string | null = null;

  try {
    rule = await getRuleWithRuns(ruleId);
  } catch (err: unknown) {
    logger.error('[RuleDetailPage] getRuleWithRuns error:', err);
    fetchError = err instanceof Error ? err.message : 'Failed to load rule';
  }

  if (fetchError || !rule) {
    return (
      <div className="space-y-6">
        <Link href="/automations" className="text-sm text-gray-500 hover:text-gray-700">
          &larr; All Rules
        </Link>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-red-600">{fetchError || 'Rule not found'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/automations" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
        &larr; All Rules
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 font-mono">{rule.key}</h1>
        <p className="mt-1 text-sm text-gray-500">{rule.name}</p>
        {rule.description && (
          <p className="mt-1 text-sm text-gray-400">{rule.description}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Rule metadata */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Rule Config</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Trigger Event</span>
              <span className="font-mono text-xs text-gray-700">{rule.triggerEvent}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Scope</span>
              <span className="text-gray-700">{rule.scope}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Run Once / Tenant</span>
              <span className="text-gray-700">{rule.runOncePerTenant ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Active</span>
              <span className={rule.isActive ? 'text-green-600 font-medium' : 'text-gray-400'}>
                {rule.isActive ? 'Yes' : 'No'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Manual trigger */}
        <RuleDetailClient ruleId={ruleId} />
      </div>

      {/* Last 10 runs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Last 10 Runs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rule.runs.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-gray-400">No runs yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-6 py-3">Tenant</th>
                  <th className="px-6 py-3">Triggered By</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Scheduled At</th>
                  <th className="px-6 py-3">Fired At</th>
                  <th className="px-6 py-3">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rule.runs.map((run) => (
                  <tr key={run.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900">
                      <Link href={`/tenants/${run.tenantId}`} className="hover:underline text-blue-600 text-xs">
                        {run.tenant?.name ?? run.tenantId.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-6 py-3 font-mono text-xs text-gray-500">{run.triggeredBy}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        run.status === 'SENT' ? 'bg-green-100 text-green-700' :
                        run.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                        run.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-500 text-xs">
                      {run.scheduledAt ? new Date(run.scheduledAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-6 py-3 text-gray-500 text-xs">
                      {new Date(run.firedAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-3 text-red-500 text-xs max-w-xs truncate">
                      {run.errorMessage ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
