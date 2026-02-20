'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toggleIntegration, saveIntegrationConfig } from '@/app/(owner)/actions/integrations';
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
    comingSoon: false,
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
  configMap?: Record<string, Record<string, string>>;
};

/**
 * Mask an API token showing only the last 4 characters.
 */
function maskToken(token: string): string {
  if (token.length <= 4) return '****';
  return '*'.repeat(Math.min(token.length - 4, 20)) + token.slice(-4);
}

export function IntegrationsManager({ initialIntegrations, configMap }: Props) {
  // Map provider -> enabled state for optimistic UI
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const integration of initialIntegrations) {
      map[integration.provider] = integration.enabled;
    }
    return map;
  });

  // Samsara-specific state
  const existingToken = configMap?.SAMSARA?.apiToken || '';
  const [samsaraToken, setSamsaraToken] = useState('');
  const [isEditingToken, setIsEditingToken] = useState(!existingToken);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

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

  async function handleSaveToken() {
    if (!samsaraToken.trim()) {
      toast.error('Please enter an API token.');
      return;
    }
    setIsSaving(true);
    try {
      const result = await saveIntegrationConfig('SAMSARA', { apiToken: samsaraToken.trim() });
      if (result && 'error' in result) {
        toast.error(result.error);
      } else {
        toast.success('Samsara API token saved successfully.');
        setIsEditingToken(false);
        // Update enabled state since saving also enables
        setEnabledMap((prev) => ({ ...prev, SAMSARA: true }));
      }
    } catch {
      toast.error('Failed to save API token.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSyncNow() {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/integrations/samsara/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        toast.error(body.error || 'Sync failed.');
        return;
      }

      const data = await response.json();
      toast.success(`Synced ${data.synced} vehicle location(s).${
        data.unmatched?.length ? ` ${data.unmatched.length} unmatched.` : ''
      }`);
    } catch {
      toast.error('Failed to trigger sync.');
    } finally {
      setIsSyncing(false);
    }
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
              <div key={def.provider}>
                <Card
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

                {/* Samsara config panel — shown when enabled */}
                {def.provider === 'SAMSARA' && enabledMap['SAMSARA'] && (
                  <div className="ml-14 mt-2 p-4 border rounded-lg bg-muted/30 space-y-3">
                    <p className="text-sm font-medium text-foreground">Samsara Configuration</p>

                    {isEditingToken ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="password"
                          placeholder="Enter your Samsara API token"
                          value={samsaraToken}
                          onChange={(e) => setSamsaraToken(e.target.value)}
                          className="max-w-md"
                        />
                        <Button
                          size="sm"
                          onClick={handleSaveToken}
                          disabled={isSaving}
                        >
                          {isSaving ? 'Saving...' : 'Save'}
                        </Button>
                        {existingToken && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setIsEditingToken(false);
                              setSamsaraToken('');
                            }}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <code className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded">
                          {maskToken(existingToken)}
                        </code>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setIsEditingToken(true)}
                        >
                          Edit
                        </Button>
                      </div>
                    )}

                    {/* Sync Now button — only if token is configured */}
                    {(existingToken || !isEditingToken) && (
                      <div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleSyncNow}
                          disabled={isSyncing}
                        >
                          {isSyncing ? 'Syncing...' : 'Sync Now'}
                        </Button>
                        <p className="text-xs text-muted-foreground mt-1">
                          Manually pull the latest vehicle locations from Samsara.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
