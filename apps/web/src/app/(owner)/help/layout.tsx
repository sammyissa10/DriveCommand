import { HelpSearch } from '@/components/help/HelpSearch';
import { HelpSidebar, HelpSidebarMobile, type HubWithFeatures } from '@/components/help/HelpSidebar';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { getAllFeatures } from '@/lib/docs/get-features';
import ia from '../../../../../../docs-content/_ia.json';

// Build hub data with features
function getHubsWithFeatures(): HubWithFeatures[] {
  const allFeatures = getAllFeatures();

  return ia.clientHubs
    .map((hub) => {
      const hubFeatures = allFeatures.filter(
        (f) =>
          hub.features.includes(f.slug) &&
          f.requiresClientDoc &&
          (f.portal === 'owner' || f.portal === 'shared' || f.portal === 'driver')
      );

      return {
        id: hub.id,
        name: hub.name,
        description: hub.description,
        icon: hub.icon,
        features: hubFeatures,
      };
    })
    .filter((hub) => hub.features.length > 0);
}

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  const hubs = getHubsWithFeatures();

  return (
    <SidebarProvider defaultOpen>
      <HelpSidebar hubs={hubs} />
      <SidebarInset>
        <div className="flex flex-col min-h-screen">
          {/* Header */}
          <header className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
            <div className="flex items-center gap-4 px-4 py-3 lg:px-6">
              <HelpSidebarMobile hubs={hubs} />
              <div className="flex-1">
                <h1 className="text-lg font-semibold tracking-tight text-foreground lg:hidden">
                  Help Center
                </h1>
              </div>
              <div className="w-full max-w-xs lg:max-w-sm">
                <HelpSearch />
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 p-4 lg:p-6">{children}</main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
