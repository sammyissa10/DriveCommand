import { redirect } from 'next/navigation';

interface EditRoutePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditRoutePage({ params }: EditRoutePageProps) {
  const { id } = await params;
  redirect(`/routes/${id}?mode=edit`);
}
