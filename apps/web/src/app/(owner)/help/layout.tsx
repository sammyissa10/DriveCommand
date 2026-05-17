/**
 * Help Center Layout
 *
 * This layout wraps help pages with consistent padding and max-width.
 * The main app shell (Sidebar + TopBar) is provided by the parent (owner) layout.
 *
 * Design principles:
 * - Centered content with max-width 880px
 * - 48px top padding for a calm, spacious feel
 * - Help should feel like a quiet harbor, not a busy page
 */
export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[880px] mx-auto pt-12">
      {children}
    </div>
  )
}
