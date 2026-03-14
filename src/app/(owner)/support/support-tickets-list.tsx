'use client';

import { useMemo, useState } from 'react';
import { getMyTickets } from '@/actions/support-tickets';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { LifeBuoy } from 'lucide-react';
import Link from 'next/link';

type Tickets = Awaited<ReturnType<typeof getMyTickets>>;

type TabKey = 'all' | 'open' | 'in_progress' | 'closed';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'closed', label: 'Closed' },
];

function matchesTab(status: string, tab: TabKey): boolean {
  switch (tab) {
    case 'all':
      return true;
    case 'open':
      return status === 'OPEN';
    case 'in_progress':
      return status === 'IN_PROGRESS' || status === 'WAITING_ON_CUSTOMER';
    case 'closed':
      return status === 'RESOLVED' || status === 'CLOSED';
    default:
      return false;
  }
}

function getCategoryBadgeClass(category: string) {
  switch (category) {
    case 'BUG':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'FEATURE':
      return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'BILLING':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    default:
      return 'bg-blue-100 text-blue-800 border-blue-200';
  }
}

function getCategoryLabel(category: string) {
  switch (category) {
    case 'BUG': return 'Bug Report';
    case 'FEATURE': return 'Feature Request';
    case 'BILLING': return 'Billing';
    default: return 'General';
  }
}

function getPriorityBadgeClass(priority: string) {
  switch (priority) {
    case 'URGENT':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'HIGH':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'NORMAL':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

function getPriorityLabel(priority: string) {
  switch (priority) {
    case 'URGENT': return 'Urgent';
    case 'HIGH': return 'High';
    case 'NORMAL': return 'Normal';
    default: return 'Low';
  }
}

function getStatusBadgeClass(status: string) {
  switch (status) {
    case 'OPEN':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'IN_PROGRESS':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'WAITING_ON_CUSTOMER':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'RESOLVED':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'CLOSED':
      return 'bg-gray-100 text-gray-600 border-gray-200';
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'IN_PROGRESS': return 'In Progress';
    case 'WAITING_ON_CUSTOMER': return 'Waiting on You';
    default: return status.charAt(0) + status.slice(1).toLowerCase();
  }
}

interface SupportTicketsListProps {
  tickets: Tickets;
}

export function SupportTicketsList({ tickets }: SupportTicketsListProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('all');

  const counts = useMemo(() => {
    const result: Record<TabKey, number> = { all: 0, open: 0, in_progress: 0, closed: 0 };
    for (const ticket of tickets) {
      result.all++;
      if (ticket.status === 'OPEN') result.open++;
      if (ticket.status === 'IN_PROGRESS' || ticket.status === 'WAITING_ON_CUSTOMER') result.in_progress++;
      if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') result.closed++;
    }
    return result;
  }, [tickets]);

  const filteredTickets = useMemo(
    () => tickets.filter((t) => matchesTab(t.status, activeTab)),
    [tickets, activeTab]
  );

  if (tickets.length === 0) {
    return (
      <EmptyState
        icon={LifeBuoy}
        title="No support tickets yet"
        description="Use the support button in the bottom-right corner to submit a new ticket."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 w-fit">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const count = counts[tab.key];
          const isZero = count === 0;

          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={
                isActive
                  ? 'bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium'
                  : `text-muted-foreground hover:text-foreground px-3 py-1.5 text-sm font-medium${isZero ? ' opacity-50' : ''}`
              }
            >
              {tab.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Ticket list */}
      {filteredTickets.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No tickets match this filter.</p>
      ) : (
        <div className="space-y-3">
          {filteredTickets.map((ticket) => (
            <Link key={ticket.id} href={`/support/${ticket.id}`} className="block">
              <Card className="hover:shadow-sm transition-shadow cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-muted-foreground">{ticket.ticketNumber}</span>
                      <Badge className={getCategoryBadgeClass(ticket.category)}>
                        {getCategoryLabel(ticket.category)}
                      </Badge>
                      {ticket.priority && (
                        <Badge className={getPriorityBadgeClass(ticket.priority)}>
                          {getPriorityLabel(ticket.priority)}
                        </Badge>
                      )}
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
                    <div className="mt-3 rounded-md bg-green-50 border border-green-200 px-3 py-2">
                      <p className="text-xs font-medium text-green-800">Resolution:</p>
                      <p className="text-sm text-green-700 mt-0.5">{ticket.resolution}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
