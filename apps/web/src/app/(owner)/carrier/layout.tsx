import { redirect } from "next/navigation"
import { getRole } from "@/lib/auth/supabase"
import { UserRole } from "@/lib/auth/roles"
import { CarrierBreadcrumb } from "@/components/carrier/CarrierBreadcrumb"

export const dynamic = "force-dynamic"

/**
 * Carrier Ops section layout.
 *
 * The parent (owner)/layout.tsx already blocks unauthenticated users and
 * redirects non-OWNER/MANAGER roles to /unauthorized.
 *
 * This layout adds the DRIVER-specific redirect to /home (belt-and-suspenders)
 * and renders the pathname-based CarrierBreadcrumb above all carrier pages.
 */
export default async function CarrierLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const role = await getRole()

  // Drivers should go to their own portal, not the carrier ops section
  if (role === UserRole.DRIVER) {
    redirect("/home")
  }

  // Belt-and-suspenders: only OWNER and MANAGER can access carrier ops
  if (role !== UserRole.OWNER && role !== UserRole.MANAGER) {
    redirect("/unauthorized")
  }

  return (
    <>
      {/* Desktop only — the mobile-web design leads with its own large title */}
      <div className="hidden lg:block">
        <CarrierBreadcrumb />
      </div>
      {children}
    </>
  )
}
