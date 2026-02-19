import Link from 'next/link';
import { Plus } from 'lucide-react';
import { listRoutes, deleteRoute } from '@/app/(owner)/actions/routes';
import { RouteListWrapper } from './route-list-wrapper';

export default async function RoutesPage() {
  const routes = await listRoutes();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Routes</h1>
          <p className="mt-1 text-muted-foreground">{routes.length} route{routes.length !== 1 ? 's' : ''} configured</p>
        </div>
        <Link
          href="/routes/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Route
        </Link>
      </div>

      <RouteListWrapper initialRoutes={routes} deleteAction={deleteRoute} />
    </div>
  );
}
