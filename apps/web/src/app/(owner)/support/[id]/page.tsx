import { getTicketById } from '@/actions/support-tickets';
import { generateDownloadUrl } from '@/lib/storage/presigned';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Paperclip } from 'lucide-react';
import { OwnerReplyForm } from './owner-reply-form';

interface TicketDetailPageProps {
  params: Promise<{ id: string }>;
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

function formatMessageTime(date: Date | string) {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function TicketDetailPage({ params }: TicketDetailPageProps) {
  const { id } = await params;
  const { ticket, messages } = await getTicketById(id);

  if (!ticket) {
    notFound();
  }

  const isClosed = ticket.status === 'CLOSED' || ticket.status === 'RESOLVED';
  const attachmentUrl = ticket.attachmentKey ? await generateDownloadUrl(ticket.attachmentKey) : null;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back link */}
      <Link
        href="/support"
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
        <CardContent className="space-y-4">
          <div className="rounded-md bg-muted/50 border border-border px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Original Description</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{ticket.description}</p>
          </div>

          {/* Platform badge */}
          {ticket.platform && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Platform</p>
              <Badge
                className={
                  ticket.platform === 'DESKTOP'
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-violet-50 text-violet-700 border-violet-200'
                }
              >
                {ticket.platform === 'DESKTOP' ? 'Desktop' : 'Mobile'}
              </Badge>
            </div>
          )}

          {/* Attachment link */}
          {attachmentUrl && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Attachment</p>
              <a
                href={attachmentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 underline"
              >
                <Paperclip className="h-3.5 w-3.5" />
                View Attachment
              </a>
            </div>
          )}
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
              const isOwner = message.senderType === 'OWNER';
              return (
                <div
                  key={message.id}
                  className={`flex ${isOwner ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-3 ${
                      isOwner
                        ? 'bg-blue-50 border border-blue-200 text-blue-900'
                        : 'bg-muted border border-border text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-semibold">
                        {isOwner ? message.senderLabel || 'You' : 'Support Team'}
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
            <OwnerReplyForm ticketId={ticket.id} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
