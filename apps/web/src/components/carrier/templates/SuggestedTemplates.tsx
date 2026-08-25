import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';

/**
 * Templates the system created for itself (spec Section 8, item 6).
 *
 * When `Tenant."autoCreateRouteTemplatesFromImports"` is on,
 * `runPostCommitTemplateStep` creates a template from a committed import and
 * marks it `isSuggested`. Nothing rendered that flag before Phase 8: the column
 * existed, the index on `(orgId, isSuggested)` existed, the write existed — and
 * a dispatcher had no way to see that the system had invented a route on their
 * behalf, which is a worse outcome than not creating one.
 *
 * Separated from the main list rather than mixed into it, because a suggestion
 * and a route somebody designed are different kinds of thing and the difference
 * matters when picking one for tomorrow.
 *
 * Renders NOTHING when there are none, which is the normal case for a tenant
 * with the setting off. A section header over an empty list is a section that
 * teaches people to ignore it.
 */
export async function SuggestedTemplates({ orgId, userId }: { orgId: string; userId: string }) {
  const db = await getTenantPrismaForOrg(orgId, userId);

  // No `deletedAt` on this model — checked against the schema, not assumed from
  // the carrier siblings that do have it.
  const rows = await db.routeTemplate.findMany({
    where: { orgId, isSuggested: true, active: true },
    select: {
      id: true,
      templateName: true,
      estimatedMiles: true,
      createdAt: true,
      _count: { select: { stops: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  if (rows.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-medium text-foreground">Suggested routes</h2>
        <span className="text-xs text-muted-foreground">created from imported documents</span>
      </div>

      <ul className="space-y-2">
        {rows.map((t) => (
          <li key={t.id}>
            <Link
              href={`/carrier/templates/${t.id}`}
              className="flex items-center gap-4 rounded-xl bg-card p-4 shadow-sm transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{t.templateName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {t._count.stops} stop{t._count.stops === 1 ? '' : 's'}
                  {t.estimatedMiles != null ? ` · ${String(t.estimatedMiles)} mi` : ''}
                  {' · created '}
                  {t.createdAt.toLocaleDateString('en-US', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                Suggested
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
