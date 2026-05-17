"use client"

/**
 * HelpHeader - Welcome header for the Help Center
 *
 * Design principles:
 * - Warm, human copy ("How can we help?" not "Knowledge Base")
 * - Spacious, calm layout
 * - Plain English suitable for carrier owners
 */
export function HelpHeader() {
  return (
    <div className="text-center mb-8">
      <h1 className="text-3xl font-semibold text-foreground mb-3">
        How can we help?
      </h1>
      <p className="text-base text-muted-foreground max-w-lg mx-auto">
        Find answers, learn the workflow, or get in touch with our team.
      </p>
    </div>
  )
}
