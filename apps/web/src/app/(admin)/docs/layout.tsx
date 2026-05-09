import Link from 'next/link';
import { BookOpen, Cog } from 'lucide-react';
import { AdminDocSearch } from '@/components/docs/AdminDocSearch';

const operationalDocs = [
  { slug: 'architecture', name: 'Architecture' },
  { slug: 'auth', name: 'Authentication' },
  { slug: 'database', name: 'Database' },
  { slug: 'stack', name: 'Tech Stack' },
  { slug: 'modules', name: 'Modules' },
  { slug: 'setup', name: 'Setup' },
  { slug: 'deployment', name: 'Deployment' },
  { slug: 'email', name: 'Email' },
  { slug: 'troubleshooting', name: 'Troubleshooting' },
];

export default function AdminDocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      {/* Search bar at top */}
      <div className="mb-6">
        <AdminDocSearch />
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <aside className="w-64 shrink-0">
        <nav className="sticky top-6 space-y-6">
          {/* Feature Reference Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="h-4 w-4 text-gray-400" />
              <h3 className="font-semibold text-sm text-gray-900">Feature Reference</h3>
            </div>
            <ul className="space-y-1">
              <li>
                <Link
                  href="/docs/features"
                  className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                >
                  All Features
                </Link>
              </li>
            </ul>
          </div>

          {/* Architecture & Operations Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Cog className="h-4 w-4 text-gray-400" />
              <h3 className="font-semibold text-sm text-gray-900">Architecture & Operations</h3>
            </div>
            <ul className="space-y-1">
              <li>
                <Link
                  href="/docs/operations"
                  className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors font-medium"
                >
                  Overview
                </Link>
              </li>
              {operationalDocs.map((doc) => (
                <li key={doc.slug}>
                  <Link
                    href={`/docs/operations/${doc.slug}`}
                    className="block px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                  >
                    {doc.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
