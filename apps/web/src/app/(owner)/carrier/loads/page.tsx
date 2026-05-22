import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { LoadsGrid } from './_grid/LoadsGrid';

export default async function LoadsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const orgId = session.tenantId;
  if (!orgId) redirect('/login');

  const clients = await prisma.carrierClient.findMany({
    where: { orgId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const clientMap: Record<string, string> = {};
  for (const c of clients) clientMap[c.id] = c.name;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Loads
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            All loads across your carrier operations &mdash; filter by client, status, or date range.
          </p>
        </div>
      </div>

      <LoadsGrid clientMap={clientMap} />
    </div>
  );
}
