import { redirect } from 'next/navigation';

// Trips list page redirects to dispatches (URL paths are synonymous)
// This allows /carrier/trips to work alongside /carrier/dispatches
export default function TripsPage() {
  redirect('/carrier/dispatches');
}
