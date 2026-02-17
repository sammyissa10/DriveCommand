import Link from "next/link";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white border-b border-gray-800">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-semibold">DriveCommand Admin</h1>
            <nav>
              <Link
                href="/tenants"
                className="text-white hover:text-gray-300 font-medium"
              >
                Tenants
              </Link>
            </nav>
          </div>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
