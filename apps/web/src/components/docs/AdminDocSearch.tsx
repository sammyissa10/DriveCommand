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
import { Search, FileText, BookOpen, Cog, ArrowRight } from 'lucide-react';

interface SearchEntry {
  slug: string;
  name?: string;
  title?: string;
  shortDescription?: string;
  summary?: string;
  category?: string;
  portal?: string;
  planTier?: string;
  route?: string;
  type: 'feature' | 'sysadmin-doc' | 'operations-doc';
}

const fuseOptions = {
  keys: ['name', 'title', 'shortDescription', 'summary', 'category'],
  threshold: 0.3,
  includeScore: true,
};

export function AdminDocSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<SearchEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Fetch search index on mount
  useEffect(() => {
    fetch('/api/docs-index')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch search index');
        return res.json();
      })
      .then((data) => {
        setIndex(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error loading admin search index:', err);
        setLoading(false);
      });
  }, []);

  const fuse = useMemo(() => new Fuse(index, fuseOptions), [index]);

  const results = useMemo(() => {
    if (!query.trim()) return index;
    return fuse.search(query).map((r) => r.item);
  }, [query, fuse, index]);

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

  const handleSelect = (entry: SearchEntry) => {
    setOpen(false);
    setQuery('');

    // Navigate based on type
    if (entry.type === 'feature' || entry.type === 'sysadmin-doc') {
      router.push(`/docs/features/${entry.slug}`);
    } else if (entry.type === 'operations-doc') {
      router.push(`/docs/operations/${entry.slug}`);
    }
  };

  // Group results by type
  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchEntry[]> = {
      feature: [],
      'sysadmin-doc': [],
      'operations-doc': [],
    };

    for (const entry of results) {
      groups[entry.type].push(entry);
    }

    return groups;
  }, [results]);

  const typeLabels: Record<string, { label: string; icon: typeof FileText }> = {
    feature: { label: 'Feature Reference', icon: BookOpen },
    'sysadmin-doc': { label: 'Sysadmin Docs', icon: FileText },
    'operations-doc': { label: 'Operations Docs', icon: Cog },
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 transition-colors"
      >
        <Search className="h-4 w-4" />
        <span>Search docs...</span>
        <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-gray-600 bg-gray-900 px-1.5 font-mono text-[10px] font-medium text-gray-400">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search admin documentation..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {loading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Loading search index...
            </div>
          ) : (
            <>
              <CommandEmpty>No results found.</CommandEmpty>
              {Object.entries(groupedResults).map(([type, entries]) => {
                if (entries.length === 0) return null;

                const { label, icon: Icon } = typeLabels[type];

                return (
                  <CommandGroup key={type} heading={label}>
                    {entries.map((entry) => (
                      <CommandItem
                        key={`${entry.type}-${entry.slug}`}
                        value={`${entry.type}-${entry.slug}`}
                        onSelect={() => handleSelect(entry)}
                        className="flex items-center gap-3"
                      >
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {entry.name || entry.title || entry.slug}
                          </p>
                          {(entry.shortDescription || entry.summary) && (
                            <p className="text-xs text-muted-foreground truncate">
                              {entry.shortDescription || entry.summary}
                            </p>
                          )}
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
