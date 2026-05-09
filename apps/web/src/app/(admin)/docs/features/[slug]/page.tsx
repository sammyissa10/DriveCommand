import { renderSysadminDoc } from '@/lib/docs/render-mdx';
import { getFeatureBySlug } from '@/lib/docs/get-features';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Callout } from '@/components/docs/blocks/Callout';
import { PrismaModelRef } from '@/components/docs/blocks/sysadmin/PrismaModelRef';
import { ApiTable } from '@/components/docs/blocks/sysadmin/ApiTable';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import fs from 'node:fs';
import path from 'node:path';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function FeatureDetailPage({ params }: PageProps) {
  const { slug } = await params;

  // Get feature from registry
  const feature = await getFeatureBySlug(slug);
  if (!feature) {
    notFound();
  }

  // Try to render sysadmin doc
  let doc: Awaited<ReturnType<typeof renderSysadminDoc>> | null = null;
  try {
    doc = await renderSysadminDoc(slug);
  } catch (error) {
    // Doc doesn't exist yet
    console.log(`No sysadmin doc for ${slug}:`, error);
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            {feature.name}
          </h1>
          <Badge variant={feature.status === 'stable' ? 'default' : 'secondary'}>
            {feature.status}
          </Badge>
          <Badge variant="outline">{feature.portal}</Badge>
        </div>
        <p className="text-gray-600">{feature.shortDescription}</p>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-5 mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="server-actions">Server Actions</TabsTrigger>
          <TabsTrigger value="database">Database</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="runbook">Runbook</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          {doc ? (
            <div className="prose max-w-none">{doc.content}</div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <Callout variant="warning" title="Documentation Pending">
                  No sysadmin documentation yet for this feature. Create{' '}
                  <code>docs-content/sysadmin/{slug}.mdx</code> using the template at{' '}
                  <Link
                    href="https://github.com/drivecommand/docs-content/blob/main/sysadmin/_template.mdx"
                    className="text-blue-600 underline"
                  >
                    _template.mdx
                  </Link>
                  .
                </Callout>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Server Actions Tab */}
        <TabsContent value="server-actions">
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">Server Actions</h2>
              {!feature.serverActionPaths || feature.serverActionPaths.length === 0 ? (
                <p className="text-muted-foreground">
                  No server action paths registered for this feature.
                </p>
              ) : (
                <div className="space-y-6">
                  {feature.serverActionPaths.map((actionPath) => {
                    const fullPath = path.join(process.cwd(), actionPath);
                    let fileContent = '';
                    try {
                      fileContent = fs.readFileSync(fullPath, 'utf-8');
                    } catch (error) {
                      return (
                        <div key={actionPath}>
                          <h3 className="font-mono text-sm text-gray-600 mb-2">{actionPath}</h3>
                          <p className="text-sm text-red-600">File not found</p>
                        </div>
                      );
                    }

                    // Extract function exports
                    const functionRegex = /export\s+(async\s+)?function\s+(\w+)/g;
                    const matches = Array.from(fileContent.matchAll(functionRegex));
                    const functions = matches.map((m) => ({
                      name: m[2],
                      isAsync: !!m[1],
                    }));

                    return (
                      <div key={actionPath}>
                        <h3 className="font-mono text-sm text-gray-600 mb-3">{actionPath}</h3>
                        {functions.length > 0 ? (
                          <ApiTable
                            rows={functions.map((fn) => ({
                              name: fn.name,
                              roleGuard: 'See source',
                              inputSchema: 'See source',
                              returnType: fn.isAsync ? 'Promise<...>' : '...',
                            }))}
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground italic">
                            No exported functions found (check source manually)
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Database Tab */}
        <TabsContent value="database">
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">Database Schema</h2>
              {!feature.prismaModels || feature.prismaModels.length === 0 ? (
                <p className="text-muted-foreground">
                  No Prisma models registered for this feature.
                </p>
              ) : (
                <div className="space-y-4">
                  {feature.prismaModels.map((model) => (
                    <div key={model}>
                      <PrismaModelRef model={model} />
                      <Link
                        href={`vscode://file${process.cwd()}/prisma/schema.prisma`}
                        className="text-sm text-blue-600 hover:underline mt-2 inline-block"
                      >
                        View in schema.prisma
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">Security Notes</h2>
              {doc?.frontmatter?.securityNotes && doc.frontmatter.securityNotes.length > 0 ? (
                <div className="space-y-3">
                  {doc.frontmatter.securityNotes.map((note, index) => (
                    <Callout key={index} variant="warning">
                      {note}
                    </Callout>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">
                  No security notes documented for this feature. Add securityNotes array to
                  frontmatter in the sysadmin MDX file.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Runbook Tab */}
        <TabsContent value="runbook">
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">Operational Runbook</h2>
              {doc?.frontmatter?.runbookUrl ? (
                <div>
                  <p className="text-muted-foreground mb-4">
                    Runbook available at external location:
                  </p>
                  <Link
                    href={doc.frontmatter.runbookUrl}
                    className="text-blue-600 underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {doc.frontmatter.runbookUrl}
                  </Link>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  No runbook yet. Add runbookUrl to frontmatter in the sysadmin MDX file.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
