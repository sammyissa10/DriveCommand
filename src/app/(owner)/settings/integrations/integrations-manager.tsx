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
    name: 'Motive (KeepTruckin)',
    description: 'Import GPS tracking, HOS logs, and vehicle locations from Motive (formerly KeepTruckin).',
    logoPlaceholder: 'MO',
    comingSoon: false,
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

// ELD providers that support token-based config + manual sync
type EldProviderKey = 'SAMSARA' | 'KEEP_TRUCKIN';
const ELD_PROVIDERS: EldProviderKey[] = ['SAMSARA', 'KEEP_TRUCKIN'];

/** Per-provider state for token editing and sync */
type EldProviderState = {
  token: string;
  isEditing: boolean;
  isSaving: boolean;
  isSyncing: boolean;
};

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

/** Map an ELD provider key to its sync API path */
function eldSyncPath(provider: EldProviderKey): string {
  if (provider === 'SAMSARA') return '/api/integrations/samsara/sync';
  return '/api/integrations/motive/sync';
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

  // Per-ELD-provider state (token input, editing, saving, syncing)
  const [eldState, setEldState] = useState<Record<EldProviderKey, EldProviderState>>(() => {
    const state = {} as Record<EldProviderKey, EldProviderState>;
    for (const provider of ELD_PROVIDERS) {
      const existingToken = configMap?.[provider]?.apiToken || '';
      state[provider] = {
        token: '',
        isEditing: !existingToken,
        isSaving: false,
        isSyncing: false,
      };
    }
    return state;
  });

  function setEldField<K extends keyof EldProviderState>(
    provider: EldProviderKey,
    field: K,
    value: EldProviderState[K]
  ) {
    setEldState((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], [field]: value },
    }));
  }

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

  async function handleSaveToken(provider: EldProviderKey, providerName: string) {
    const token = eldState[provider].token.trim();
    if (!token) {
      toast.error('Please enter an API token.');
      return;
    }
    setEldField(provider, 'isSaving', true);
    try {
      const result = await saveIntegrationConfig(provider, { apiToken: token });
      if (result && 'error' in result) {
        toast.error(result.error);
      } else {
        toast.success(`${providerName} API token saved successfully.`);
        setEldField(provider, 'isEditing', false);
        // Update enabled state since saving also enables
        setEnabledMap((prev) => ({ ...prev, [provider]: true }));
      }
    } catch {
      toast.error('Failed to save API token.');
    } finally {
      setEldField(provider, 'isSaving', false);
    }
  }

  async function handleSyncNow(provider: EldProviderKey, providerName: string) {
    setEldField(provider, 'isSyncing', true);
    try {
      const response = await fetch(eldSyncPath(provider), {
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
      toast.success(`Synced ${data.synced} vehicle location(s) from ${providerName}.${
        data.unmatched?.length ? ` ${data.unmatched.length} unmatched.` : ''
      }`);
    } catch {
      toast.error('Failed to trigger sync.');
    } finally {
      setEldField(provider, 'isSyncing', false);
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
            {group.items.map((def) => {
              const isEldProvider = ELD_PROVIDERS.includes(def.provider as EldProviderKey);
              const eldKey = def.provider as EldProviderKey;
              const providerState = isEldProvider ? eldState[eldKey] : null;
              const existingToken = configMap?.[def.provider]?.apiToken || '';

              return (
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

                  {/* Generic ELD config panel — shown when provider is ELD type and enabled */}
                  {isEldProvider && enabledMap[def.provider] && providerState && (
                    <div className="ml-14 mt-2 p-4 border rounded-lg bg-muted/30 space-y-3">
                      <p className="text-sm font-medium text-foreground">{def.name} Configuration</p>

                      {providerState.isEditing ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="password"
                            placeholder={`Enter your ${def.name} API token`}
                            value={providerState.token}
                            onChange={(e) => setEldField(eldKey, 'token', e.target.value)}
                            className="max-w-md"
                          />
                          <Button
                            size="sm"
                            onClick={() => handleSaveToken(eldKey, def.name)}
                            disabled={providerState.isSaving}
                          >
                            {providerState.isSaving ? 'Saving...' : 'Save'}
                          </Button>
                          {existingToken && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEldField(eldKey, 'isEditing', false);
                                setEldField(eldKey, 'token', '');
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
                            onClick={() => setEldField(eldKey, 'isEditing', true)}
                          >
                            Edit
                          </Button>
                        </div>
                      )}

                      {/* Sync Now button — only if token is configured */}
                      {(existingToken || !providerState.isEditing) && (
                        <div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSyncNow(eldKey, def.name)}
                            disabled={providerState.isSyncing}
                          >
                            {providerState.isSyncing ? 'Syncing...' : 'Sync Now'}
                          </Button>
                          <p className="text-xs text-muted-foreground mt-1">
                            Manually pull the latest vehicle locations from {def.name}.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
