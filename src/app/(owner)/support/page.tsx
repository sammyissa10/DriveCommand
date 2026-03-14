import { getMyTickets } from '@/actions/support-tickets';
import { SupportTicketsList } from './support-tickets-list';

export default async function OwnerSupportPage() {
  let tickets: Awaited<ReturnType<typeof getMyTickets>> = [];
  try {
    tickets = await getMyTickets();
  } catch {
    // Auth error — layout handles redirect, this is a safety fallback
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">My Support Tickets</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track the status of your support requests and feature requests.
        </p>
      </div>

      <SupportTicketsList tickets={tickets} />
    </div>
  );
}
