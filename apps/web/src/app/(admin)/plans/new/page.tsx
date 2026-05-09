import Link from 'next/link';
import { NewPlanForm } from './new-plan-form';

export default function NewPlanPage() {
  return (
    <div className="space-y-6">
      <Link href="/plans" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
        ← All Plans
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">New Plan</h1>
        <p className="mt-1 text-sm text-gray-500">Create a new subscription plan</p>
      </div>
      <NewPlanForm />
    </div>
  );
}
