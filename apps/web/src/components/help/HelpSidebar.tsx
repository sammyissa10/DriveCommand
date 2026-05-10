'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Rocket,
  Truck,
  Users,
  ListChecks,
  DollarSign,
  Shield,
  Brain,
  MessageSquare,
  Settings,
  LifeBuoy,
  BookOpen,
  ChevronRight,
  Menu,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import ia from '../../../../../docs-content/_ia.json';
import type { Feature } from '@/lib/docs/feature-registry-schema';

// Icon mapping for hub icons
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Rocket,
  Truck,
  Users,
  ListChecks,
  DollarSign,
  Shield,
  Brain,
  MessageSquare,
  Settings,
  LifeBuoy,
  BookOpen,
};

interface HubWithFeatures {
  id: string;
  name: string;
  description: string;
  icon: string;
  features: Feature[];
}

interface HelpSidebarProps {
  hubs: HubWithFeatures[];
}

export function HelpSidebar({ hubs }: HelpSidebarProps) {
  const pathname = usePathname();
  const currentSlug = pathname.split('/').pop();

  return (
    <aside className="w-64 border-r bg-card shrink-0 hidden lg:block">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="border-b px-4 py-3">
          <Link
            href="/help"
            className="flex items-center gap-2 font-semibold text-foreground hover:text-primary transition-colors"
          >
            <BookOpen className="h-5 w-5 text-primary" />
            <span>Help Center</span>
          </Link>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1">
          <nav className="p-2">
            {hubs.map((hub) => {
              const Icon = iconMap[hub.icon] || BookOpen;
              const isHubActive = hub.features.some((f) => f.slug === currentSlug);

              return (
                <Collapsible
                  key={hub.id}
                  defaultOpen={isHubActive}
                  className="mb-1 group/collapsible"
                >
                  <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium hover:bg-muted transition-colors">
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span className="truncate">{hub.name}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-4 border-l pl-3 pt-1 space-y-1">
                      {hub.features.map((feature) => (
                        <Link
                          key={feature.slug}
                          href={`/help/${feature.slug}`}
                          className={cn(
                            'block rounded-md px-3 py-1.5 text-sm transition-colors',
                            feature.slug === currentSlug
                              ? 'bg-primary/10 font-medium text-primary'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          )}
                        >
                          {feature.name}
                        </Link>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </nav>
        </ScrollArea>
      </div>
    </aside>
  );
}

export function HelpSidebarMobile({ hubs }: HelpSidebarProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const currentSlug = pathname.split('/').pop();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle navigation</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetTitle className="sr-only">Help Center Navigation</SheetTitle>
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="border-b px-4 py-3">
            <Link
              href="/help"
              className="flex items-center gap-2 font-semibold text-foreground hover:text-primary transition-colors"
              onClick={() => setOpen(false)}
            >
              <BookOpen className="h-5 w-5 text-primary" />
              <span>Help Center</span>
            </Link>
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1">
            <nav className="p-2">
              {hubs.map((hub) => {
                const Icon = iconMap[hub.icon] || BookOpen;
                const isHubActive = hub.features.some((f) => f.slug === currentSlug);

                return (
                  <Collapsible
                    key={hub.id}
                    defaultOpen={isHubActive}
                    className="mb-1 group/collapsible"
                  >
                    <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium hover:bg-muted transition-colors">
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <span>{hub.name}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="ml-4 border-l pl-3 pt-1 space-y-1">
                        {hub.features.map((feature) => (
                          <Link
                            key={feature.slug}
                            href={`/help/${feature.slug}`}
                            onClick={() => setOpen(false)}
                            className={cn(
                              'block rounded-md px-3 py-1.5 text-sm transition-colors',
                              feature.slug === currentSlug
                                ? 'bg-primary/10 font-medium text-primary'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            )}
                          >
                            {feature.name}
                          </Link>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </nav>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Export hub type for use in layout
export type { HubWithFeatures };
