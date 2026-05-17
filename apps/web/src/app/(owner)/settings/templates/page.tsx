import Link from "next/link"
import { SettingsHeader } from "@/components/settings/SettingsHeader"
import { SETTINGS_PAGE_META, TEMPLATE_TYPES } from "@/components/settings/settings.config"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { FileText, FileCheck, ClipboardList, Receipt } from "lucide-react"

const meta = SETTINGS_PAGE_META.templates

/**
 * Get icon for template type
 */
function getTemplateIcon(slug: string) {
  switch (slug) {
    case "rate-confirmations":
      return FileText
    case "bol":
      return FileCheck
    case "checklist":
      return ClipboardList
    case "expense":
      return Receipt
    default:
      return FileText
  }
}

/**
 * Templates Settings Page
 *
 * STUB: This page displays template TYPES as cards, each linking to
 * /settings/templates/[type] where users can manage individual templates.
 *
 * Template types:
 * - Rate Confirmations: Templates for confirming rates with brokers and clients
 * - Bill of Lading (BOL): Customizable BOL forms for loads
 * - Checklist Templates: Pre-trip, post-trip, maintenance, and custom checklists
 * - Expense Templates: Recurring expense templates for fast logging
 *
 * Implementation notes for future development:
 * - Each type page will list templates with create/edit/delete actions
 * - Templates are stored in a Template table with type, name, content fields
 * - Rate confirmations may have special PDF generation logic
 */
export default function TemplatesSettingsPage() {
  return (
    <div>
      <SettingsHeader title={meta.title} subtitle={meta.subtitle} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {TEMPLATE_TYPES.map((type) => {
          const Icon = getTemplateIcon(type.slug)
          return (
            <Link
              key={type.id}
              href={`/settings/templates/${type.slug}`}
              className="block group"
            >
              <Card className="bg-card border-border h-full transition-colors group-hover:bg-muted/30">
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <Icon className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-medium">
                        {type.title}
                      </CardTitle>
                      <CardDescription className="text-sm mt-1">
                        {type.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <span className="text-xs text-muted-foreground">
                    Click to manage templates →
                  </span>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
