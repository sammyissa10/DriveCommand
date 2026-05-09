import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { prisma } from '@/lib/db/prisma';

interface Props {
  tenantId: string;
}

export async function AutomationRunsSection({ tenantId }: Props) {
  const runs = await prisma.automationRun.findMany({
    where: { tenantId },
    orderBy: { firedAt: 'desc' },
    take: 10,
    select: {
      id: true,
      triggeredBy: true,
      status: true,
      firedAt: true,
      scheduledAt: true,
      errorMessage: true,
      rule: { select: { key: true, id: true } },
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Automation Runs (last 10)</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {runs.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-gray-400">No automation runs yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-6 py-3">Rule</th>
                <th className="px-6 py-3">Triggered By</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Fired At</th>
                <th className="px-6 py-3">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.map((run) => (
                <tr key={run.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-mono text-xs">
                    {run.rule ? (
                      <Link href={`/automations/${run.rule.id}`} className="text-blue-600 hover:underline">
                        {run.rule.key}
                      </Link>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
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
                  <td className="px-6 py-3 text-xs text-gray-500">
                    {new Date(run.firedAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-3 text-xs text-red-500 max-w-xs truncate">
                    {run.errorMessage ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
