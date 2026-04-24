import { ChecklistDetailClient } from './_components/ChecklistDetailClient';

type PageProps = { params: Promise<{ id: string }> };

export default async function ChecklistDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <ChecklistDetailClient instanceId={id} />;
}
