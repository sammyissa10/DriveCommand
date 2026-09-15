import { getSession, getRole } from '@/lib/auth/supabase';
import { redirect } from 'next/navigation';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { DocumentList } from './document-list';
import { FileText } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function DriverDocumentsPage() {
  const session = await getSession();
  if (!session) {
    redirect('/sign-in');
  }

  const role = await getRole();
  if (role !== UserRole.DRIVER) {
    redirect('/unauthorized');
  }

  /**
   * quick-606 — TWO defects lived here and only one of them was about `app_user`.
   *
   * The one that raised: `P2022 ColumnNotFound`. Five `Document` columns existed
   * on production and in `schema.prisma` and NOT on staging, two of them in zero
   * migration files anywhere (quick-604 §7e). This page orders by `expiryDate`,
   * so it 500'd — the repository could not rebuild its own database. Closed by
   * `20260915120000_document_column_drift_staging_parity`.
   *
   * The one hiding behind it: this read was on the BARE client with no tenant
   * scope — the §7a shape, unmeasurable while the P2022 raised first. A driver's
   * documents were selected by `driverId` alone, and `driverId` is a `User` id;
   * correct in practice only because user ids do not collide across tenants.
   * `getTenantPrisma()` because there is a session, already role-checked above.
   */
  const db = await getTenantPrisma();

  // Get all documents for this driver (driverId references User, not Driver)
  const documents = await db.document.findMany({
    where: {
      driverId: session.userId,
    },
    orderBy: { expiryDate: 'asc' },
    select: {
      id: true,
      documentType: true,
      fileName: true,
      s3Key: true,
      expiryDate: true,
      createdAt: true,
      contentType: true,
      sizeBytes: true,
      isRestricted: true,
      driverId: true,
    },
  });

  return (
    <div className="max-w-2xl mx-auto space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-foreground">Documents</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          {documents.length} document{documents.length !== 1 ? 's' : ''} on file
        </p>
      </div>
      <DocumentList documents={documents} />
    </div>
  );
}
