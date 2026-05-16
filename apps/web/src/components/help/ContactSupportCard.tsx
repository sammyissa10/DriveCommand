"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Mail } from "lucide-react"

/**
 * ContactSupportCard - CTA for reaching support
 *
 * Design principles:
 * - Solid surface (no glass, no transparency)
 * - Calm, reassuring tone
 * - Clear next steps
 */
export function ContactSupportCard() {
  // TODO: Replace with your actual support email
  const supportEmail = "support@drivecommand.com"

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Left side: Copy */}
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-1">
            Still need help?
          </h3>
          <p className="text-sm text-muted-foreground">
            Our support team responds within 4 hours during business days.
          </p>
        </div>

        {/* Right side: Actions */}
        <div className="flex items-center gap-3 shrink-0">
          <Button asChild variant="outline" size="sm">
            <a href={`mailto:${supportEmail}`} className="flex items-center gap-2">
              <Mail size={16} strokeWidth={1.75} aria-hidden="true" />
              Email us
            </a>
          </Button>
          <Button asChild size="sm">
            <Link href="/support">Contact Support</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
