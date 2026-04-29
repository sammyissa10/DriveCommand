export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { getPlanById } from '@/app/(admin)/actions/plans';
import { EditPlanForm } from './edit-plan-form';
import { notFound } from 'next/navigation';

export default async function EditPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let plan;
  try {
    plan = await getPlanById(id);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-6">
      <Link href="/plans" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
        ← All Plans
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Edit Plan: {plan.name}</h1>
        <p className="mt-1 text-sm text-gray-500">Toggle active status or adjust settings</p>
      </div>
      <EditPlanForm plan={plan} />
    </div>
  );
}
