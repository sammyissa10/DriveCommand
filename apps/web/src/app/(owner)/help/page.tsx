import Link from 'next/link';
import { getAllFeatures } from '@/lib/docs/get-features';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BookOpen,
  Sparkles,
  Clock,
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
} from 'lucide-react';
import ia from '../../../../../../docs-content/_ia.json';

// Icon mapping for hub icons
const iconMap: Record<string, React.ReactNode> = {
  Rocket: <Rocket className="h-5 w-5" />,
  Truck: <Truck className="h-5 w-5" />,
  Users: <Users className="h-5 w-5" />,
  ListChecks: <ListChecks className="h-5 w-5" />,
  DollarSign: <DollarSign className="h-5 w-5" />,
  Shield: <Shield className="h-5 w-5" />,
  Brain: <Brain className="h-5 w-5" />,
  MessageSquare: <MessageSquare className="h-5 w-5" />,
  Settings: <Settings className="h-5 w-5" />,
  LifeBuoy: <LifeBuoy className="h-5 w-5" />,
  BookOpen: <BookOpen className="h-5 w-5" />,
};

export default function HelpHomePage() {
  const allFeatures = getAllFeatures();

  return (
    <div className="space-y-8">
      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/owner/help/whats-new">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center gap-3 p-4">
              <Sparkles className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">What&apos;s New</CardTitle>
                <CardDescription className="text-xs">Latest features and updates</CardDescription>
              </div>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/support">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center gap-3 p-4">
              <BookOpen className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">Support</CardTitle>
                <CardDescription className="text-xs">Contact our team</CardDescription>
              </div>
            </CardHeader>
          </Card>
        </Link>
        <Card className="opacity-60">
          <CardHeader className="flex flex-row items-center gap-3 p-4">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">Video Tutorials</CardTitle>
              <CardDescription className="text-xs">Coming soon</CardDescription>
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Hubs from _ia.json */}
      {ia.clientHubs.map((hub: any) => {
        // Skip Getting Started hub if it has no features
        if (hub.features.length === 0) return null;

        // Get features for this hub
        const hubFeatures = allFeatures.filter(
          (f) => hub.features.includes(f.slug) && f.requiresClientDoc
        );

        if (hubFeatures.length === 0) return null;

        const icon = iconMap[hub.icon] || <BookOpen className="h-5 w-5" />;

        return (
          <section key={hub.id}>
            <div className="flex items-center gap-2 mb-4">
              {icon}
              <div>
                <h2 className="text-lg font-semibold">{hub.name}</h2>
                <p className="text-sm text-muted-foreground">{hub.description}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {hubFeatures.map((feature) => (
                <Link key={feature.slug} href={`/owner/help/${feature.slug}`}>
                  <Card className="h-full hover:bg-muted/50 transition-colors cursor-pointer">
                    <CardHeader className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">{feature.name}</CardTitle>
                        {feature.planTier !== 'free' && feature.planTier !== 'starter' && (
                          <Badge variant="secondary" className="text-xs shrink-0">
                            {feature.planTier}
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-sm line-clamp-2">
                        {feature.shortDescription}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
