import { notFound } from "next/navigation"
import Link from "next/link"
import { SettingsHeader } from "@/components/settings/SettingsHeader"
import { TEMPLATE_TYPES } from "@/components/settings/settings.config"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

interface TemplateTypePageProps {
  params: Promise<{ type: string }>
}

/**
 * Dynamic Template Type Page
 *
 * STUB: Displays templates of a specific type with an empty state.
 * Valid types: rate-confirmations, bol, checklist, expense
 *
 * Implementation notes for future development:
 * - Fetch templates from DB filtered by type and tenantId
 * - Display as a list/table with name, last modified, actions
 * - "Add Template" button opens a create modal or navigates to /new
 * - Edit/delete actions on each template row
 */
export default async function TemplateTypePage({ params }: TemplateTypePageProps) {
  const { type } = await params

  // Find the template type config
  const templateType = TEMPLATE_TYPES.find((t) => t.slug === type)

  if (!templateType) {
    notFound()
  }

  return (
    <div>
      <SettingsHeader
        title={templateType.title}
        subtitle={`Manage your ${templateType.title.toLowerCase()}`}
      >
        {/* TODO: Wire up to create template modal or /new page */}
        <Button size="sm" asChild>
          <Link href={`/settings/templates/${type}/new`}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add Template
          </Link>
        </Button>
      </SettingsHeader>

      {/* Empty state */}
      <div className="py-16 text-center border border-dashed border-border rounded-lg">
        <p className="text-sm text-muted-foreground">
          No {templateType.title.toLowerCase()} templates yet
        </p>
        <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
          {templateType.description}. Create your first template to get started.
        </p>
      </div>
    </div>
  )
}

/**
 * Generate static params for known template types
 * This enables static generation for all valid type slugs
 */
export function generateStaticParams() {
  return TEMPLATE_TYPES.map((type) => ({
    type: type.slug,
  }))
}
