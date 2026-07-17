import { TeamPermissionsDesktop } from './TeamPermissionsDesktop';
import { TeamPermissionsMobile } from './TeamPermissionsMobile';

export default function TeamPermissionsPage() {
  return (
    <>
      {/* Mobile-web design system view (phone widths only) */}
      <div className="lg:hidden -m-4">
        <TeamPermissionsMobile />
      </div>

      {/* Desktop view (lg and up) — unchanged */}
      <div className="hidden lg:block">
        <TeamPermissionsDesktop />
      </div>
    </>
  );
}
