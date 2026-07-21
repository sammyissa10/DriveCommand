/**
 * Auth Layout — Full-bleed viewport layout for auth pages.
 * Centers children within the viewport: the sign-in card is w-screen/h-dvh so it
 * still fills edge to edge, while the smaller forgot-password / reset-password
 * cards (max-w-sm) sit centered instead of pinning to the top-left corner.
 * Uses min-h-dvh for proper mobile viewport handling (accounts for address bar).
 * Unified dark navy background (#0E172A) across all auth pages.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-dvh h-dvh w-screen overflow-hidden bg-[#0E172A] flex items-center justify-center">
      {children}
    </main>
  );
}
