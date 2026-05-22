import { notFound } from 'next/navigation';
import { parsePrismaSchema } from '@/lib/docs/prisma-parser';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, AlertTriangle, ArrowRight } from 'lucide-react';
import { features } from '@/lib/docs/feature-registry';
import { FieldsTable } from './_components/FieldsTable';

// Pre-generate all model pages at build time
export async function generateStaticParams() {
  const schema = parsePrismaSchema();
  return schema.models.map((model) => ({
    model: model.name,
  }));
}

function RelationCard({
  fieldName,
  targetModel,
  sourceModel,
  isArray,
  onDelete,
  direction,
}: {
  fieldName: string;
  targetModel?: string;
  sourceModel?: string;
  isArray: boolean;
  onDelete?: string;
  direction: 'outgoing' | 'incoming';
}) {
  const cardinality = isArray ? 'one-to-many' : 'one-to-one';
  const hasCascade = onDelete === 'Cascade';

  return (
    <Card className={hasCascade ? 'border-yellow-200 bg-yellow-50' : ''}>
      <CardContent className="py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {direction === 'outgoing' ? (
              <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />
            ) : (
              <ArrowLeft className="h-4 w-4 text-gray-400 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-mono text-sm font-medium truncate">{fieldName}</div>
              <div className="text-xs text-gray-500 truncate">
                {direction === 'outgoing' ? (
                  <>
                    → <Link href={`/docs/database/${targetModel}`} className="text-blue-600 hover:underline">{targetModel}</Link>
                  </>
                ) : (
                  <>
                    ← from <Link href={`/docs/database/${sourceModel}`} className="text-blue-600 hover:underline">{sourceModel}</Link>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Badge variant="outline" className="text-xs">
              {cardinality}
            </Badge>
            {onDelete && (
              <Badge
                variant={hasCascade ? 'destructive' : 'secondary'}
                className="text-xs"
              >
                {hasCascade && <AlertTriangle className="h-3 w-3 mr-1" />}
                {onDelete}
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function ModelDetailPage({ params }: { params: Promise<{ model: string }> }) {
  const { model: modelParam } = await params;
  const schema = parsePrismaSchema();

  // Find model (case-insensitive)
  const model = schema.models.find(
    (m) => m.name.toLowerCase() === modelParam.toLowerCase()
  );

  if (!model) {
    notFound();
  }

  // Find incoming relations (models that reference this model)
  const incomingRelations: Array<{
    sourceModel: string;
    fieldName: string;
    isArray: boolean;
    onDelete?: string;
  }> = [];

  for (const otherModel of schema.models) {
    for (const relation of otherModel.relations) {
      if (relation.targetModel === model.name) {
        incomingRelations.push({
          sourceModel: otherModel.name,
          fieldName: relation.fieldName,
          isArray: relation.isArray,
          onDelete: relation.onDelete,
        });
      }
    }
  }

  // Find features that use this model
  const featureUsages = features.filter((feature) =>
    feature.prismaModels?.includes(model.name)
  );

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/docs/database"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Schema
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 font-mono mb-2">
              {model.name}
            </h1>
            <div className="flex items-center gap-3">
              <Badge variant="secondary">{model.module}</Badge>
              <span className="text-sm text-gray-600">
                {model.fields.length} fields, {model.relations.length} relations
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Fields Section */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Fields</h2>
        <FieldsTable fields={model.fields} />
      </section>

      {/* Outgoing Relations Section */}
      <section className="mb-8">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Outgoing Relations</h2>
          <p className="text-sm text-gray-600">What this model references</p>
        </div>
        {model.relations.length === 0 ? (
          <p className="text-gray-500 italic">No outgoing relations</p>
        ) : (
          <div className="grid gap-2">
            {model.relations.map((relation) => (
              <RelationCard
                key={relation.fieldName}
                fieldName={relation.fieldName}
                targetModel={relation.targetModel}
                isArray={relation.isArray}
                onDelete={relation.onDelete}
                direction="outgoing"
              />
            ))}
          </div>
        )}
      </section>

      {/* Incoming Relations Section */}
      <section className="mb-8">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Incoming Relations</h2>
          <p className="text-sm text-gray-600">What references this model</p>
        </div>
        {incomingRelations.length === 0 ? (
          <p className="text-gray-500 italic">No incoming relations</p>
        ) : (
          <div className="grid gap-2">
            {incomingRelations.map((relation) => (
              <RelationCard
                key={`${relation.sourceModel}.${relation.fieldName}`}
                fieldName={relation.fieldName}
                sourceModel={relation.sourceModel}
                isArray={relation.isArray}
                onDelete={relation.onDelete}
                direction="incoming"
              />
            ))}
          </div>
        )}
      </section>

      {/* Feature Usages Section */}
      <section className="mb-8">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Feature Usages</h2>
          <p className="text-sm text-gray-600">Features that use this model</p>
        </div>
        {featureUsages.length === 0 ? (
          <p className="text-gray-500 italic">Not referenced in feature registry</p>
        ) : (
          <div className="border rounded-lg divide-y">
            {featureUsages.map((feature) => (
              <Link
                key={feature.slug}
                href={`/docs/features/${feature.slug}`}
                className="block px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-gray-900">{feature.name}</div>
                    <div className="text-sm text-gray-600">{feature.shortDescription}</div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Badge variant="outline" className="text-xs">
                      {feature.portal}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {feature.category}
                    </Badge>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
