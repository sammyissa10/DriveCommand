'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { manualTriggerRule } from '@/app/(admin)/actions/automations';

export function RuleDetailClient({ ruleId }: { ruleId: string }) {
  const [tenantId, setTenantId] = useState('');
  const [result, setResult] = useState<{ ok?: boolean; tenantName?: string; error?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const res = await manualTriggerRule(ruleId, tenantId.trim());
      setResult(res);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Manual Trigger</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-500">
          Enter a tenant UUID to trigger this rule immediately for that tenant. Executes only this specific run — does not affect other tenants.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={isPending || !tenantId.trim()}
            className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Triggering…' : 'Trigger Now'}
          </button>
        </form>
        {result?.ok && (
          <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            Triggered for {result.tenantName}. Check runs table below (refresh to see updated status).
          </div>
        )}
        {result?.error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {result.error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
