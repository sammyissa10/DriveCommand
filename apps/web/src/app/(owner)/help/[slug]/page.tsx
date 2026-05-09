import { notFound } from 'next/navigation';
import Link from 'next/link';
import { renderClientDoc } from '@/lib/docs/render-mdx';
import { getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { FeedbackWidget } from '@/components/help/FeedbackWidget';
import { HelpBreadcrumbs } from '@/components/help/HelpBreadcrumbs';
import { RelatedArticles } from '@/components/help/RelatedArticles';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Clock, Sparkles } from 'lucide-react';
import ia from '../../../../../../../docs-content/_ia.json';

interface Props {
  params: Promise<{ slug: string }>;
}

// Find which hub contains a given feature slug
function findHubForFeature(slug: string): { id: string; name: string } | undefined {
  for (const hub of ia.clientHubs) {
    if (hub.features.includes(slug)) {
      return { id: hub.id, name: hub.name };
    }
  }
  return undefined;
}

export default async function HelpArticlePage({ params }: Props) {
  const { slug } = await params;

  let doc;
  try {
    doc = await renderClientDoc(slug);
  } catch {
    notFound();
  }

  // Get tenant plan for upgrade banner
  const session = await getSession();
  let tenantPlan = 'starter';
  if (session?.tenantId) {
    try {
      const rows = await prisma.$queryRaw<{ plan: string }[]>`
        SELECT plan FROM "Tenant" WHERE id = ${session.tenantId}::uuid LIMIT 1
      `;
      tenantPlan = rows[0]?.plan ?? 'starter';
    } catch {
      // Non-fatal
    }
  }

  const { frontmatter, content, feature } = doc;
  const featurePlanTier = feature?.planTier ?? 'free';

  // Plan tier hierarchy for comparison
  const planHierarchy = ['free', 'starter', 'pro', 'business', 'enterprise'];
  const tenantPlanIndex = planHierarchy.indexOf(tenantPlan);
  const featurePlanIndex = planHierarchy.indexOf(featurePlanTier);
  const needsUpgrade = featurePlanIndex > tenantPlanIndex;

  // Find the hub this article belongs to
  const hub = findHubForFeature(slug);

  return (
    <div className="max-w-4xl">
      {/* Breadcrumbs */}
      <HelpBreadcrumbs
        hubName={hub?.name}
        hubId={hub?.id}
        articleTitle={frontmatter.title}
      />

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-2xl font-bold">{frontmatter.title}</h1>
          {feature && feature.planTier !== 'free' && feature.planTier !== 'starter' && (
            <Badge variant="secondary">{feature.planTier}</Badge>
          )}
        </div>
        <p className="text-muted-foreground">{frontmatter.summary}</p>
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {frontmatter.estimatedReadMinutes} min read
          </span>
        </div>
      </div>

      {/* Upgrade banner (soft - not blocking) */}
      {needsUpgrade && (
        <Alert className="mb-6 border-primary/50 bg-primary/5">
          <Sparkles className="h-4 w-4 text-primary" />
          <AlertTitle>Upgrade to {featurePlanTier}</AlertTitle>
          <AlertDescription>
            This feature requires the {featurePlanTier} plan.{' '}
            <Link href="/owner/subscription" className="font-medium text-primary hover:underline">
              View plans
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* MDX Content */}
      <article className="prose prose-slate dark:prose-invert max-w-none">
        {content}
      </article>

      {/* Feedback Widget */}
      <div className="mt-12 pt-6 border-t">
        <FeedbackWidget docSlug={slug} />
      </div>

      {/* Related Articles */}
      <RelatedArticles slug={slug} />
    </div>
  );
}
