import { redirect } from "next/navigation"

/**
 * Settings Index Page
 *
 * Redirects to /settings/workspace as the default landing page.
 * This ensures a consistent entry point for the Settings surface.
 *
 * Previously this was a hub page with cards linking to sub-sections.
 * The new design uses a persistent sub-nav, so the hub is no longer needed.
 */
export default function SettingsPage() {
  redirect("/settings/workspace")
}
