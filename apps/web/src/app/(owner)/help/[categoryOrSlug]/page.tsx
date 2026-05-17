import { notFound } from "next/navigation"
import Link from "next/link"
import { getCategoryBySlug, type HelpCategory } from "@/components/help/help.config"
import { renderClientDoc } from "@/lib/docs/render-mdx"
import { FeedbackWidget } from "@/components/help/FeedbackWidget"
import { HelpBreadcrumbs } from "@/components/help/HelpBreadcrumbs"
import { RelatedArticles } from "@/components/help/RelatedArticles"
import { ChevronLeft, Clock } from "lucide-react"
import ia from "../../../../../../../docs-content/_ia.json"

interface Props {
  params: Promise<{ categoryOrSlug: string }>
}

/**
 * Help Category or Article Page
 *
 * This page handles two types of URLs:
 * 1. /help/[category] - Shows category page with list of articles (from help.config)
 * 2. /help/[slug] - Shows feature article (from MDX/feature registry)
 *
 * It first checks if the slug is a help.config category. If yes, renders category page.
 * Otherwise, falls back to the existing feature article behavior.
 */
export default async function HelpCategoryOrArticlePage({ params }: Props) {
  const { categoryOrSlug } = await params

  // Check if this is a help.config category first
  const category = getCategoryBySlug(categoryOrSlug)

  if (category) {
    return <CategoryPage category={category} />
  }

  // Fall back to feature article
  return <FeatureArticlePage slug={categoryOrSlug} />
}

/**
 * Category Page - Shows list of articles in a category
 */
function CategoryPage({ category }: { category: HelpCategory }) {
  const Icon = category.icon

  return (
    <div>
      {/* Back link */}
      <Link
        href="/help"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ChevronLeft size={16} strokeWidth={1.75} />
        Back to Help Center
      </Link>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
            <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">{category.name}</h1>
        </div>
        <p className="text-muted-foreground">{category.description}</p>
      </div>

      {/* Article list */}
      <div className="space-y-3">
        {category.articles.map((article) => (
          <Link
            key={article.slug}
            href={`/help/${category.slug}/${article.slug}`}
            className="block p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
          >
            <h3 className="text-base font-medium text-foreground mb-1">
              {article.title}
            </h3>
            <p className="text-sm text-muted-foreground">{article.preview}</p>
          </Link>
        ))}
      </div>

      {/* Article count */}
      <p className="mt-6 text-sm text-muted-foreground">
        {category.articles.length} {category.articles.length === 1 ? "article" : "articles"} in this category
      </p>
    </div>
  )
}

/**
 * Feature Article Page - Renders MDX content for feature articles
 * This preserves backward compatibility with existing feature article URLs
 */
async function FeatureArticlePage({ slug }: { slug: string }) {
  let doc
  try {
    doc = await renderClientDoc(slug)
  } catch {
    notFound()
  }

  const { frontmatter, content } = doc

  // Find the hub this article belongs to
  function findHubForFeature(featureSlug: string): { id: string; name: string } | undefined {
    for (const hub of ia.clientHubs) {
      if (hub.features.includes(featureSlug)) {
        return { id: hub.id, name: hub.name }
      }
    }
    return undefined
  }

  const hub = findHubForFeature(slug)

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
  )
}
