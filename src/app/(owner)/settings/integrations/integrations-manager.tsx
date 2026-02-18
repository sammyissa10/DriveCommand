'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toggleIntegration } from '@/app/(owner)/actions/integrations';
import { IntegrationProvider, IntegrationCategory, TenantIntegration } from '@/generated/prisma';

type IntegrationDef = {
  provider: IntegrationProvider;
  category: IntegrationCategory;
  name: string;
  description: string;
  logoPlaceholder: string;
  comingSoon: boolean;
};

const CATALOG: IntegrationDef[] = [
  {
    provider: 'QUICKBOOKS',
    category: 'ACCOUNTING',
    name: 'QuickBooks',
    description: 'Sync invoices, expenses, and payroll with QuickBooks Online.',
    logoPlaceholder: 'QB',
    comingSoon: true,
  },
  {
    provider: 'SAMSARA',
    category: 'ELD',
    name: 'Samsara',
    description: 'Import GPS tracking, HOS logs, and safety events from Samsara.',
    logoPlaceholder: 'SA',
    comingSoon: true,
  },
  {
    provider: 'KEEP_TRUCKIN',
    category: 'ELD',
    name: 'KeepTruckin',
    description: 'Sync driver HOS and vehicle tracking from KeepTruckin ELD.',
    logoPlaceholder: 'KT',
    comingSoon: true,
  },
  {
    provider: 'TRIUMPH_FACTORING',
    category: 'FACTORING',
    name: 'Triumph Business Capital',
    description: 'Submit invoices for factoring and track funding status.',
    logoPlaceholder: 'TB',
    comingSoon: true,
  },
  {
    provider: 'OTR_SOLUTIONS',
    category: 'FACTORING',
    name: 'OTR Solutions',
    description: 'Connect invoice factoring with OTR Solutions.',
    logoPlaceholder: 'OT',
    comingSoon: true,
  },
  {
    provider: 'SENDGRID',
    category: 'EMAIL',
    name: 'SendGrid',
    description: 'Send transactional emails via SendGrid for load notifications and customer communications.',
    logoPlaceholder: 'SG',
    comingSoon: false,
  },
  {
    provider: 'MAILGUN',
    category: 'EMAIL',
    name: 'Mailgun',
    description: 'Reliable email delivery for automated customer communications.',
    logoPlaceholder: 'MG',
    comingSoon: false,
  },
];

const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  ACCOUNTING: 'Accounting',
  ELD: 'ELD / Telematics',
  FACTORING: 'Factoring',
  EMAIL: 'Email',
};

const CATEGORY_ORDER: IntegrationCategory[] = ['ELD', 'ACCOUNTING', 'FACTORING', 'EMAIL'];

type Props = {
  initialIntegrations: TenantIntegration[];
};

export function IntegrationsManager({ initialIntegrations }: Props) {
  // Map provider -> enabled state for optimistic UI
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const integration of initialIntegrations) {
      map[integration.provider] = integration.enabled;
    }
    return map;
  });

  async function handleToggle(def: IntegrationDef, newEnabled: boolean) {
    // Optimistic update
    setEnabledMap((prev) => ({ ...prev, [def.provider]: newEnabled }));

    const result = await toggleIntegration(def.provider, def.category, newEnabled);
    if (result && 'error' in result) {
      // Revert on failure
      setEnabledMap((prev) => ({ ...prev, [def.provider]: !newEnabled }));
      toast.error(`Failed to update ${def.name} integration.`);
    }
  }

  function handleComingSoonClick(def: IntegrationDef) {
    toast.info(`Coming Soon — ${def.name} integration is not yet available. Check back soon.`);
  }

  // Group CATALOG by category in defined order
  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    items: CATALOG.filter((d) => d.category === category),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <div key={group.category}>
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">
            {group.label}
          </p>
          <div className="space-y-3">
            {group.items.map((def) => (
              <Card
                key={def.provider}
                className={def.comingSoon ? 'cursor-pointer' : undefined}
                onClick={def.comingSoon ? () => handleComingSoonClick(def) : undefined}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  {/* Logo placeholder */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-sm font-bold">
                    {def.logoPlaceholder}
                  </div>

                  {/* Name and description */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">{def.name}</p>
                    <p className="text-sm text-muted-foreground">{def.description}</p>
                  </div>

                  {/* Action: badge for coming soon, switch for available */}
                  <div className="shrink-0">
                    {def.comingSoon ? (
                      <Badge variant="secondary">Coming Soon</Badge>
                    ) : (
                      <Switch
                        checked={!!enabledMap[def.provider]}
                        onCheckedChange={(checked) => handleToggle(def, checked)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
