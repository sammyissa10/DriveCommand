import { SettingsHeader } from "@/components/settings/SettingsHeader"
import { SETTINGS_PAGE_META } from "@/components/settings/settings.config"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const meta = SETTINGS_PAGE_META.workspace

/**
 * Workspace Settings Page
 *
 * STUB: This page will eventually allow owners to:
 * - View and edit their company name
 * - Upload and manage their company logo
 * - Manage team members (invite, roles, remove)
 *
 * Implementation notes for future development:
 * - Company Name: Fetch from Tenant table, update via server action
 * - Logo Upload: Use R2 presigned URLs, store in Tenant.logoUrl
 * - Team Members: List Users with tenantId match, invite flow via email
 */
export default function WorkspaceSettingsPage() {
  return (
    <div>
      <SettingsHeader title={meta.title} subtitle={meta.subtitle} />

      <div className="space-y-6">
        {/* Company Name Section */}
        {/* TODO: Fetch tenant name from DB, display read-only with "Edit" button */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Company Name</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your company name is displayed across the platform and on customer-facing documents.
            </p>
            <div className="mt-4 p-3 bg-muted rounded-md">
              <span className="text-sm font-medium text-foreground">
                {/* Placeholder — will be fetched from Tenant table */}
                Acme Trucking LLC
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Logo Upload Section */}
        {/* TODO: Implement logo upload with R2 presigned URLs */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Company Logo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Upload your logo to display on invoices, rate confirmations, and other documents.
            </p>
            <div className="mt-4 flex items-center gap-4">
              {/* Placeholder logo area */}
              <div className="w-16 h-16 rounded-lg bg-muted border-2 border-dashed border-border flex items-center justify-center">
                <span className="text-xs text-muted-foreground">Logo</span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Recommended: 200×200px, PNG or SVG
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Team Members Section */}
        {/* TODO: Fetch users with this tenantId, display in table with roles */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Team Members</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Manage who has access to your workspace and what permissions they have.
            </p>
            {/* Empty state */}
            <div className="mt-4 py-8 text-center border border-dashed border-border rounded-lg">
              <p className="text-sm text-muted-foreground">No team members yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Invite team members to collaborate on your fleet operations
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
