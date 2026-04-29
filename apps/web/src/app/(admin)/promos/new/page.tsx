import Link from 'next/link';
import { NewPromoForm } from './new-promo-form';

export default function NewPromoPage() {
  return (
    <div className="space-y-6">
      <Link href="/promos" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
        ← All Promos
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">New Promo</h1>
        <p className="mt-1 text-sm text-gray-500">Create a trial extension or discount promo code</p>
      </div>
      <NewPromoForm />
    </div>
  );
}
