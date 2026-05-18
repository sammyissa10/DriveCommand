'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatAbsoluteTime, formatRelativeTime } from '@/lib/audit-trail/format-relative-time';

export interface AuditTrailFooterProps {
  createdAt: Date | string;
  createdByName: string | null;
  createdByEmail: string | null;
  updatedAt: Date | string;
  updatedByName: string | null;
  updatedByEmail: string | null;
}

export function AuditTrailFooter({
  createdAt,
  createdByName,
  createdByEmail,
  updatedAt,
  updatedByName,
  updatedByEmail,
}: AuditTrailFooterProps) {
  // Coerce to Date objects
  const createdDate = createdAt instanceof Date ? createdAt : new Date(createdAt as string);
  const updatedDate = updatedAt instanceof Date ? updatedAt : new Date(updatedAt as string);

  const createdMs = createdDate.getTime();
  const updatedMs = updatedDate.getTime();
  const diffMs = Math.abs(updatedMs - createdMs);

  // Resolve display names
  const createdActor =
    createdByName?.trim() || createdByEmail?.trim() || 'Unknown';
  const updatedActor =
    updatedByName?.trim() || updatedByEmail?.trim() || 'Unknown';

  // Collapse to single line when:
  // - exact timestamp match (no update has happened), OR
  // - diff < 60s AND same actor (redundant update)
  const showOnlyCreated =
    updatedMs === createdMs ||
    (diffMs < 60_000 && createdActor === updatedActor);

  return (
    <TooltipProvider>
      <div className="mt-8 pt-6 space-y-1">
        <p className="text-sm text-muted-foreground">
          Created{' '}
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                tabIndex={0}
                role="button"
                className="underline decoration-dotted cursor-help"
              >
                {formatRelativeTime(createdDate)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {formatAbsoluteTime(createdDate)}
            </TooltipContent>
          </Tooltip>{' '}
          by {createdActor}
        </p>

        {!showOnlyCreated && (
          <p className="text-sm text-muted-foreground">
            Last updated{' '}
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  role="button"
                  className="underline decoration-dotted cursor-help"
                >
                  {formatRelativeTime(updatedDate)}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {formatAbsoluteTime(updatedDate)}
              </TooltipContent>
            </Tooltip>{' '}
            by {updatedActor}
          </p>
        )}
      </div>
    </TooltipProvider>
  );
}
