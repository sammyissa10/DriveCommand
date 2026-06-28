/**
 * Truck edit page — uses unified TruckRecord component in edit mode.
 *
 * This page and /trucks/[id] share the exact same component,
 * ensuring view and edit layouts never drift apart.
 *
 * Features:
 * - Same layout as view page
 * - Unlocked form fields
 * - Save/Cancel buttons
 * - Unsaved changes indicator
 * - Navigation guard for unsaved changes
 */

import { notFound } from 'next/navigation';
import { getTruck, updateTruck } from '@/app/(owner)/actions/trucks';
import { TruckRecord } from '../_components/TruckRecord';

interface EditTruckPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditTruckPage({ params }: EditTruckPageProps) {
  const { id } = await params;

  const truck = await getTruck(id);

  if (!truck) {
    notFound();
  }

  // Bind the updateTruck action to include the truck ID
  const boundUpdateTruck = updateTruck.bind(null, id);

  return (
    <TruckRecord truck={truck} mode="edit" updateAction={boundUpdateTruck} />
  );
}
