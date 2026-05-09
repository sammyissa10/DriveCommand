import { getOperationalDocs } from '@/lib/docs/render-operational-md';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { FileText } from 'lucide-react';

export default async function OperationsDocsPage() {
  const docs = await getOperationalDocs();

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">
          Architecture & Operations
        </h1>
        <p className="text-gray-600">
          System design documentation and operational procedures
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {docs.map((doc) => (
          <Link key={doc.slug} href={`/docs/operations/${doc.slug}`}>
            <Card className="hover:border-gray-400 transition-colors cursor-pointer h-full">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <FileText className="h-5 w-5 text-gray-500" />
                  <CardTitle className="text-lg">{doc.title}</CardTitle>
                </div>
                <CardDescription>{doc.summary}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
