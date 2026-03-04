'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { updateTicketStatus } from '@/actions/support-tickets';
import type { TicketWithDetails } from '@/actions/support-tickets';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function getTypeBadgeClass(type: string) {
  switch (type) {
    case 'BUG':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'FEATURE_REQUEST':
      return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'QUESTION':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'ACCOUNT_ISSUE':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
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
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'IN_PROGRESS':
      return 'bg-blue-100 text-blue-800 border-blue-200';
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
    default: return status.charAt(0) + status.slice(1).toLowerCase();
  }
}

interface TicketRowProps {
  ticket: TicketWithDetails;
}

function TicketRow({ ticket }: TicketRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState(ticket.status as string);
  const [resolution, setResolution] = useState(ticket.resolution ?? '');
  const [saving, setSaving] = useState(false);

  const showResolution = status === 'RESOLVED' || status === 'CLOSED';

  async function handleSave() {
    setSaving(true);
    try {
      const result = await updateTicketStatus(ticket.id, {
        status,
        resolution: showResolution ? resolution : undefined,
      });
      if (result.success) {
        toast.success(`Ticket ${ticket.ticketNumber} updated`);
      } else {
        toast.error(result.error ?? 'Failed to update ticket');
      }
    } catch {
      toast.error('Failed to update ticket');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border border-gray-200">
      <CardContent className="p-0">
        {/* Row header — always visible */}
        <div
          className="flex items-start gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-xs font-mono text-gray-400">{ticket.ticketNumber}</span>
              <Badge className={getTypeBadgeClass(ticket.type)}>
                {getTypeLabel(ticket.type)}
              </Badge>
              <Badge className={getStatusBadgeClass(ticket.status as string)}>
                {getStatusLabel(ticket.status as string)}
              </Badge>
            </div>
            <p className="font-semibold text-gray-900 truncate">{ticket.title}</p>
            <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
              <span>{ticket.tenantName}</span>
              <span>·</span>
              <span>{ticket.submitterEmail}</span>
              <span>·</span>
              <span>
                {new Date(ticket.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>
          </div>
          <div className="shrink-0 text-gray-400">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="border-t border-gray-100 p-4 space-y-4 bg-gray-50/50">
            {/* Full description */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Description</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
            </div>

            {/* Submitted from */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Submitted from page</p>
              <p className="text-xs font-mono text-gray-600">{ticket.fromPage}</p>
            </div>

            {/* Status update */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-gray-500">Update Status</p>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-48 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="RESOLVED">Resolved</SelectItem>
                  <SelectItem value="CLOSED">Closed</SelectItem>
                </SelectContent>
              </Select>

              {/* Resolution textarea — only when RESOLVED or CLOSED */}
              {showResolution && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500">
                    Resolution Notes
                  </label>
                  <textarea
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="Describe how the issue was resolved..."
                    className="flex w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  />
                </div>
              )}

              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface AdminTicketListProps {
  tickets: TicketWithDetails[];
}

export function AdminTicketList({ tickets }: AdminTicketListProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">
          All Tickets ({tickets.length})
        </h2>
        <p className="text-xs text-gray-400">Click a ticket to expand details and update status</p>
      </div>
      {tickets.map((ticket) => (
        <TicketRow key={ticket.id} ticket={ticket} />
      ))}
    </div>
  );
}
