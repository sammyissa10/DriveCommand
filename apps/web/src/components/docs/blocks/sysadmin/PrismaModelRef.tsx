import React from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { ExternalLink } from 'lucide-react';

interface PrismaModelRefProps {
  model: string;
  fields?: string[];
}

export function PrismaModelRef({ model, fields }: PrismaModelRefProps) {
  return (
    <Card className="my-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground font-mono">
            {model}
          </h3>
          <a
            href={`https://github.com/your-org/drivecommand/blob/master/apps/web/prisma/schema.prisma`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:text-primary/80 inline-flex items-center gap-1"
          >
            View in schema.prisma
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardHeader>
      {fields && fields.length > 0 && (
        <CardContent>
          <ul className="space-y-1">
            {fields.map((field, index) => (
              <li
                key={index}
                className="font-mono text-sm text-muted-foreground"
              >
                {field}
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}
