'use client';

import { useState, useTransition } from 'react';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Info } from 'lucide-react';
import { toast } from 'sonner';
import { toggleTenantNotificationActive } from '@/app/(owner)/actions/tenant-notification-settings';
import type { TenantNotificationSettingRow } from '@/app/(owner)/actions/tenant-notification-settings';
import { TenantTemplateEditorPanel } from './tenant-template-editor-panel';

// ---------------------------------------------------------------------------
// Category ordering
// ---------------------------------------------------------------------------

const CATEGORY_ORDER = [
  'USER',
  'LOAD',
  'DRIVER',
  'TRUCK',
  'MESSAGE',
  'FINANCE',
  'ROUTE',
  'CUSTOMER',
  'DIGEST',
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  USER: 'bg-blue-100 text-blue-700',
  LOAD: 'bg-orange-100 text-orange-700',
  DRIVER: 'bg-green-100 text-green-700',
  TRUCK: 'bg-yellow-100 text-yellow-800',
  MESSAGE: 'bg-purple-100 text-purple-700',
  FINANCE: 'bg-teal-100 text-teal-700',
  ROUTE: 'bg-indigo-100 text-indigo-700',
  CUSTOMER: 'bg-pink-100 text-pink-700',
  DIGEST: 'bg-gray-100 text-gray-700',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface NotificationsTabProps {
  initialSettings: TenantNotificationSettingRow[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotificationsTab({ initialSettings }: NotificationsTabProps) {
  const [rows, setRows] = useState<TenantNotificationSettingRow[]>(initialSettings);
  const [editingTrigger, setEditingTrigger] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Group rows by category
  const grouped: Record<string, TenantNotificationSettingRow[]> = {};
  for (const row of rows) {
    const cat = row.template.category;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(row);
  }

  // Order by canonical category order
  const orderedCategories = CATEGORY_ORDER.filter((cat) => grouped[cat]?.length);

  const handleToggleActive = (triggerKey: string, newValue: boolean) => {
    // Optimistic update
    setRows((prev) =>
      prev.map((r) => (r.template.triggerKey === triggerKey ? { ...r, isActive: newValue } : r)),
    );

    startTransition(async () => {
      const result = await toggleTenantNotificationActive(triggerKey, newValue);
      if (!result.success) {
        // Revert
        setRows((prev) =>
          prev.map((r) =>
            r.template.triggerKey === triggerKey ? { ...r, isActive: !newValue } : r,
          ),
        );
        toast.error(result.error);
      } else {
        toast.success('Updated');
      }
    });
  };

  const editingRow = rows.find((r) => r.template.triggerKey === editingTrigger) ?? null;

  return (
    <TooltipProvider>
      <Accordion type="multiple" defaultValue={orderedCategories} className="space-y-2">
        {orderedCategories.map((category) => (
          <AccordionItem
            key={category}
            value={category}
            className="border border-gray-200 rounded-lg overflow-hidden"
          >
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[category] ?? 'bg-gray-100 text-gray-700'}`}
                >
                  {category}
                </span>
                <span className="text-sm text-gray-500">
                  {grouped[category].length} template{grouped[category].length !== 1 ? 's' : ''}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="p-0">
              <div className="divide-y divide-gray-100">
                {grouped[category].map((row) => (
                  <div
                    key={row.template.triggerKey}
                    className="flex items-center gap-4 px-4 py-3 bg-white"
                  >
                    {/* Left: name + info */}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {row.template.displayName}
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="text-gray-400 hover:text-gray-600 shrink-0"
                            tabIndex={-1}
                          >
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs">
                          {row.template.description}
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    {/* Middle: Override badge */}
                    <Badge variant="secondary" className="shrink-0">
                      {row.hasOverride ? 'Customized' : 'Default'}
                    </Badge>

                    {/* Right: Edit button + Active switch */}
                    <div className="flex items-center gap-3 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingTrigger(row.template.triggerKey)}
                      >
                        Edit Template
                      </Button>

                      {row.template.isActive === false ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div>
                              <Switch checked={false} disabled />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs max-w-xs">
                            This notification is currently disabled by DriveCommand globally
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Switch
                          checked={row.isActive}
                          onCheckedChange={(checked) =>
                            handleToggleActive(row.template.triggerKey, checked)
                          }
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {/* Edit Sheet */}
      <Sheet
        open={editingTrigger != null}
        onOpenChange={(open) => {
          if (!open) setEditingTrigger(null);
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col">
          <SheetHeader className="shrink-0">
            <SheetTitle>Edit Template</SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 mt-4 overflow-y-auto">
            {editingRow && (
              <TenantTemplateEditorPanel
                template={editingRow.template}
                tenantSetting={editingRow.tenantSetting}
                onClose={() => setEditingTrigger(null)}
                onUpdated={(updated) => {
                  setRows((prev) =>
                    prev.map((r) =>
                      r.template.triggerKey === editingTrigger
                        ? {
                            ...r,
                            tenantSetting: updated,
                            hasOverride: updated?.customBlockJson != null,
                          }
                        : r,
                    ),
                  );
                }}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
}
