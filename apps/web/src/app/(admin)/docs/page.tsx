import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DocDriftIndicator } from '@/components/docs/DocDriftIndicator';
import { features } from '@/lib/docs/feature-registry';
import Link from 'next/link';
import { BookOpen, Cog, ArrowRight } from 'lucide-react';
import fs from 'node:fs';
import path from 'node:path';

export default async function AdminDocsPage() {
  // Count features
  const featureCount = features.filter(
    (f) => f.status === 'stable' || f.status === 'beta'
  ).length;

  // Count operational docs
  const docsDir = path.join(process.cwd(), 'docs');
  const files = fs.readdirSync(docsDir);
  const operationalDocsCount = files.filter(
    (f) => f.endsWith('.md') && f !== 'README.md'
  ).length;

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">
          Technical Knowledge Base
        </h1>
        <p className="text-gray-600">
          Complete technical documentation for DriveCommand features and infrastructure
        </p>
      </div>

      {/* Drift Indicator */}
      <div className="mb-8">
        <DocDriftIndicator />
      </div>

      {/* Section Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Feature Reference Card */}
        <Link href="/admin/docs/features">
          <Card className="hover:border-gray-400 transition-colors cursor-pointer h-full">
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <BookOpen className="h-8 w-8 text-blue-600" />
                <ArrowRight className="h-5 w-5 text-gray-400" />
              </div>
              <CardTitle>Feature Reference</CardTitle>
              <CardDescription>
                Technical deep-dive into every user-facing feature
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {featureCount} documented features with server actions, database schemas, RLS
                policies, and security notes.
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* Architecture & Operations Card */}
        <Link href="/admin/docs/operations">
          <Card className="hover:border-gray-400 transition-colors cursor-pointer h-full">
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <Cog className="h-8 w-8 text-purple-600" />
                <ArrowRight className="h-5 w-5 text-gray-400" />
              </div>
              <CardTitle>Architecture & Operations</CardTitle>
              <CardDescription>
                System design docs, auth, database, deployment
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {operationalDocsCount} comprehensive guides covering infrastructure, authentication,
                and operational procedures.
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
