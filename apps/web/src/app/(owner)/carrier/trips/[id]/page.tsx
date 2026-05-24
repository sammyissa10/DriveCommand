import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ id: string }>;
}

// Trip detail page redirects to dispatch detail (URL paths are synonymous)
export default async function TripDetailPage({ params }: Props) {
  const { id } = await params;
  redirect(`/carrier/dispatches/${id}`);
}
