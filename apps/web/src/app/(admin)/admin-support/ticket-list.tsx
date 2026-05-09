'use client';

import { useState, useEffect, useTransition } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Paperclip, Loader2, Camera } from 'lucide-react';
import { updateTicketStatus, addAdminReply, getTicketMessages, getAttachmentDownloadUrl } from '@/actions/support-tickets';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { logger } from '@/lib/logger';

function getCategoryBadgeClass(category: string) {
  switch (category) {
    case 'BUG':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'FEATURE':
      return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'BILLING':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'GENERAL':
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

function getCategoryLabel(category: string) {
  switch (category) {
    case 'BUG': return 'Bug Report';
    case 'FEATURE': return 'Feature Request';
    case 'BILLING': return 'Billing';
    case 'GENERAL': return 'General';
    default: return category;
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
    case 'LOW':
    default:
      return 'bg-gray-100 text-gray-500 border-gray-200';
  }
}

function getPriorityLabel(priority: string) {
  switch (priority) {
    case 'URGENT': return 'Urgent';
    case 'HIGH': return 'High';
    case 'NORMAL': return 'Normal';
    case 'LOW': return 'Low';
    default: return priority;
  }
}

function getStatusBadgeClass(status: string) {
  switch (status) {
    case 'OPEN':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'IN_PROGRESS':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'WAITING_ON_CUSTOMER':
      return 'bg-orange-100 text-orange-800 border-orange-200';
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
    case 'WAITING_ON_CUSTOMER': return 'Waiting on Customer';
    default: return status.charAt(0) + status.slice(1).toLowerCase();
  }
}

type TicketMessage = {
  id: string;
  ticketId: string;
  senderType: string;
  senderLabel: string;
  body: string;
  createdAt: Date;
};

interface TicketRowProps {
  ticket: TicketWithDetails;
}

function TicketRow({ ticket }: TicketRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState(ticket.status as string);
  const [resolution, setResolution] = useState(ticket.resolution ?? '');
  const [saving, setSaving] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [, startReplyTransition] = useTransition();
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [screenshotExpanded, setScreenshotExpanded] = useState(false);

  const showResolution = status === 'RESOLVED' || status === 'CLOSED';

  // Load messages and screenshot URL when row expands
  useEffect(() => {
    if (!expanded) return;

    // Load messages
    if (messages.length === 0) {
      setLoadingMessages(true);
      getTicketMessages(ticket.id)
        .then((msgs) => setMessages(msgs as TicketMessage[]))
        .catch(() => toast.error('Failed to load thread'))
        .finally(() => setLoadingMessages(false));
    }

    // Load screenshot URL
    if (ticket.screenshotKey && screenshotUrl === null) {
      setScreenshotLoading(true);
      getAttachmentDownloadUrl(ticket.screenshotKey)
        .then((url) => setScreenshotUrl(url))
        .catch((err) => {
          logger.error('[TicketRow] Failed to load screenshot URL:', err);
          // Don't show error toast — just don't display the screenshot
        })
        .finally(() => setScreenshotLoading(false));
    }
  }, [expanded, ticket.id, ticket.screenshotKey, messages.length, screenshotUrl]);

  async function handleViewAttachment() {
    if (!ticket.attachmentKey) return;
    setAttachmentLoading(true);
    try {
      const url = await getAttachmentDownloadUrl(ticket.attachmentKey);
      window.open(url, '_blank');
    } catch {
      toast.error('Failed to load attachment');
    } finally {
      setAttachmentLoading(false);
    }
  }

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

  function handleSendReply() {
    if (!replyText.trim()) {
      toast.error('Reply cannot be empty');
      return;
    }
    startReplyTransition(async () => {
      try {
        const result = await addAdminReply(ticket.id, replyText);
        if (result.success) {
          toast.success('Reply sent');
          setReplyText('');
          // Reload messages to show the new reply
          setMessages([]);
          const msgs = await getTicketMessages(ticket.id);
          setMessages(msgs as TicketMessage[]);
          // Update local status to IN_PROGRESS
          setStatus('IN_PROGRESS');
        } else {
          toast.error(result.error ?? 'Failed to send reply');
        }
      } catch {
        toast.error('Failed to send reply');
      }
    });
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
              <Badge className={getCategoryBadgeClass(ticket.category as string)}>
                {getCategoryLabel(ticket.category as string)}
              </Badge>
              <Badge className={getPriorityBadgeClass(ticket.priority as string)}>
                {getPriorityLabel(ticket.priority as string)}
              </Badge>
              <Badge className={getStatusBadgeClass(ticket.status as string)}>
                {getStatusLabel(ticket.status as string)}
              </Badge>
              {ticket.screenshotKey && (
                <span title="Has screenshot">
                  <Camera className="h-3.5 w-3.5 text-gray-400" />
                </span>
              )}
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

            {/* Platform badge */}
            {ticket.platform && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Platform</p>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                    ticket.platform === 'DESKTOP'
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-violet-50 text-violet-700 border-violet-200'
                  }`}
                >
                  {ticket.platform === 'DESKTOP' ? 'Desktop' : 'Mobile'}
                </span>
              </div>
            )}

            {/* Attachment */}
            {ticket.attachmentKey && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Attachment</p>
                <button
                  onClick={handleViewAttachment}
                  disabled={attachmentLoading}
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 underline cursor-pointer disabled:opacity-50"
                >
                  {attachmentLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Paperclip className="h-3.5 w-3.5" />
                  )}
                  {attachmentLoading ? 'Loading...' : 'View Attachment'}
                </button>
              </div>
            )}

            {/* Auto-captured Screenshot */}
            {ticket.screenshotKey && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Auto-captured Screenshot</p>
                {screenshotLoading ? (
                  <p className="text-xs text-gray-400">Loading screenshot...</p>
                ) : screenshotUrl ? (
                  <>
                    <img
                      src={screenshotUrl}
                      alt="Page screenshot"
                      className="max-h-48 rounded-md border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setScreenshotExpanded(true)}
                    />
                    <Dialog open={screenshotExpanded} onOpenChange={setScreenshotExpanded}>
                      <DialogContent className="max-w-4xl">
                        <DialogHeader>
                          <DialogTitle>Screenshot — {ticket.ticketNumber}</DialogTitle>
                        </DialogHeader>
                        <Image src={screenshotUrl} alt="Full page screenshot" width={800} height={600} className="w-full rounded-md" unoptimized />
                      </DialogContent>
                    </Dialog>
                  </>
                ) : null}
              </div>
            )}

            {/* Message thread */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Thread</p>
              {loadingMessages ? (
                <p className="text-xs text-gray-400">Loading thread...</p>
              ) : messages.length === 0 ? (
                <p className="text-xs text-gray-400">No replies yet.</p>
              ) : (
                <div className="space-y-2">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`rounded-md p-3 text-sm ${
                        msg.senderType === 'ADMIN'
                          ? 'bg-blue-50 border border-blue-100'
                          : 'bg-white border border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-xs font-semibold ${
                            msg.senderType === 'ADMIN' ? 'text-blue-700' : 'text-gray-700'
                          }`}
                        >
                          {msg.senderLabel}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(msg.createdAt).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-gray-700 whitespace-pre-wrap">{msg.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Admin reply form */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500">Send Reply to Owner</p>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={4}
                maxLength={4000}
                placeholder="Type your reply to the owner..."
                className="flex w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{replyText.length}/4000</span>
                <Button
                  size="sm"
                  onClick={handleSendReply}
                  disabled={!replyText.trim()}
                >
                  Send Reply
                </Button>
              </div>
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
                  <SelectItem value="WAITING_ON_CUSTOMER">Waiting on Customer</SelectItem>
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

type TabValue = 'ALL' | 'OPEN' | 'IN_PROGRESS' | 'CLOSED';

interface AdminTicketListProps {
  tickets: TicketWithDetails[];
  tenantOptions: { id: string; name: string }[];
}

export function AdminTicketList({ tickets, tenantOptions }: AdminTicketListProps) {
  const [activeTab, setActiveTab] = useState<TabValue>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [tenantFilter, setTenantFilter] = useState<string>('ALL');

  // Pre-compute tab counts from the full unfiltered list (unaffected by priority/tenant filters)
  const counts = {
    ALL: tickets.length,
    OPEN: tickets.filter((t) => t.status === 'OPEN').length,
    IN_PROGRESS: tickets.filter((t) => t.status === 'IN_PROGRESS' || t.status === 'WAITING_ON_CUSTOMER').length,
    CLOSED: tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED').length,
  };

  // Derive filtered + sorted list
  // ALL/CLOSED → newest first (desc); OPEN/IN_PROGRESS → oldest first (asc)
  const filteredTickets = tickets
    .filter((t) => {
      if (activeTab === 'ALL') return true;
      if (activeTab === 'OPEN') return t.status === 'OPEN';
      if (activeTab === 'IN_PROGRESS') return t.status === 'IN_PROGRESS' || t.status === 'WAITING_ON_CUSTOMER';
      if (activeTab === 'CLOSED') return t.status === 'RESOLVED' || t.status === 'CLOSED';
      return true;
    })
    .filter((t) => priorityFilter === 'ALL' || t.priority === priorityFilter)
    .filter((t) => tenantFilter === 'ALL' || t.tenantId === tenantFilter)
    .sort((a, b) => {
      const asc = activeTab === 'OPEN' || activeTab === 'IN_PROGRESS';
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return asc ? diff : -diff;
    });

  const headingLabel =
    activeTab === 'ALL' ? 'All Tickets' :
    activeTab === 'OPEN' ? 'Open Tickets' :
    activeTab === 'IN_PROGRESS' ? 'In Progress Tickets' :
    'Closed Tickets';

  const tabs: { value: TabValue; label: string }[] = [
    { value: 'ALL', label: 'All' },
    { value: 'OPEN', label: 'Open' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'CLOSED', label: 'Closed' },
  ];

  const sharedTabClass = 'px-3 py-1.5 rounded-md text-sm transition-colors';
  const activeTabClass = 'bg-white border border-gray-200 shadow-sm text-gray-900 font-semibold';
  const inactiveTabClass = 'text-gray-500 hover:text-gray-700 hover:bg-gray-100';

  const hasActiveFilter = priorityFilter !== 'ALL' || tenantFilter !== 'ALL';

  return (
    <div className="space-y-3">
      {/* Priority + Tenant filter controls */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="border border-gray-200 rounded-md px-3 py-1.5 text-sm bg-white text-gray-700"
        >
          <option value="ALL">All Priorities</option>
          <option value="URGENT">Urgent</option>
          <option value="HIGH">High</option>
          <option value="NORMAL">Normal</option>
          <option value="LOW">Low</option>
        </select>

        <select
          value={tenantFilter}
          onChange={(e) => setTenantFilter(e.target.value)}
          className="border border-gray-200 rounded-md px-3 py-1.5 text-sm bg-white text-gray-700 max-w-[200px]"
        >
          <option value="ALL">All Tenants</option>
          {tenantOptions.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        {hasActiveFilter && (
          <button
            onClick={() => { setPriorityFilter('ALL'); setTenantFilter('ALL'); }}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Reset filters
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`${sharedTabClass} ${activeTab === tab.value ? activeTabClass : inactiveTabClass}`}
          >
            {tab.label} ({counts[tab.value]})
          </button>
        ))}
      </div>

      {/* Count / hint row */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">
          {headingLabel} ({filteredTickets.length})
        </h2>
        <p className="text-xs text-gray-400">Click a ticket to expand details and update status</p>
      </div>

      {filteredTickets.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">No tickets in this category.</p>
      ) : (
        filteredTickets.map((ticket) => (
          <TicketRow key={ticket.id} ticket={ticket} />
        ))
      )}
    </div>
  );
}
