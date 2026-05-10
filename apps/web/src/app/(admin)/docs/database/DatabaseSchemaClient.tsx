'use client';

import { useState, useMemo } from 'react';
import type { PrismaModel, PrismaEnum, ParsedSchema } from '@/lib/docs/prisma-parser';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Database, Search, AlertTriangle } from 'lucide-react';

interface ModuleGroup {
  name: string;
  models: PrismaModel[];
}

function ModelCard({ model }: { model: PrismaModel }) {
  const hasCascadeDeletes = model.relations.some((r) => r.onDelete === 'Cascade');
  const keyFields = model.fields.slice(0, 4);

  return (
    <Link href={`/docs/database/${model.name}`}>
      <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-start justify-between">
            <span className="font-mono">{model.name}</span>
            {hasCascadeDeletes && (
              <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0 ml-2" />
            )}
          </CardTitle>
          <div className="flex gap-2 mt-2">
            <Badge variant="outline" className="text-xs">
              {model.fields.length} fields
            </Badge>
            <Badge variant="outline" className="text-xs">
              {model.relations.length} relations
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-gray-600 space-y-1">
            {keyFields.map((field) => (
              <div key={field.name} className="font-mono">
                <span className="text-gray-500">{field.name}</span>
                <span className="text-gray-400 ml-1">
                  {field.type}
                  {field.isArray && '[]'}
                  {!field.isRequired && '?'}
                </span>
              </div>
            ))}
            {model.fields.length > 4 && (
              <div className="text-gray-400 italic">+{model.fields.length - 4} more</div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function EnumBadge({ name, valueCount }: { name: string; valueCount: number }) {
  return (
    <Badge variant="secondary" className="justify-between w-full">
      <span className="font-mono text-xs">{name}</span>
      <span className="text-xs text-gray-500 ml-2">{valueCount}</span>
    </Badge>
  );
}

function CollapsibleSection({
  title,
  count,
  children,
  defaultOpen = true,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border rounded-lg">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Badge variant="outline">{count}</Badge>
        </div>
        <span className="text-gray-500">{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && <div className="p-4 border-t">{children}</div>}
    </div>
  );
}

interface DatabaseSchemaClientProps {
  schema: ParsedSchema;
}

export default function DatabaseSchemaClient({ schema }: DatabaseSchemaClientProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const moduleGroups = useMemo(() => {
    // Group models by module
    const groups: Record<string, PrismaModel[]> = {};
    for (const model of schema.models) {
      if (!groups[model.module]) {
        groups[model.module] = [];
      }
      groups[model.module].push(model);
    }

    // Convert to array and sort by module name
    const groupArray: ModuleGroup[] = Object.entries(groups)
      .map(([name, models]) => ({ name, models }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return groupArray;
  }, [schema.models]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return moduleGroups;

    const query = searchQuery.toLowerCase();
    return moduleGroups
      .map((group) => ({
        ...group,
        models: group.models.filter((model) =>
          model.name.toLowerCase().includes(query)
        ),
      }))
      .filter((group) => group.models.length > 0);
  }, [moduleGroups, searchQuery]);

  return (
    <div className="max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <Database className="h-8 w-8 text-gray-400" />
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Database Schema
          </h1>
        </div>
        <p className="text-gray-600">
          {schema.models.length} models, {schema.enums.length} enums across{' '}
          {moduleGroups.length} modules
        </p>
      </div>

      {/* Search */}
      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          type="text"
          placeholder="Filter models..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Module Groups */}
      <div className="grid gap-6 mb-8">
        {filteredGroups.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No models match &quot;{searchQuery}&quot;
          </div>
        ) : (
          filteredGroups.map((group) => (
            <CollapsibleSection
              key={group.name}
              title={group.name}
              count={group.models.length}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.models.map((model) => (
                  <ModelCard key={model.name} model={model} />
                ))}
              </div>
            </CollapsibleSection>
          ))
        )}
      </div>

      {/* Enums Section */}
      {!searchQuery && (
        <CollapsibleSection title="Enums" count={schema.enums.length} defaultOpen={false}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {schema.enums.map((e) => (
              <EnumBadge key={e.name} name={e.name} valueCount={e.values.length} />
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}
