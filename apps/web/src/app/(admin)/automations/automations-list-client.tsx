'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { toggleRuleActive } from '@/app/(admin)/actions/automations';

interface RuleRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  triggerEvent: string;
  isActive: boolean;
  runOncePerTenant: boolean;
  scope: string;
  _count: { runs: number };
}

export function AutomationsListClient({ rules }: { rules: RuleRow[] }) {
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [isPending, startTransition] = useTransition();

  function handleToggle(ruleId: string, current: boolean) {
    const next = !current;
    setOptimistic((prev) => ({ ...prev, [ruleId]: next }));
    startTransition(async () => {
      await toggleRuleActive(ruleId, next);
    });
  }

  if (rules.length === 0) {
    return (
      <Card>
        <CardContent className="px-6 py-12 text-center text-sm text-gray-500">
          No automation rules found.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-6 py-3">Rule Key</th>
              <th className="px-6 py-3">Trigger Event</th>
              <th className="px-6 py-3">Scope</th>
              <th className="px-6 py-3">Once / Tenant</th>
              <th className="px-6 py-3">Total Runs</th>
              <th className="px-6 py-3">Active</th>
              <th className="px-6 py-3">Inspect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rules.map((rule) => {
              const isActive = optimistic[rule.id] !== undefined ? optimistic[rule.id] : rule.isActive;
              return (
                <tr key={rule.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-mono text-xs text-gray-700">{rule.key}</td>
                  <td className="px-6 py-4 font-mono text-xs text-gray-500">{rule.triggerEvent}</td>
                  <td className="px-6 py-4 text-gray-600">{rule.scope}</td>
                  <td className="px-6 py-4 text-gray-600">{rule.runOncePerTenant ? 'Yes' : 'No'}</td>
                  <td className="px-6 py-4 text-gray-600">{rule._count.runs}</td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleToggle(rule.id, isActive)}
                      disabled={isPending}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                        isActive ? 'bg-blue-600' : 'bg-gray-300'
                      } ${isPending ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                      aria-label={isActive ? 'Deactivate rule' : 'Activate rule'}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          isActive ? 'translate-x-4' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      href={`/automations/${rule.id}`}
                      className="text-blue-600 hover:text-blue-800 text-xs font-medium hover:underline"
                    >
                      View runs &rarr;
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
