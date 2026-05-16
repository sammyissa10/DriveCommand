import type { ReactNode } from "react"

interface SettingsHeaderProps {
  /** Page title (displayed at 28px font-semibold) */
  title: string
  /** One-line subtitle describing this settings section */
  subtitle: string
  /** Optional CTA button(s) displayed on the right */
  children?: ReactNode
}

/**
 * SettingsHeader - Consistent header pattern for Settings pages
 *
 * Renders:
 * - Title (28px, font-semibold, foreground color)
 * - Subtitle (14px, muted, describes what this section does)
 * - Optional CTA slot on the right (e.g., "Add Template", "Connect Integration")
 *
 * Usage:
 * ```tsx
 * <SettingsHeader
 *   title="Templates"
 *   subtitle="Reusable documents and forms for your operations"
 * >
 *   <Button>Add Template</Button>
 * </SettingsHeader>
 * ```
 */
export function SettingsHeader({ title, subtitle, children }: SettingsHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-8">
      <div>
        <h1 className="text-[28px] font-semibold text-foreground leading-tight">
          {title}
        </h1>
        <p className="text-[14px] text-muted-foreground mt-1">
          {subtitle}
        </p>
      </div>
      {children && (
        <div className="shrink-0 flex items-center gap-2">
          {children}
        </div>
      )}
    </div>
  )
}
