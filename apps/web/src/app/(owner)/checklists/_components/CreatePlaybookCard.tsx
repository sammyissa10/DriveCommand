'use client';

import { Plus } from 'lucide-react';

export function CreatePlaybookCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-full min-h-[160px] w-full rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-3 text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors cursor-pointer"
    >
      <div className="w-12 h-12 rounded-full border-2 border-current flex items-center justify-center">
        <Plus className="w-6 h-6" />
      </div>
      <span className="text-sm font-medium">Create new</span>
    </button>
  );
}
