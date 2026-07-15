import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/supabase';
import { RouteTemplateList } from '@/components/carrier/templates/RouteTemplateList';
import { TemplatesMobile } from './TemplatesMobile';

export default async function RouteTemplatesPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const canCreate = session.role !== 'MANAGER';

  return (
    <>
      {/* Mobile-web design system — rendered below lg; desktop keeps its own layout */}
      <div className="lg:hidden -m-4">
        <TemplatesMobile canCreate={canCreate} />
      </div>

      {/* Desktop */}
      <div className="hidden lg:block space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Route Templates
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              Manage recurring route templates for automated dispatch generation.
            </p>
          </div>
        </div>

        <RouteTemplateList />
      </div>
    </>
  );
}
