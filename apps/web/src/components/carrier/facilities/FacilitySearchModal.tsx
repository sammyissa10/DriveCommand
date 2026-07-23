'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface FacilitySearchResult {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  facilityType: string | null;
}

interface FacilitySearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (facility: FacilitySearchResult) => void;
  onCreateNew?: () => void;
  /**
   * When true, renders only the search body (input + results + create button)
   * with no Dialog/DialogContent/DialogHeader wrapper. The parent owns the
   * Dialog and title in this mode. Defaults to false for backward
   * compatibility with existing consumers (e.g. TripAddStopModal).
   */
  bodyOnly?: boolean;
}

const BADGE_CLASSES: Record<string, string> = {
  terminal: 'border-blue-500 text-blue-600 dark:text-blue-400',
  warehouse: 'border-orange-500 text-orange-600 dark:text-orange-400',
  distribution_center: 'border-purple-500 text-purple-600 dark:text-purple-400',
  cross_dock: 'border-green-500 text-green-600 dark:text-green-400',
  customer_location: 'border-slate-500 text-slate-600 dark:text-slate-400',
  pickup: 'border-emerald-500 text-emerald-600 dark:text-emerald-400',
  delivery: 'border-amber-500 text-amber-600 dark:text-amber-400',
};

function getFacilityTypeLabel(type: string | null): string {
  if (!type) return '';
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function FacilitySearchModal({
  open,
  onOpenChange,
  onSelect,
  onCreateNew,
  bodyOnly,
}: FacilitySearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FacilitySearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/v1/carrier/facilities?search=${encodeURIComponent(query.trim())}&pageSize=20`
        );
        if (res.ok) {
          const data = await res.json();
          setResults(data.data?.items ?? []);
        }
      } catch {
        // silently ignore search errors
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function handleSelect(facility: FacilitySearchResult) {
    onSelect(facility);
    // Do NOT call onOpenChange(false) here — the parent controls modal state.
    // For StopBuilderAddModal: onSelect sets step→2, unmounting this Dialog
    // and rendering the step-2 Dialog instead (open prop stays true).
    // Closing here would trigger StopBuilderAddModal's reset useEffect
    // and wipe selectedFacility before step 2 can render.
  }

  const body = (
    <>
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by facility name..."
          autoFocus
          className="flex h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {/* Results list */}
      <div className="max-h-72 overflow-y-auto -mx-1 px-1">
        {isLoading && (
          <p className="py-6 text-center text-sm text-muted-foreground">Searching…</p>
        )}

        {!isLoading && query.trim() && results.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No facilities found</p>
        )}

        {!isLoading && !query.trim() && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Start typing to search facilities
          </p>
        )}

        {!isLoading && results.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border overflow-hidden mt-1">
            {results.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(f)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{f.name}</p>
                    {(f.city || f.state) && (
                      <p className="text-xs text-muted-foreground">
                        {f.city && f.state
                          ? `${f.city}, ${f.state}`
                          : f.city ?? f.state}
                      </p>
                    )}
                  </div>
                  {f.facilityType && (
                    <Badge
                      variant="outline"
                      className={`shrink-0 text-xs ${BADGE_CLASSES[f.facilityType] ?? 'border-border text-muted-foreground'}`}
                    >
                      {getFacilityTypeLabel(f.facilityType)}
                    </Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Create New button */}
      {onCreateNew && (
        <div className="border-t border-border pt-3">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              onCreateNew();
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create New Facility
          </Button>
        </div>
      )}
    </>
  );

  if (bodyOnly) {
    return body;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Search Facilities</DialogTitle>
        </DialogHeader>

        {body}
      </DialogContent>
    </Dialog>
  );
}
