'use client';

import { useState, useCallback } from 'react';
import { ConversationList } from '@/components/carrier/messages/ConversationList';
import { MessageThread } from '@/components/carrier/messages/MessageThread';

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

type SelectedConv = {
  driverId: string;
  driverName: string;
  dispatchId: string | null;
} | null;

export default function MessagesPage() {
  const [selected, setSelected] = useState<SelectedConv>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const handleConversationsLoaded = useCallback((convs: Conversation[]) => {
    setConversations(convs);
  }, []);

  const handleSelect = (driverId: string, dispatchId: string | null) => {
    const conv = conversations.find((c) => c.driverId === driverId);
    setSelected({
      driverId,
      dispatchId: dispatchId,
      driverName: conv?.driverName ?? 'Driver',
    });
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-lg border border-border bg-card">
      {/* Left panel — Conversation list */}
      <div className="w-[320px] flex-shrink-0 border-r border-border flex flex-col h-full overflow-hidden">
        <ConversationList
          selectedDriverId={selected?.driverId ?? null}
          onSelect={handleSelect}
          onConversationsLoaded={handleConversationsLoaded}
        />
      </div>

      {/* Right panel — Message thread */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <MessageThread
          driverId={selected?.driverId ?? null}
          driverName={selected?.driverName}
          dispatchId={selected?.dispatchId}
        />
      </div>
    </div>
  );
}
