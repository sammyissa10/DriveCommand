import { renderOperationalMd } from '@/lib/docs/render-operational-md';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function OperationalDocPage({ params }: PageProps) {
  const { slug } = await params;

  let doc: Awaited<ReturnType<typeof renderOperationalMd>>;
  try {
    doc = await renderOperationalMd(slug);
  } catch (error) {
    notFound();
  }

  return (
    <div className="max-w-4xl">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link
          href="/docs/operations"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Operations
        </Link>
      </div>

      {/* Title */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">{doc.title}</h1>
        <p className="text-gray-600">{doc.summary}</p>
      </div>

      {/* Content */}
      <div className="prose max-w-none">{doc.content}</div>
    </div>
  );
}
