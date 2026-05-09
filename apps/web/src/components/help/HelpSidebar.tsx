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
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar';
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

function SidebarNav({ hubs }: HelpSidebarProps) {
  const pathname = usePathname();
  const currentSlug = pathname.split('/').pop();
  const { setOpenMobile } = useSidebar();

  return (
    <>
      <SidebarHeader className="border-b px-4 py-3">
        <Link
          href="/owner/help"
          className="flex items-center gap-2 font-semibold text-foreground"
          onClick={() => setOpenMobile(false)}
        >
          <BookOpen className="h-5 w-5 text-primary" />
          <span>Help Center</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <ScrollArea className="h-[calc(100vh-60px)]">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {hubs.map((hub) => {
                  const Icon = iconMap[hub.icon] || BookOpen;
                  const isHubActive = hub.features.some((f) => f.slug === currentSlug);

                  return (
                    <Collapsible
                      key={hub.id}
                      defaultOpen={isHubActive}
                      className="group/collapsible"
                    >
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton
                            className="w-full justify-between"
                            isActive={isHubActive && !currentSlug}
                          >
                            <span className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              <span className="truncate">{hub.name}</span>
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {hub.features.map((feature) => (
                              <SidebarMenuSubItem key={feature.slug}>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={feature.slug === currentSlug}
                                >
                                  <Link
                                    href={`/owner/help/${feature.slug}`}
                                    onClick={() => setOpenMobile(false)}
                                  >
                                    <span className="truncate">{feature.name}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </ScrollArea>
      </SidebarContent>
    </>
  );
}

export function HelpSidebar({ hubs }: HelpSidebarProps) {
  return (
    <Sidebar collapsible="none" className="hidden lg:flex">
      <SidebarNav hubs={hubs} />
    </Sidebar>
  );
}

export function HelpSidebarMobile({ hubs }: HelpSidebarProps) {
  const [open, setOpen] = useState(false);

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
        <MobileSidebarContent hubs={hubs} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

interface MobileSidebarContentProps {
  hubs: HubWithFeatures[];
  onNavigate: () => void;
}

function MobileSidebarContent({ hubs, onNavigate }: MobileSidebarContentProps) {
  const pathname = usePathname();
  const currentSlug = pathname.split('/').pop();

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <Link
          href="/owner/help"
          className="flex items-center gap-2 font-semibold text-foreground"
          onClick={onNavigate}
        >
          <BookOpen className="h-5 w-5 text-primary" />
          <span>Help Center</span>
        </Link>
      </div>
      <ScrollArea className="flex-1">
        <nav className="p-2">
          {hubs.map((hub) => {
            const Icon = iconMap[hub.icon] || BookOpen;
            const isHubActive = hub.features.some((f) => f.slug === currentSlug);

            return (
              <Collapsible key={hub.id} defaultOpen={isHubActive} className="mb-1">
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <span>{hub.name}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="ml-4 border-l pl-3 pt-1">
                    {hub.features.map((feature) => (
                      <Link
                        key={feature.slug}
                        href={`/owner/help/${feature.slug}`}
                        onClick={onNavigate}
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
  );
}

// Export hub type for use in layout
export type { HubWithFeatures };
