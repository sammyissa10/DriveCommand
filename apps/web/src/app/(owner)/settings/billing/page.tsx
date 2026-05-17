import { SettingsHeader } from "@/components/settings/SettingsHeader"
import { SETTINGS_PAGE_META } from "@/components/settings/settings.config"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CreditCard, FileText, BarChart3 } from "lucide-react"

const meta = SETTINGS_PAGE_META.billing

/**
 * Billing & Subscription Page
 *
 * STUB: This page will eventually allow owners to:
 * - View their current subscription plan
 * - Update payment method (credit card, ACH)
 * - View and download past invoices
 * - See usage statistics
 *
 * Implementation notes for future development:
 * - Integrate with Stripe for subscription management
 * - TenantSubscription table with planId, status, currentPeriodEnd
 * - Stripe Customer Portal for self-service billing changes
 * - Usage tracking: loads created, drivers active, storage used
 */
export default function BillingSettingsPage() {
  return (
    <div>
      <SettingsHeader title={meta.title} subtitle={meta.subtitle} />

      <div className="space-y-6">
        {/* Current Plan Section */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium">Current Plan</CardTitle>
              <Button size="sm" variant="outline">
                Upgrade Plan
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <BarChart3 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">Pro Plan</p>
                <p className="text-sm text-muted-foreground">
                  $99/month · Renews on Jan 15, 2026
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-2xl font-semibold text-foreground">12</p>
                <p className="text-xs text-muted-foreground">Active Drivers</p>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-2xl font-semibold text-foreground">8</p>
                <p className="text-xs text-muted-foreground">Trucks</p>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-2xl font-semibold text-foreground">∞</p>
                <p className="text-xs text-muted-foreground">Loads</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Method Section */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium">Payment Method</CardTitle>
              <Button size="sm" variant="outline">
                Update
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <CreditCard className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Visa ending in 4242
                </p>
                <p className="text-sm text-muted-foreground">Expires 12/2027</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Invoices Section */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium">Invoices</CardTitle>
              <Button size="sm" variant="ghost">
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Empty state for invoices */}
            <div className="py-6 text-center border border-dashed border-border rounded-lg">
              <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No invoices yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Your billing history will appear here
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Usage Statistics Section */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Usage This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Loads Created</span>
                <span className="text-sm font-medium text-foreground">247</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Documents Stored</span>
                <span className="text-sm font-medium text-foreground">1.2 GB</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">API Calls</span>
                <span className="text-sm font-medium text-foreground">12,450</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
