import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function StopsRedirectPage({ params }: Props) {
  const { id } = await params;
  redirect(`/carrier/trips/${id}/stops`);
}
