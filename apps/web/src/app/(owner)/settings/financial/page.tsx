import { SettingsHeader } from "@/components/settings/SettingsHeader"
import { SETTINGS_PAGE_META } from "@/components/settings/settings.config"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const meta = SETTINGS_PAGE_META.financial

/**
 * Financial Configuration Page
 *
 * STUB: This page will eventually allow owners to:
 * - Manage expense categories (custom categories for expense tracking)
 * - Configure driver pay rules (per-mile, percentage, flat rate)
 * - Set up tax settings (state rates, IFTA, quarterly filing)
 *
 * Implementation notes for future development:
 * - Expense Categories: Already exists at /settings/expense-categories — consider migrating here
 * - Driver Pay Rules: PayrollSettings table with rateType, rate, conditions
 * - Tax Settings: TenantTaxSettings table with stateRates, IFTAConfig
 */
export default function FinancialSettingsPage() {
  return (
    <div>
      <SettingsHeader title={meta.title} subtitle={meta.subtitle} />

      <div className="space-y-6">
        {/* Expense Categories Section */}
        {/* TODO: Display expense categories with add/edit/delete actions */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Expense Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Organize your expenses into categories for better tracking and reporting.
            </p>
            {/* Placeholder list */}
            <div className="mt-4 space-y-2">
              <div className="p-2 bg-muted rounded-md text-sm text-foreground">Fuel</div>
              <div className="p-2 bg-muted rounded-md text-sm text-foreground">Maintenance</div>
              <div className="p-2 bg-muted rounded-md text-sm text-foreground">Tolls</div>
              <div className="p-2 bg-muted rounded-md text-sm text-foreground">Insurance</div>
            </div>
          </CardContent>
        </Card>

        {/* Driver Pay Rules Section */}
        {/* TODO: Configure pay calculation rules per driver or fleet-wide */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Driver Pay Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Define how driver compensation is calculated for loads and trips.
            </p>
            {/* Placeholder empty state */}
            <div className="mt-4 py-6 text-center border border-dashed border-border rounded-lg">
              <p className="text-sm text-muted-foreground">No pay rules configured</p>
              <p className="text-xs text-muted-foreground mt-1">
                Set up per-mile, percentage, or flat rate pay structures
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Tax Settings Section */}
        {/* TODO: State tax rates, IFTA configuration */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Tax Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Configure tax rates and IFTA reporting settings for your fleet.
            </p>
            {/* Placeholder */}
            <div className="mt-4 py-6 text-center border border-dashed border-border rounded-lg">
              <p className="text-sm text-muted-foreground">No tax settings configured</p>
              <p className="text-xs text-muted-foreground mt-1">
                Add state tax rates for accurate IFTA quarterly reports
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
