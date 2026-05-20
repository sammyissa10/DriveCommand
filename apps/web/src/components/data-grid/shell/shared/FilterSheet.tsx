/**
 * FilterSheet Component
 *
 * Side panel for filters (desktop: right, mobile: bottom).
 * Currently shows placeholder - actual filter UI will come in future phases.
 */

'use client';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Filter } from 'lucide-react';
import { useBreakpoint } from '../../hooks/useBreakpoint';

export interface FilterSheetProps {
  /** Whether sheet is open */
  open: boolean;
  /** Open change handler */
  onOpenChange: (open: boolean) => void;
}

/**
 * FilterSheet displays filter controls in a side panel.
 *
 * Design:
 * - Desktop (>=768px): side="right" with w-[400px]
 * - Mobile (<768px): side="bottom" with h-[60vh]
 * - Header: "Filters" title
 * - Body: Placeholder icon + text (actual filters coming later)
 *
 * @example
 * <FilterSheet
 *   open={filterSheetOpen}
 *   onOpenChange={setFilterSheetOpen}
 * />
 */
export function FilterSheet({ open, onOpenChange }: FilterSheetProps) {
  const { isDesktop } = useBreakpoint();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isDesktop ? 'right' : 'bottom'}
        className={isDesktop ? 'w-[400px]' : 'h-[60vh]'}
      >
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>

        {/* Placeholder content */}
        <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
          <Filter className="h-8 w-8" strokeWidth={1.5} />
          <p className="text-sm">Filters coming soon</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
