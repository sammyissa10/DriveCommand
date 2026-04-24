'use client';

import Link from 'next/link';
import {
  User,
  Truck,
  Handshake,
  Package,
  Shield,
  Sparkles,
  FileText,
  ClipboardList,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@/server/api/root';

type PlaybookListItem = inferRouterOutputs<AppRouter>['workflows']['playbook']['list'][number];

const CATEGORY_ICON: Record<string, React.ReactNode> = {
  ONBOARDING: <User className="w-6 h-6" />,
  SAFETY: <Shield className="w-6 h-6" />,
  OPERATIONS: <Package className="w-6 h-6" />,
  COMPLIANCE: <FileText className="w-6 h-6" />,
  PARTNER: <Handshake className="w-6 h-6" />,
  CUSTOM: <Sparkles className="w-6 h-6" />,
};

const CATEGORY_COLOR: Record<string, string> = {
  ONBOARDING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  SAFETY: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  OPERATIONS: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  COMPLIANCE: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  PARTNER: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  CUSTOM: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const ENTITY_TYPE_LABEL: Record<string, string> = {
  DRIVER: 'Driver',
  VEHICLE: 'Vehicle',
  PARTNER: 'Partner',
  DISPATCH: 'Dispatch',
  OTHER: 'Other',
};

const CATEGORY_LABEL: Record<string, string> = {
  ONBOARDING: 'Onboarding',
  SAFETY: 'Safety',
  OPERATIONS: 'Operations',
  COMPLIANCE: 'Compliance',
  PARTNER: 'Partner',
  CUSTOM: 'Custom',
};

export function PlaybookCard({ playbook }: { playbook: PlaybookListItem }) {
  const icon = CATEGORY_ICON[playbook.category] ?? <ClipboardList className="w-6 h-6" />;
  const colorClass = CATEGORY_COLOR[playbook.category] ?? CATEGORY_COLOR.CUSTOM;
  const stepCount = playbook._count.steps;

  return (
    <Link href={`/checklists/playbooks/${playbook.id}/edit`} className="block group">
      <Card className="h-full transition-shadow group-hover:shadow-md cursor-pointer border border-border">
        <CardContent className="p-4 flex flex-col gap-3 h-full">
          {/* Category icon tile */}
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${colorClass}`}>
            {icon}
          </div>

          {/* Name */}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-snug line-clamp-2">{playbook.name}</p>
            {playbook.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{playbook.description}</p>
            )}
          </div>

          {/* Footer: entity type + step count */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">
              {ENTITY_TYPE_LABEL[playbook.entityType] ?? playbook.entityType}
            </Badge>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {stepCount} {stepCount === 1 ? 'step' : 'steps'}
            </span>
          </div>

          {/* Category label */}
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            {CATEGORY_LABEL[playbook.category] ?? playbook.category}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
