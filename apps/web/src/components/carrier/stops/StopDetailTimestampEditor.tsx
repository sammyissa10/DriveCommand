'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface StopDetailTimestampEditorProps {
  stopId: string;
  field: 'arrivedAt' | 'departedAt';
  currentValue: string | null;
  label: string;
}

export function StopDetailTimestampEditor({
  stopId,
  field,
  currentValue,
  label,
}: StopDetailTimestampEditorProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState<string>(() => {
    if (!currentValue) return '';
    // Convert ISO to datetime-local input format (YYYY-MM-DDTHH:mm)
    return new Date(currentValue).toISOString().slice(0, 16);
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/v1/carrier/stops/${stopId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value ? new Date(value).toISOString() : null }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error((err as { error?: string }).error ?? 'Failed to update');
        return;
      }

      toast.success('Updated successfully');
      setIsEditing(false);
      router.refresh();
    } catch {
      toast.error('Failed to update');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setValue(currentValue ? new Date(currentValue).toISOString().slice(0, 16) : '');
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <button
        onClick={() => setIsEditing(true)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
        title={label}
        aria-label={label}
      >
        <Pencil className="h-3 w-3" />
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={isSaving}
        className="rounded border border-input bg-background px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6"
        onClick={handleSave}
        disabled={isSaving}
        aria-label="Save"
      >
        <Check className="h-3 w-3 text-green-600" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6"
        onClick={handleCancel}
        disabled={isSaving}
        aria-label="Cancel"
      >
        <X className="h-3 w-3 text-red-500" />
      </Button>
    </span>
  );
}
