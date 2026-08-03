'use client';

/**
 * Import Document — the top-right tinted circle (spec Section 15).
 *
 * Section 15's design rule is "no FABs, add is the top-right tinted circle",
 * and the first Phase 2 commit rendered a labelled rectangular button on
 * desktop instead.
 *
 * A note on "matching the pattern used elsewhere in the portal": there is no
 * pre-existing DESKTOP tinted-circle add action to copy. Carrier list pages
 * carry no top-right primary action at all — creation goes through the global
 * `QuickActionsMenu`, which is a labelled pill in the top bar. The tinted
 * circle exists in the `ds` mobile-web kit (`AddButton`, dark tokens) and the
 * portal's tinted-circle idiom is `rounded-full bg-primary/10 text-primary`,
 * used in about ten places for avatars and badges.
 *
 * So this is the `ds` AddButton's geometry expressed in the light brand tokens
 * the desktop portal actually uses — not an invented style, and not the dark
 * `ds.*` palette leaking onto a light surface.
 *
 * A circle has no visible label, so the name lives in `aria-label` plus a
 * tooltip. That is the trade Section 15 asks for.
 */

import Link from 'next/link';
import { FileUp } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function ImportDocumentAction({ href = '/carrier/imports/new' }: { href?: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={href}
            aria-label="Import Document"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <FileUp className="h-5 w-5" strokeWidth={1.75} />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="bottom">Import Document</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
