import { HelpHeader } from "@/components/help/HelpHeader"
import { HelpSearchInline } from "@/components/help/HelpSearchInline"
import { HelpCategoryGrid } from "@/components/help/HelpCategoryGrid"
import { HelpGuides } from "@/components/help/HelpGuides"
import { ContactSupportCard } from "@/components/help/ContactSupportCard"
import { ReplayTourButton } from "@/components/onboarding/tour/ReplayTourButton"

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

      {/* Replay the first-run navigational tour on demand */}
      <div className="mt-4">
        <ReplayTourButton />
      </div>

      {/* Inline search (visual stub) */}
      <HelpSearchInline />

      {/* Category grid */}
      <HelpCategoryGrid />

      {/*
        The written articles. Until Phase 12 nothing on this page — or anywhere
        else in the app — linked to them: the grid above points only at the
        stub articles, which render "Article content coming soon." See the
        header of HelpGuides for how that was found and why the list is built
        from the feature registry rather than from the directory.
      */}
      <HelpGuides />

      {/* Contact Support CTA */}
      <ContactSupportCard />
    </div>
  )
}
