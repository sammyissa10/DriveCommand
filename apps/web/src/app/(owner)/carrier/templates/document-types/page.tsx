import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/supabase';
import { DocumentTypesManager } from '@/components/carrier/documents/DocumentTypesManager';

export default async function DocumentTypesPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Document Types
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Manage your document type catalog. Custom types can be added, renamed, and toggled.
            Default types are system-provided and cannot be deleted.
          </p>
        </div>
      </div>

      <DocumentTypesManager />
    </div>
  );
}
