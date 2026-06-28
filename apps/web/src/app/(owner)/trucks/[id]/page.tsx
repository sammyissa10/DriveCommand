/**
 * Truck view page — uses unified TruckRecord component in view mode.
 *
 * This page and /trucks/[id]/edit share the exact same component,
 * ensuring view and edit layouts never drift apart.
 */

import { notFound } from 'next/navigation';
import { getTruck } from '@/app/(owner)/actions/trucks';
import { TruckRecord } from './_components/TruckRecord';

interface TruckDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TruckDetailPage({ params }: TruckDetailPageProps) {
  const { id } = await params;

  const truck = await getTruck(id);

  if (!truck) {
    notFound();
  }

  return <TruckRecord truck={truck} mode="view" />;
}
