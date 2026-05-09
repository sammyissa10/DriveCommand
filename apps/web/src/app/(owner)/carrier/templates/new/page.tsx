import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { RouteTemplateForm } from '@/components/carrier/templates/RouteTemplateForm';

export default function NewRouteTemplatePage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/carrier/templates"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Route Templates
        </Link>
        <h1 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          New Route Template
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Define a recurring route with stops for automated dispatch generation.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <RouteTemplateForm />
      </div>
    </div>
  );
}
