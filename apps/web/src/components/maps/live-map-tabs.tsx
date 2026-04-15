'use client';

import { cn } from '@/lib/utils';
import { Map, History, Route } from 'lucide-react';

type TabId = 'live' | 'history' | 'trips';

interface LiveMapTabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'live', label: 'Live', icon: Map },
  { id: 'history', label: 'History', icon: History },
  { id: 'trips', label: 'Trips', icon: Route },
];

export default function LiveMapTabs({ activeTab, onTabChange }: LiveMapTabsProps) {
  return (
    <div className="flex border-b shrink-0">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onTabChange(id)}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors',
            activeTab === id
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
