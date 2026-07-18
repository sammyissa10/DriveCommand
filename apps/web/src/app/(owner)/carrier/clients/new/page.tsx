import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ClientForm } from '@/components/carrier/clients/ClientForm';
import { ClientCreateMobile } from './ClientCreateMobile';

export default function NewClientPage() {
  return (
    <>
      {/* Mobile-web design system view (phone widths only) */}
      <div className="lg:hidden -m-4">
        <ClientCreateMobile />
      </div>

      {/* Desktop form (lg and up) — unchanged */}
      <div className="hidden lg:block space-y-6">
        <div>
          <Link
            href="/carrier/clients"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Clients
          </Link>
          <h1 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            New Client
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a new client to your carrier network.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <ClientForm />
        </div>
      </div>
    </>
  );
}
