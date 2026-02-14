import Link from 'next/link';
import { listRoutes, deleteRoute } from '@/app/(owner)/actions/routes';
import { RouteListWrapper } from './route-list-wrapper';

export default async function RoutesPage() {
  const routes = await listRoutes();

  return (
    <div className="space-y-6 p-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Routes</h1>
        <Link
          href="/routes/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Create Route
        </Link>
      </div>

      {/* Route List */}
      <RouteListWrapper initialRoutes={routes} deleteAction={deleteRoute} />
    </div>
  );
}
