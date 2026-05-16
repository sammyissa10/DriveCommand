import { SettingsHeader } from "@/components/settings/SettingsHeader"
import { SETTINGS_PAGE_META } from "@/components/settings/settings.config"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const meta = SETTINGS_PAGE_META.account

/**
 * Account Settings Page
 *
 * STUB: This page will eventually allow users to:
 * - View and edit their profile (name, email, avatar)
 * - Change their password
 * - Enable/disable two-factor authentication
 * - Sign out of all sessions
 *
 * Implementation notes for future development:
 * - Profile: Fetch from Supabase Auth user, update via server action
 * - Password: Use Supabase Auth password update flow
 * - 2FA: Use Supabase Auth MFA with TOTP
 * - Sign out: Clear session cookies, redirect to sign-in
 */
export default function AccountSettingsPage() {
  return (
    <div>
      <SettingsHeader title={meta.title} subtitle={meta.subtitle} />

      <div className="space-y-6">
        {/* Profile Section */}
        {/* TODO: Fetch user profile from Supabase Auth */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-4">
              {/* Avatar placeholder */}
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center shrink-0">
                <span className="text-lg font-medium text-muted-foreground">JD</span>
              </div>
              <div className="space-y-3 flex-1">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Name
                  </label>
                  <p className="text-sm text-foreground mt-0.5">John Doe</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Email
                  </label>
                  <p className="text-sm text-foreground mt-0.5">john@acmetrucking.com</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Password Section */}
        {/* TODO: Implement password change flow via Supabase Auth */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Password</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Change your password to keep your account secure.
            </p>
            <div className="mt-4">
              <p className="text-sm text-muted-foreground">
                Password last changed: Never
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Two-Factor Authentication Section */}
        {/* TODO: Implement 2FA toggle via Supabase Auth MFA */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Two-Factor Authentication</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground">
                  Add an extra layer of security to your account
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Use an authenticator app to generate one-time codes
                </p>
              </div>
              {/* Toggle placeholder — will be a real Switch component */}
              <div className="w-10 h-5 bg-muted rounded-full relative">
                <div className="w-4 h-4 bg-muted-foreground/50 rounded-full absolute left-0.5 top-0.5" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sign Out Section */}
        {/* TODO: Implement sign out action */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Sign Out</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Sign out of your account on this device or all devices.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
