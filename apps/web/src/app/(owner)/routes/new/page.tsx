import { redirect } from 'next/navigation';

/**
 * Legacy route creation is retired in favour of carrier Trips (TKT-0074/0056/0057).
 *
 * The old /routes/new form was built on the legacy Route → Driver(User) / Truck
 * models, so its driver dropdown only listed User accounts (not the carrier
 * fleet) and its truck dropdown predated the carrier-truck migration. The carrier
 * "New Trip" form (/carrier/trips/new) assigns drivers and trucks directly from
 * the carrier fleet and supports templates/co-drivers/scheduling, so all new
 * creation funnels there. The legacy Routes list stays viewable for old data.
 */
export default function NewRoutePage() {
  redirect('/carrier/trips/new');
}
