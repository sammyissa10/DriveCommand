import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';

interface HelpBreadcrumbsProps {
  hubName?: string;
  hubId?: string;
  articleTitle?: string;
}

export function HelpBreadcrumbs({ hubName, articleTitle }: HelpBreadcrumbsProps) {
  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
      <Link
        href="/help"
        className="flex items-center gap-1 hover:text-foreground transition-colors"
      >
        <Home className="h-3.5 w-3.5" />
        <span>Help Center</span>
      </Link>

      {hubName && (
        <>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-muted-foreground">{hubName}</span>
        </>
      )}

      {articleTitle && (
        <>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground truncate max-w-[200px]">
            {articleTitle}
          </span>
        </>
      )}
    </nav>
  );
}
