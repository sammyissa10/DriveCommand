import { listIntegrations } from '@/app/(owner)/actions/integrations';
import { IntegrationsManager } from './integrations-manager';

export default async function IntegrationsPage() {
  const integrations = await listIntegrations();

  // Build configMap: provider -> configJson for passing API token data to client
  const configMap: Record<string, Record<string, string>> = {};
  for (const integration of integrations) {
    if (integration.configJson && typeof integration.configJson === 'object') {
      configMap[integration.provider] = integration.configJson as Record<string, string>;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Integrations</h1>
        <p className="text-muted-foreground mt-1">
          Connect DriveCommand to external services like ELDs, accounting software, and factoring companies.
        </p>
      </div>
      <IntegrationsManager initialIntegrations={integrations} configMap={configMap} />
    </div>
  );
}
