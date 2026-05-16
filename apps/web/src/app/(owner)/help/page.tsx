import { HelpHeader } from "@/components/help/HelpHeader"
import { HelpSearchInline } from "@/components/help/HelpSearchInline"
import { HelpCategoryGrid } from "@/components/help/HelpCategoryGrid"
import { ContactSupportCard } from "@/components/help/ContactSupportCard"

/**
 * Help Center Home Page
 *
 * Design principles:
 * - Warm, human copy ("How can we help?" not "Knowledge Base")
 * - Calm, spacious layout with centered content
 * - 5+ entry points to Help: sidebar, topbar icon, account menu, "?" shortcut, global search
 *
 * Layout:
 * 1. Header with title and subtitle
 * 2. Inline search (visual stub, TODO: wire to real search)
 * 3. Category grid (2x3 on desktop)
 * 4. Contact Support card
 */
export default function HelpPage() {
  return (
    <div>
      {/* Header: "How can we help?" */}
      <HelpHeader />

      {/* Inline search (visual stub) */}
      <HelpSearchInline />

      {/* Category grid */}
      <HelpCategoryGrid />

      {/* Contact Support CTA */}
      <ContactSupportCard />
    </div>
  )
}
