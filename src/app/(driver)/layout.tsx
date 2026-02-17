import { Truck } from "lucide-react";

export default async function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 text-white">
              <Truck className="h-4 w-4" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">DriveCommand</h1>
          </div>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
