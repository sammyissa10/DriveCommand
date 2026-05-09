import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DocDriftIndicator } from '@/components/docs/DocDriftIndicator';
import { features } from '@/lib/docs/feature-registry';
import Link from 'next/link';
import { BookOpen, Server, LifeBuoy, ArrowRight } from 'lucide-react';
import fs from 'node:fs';
import path from 'node:path';
import ia from '../../../../../../docs-content/_ia.json';

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

  // Icon mapping for sysadmin hubs
  const iconMap: Record<string, React.ReactNode> = {
    Server: <Server className="h-8 w-8 text-blue-600" />,
    LifeBuoy: <LifeBuoy className="h-8 w-8 text-green-600" />,
    BookOpen: <BookOpen className="h-8 w-8 text-purple-600" />,
  };

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

      {/* Section Cards from _ia.json */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {ia.sysadminHubs.map((hub: any) => {
          const icon = iconMap[hub.icon] || <BookOpen className="h-8 w-8 text-gray-600" />;
          const href =
            hub.id === 'feature-reference'
              ? '/admin/docs/features'
              : hub.id === 'support-operations'
                ? '/admin/docs/operations'
                : '/admin/docs/operations';

          const count =
            hub.id === 'feature-reference'
              ? featureCount
              : hub.id === 'support-operations'
                ? operationalDocsCount
                : hub.features.length;

          const description =
            hub.id === 'feature-reference'
              ? `${count} documented features with server actions, database schemas, RLS policies, and security notes.`
              : hub.id === 'support-operations'
                ? `${count} comprehensive guides covering infrastructure, authentication, and operational procedures.`
                : hub.description;

          return (
            <Link key={hub.id} href={href}>
              <Card className="hover:border-gray-400 transition-colors cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    {icon}
                    <ArrowRight className="h-5 w-5 text-gray-400" />
                  </div>
                  <CardTitle>{hub.name}</CardTitle>
                  <CardDescription>{hub.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
