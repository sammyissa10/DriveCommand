import { ChecklistDetailClient } from './_components/ChecklistDetailClient';
import { AuditTrailFooter } from '@/components/audit-trail-footer';
import { prisma } from '@/lib/db/prisma';

type PageProps = { params: Promise<{ id: string }> };

export default async function ChecklistDetailPage({ params }: PageProps) {
  const { id } = await params;

  const instanceAudit = await prisma.playbookInstance.findUnique({
    where: { id },
    select: {
      createdBy: { select: { firstName: true, lastName: true, email: true } },
      updatedBy: { select: { firstName: true, lastName: true, email: true } },
      createdAt: true,
      updatedAt: true,
    },
  }).catch(() => null);

  return (
    <>
      <ChecklistDetailClient instanceId={id} />
      {instanceAudit && (
        <AuditTrailFooter
          createdAt={instanceAudit.createdAt}
          createdByName={instanceAudit.createdBy ? `${instanceAudit.createdBy.firstName ?? ''} ${instanceAudit.createdBy.lastName ?? ''}`.trim() || null : null}
          createdByEmail={instanceAudit.createdBy?.email ?? null}
          updatedAt={instanceAudit.updatedAt}
          updatedByName={instanceAudit.updatedBy ? `${instanceAudit.updatedBy.firstName ?? ''} ${instanceAudit.updatedBy.lastName ?? ''}`.trim() || null : null}
          updatedByEmail={instanceAudit.updatedBy?.email ?? null}
        />
      )}
    </>
  );
}
