import { getMyTickets } from '@/actions/support-tickets';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { LifeBuoy } from 'lucide-react';

function getTypeBadgeClass(type: string) {
  switch (type) {
    case 'BUG':
      return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800';
    case 'FEATURE_REQUEST':
      return 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800';
    case 'QUESTION':
      return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800';
    case 'ACCOUNT_ISSUE':
      return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700';
  }
}

function getTypeLabel(type: string) {
  switch (type) {
    case 'BUG': return 'Bug Report';
    case 'FEATURE_REQUEST': return 'Feature Request';
    case 'QUESTION': return 'Question';
    case 'ACCOUNT_ISSUE': return 'Account Issue';
    default: return 'Other';
  }
}

function getStatusBadgeClass(status: string) {
  switch (status) {
    case 'OPEN':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800';
    case 'IN_PROGRESS':
      return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800';
    case 'RESOLVED':
      return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800';
    case 'CLOSED':
      return 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'IN_PROGRESS': return 'In Progress';
    default: return status.charAt(0) + status.slice(1).toLowerCase();
  }
}

export default async function DriverSupportPage() {
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

      {tickets.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title="No support tickets yet"
          description="Use the support button in the bottom-right corner to submit a new ticket."
        />
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <Card key={ticket.id} className="hover:shadow-sm transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-muted-foreground">{ticket.ticketNumber}</span>
                    <Badge className={getTypeBadgeClass(ticket.type)}>
                      {getTypeLabel(ticket.type)}
                    </Badge>
                    <Badge className={getStatusBadgeClass(ticket.status)}>
                      {getStatusLabel(ticket.status)}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(ticket.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <h3 className="font-semibold text-foreground mt-1">{ticket.title}</h3>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2">{ticket.description}</p>
                {ticket.resolution && (
                  <div className="mt-3 rounded-md bg-green-50 border border-green-200 dark:bg-green-900/20 dark:border-green-800 px-3 py-2">
                    <p className="text-xs font-medium text-green-800 dark:text-green-300">Resolution:</p>
                    <p className="text-sm text-green-700 dark:text-green-400 mt-0.5">{ticket.resolution}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
