import { redirect } from "next/navigation"
import { SettingsHeader } from "@/components/settings/SettingsHeader"
import { SETTINGS_PAGE_META } from "@/components/settings/settings.config"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getSession } from "@/lib/auth/supabase"
import { prisma } from "@/lib/db/prisma"

const meta = SETTINGS_PAGE_META.account

function initialsOf(firstName?: string | null, lastName?: string | null, email?: string): string {
  const f = firstName?.trim()?.[0] ?? ""
  const l = lastName?.trim()?.[0] ?? ""
  if (f || l) return (f + l).toUpperCase()
  return (email?.trim()?.[0] ?? "?").toUpperCase()
}

/**
 * Account Settings Page — shows the signed-in account holder's real profile
 * (TKT-0078). Password / 2FA / sign-out remain stubs pending Supabase Auth wiring.
 */
export default async function AccountSettingsPage() {
  const session = await getSession()
  if (!session) redirect("/login")

  // Prefer names from the session (user_metadata); fall back to the User row.
  let firstName = session.firstName ?? null
  let lastName = session.lastName ?? null
  if (!firstName && !lastName) {
    const user = await prisma.user
      .findUnique({ where: { id: session.userId }, select: { firstName: true, lastName: true } })
      .catch(() => null)
    firstName = user?.firstName ?? null
    lastName = user?.lastName ?? null
  }

  const fullName = [firstName, lastName].filter(Boolean).join(" ") || session.email
  const initials = initialsOf(firstName, lastName, session.email)

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
              {/* Avatar — initials from the signed-in user */}
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center shrink-0">
                <span className="text-lg font-medium text-muted-foreground">{initials}</span>
              </div>
              <div className="space-y-3 flex-1">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Name
                  </label>
                  <p className="text-sm text-foreground mt-0.5">{fullName}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Email
                  </label>
                  <p className="text-sm text-foreground mt-0.5">{session.email}</p>
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
