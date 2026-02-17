import { Truck } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <div className="mb-6 flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg">
          <Truck className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">DriveCommand</h1>
      </div>
      {children}
    </div>
  );
}
