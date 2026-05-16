import { notFound } from "next/navigation"
import Link from "next/link"
import { getArticleBySlug } from "@/components/help/help.config"
import { ChevronLeft, ThumbsUp, ThumbsDown } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
  params: Promise<{ categoryOrSlug: string; article: string }>
}

/**
 * Help Article Page
 *
 * Renders a single help article from help.config.
 * Article content is stubbed with "Article content coming soon."
 *
 * Design principles:
 * - Calm, readable layout
 * - Clear navigation back to category
 * - "Was this helpful?" feedback widget (non-functional stub)
 * - Contact Support link at bottom
 */
export default async function HelpArticlePage({ params }: Props) {
  const { categoryOrSlug, article: articleSlug } = await params

  const result = getArticleBySlug(categoryOrSlug, articleSlug)

  if (!result) {
    notFound()
  }

  const { category, article } = result
  const Icon = category.icon

  return (
    <div>
      {/* Back link */}
      <Link
        href={`/help/${category.slug}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ChevronLeft size={16} strokeWidth={1.75} />
        Back to {category.name}
      </Link>

      {/* Article header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground mb-2">
          {article.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          Last updated 2 weeks ago
        </p>
      </div>

      {/* Article content (stub) */}
      <article className="prose prose-slate dark:prose-invert max-w-none mb-12">
        <p className="text-muted-foreground">
          Article content coming soon.
        </p>
        <p className="text-muted-foreground text-sm mt-4">
          This article will cover: {article.preview}
        </p>
      </article>

      {/* Divider */}
      <div className="border-t border-border pt-8 mb-8">
        {/* Was this helpful? */}
        <div className="flex items-center gap-4 mb-8">
          <span className="text-sm text-foreground font-medium">
            Was this helpful?
          </span>
          <div className="flex items-center gap-2">
            {/* TODO: Wire to feedback backend */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3"
              aria-label="Yes, this was helpful"
            >
              <ThumbsUp size={14} strokeWidth={1.75} className="mr-1.5" />
              Yes
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3"
              aria-label="No, this was not helpful"
            >
              <ThumbsDown size={14} strokeWidth={1.75} className="mr-1.5" />
              No
            </Button>
          </div>
        </div>

        {/* Contact Support */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Still have questions?</span>
          <Link
            href="/support"
            className="text-primary hover:underline font-medium"
          >
            Contact Support
          </Link>
        </div>
      </div>
    </div>
  )
}
