/**
 * MobileActionSheet Component
 *
 * Bottom sheet for Filter/Sort/Columns actions on mobile.
 * Slide-up animation with backdrop.
 */

'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export interface MobileActionSheetProps {
  /** Whether sheet is open */
  open?: boolean;
  /** Open state change handler */
  onOpenChange?: (open: boolean) => void;
  /** Sheet variant determines content */
  variant: 'filter' | 'sort' | 'columns';
  /** Sheet title */
  title?: string;
  /** Sheet content */
  children?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

/**
 * MobileActionSheet provides a bottom sheet for mobile grid actions.
 *
 * Design:
 * - Slide-up animation from bottom
 * - Backdrop: bg-black/50
 * - Sheet: bg-background rounded-t-2xl max-h-[80vh]
 * - Header with title + close button
 * - Scrollable content area
 * - Variants: 'filter' | 'sort' | 'columns'
 *
 * @example
 * <MobileActionSheet
 *   open={isFilterOpen}
 *   onOpenChange={setIsFilterOpen}
 *   variant="filter"
 *   title="Filters"
 * >
 *   <FilterContent />
 * </MobileActionSheet>
 */
export function MobileActionSheet({
  open,
  onOpenChange,
  variant,
  title,
  children,
  className,
}: MobileActionSheetProps) {
  const defaultTitles = {
    filter: 'Filters',
    sort: 'Sort',
    columns: 'Columns',
  };

  const finalTitle = title || defaultTitles[variant];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          'max-h-[80vh] overflow-y-auto rounded-t-2xl',
          className
        )}
      >
        <SheetHeader className="mb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base font-medium">{finalTitle}</SheetTitle>
            <SheetClose asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <X className="h-4 w-4" strokeWidth={1.5} />
                <span className="sr-only">Close</span>
              </Button>
            </SheetClose>
          </div>
        </SheetHeader>

        {/* Scrollable content */}
        <div className="space-y-4">
          {children || (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No {variant} available
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
