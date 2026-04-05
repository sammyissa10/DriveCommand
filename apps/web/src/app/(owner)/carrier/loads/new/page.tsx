import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { LoadForm } from '@/components/carrier/loads/LoadForm';

export default async function NewLoadPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const orgId = session.tenantId;
  if (!orgId) redirect('/login');

  const clients = await prisma.carrierClient.findMany({
    where: { orgId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          New Load
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Create a new load. Select a client and optionally link a contract to auto-populate rate fields.
        </p>
      </div>

      <LoadForm mode="create" clients={clients} />
    </div>
  );
}
