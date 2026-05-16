import { getSession, getRole } from '@/lib/auth/supabase';
import { redirect } from 'next/navigation';
import { UserRole } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
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

  // Get all documents for this driver (driverId references User, not Driver)
  const documents = await prisma.document.findMany({
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
