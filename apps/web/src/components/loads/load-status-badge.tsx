'use client';

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  DISPATCHED: 'bg-blue-100 text-blue-700',
  PICKED_UP: 'bg-indigo-100 text-indigo-700',
  IN_TRANSIT: 'bg-purple-100 text-purple-700',
  DELIVERED: 'bg-green-100 text-green-700',
  INVOICED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-gray-100 text-gray-700',
};

const statusLabels: Record<string, string> = {
  PENDING: 'Pending',
  DISPATCHED: 'Dispatched',
  PICKED_UP: 'Picked Up',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
  INVOICED: 'Invoiced',
  CANCELLED: 'Cancelled',
};

export function LoadStatusBadge({ status }: { status: string }) {
  const colorClass = statusColors[status] ?? 'bg-gray-100 text-gray-700';
  const label = statusLabels[status] ?? status;

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}
