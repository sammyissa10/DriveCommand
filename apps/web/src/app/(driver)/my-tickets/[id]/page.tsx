import { getTicketById } from '@/actions/support-tickets';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';
import { DriverReplyForm } from './driver-reply-form';

interface TicketDetailPageProps {
  params: Promise<{ id: string }>;
}

function getCategoryBadgeClass(category: string) {
  switch (category) {
    case 'BUG':
      return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800';
    case 'FEATURE':
      return 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800';
    case 'BILLING':
      return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800';
    default:
      return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800';
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
      return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800';
    case 'HIGH':
      return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800';
    case 'NORMAL':
      return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800';
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';
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
      return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800';
    case 'IN_PROGRESS':
      return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800';
    case 'WAITING_ON_CUSTOMER':
      return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800';
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
    case 'WAITING_ON_CUSTOMER': return 'Waiting on You';
    default: return status.charAt(0) + status.slice(1).toLowerCase();
  }
}

function formatMessageTime(date: Date | string) {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function DriverTicketDetailPage({ params }: TicketDetailPageProps) {
  const { id } = await params;
  const { ticket, messages } = await getTicketById(id);

  if (!ticket) {
    notFound();
  }

  const isClosed = ticket.status === 'CLOSED' || ticket.status === 'RESOLVED';

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back link */}
      <Link
        href="/my-tickets"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to My Tickets
      </Link>

      {/* Ticket header card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <span className="font-mono text-sm text-muted-foreground">{ticket.ticketNumber}</span>
            <div className="flex items-center gap-2 flex-wrap">
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
          </div>
          <CardTitle className="text-xl mt-2">{ticket.title}</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Submitted on{' '}
            {new Date(ticket.createdAt).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </CardHeader>
        <CardContent>
          <div className="rounded-md bg-muted/50 border border-border px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Original Description</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{ticket.description}</p>
          </div>
        </CardContent>
      </Card>

      {/* Message thread */}
      {messages.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Thread
          </h2>
          <div className="space-y-3">
            {messages.map((message) => {
              // OWNER senderType = driver's own messages (right side)
              // ADMIN senderType = Support Team (left side)
              const isDriverMessage = message.senderType === 'OWNER';
              return (
                <div
                  key={message.id}
                  className={`flex ${isDriverMessage ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-3 ${
                      isDriverMessage
                        ? 'bg-blue-50 border border-blue-200 text-blue-900 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-100'
                        : 'bg-muted border border-border text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-semibold">
                        {isDriverMessage ? message.senderLabel || 'You' : 'Support Team'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatMessageTime(message.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{message.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reply form or closed notice */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {isClosed ? 'Ticket Closed' : 'Reply'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isClosed ? (
            <p className="text-sm text-muted-foreground">
              This ticket is closed — you can open a new ticket using the support button in the bottom-right corner.
            </p>
          ) : (
            <DriverReplyForm ticketId={ticket.id} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
