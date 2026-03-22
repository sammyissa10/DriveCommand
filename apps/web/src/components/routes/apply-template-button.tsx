'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileSpreadsheet } from 'lucide-react';
import { applyTemplate } from '@/app/(owner)/actions/expense-templates';

interface ApplyTemplateButtonProps {
  routeId: string;
  routeStatus: string;
  templates: Array<{
    id: string;
    name: string;
    items: Array<{ description: string; amount: any }>;
  }>;
}

export function ApplyTemplateButton({
  routeId,
  routeStatus,
  templates,
}: ApplyTemplateButtonProps) {
  const router = useRouter();
  const [isApplying, setIsApplying] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Don't render if route is completed or no templates
  if (routeStatus === 'COMPLETED' || templates.length === 0) {
    return null;
  }

  const handleApply = async (templateId: string, templateName: string, itemCount: number) => {
    if (!window.confirm(
      `Apply "${templateName}"? This will add ${itemCount} expense ${itemCount === 1 ? 'item' : 'items'} to this route.`
    )) {
      return;
    }

    setIsApplying(true);
    setShowDropdown(false);

    const result = await applyTemplate(routeId, templateId);
    setIsApplying(false);

    if (result.error) {
      alert(result.error);
    } else {
      router.refresh();
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={isApplying}
        className="inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <FileSpreadsheet className="h-4 w-4" />
        {isApplying ? 'Applying...' : 'Apply Template'}
      </button>

      {showDropdown && (
        <>
          {/* Backdrop to close dropdown */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowDropdown(false)}
          />

          {/* Dropdown menu */}
          <div className="absolute left-0 mt-2 w-64 rounded-lg border border-border bg-card shadow-lg z-20">
            <div className="p-2 space-y-1">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleApply(template.id, template.name, template.items.length)}
                  className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <div className="font-medium">{template.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {template.items.length} {template.items.length === 1 ? 'item' : 'items'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
