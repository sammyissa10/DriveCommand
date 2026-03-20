import { AppLogo } from "@/components/navigation/app-logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative"
      style={{ backgroundImage: "url('/login-bg.jpeg')", backgroundSize: "cover", backgroundPosition: "center" }}
    >
      {/* Overlay to ensure form readability */}
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative z-10 flex flex-col items-center w-full">
        <div className="mb-6 flex flex-col items-center gap-2">
          <AppLogo size={56} className="drop-shadow-md" />
          <h1 className="text-xl font-semibold text-white drop-shadow">DriveCommand</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
