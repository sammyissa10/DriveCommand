'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Fuse from 'fuse.js';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, FileText, ArrowRight, BookOpen } from 'lucide-react';
import Link from 'next/link';
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

interface HelpSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery?: string;
}

const fuseOptions = {
  keys: ['name', 'shortDescription', 'category'],
  threshold: 0.3,
  includeScore: true,
};

export function HelpSheet({ open, onOpenChange, initialQuery = '' }: HelpSheetProps) {
  const [query, setQuery] = useState(initialQuery);
  const router = useRouter();

  const fuse = useMemo(() => new Fuse(searchIndex as SearchEntry[], fuseOptions), []);

  // Reset query when sheet opens with new initialQuery
  useEffect(() => {
    if (open && initialQuery) {
      setQuery(initialQuery);
    }
  }, [open, initialQuery]);

  const results = useMemo(() => {
    if (!query.trim()) return (searchIndex as SearchEntry[]).slice(0, 8);
    return fuse.search(query).slice(0, 8).map((r) => r.item);
  }, [query, fuse]);

  const handleSelect = (slug: string) => {
    onOpenChange(false);
    setQuery('');
    router.push(`/help/${slug}`);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Help Center
          </SheetTitle>
          <SheetDescription>
            Search documentation or browse help articles
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search help articles..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          {/* Results */}
          <ScrollArea className="h-[calc(100vh-220px)]">
            <div className="space-y-1">
              {results.map((entry) => (
                <button
                  key={entry.slug}
                  onClick={() => handleSelect(entry.slug)}
                  className="w-full flex items-center gap-3 p-3 text-left rounded-lg hover:bg-muted transition-colors"
                >
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{entry.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {entry.shortDescription}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          </ScrollArea>

          {/* Footer link */}
          <div className="pt-4 border-t">
            <Link
              href="/help"
              onClick={() => onOpenChange(false)}
              className="text-sm text-primary hover:underline"
            >
              Browse all help articles
            </Link>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
