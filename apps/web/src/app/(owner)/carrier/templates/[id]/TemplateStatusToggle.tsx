'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

interface TemplateStatusToggleProps {
  templateId: string;
  initialActive: boolean;
}

export function TemplateStatusToggle({ templateId, initialActive }: TemplateStatusToggleProps) {
  const router = useRouter();
  const [active, setActive] = useState(initialActive);
  const [isUpdating, setIsUpdating] = useState(false);

  async function handleToggle(newValue: boolean) {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/v1/carrier/route-templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: newValue }),
      });
      if (!res.ok) {
        toast.error('Failed to update template status');
        return;
      }
      setActive(newValue);
      toast.success(newValue ? 'Template activated' : 'Template deactivated');
      router.refresh();
    } catch {
      toast.error('Something went wrong');
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {active ? (
        <span className="inline-flex items-center rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200 px-2.5 py-0.5 text-xs font-medium">
          Active
        </span>
      ) : (
        <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200 px-2.5 py-0.5 text-xs font-medium">
          Inactive
        </span>
      )}
      <Switch
        checked={active}
        onCheckedChange={handleToggle}
        disabled={isUpdating}
        aria-label={active ? 'Deactivate template' : 'Activate template'}
      />
    </div>
  );
}
