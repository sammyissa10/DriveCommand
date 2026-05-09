import Link from 'next/link';
import { ArrowRight, FileText } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getRelatedFeatures, getFeatureBySlug } from '@/lib/docs/get-features';
import type { Feature } from '@/lib/docs/feature-registry-schema';

interface RelatedArticlesProps {
  slug: string;
  maxArticles?: number;
}

export function RelatedArticles({ slug, maxArticles = 3 }: RelatedArticlesProps) {
  const relatedFeatures = getRelatedFeatures(slug);

  // Filter to only show owner/shared portal features with client docs
  const visibleFeatures = relatedFeatures
    .filter(
      (f) =>
        (f.portal === 'owner' || f.portal === 'shared') && f.requiresClientDoc
    )
    .slice(0, maxArticles);

  if (visibleFeatures.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 pt-6 border-t">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        Related Articles
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleFeatures.map((feature) => (
          <Link key={feature.slug} href={`/help/${feature.slug}`}>
            <Card className="h-full hover:bg-muted/50 transition-colors cursor-pointer group">
              <CardHeader className="p-4">
                <div className="flex items-start gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-sm font-medium line-clamp-1 group-hover:text-primary transition-colors">
                      {feature.name}
                    </CardTitle>
                    <CardDescription className="text-xs line-clamp-2 mt-1">
                      {feature.shortDescription}
                    </CardDescription>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
