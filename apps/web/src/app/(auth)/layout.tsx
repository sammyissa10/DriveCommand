/**
 * Auth Layout — Full-bleed viewport layout for auth pages.
 * No margins or padding — the sign-in card fills edge to edge.
 * Uses min-h-dvh for proper mobile viewport handling (accounts for address bar).
 * Unified dark navy background (#0E172A) across all auth pages.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-dvh h-dvh w-screen overflow-hidden bg-[#0E172A]">
      {children}
    </main>
  );
}
