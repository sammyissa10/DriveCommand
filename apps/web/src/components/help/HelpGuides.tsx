import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';

import { getAllFeatures } from '@/lib/docs/get-features';
import ia from '../../../../../docs-content/_ia.json';

/**
 * HelpGuides — the entry point to the written articles.
 *
 * WHY THIS EXISTS. The Help Centre has two content mechanisms behind one URL
 * prefix, and until Phase 12 only one of them was reachable:
 *
 *   /help/{category}/{article}   help.config stubs — the page renders the
 *                                literal words "Article content coming soon."
 *   /help/{slug}                 docs-content/client/{slug}.mdx — 57 written
 *                                articles, linked from NOTHING
 *
 * The category grid on /help links only at the stubs, `/help/whats-new` (which
 * does link the real articles) has no inbound link anywhere in `src/`, and the
 * two search components that read the registry index are both orphaned. So
 * every written article in the product was reachable only by typing its URL.
 * Verified by enumerating `a[href]` on `/help` in a real browser, not by
 * reading the diff — the same check that caught the orphaned sidebar in
 * quick-552.
 *
 * WHAT IT DOES. Walks the feature registry (not the directory), keeps the
 * entries that have a file on disk, and groups them by the hubs in `_ia.json`.
 * Registry-first is deliberate: `/help/{slug}` resolves through
 * `renderClientDoc`, which looks the slug up in the registry and throws if it
 * is absent, so a link built from a filename could still 404. A link built
 * from a registry entry that has a file cannot.
 *
 * Anything with a file but no hub lands in "More guides" rather than being
 * dropped, so the next article nobody remembers to file is still reachable.
 */

const DOCS_ROOT = path.resolve(process.cwd(), '..', '..', 'docs-content', 'client');

interface GuideLink {
  slug: string;
  name: string;
  description: string;
}

function hasArticle(slug: string): boolean {
  try {
    return fs.existsSync(path.join(DOCS_ROOT, `${slug}.mdx`));
  } catch {
    return false;
  }
}

export function HelpGuides() {
  const written = getAllFeatures().filter(
    (f) =>
      f.requiresClientDoc &&
      f.portal !== 'admin' &&
      (f.status === 'stable' || f.status === 'beta') &&
      hasArticle(f.slug)
  );

  if (written.length === 0) return null;

  const bySlug = new Map<string, GuideLink>(
    written.map((f) => [f.slug, { slug: f.slug, name: f.name, description: f.shortDescription }])
  );

  const groups: Array<{ id: string; name: string; guides: GuideLink[] }> = [];
  const placed = new Set<string>();

  for (const hub of ia.clientHubs) {
    const guides = hub.features
      .map((slug) => bySlug.get(slug))
      .filter((g): g is GuideLink => g !== undefined);
    for (const g of guides) placed.add(g.slug);
    if (guides.length > 0) groups.push({ id: hub.id, name: hub.name, guides });
  }

  const unfiled = written.filter((f) => !placed.has(f.slug)).map((f) => bySlug.get(f.slug)!);
  if (unfiled.length > 0) {
    groups.push({ id: 'more', name: 'More guides', guides: unfiled });
  }

  return (
    <section className="mb-10" aria-labelledby="help-guides-heading">
      <div className="mb-4 flex items-center gap-2">
        <BookOpen size={18} strokeWidth={1.75} className="text-muted-foreground" aria-hidden="true" />
        <h2 id="help-guides-heading" className="text-lg font-semibold text-foreground">
          Guides
        </h2>
      </div>

      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.id}>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {group.name}
            </h3>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {group.guides.map((guide) => (
                <li key={guide.slug}>
                  <Link
                    href={`/help/${guide.slug}`}
                    className="block rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/50"
                  >
                    <span className="block text-sm font-medium text-foreground">{guide.name}</span>
                    <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">
                      {guide.description}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        Recently added:{' '}
        <Link href="/help/whats-new" className="font-medium text-primary hover:underline">
          What&apos;s new
        </Link>
      </p>
    </section>
  );
}

