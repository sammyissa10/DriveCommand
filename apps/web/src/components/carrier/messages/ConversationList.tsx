'use client';

import { useState, useEffect, useCallback } from 'react';
import { MessageSquarePlus, Megaphone, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ComposeModal } from './ComposeModal';
import { BroadcastModal } from './BroadcastModal';
import { cn } from '@/lib/utils';

type Conversation = {
  driverId: string;
  driverName: string;
  isBroadcast: boolean;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  dispatchId: string | null;
  dispatchNumber: string | null;
};

function formatRelativeTime(isoString: string): string {
  const now = new Date();
  const date = new Date(isoString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

interface ConversationListProps {
  selectedDriverId: string | null;
  onSelect: (driverId: string, dispatchId: string | null) => void;
  onConversationsLoaded?: (conversations: Conversation[]) => void;
}

export function ConversationList({
  selectedDriverId,
  onSelect,
  onConversationsLoaded,
}: ConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [tab, setTab] = useState<'all' | 'dispatches' | 'drivers'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/messages/conversations?tab=${tab}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations ?? []);
      onConversationsLoaded?.(data.conversations ?? []);
    } catch {
      // Silent failure
    } finally {
      setIsLoading(false);
    }
  }, [tab, onConversationsLoaded]);

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 5000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Messages</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setComposeOpen(true)}
            title="New message"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setBroadcastOpen(true)}
            title="Broadcast to all drivers"
          >
            <Megaphone className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-3 py-2 border-b border-border">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="w-full h-8 text-xs">
            <TabsTrigger value="all" className="flex-1 text-xs">
              All
            </TabsTrigger>
            <TabsTrigger value="dispatches" className="flex-1 text-xs">
              Dispatches
            </TabsTrigger>
            <TabsTrigger value="drivers" className="flex-1 text-xs">
              Drivers
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <Radio className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No conversations yet</p>
          </div>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.driverId}
              type="button"
              onClick={() => onSelect(conv.driverId, conv.dispatchId)}
              className={cn(
                'w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-accent transition-colors border-b border-border/50',
                selectedDriverId === conv.driverId && 'bg-accent'
              )}
            >
              {/* Avatar */}
              <div className="flex-shrink-0 h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-xs font-semibold text-primary">
                  {conv.isBroadcast ? 'ALL' : getInitials(conv.driverName)}
                </span>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground truncate">
                    {conv.driverName}
                  </span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {formatRelativeTime(conv.lastMessageAt)}
                  </span>
                </div>
                {conv.dispatchNumber && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    Dispatch {conv.dispatchNumber}
                  </p>
                )}
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {conv.lastMessage}
                </p>
              </div>

              {/* Unread badge */}
              {conv.unreadCount > 0 && (
                <Badge className="flex-shrink-0 h-5 min-w-5 px-1.5 text-[10px] font-bold rounded-full bg-primary text-primary-foreground self-center">
                  {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                </Badge>
              )}
            </button>
          ))
        )}
      </div>

      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSent={fetchConversations}
      />
      <BroadcastModal
        open={broadcastOpen}
        onClose={() => setBroadcastOpen(false)}
      />
    </div>
  );
}
