import Link from 'next/link';
import { getAllFeatures, getFeaturesByCategory } from '@/lib/docs/get-features';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Sparkles, FileText, Clock } from 'lucide-react';

const categoryMeta: Record<string, { label: string; icon: React.ReactNode }> = {
  dispatch: { label: 'Dispatch', icon: <FileText className="h-5 w-5" /> },
  fleet: { label: 'Fleet', icon: <FileText className="h-5 w-5" /> },
  finance: { label: 'Finance', icon: <FileText className="h-5 w-5" /> },
  crm: { label: 'CRM', icon: <FileText className="h-5 w-5" /> },
  compliance: { label: 'Compliance', icon: <FileText className="h-5 w-5" /> },
  ai: { label: 'AI Tools', icon: <Sparkles className="h-5 w-5" /> },
  reporting: { label: 'Reporting', icon: <FileText className="h-5 w-5" /> },
  integrations: { label: 'Integrations', icon: <FileText className="h-5 w-5" /> },
  support: { label: 'Support', icon: <FileText className="h-5 w-5" /> },
  settings: { label: 'Settings', icon: <FileText className="h-5 w-5" /> },
};

export default function HelpHomePage() {
  const allFeatures = getAllFeatures();
  const clientFeatures = allFeatures.filter((f) => f.requiresClientDoc && f.portal !== 'admin');

  // Group by category
  const categories = [...new Set(clientFeatures.map((f) => f.category))];

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

      {/* Categories */}
      {categories.map((category) => {
        const features = getFeaturesByCategory(category).filter(
          (f) => f.requiresClientDoc && f.portal !== 'admin'
        );
        if (features.length === 0) return null;
        const meta = categoryMeta[category] || { label: category, icon: <FileText className="h-5 w-5" /> };

        return (
          <section key={category}>
            <div className="flex items-center gap-2 mb-4">
              {meta.icon}
              <h2 className="text-lg font-semibold">{meta.label}</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {features.map((feature) => (
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
