import type { ReactNode } from "react"

interface SettingsLayoutProps {
  children: ReactNode
}

/**
 * Settings Layout
 *
 * Settings pages are now full-width since navigation moved to the sidebar
 * (Vercel-style drill-down navigation pattern).
 *
 * The main sidebar switches to show settings-specific navigation when on /settings/* routes.
 * This layout just provides content constraints.
 */
export default function SettingsLayout({ children }: SettingsLayoutProps) {
  return (
    <main className="max-w-[880px] pb-8">
      {children}
    </main>
  )
}
