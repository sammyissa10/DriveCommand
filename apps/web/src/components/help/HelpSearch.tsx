'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Fuse from 'fuse.js';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Search, FileText, ArrowRight } from 'lucide-react';
import searchIndex from '@/lib/docs/search-index.json';

interface SearchEntry {
  slug: string;
  name: string;
  shortDescription: string;
  category: string;
  portal: string;
  planTier: string;
  route: string;
}

const fuseOptions = {
  keys: ['name', 'shortDescription', 'category'],
  threshold: 0.3,
  includeScore: true,
};

export function HelpSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const router = useRouter();

  const fuse = useMemo(() => new Fuse(searchIndex as SearchEntry[], fuseOptions), []);

  const results = useMemo(() => {
    if (!query.trim()) return searchIndex as SearchEntry[];
    return fuse.search(query).map((r) => r.item);
  }, [query, fuse]);

  // Command+K shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const handleSelect = (slug: string) => {
    setOpen(false);
    setQuery('');
    router.push(`/owner/help/${slug}`);
  };

  // Group results by category
  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchEntry[]> = {};
    for (const entry of results) {
      if (!groups[entry.category]) groups[entry.category] = [];
      groups[entry.category].push(entry);
    }
    return groups;
  }, [results]);

  const categoryLabels: Record<string, string> = {
    fleet: 'Fleet',
    dispatch: 'Dispatch',
    finance: 'Finance',
    crm: 'CRM',
    compliance: 'Compliance',
    ai: 'AI Tools',
    reporting: 'Reporting',
    integrations: 'Integrations',
    admin: 'Admin',
    support: 'Support',
    settings: 'Settings',
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full max-w-md px-3 py-2 text-sm text-muted-foreground bg-muted/50 border rounded-lg hover:bg-muted transition-colors"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search documentation...</span>
        <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search help articles..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {Object.entries(groupedResults).map(([category, entries]) => (
            <CommandGroup key={category} heading={categoryLabels[category] || category}>
              {entries.map((entry) => (
                <CommandItem
                  key={entry.slug}
                  value={entry.slug}
                  onSelect={() => handleSelect(entry.slug)}
                  className="flex items-center gap-3"
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{entry.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {entry.shortDescription}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
