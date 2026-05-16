import { listIntegrations } from '@/app/(owner)/actions/integrations';
import { IntegrationsManager } from './integrations-manager';
import { SettingsHeader } from "@/components/settings/SettingsHeader"
import { SETTINGS_PAGE_META } from "@/components/settings/settings.config"

const meta = SETTINGS_PAGE_META.integrations

/**
 * Integrations Settings Page
 *
 * Connect DriveCommand to external services:
 * - ELD providers (Samsara, Motive/KeepTruckin)
 * - Accounting software (QuickBooks)
 * - Factoring companies
 * - And more
 *
 * This page uses the existing IntegrationsManager component which handles
 * connection, configuration, and status display for each integration.
 */
export default async function IntegrationsPage() {
  const integrations = await listIntegrations().catch(() => []);

  // Build configMap: provider -> configJson for passing API token data to client
  const configMap: Record<string, Record<string, string>> = {};
  for (const integration of integrations) {
    if (integration.configJson && typeof integration.configJson === 'object') {
      configMap[integration.provider] = integration.configJson as Record<string, string>;
    }
  }

  return (
    <div>
      <SettingsHeader title={meta.title} subtitle={meta.subtitle} />
      <IntegrationsManager initialIntegrations={integrations} configMap={configMap} />
    </div>
  );
}
