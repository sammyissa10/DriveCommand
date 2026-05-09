import { getAllFeatures } from '@/lib/docs/get-features';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

export default function WhatsNewPage() {
  // Get features sorted by addedInVersion (newest first)
  const features = getAllFeatures()
    .filter((f) => f.requiresClientDoc && f.portal !== 'admin')
    .sort((a, b) => {
      // Compare semantic versions
      const [aMajor, aMinor, aPatch] = a.addedInVersion.split('.').map(Number);
      const [bMajor, bMinor, bPatch] = b.addedInVersion.split('.').map(Number);
      if (bMajor !== aMajor) return bMajor - aMajor;
      if (bMinor !== aMinor) return bMinor - aMinor;
      return bPatch - aPatch;
    });

  // Group by version
  const byVersion: Record<string, typeof features> = {};
  for (const f of features) {
    if (!byVersion[f.addedInVersion]) byVersion[f.addedInVersion] = [];
    byVersion[f.addedInVersion].push(f);
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold mb-2">What&apos;s New</h2>
        <p className="text-muted-foreground">
          Recent features and improvements added to DriveCommand.
        </p>
      </div>

      {Object.entries(byVersion).map(([version, versionFeatures]) => (
        <section key={version}>
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <Badge variant="outline">v{version}</Badge>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {versionFeatures.map((feature) => (
              <Link key={feature.slug} href={`/owner/help/${feature.slug}`}>
                <Card className="h-full hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardHeader className="p-4">
                    <CardTitle className="text-base">{feature.name}</CardTitle>
                    <CardDescription className="text-sm">
                      {feature.shortDescription}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
