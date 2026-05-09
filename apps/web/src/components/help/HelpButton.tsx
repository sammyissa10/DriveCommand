'use client';

import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HelpSheet } from './HelpSheet';

interface HelpButtonProps {
  /** Optional pre-filled search query based on current page context */
  contextQuery?: string;
  className?: string;
}

export function HelpButton({ contextQuery, className }: HelpButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className={className}
        aria-label="Open help"
      >
        <HelpCircle className="h-5 w-5" />
      </Button>
      <HelpSheet open={open} onOpenChange={setOpen} initialQuery={contextQuery} />
    </>
  );
}
