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
 * 3. Guides — the real, written articles
 * 4. Category grid (2x3 on desktop) — still stub-linked
 * 5. Contact Support card
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

      {/*
        The written articles, ABOVE the category grid — quick-561.

        Phase 12 made these reachable; this puts them where they are read. The
        grid below still points only at the stub route, which renders the
        literal words "Article content coming soon.", so with the grid first a
        reader met five decorative cards that do nothing and had to scroll past
        them to reach the only working content on the page. Ordering is the
        whole fix: nothing here is new, it was just below the fold.

        See the header of HelpGuides for how the orphaned articles were found
        and why the list is built from the feature registry rather than from
        the directory.
      */}
      <HelpGuides />

      {/* Category grid — still stub-linked; see above. */}
      <HelpCategoryGrid />

      {/* Contact Support CTA */}
      <ContactSupportCard />
    </div>
  )
}
