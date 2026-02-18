import { listIntegrations } from '@/app/(owner)/actions/integrations';
import { IntegrationsManager } from './integrations-manager';

export default async function IntegrationsPage() {
  const integrations = await listIntegrations();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Integrations</h1>
        <p className="text-muted-foreground mt-1">
          Connect DriveCommand to external services like ELDs, accounting software, and factoring companies.
        </p>
      </div>
      <IntegrationsManager initialIntegrations={integrations} />
    </div>
  );
}
