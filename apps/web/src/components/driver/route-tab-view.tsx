'use client';

/**
 * Tab view wrapper for the driver Route page.
 * Manages Active / History tab state on the client.
 */

import { useState, type ReactNode } from 'react';

interface RouteTabViewProps {
  hasActiveDispatch: boolean;
  historyCount: number;
  activeTab: ReactNode;
  historyTab: ReactNode;
}

export function RouteTabView({ hasActiveDispatch, historyCount, activeTab, historyTab }: RouteTabViewProps) {
  const [activeTabKey, setActiveTabKey] = useState<'active' | 'history'>('active');

  return (
    <div className="space-y-4">
      {/* Tab buttons */}
      <div className="bg-muted rounded-lg p-1 flex gap-1">
        <button
          type="button"
          onClick={() => setActiveTabKey('active')}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
            activeTabKey === 'active'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Active
          {hasActiveDispatch && (
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-white text-[10px] font-bold">
              1
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTabKey('history')}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
            activeTabKey === 'history'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          History
          {historyCount > 0 && (
            <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-muted-foreground/20 text-muted-foreground text-[10px] font-bold px-1">
              {historyCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      {activeTabKey === 'active' ? activeTab : historyTab}
    </div>
  );
}
