/**
 * Client create page — quick-create form for adding a new client.
 *
 * Only company name is required. Users can add more details later.
 */

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/app/(owner)/actions/clients';
import { ClientCreateForm } from './_components/ClientCreateForm';

export default function NewClientPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/clients"
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to Clients
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Add Client
        </h1>
      </div>

      {/* Form */}
      <ClientCreateForm action={createClient} />
    </div>
  );
}
