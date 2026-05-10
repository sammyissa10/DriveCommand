import { notFound } from 'next/navigation';
import { renderClientDoc } from '@/lib/docs/render-mdx';
import { FeedbackWidget } from '@/components/help/FeedbackWidget';
import { HelpBreadcrumbs } from '@/components/help/HelpBreadcrumbs';
import { RelatedArticles } from '@/components/help/RelatedArticles';
import { Clock } from 'lucide-react';
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

  const { frontmatter, content, feature } = doc;

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
        <h1 className="text-2xl font-bold mb-2">{frontmatter.title}</h1>
        <p className="text-muted-foreground">{frontmatter.summary}</p>
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {frontmatter.estimatedReadMinutes} min read
          </span>
        </div>
      </div>

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
