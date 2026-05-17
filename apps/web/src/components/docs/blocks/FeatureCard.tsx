import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getFeatureBySlug } from '@/lib/docs/get-features';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { PlanBadge } from './PlanBadge';

interface FeatureCardProps {
  slug: string;
}

export async function FeatureCard({ slug }: FeatureCardProps) {
  const feature = await getFeatureBySlug(slug);

  // Error placeholder if feature not found
  if (!feature) {
    return (
      <div className="rounded border border-destructive/50 bg-destructive/10 p-4 my-6">
        <p className="text-sm text-destructive font-medium">
          Feature not found: {slug}
        </p>
      </div>
    );
  }

  return (
    <Card className="my-6">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-semibold text-foreground">
            {feature.name}
          </h3>
          <PlanBadge tier={feature.planTier as any} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {feature.shortDescription}
        </p>
        {/* Skip link for dynamic routes (e.g., /track/[token]) - they require runtime params */}
        {!feature.route.includes('[') && (
          <Link
            href={feature.route}
            className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 font-medium"
          >
            Go to feature
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
