'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocumentType {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function TypesSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 rounded-md border border-border bg-muted/20 px-4 py-3">
          <div className="h-4 w-32 bg-muted animate-pulse rounded" />
          <div className="h-5 w-16 bg-muted animate-pulse rounded-full" />
          <div className="ml-auto flex items-center gap-3">
            <div className="h-5 w-9 bg-muted animate-pulse rounded-full" />
            <div className="h-7 w-16 bg-muted animate-pulse rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DocumentTypesManager() {
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  // Edit dialog
  const [editTarget, setEditTarget] = useState<DocumentType | null>(null);
  const [editName, setEditName] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Toggle saving
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Delete saving
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchTypes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/carrier/document-types');
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? 'Failed to load document types');
      }
      const data = await res.json() as { data: DocumentType[] };
      setTypes(data.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load document types');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTypes();
  }, [fetchTypes]);

  // ── Add ──────────────────────────────────────────────────────────────────

  async function handleAdd() {
    if (!addName.trim()) return;
    setAddSaving(true);
    try {
      const res = await fetch('/api/v1/carrier/document-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? 'Failed to create type');
      }
      toast.success('Document type added');
      setAddOpen(false);
      setAddName('');
      await fetchTypes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create type');
    } finally {
      setAddSaving(false);
    }
  }

  // ── Edit ─────────────────────────────────────────────────────────────────

  function openEdit(type: DocumentType) {
    setEditTarget(type);
    setEditName(type.name);
  }

  async function handleEdit() {
    if (!editTarget || !editName.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/v1/carrier/document-types/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? 'Failed to update type');
      }
      toast.success('Document type updated');
      setEditTarget(null);
      await fetchTypes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update type');
    } finally {
      setEditSaving(false);
    }
  }

  // ── Toggle ───────────────────────────────────────────────────────────────

  async function handleToggle(type: DocumentType) {
    setTogglingId(type.id);
    try {
      const res = await fetch(`/api/v1/carrier/document-types/${type.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !type.isActive }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? 'Failed to update type');
      }
      setTypes((prev) =>
        prev.map((t) => (t.id === type.id ? { ...t, isActive: !type.isActive } : t))
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update type');
    } finally {
      setTogglingId(null);
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/v1/carrier/document-types/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? 'Failed to delete type');
      }
      toast.success('Document type deleted');
      await fetchTypes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete type');
    } finally {
      setDeletingId(null);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) return <TypesSkeleton />;

  if (error) {
    return (
      <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{types.length} type{types.length !== 1 ? 's' : ''} total</p>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add Custom Type
        </Button>
      </div>

      {/* Table header */}
      <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b border-border">
        <span>Name</span>
        <span className="text-center">Default</span>
        <span className="text-center">Active</span>
        <span className="text-center">Actions</span>
      </div>

      {/* Type rows */}
      <div className="space-y-2">
        {types.map((type) => {
          const isToggling = togglingId === type.id;
          const isDeleting = deletingId === type.id;

          return (
            <div
              key={type.id}
              className="flex items-center gap-3 rounded-md border border-border bg-muted/20 px-4 py-3"
            >
              {/* Name */}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-foreground">{type.name}</span>
                <span className="ml-2 text-xs text-muted-foreground font-mono">{type.slug}</span>
              </div>

              {/* Default badge */}
              {type.isDefault ? (
                <span className="flex-shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  Default
                </span>
              ) : (
                <span className="flex-shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                  Custom
                </span>
              )}

              {/* Active toggle */}
              <Switch
                checked={type.isActive}
                disabled={isToggling}
                onCheckedChange={() => void handleToggle(type)}
                aria-label={`Toggle ${type.name} active state`}
              />

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {!type.isDefault && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => openEdit(type)}
                    aria-label={`Edit ${type.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}

                {!type.isDefault && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                        disabled={isDeleting}
                        aria-label={`Delete ${type.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Document Type?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete <strong>{type.name}</strong>? This
                          action cannot be undone. You cannot delete types that are referenced by
                          existing documents.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-600 hover:bg-red-700 text-white"
                          onClick={() => void handleDelete(type.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                {type.isDefault && (
                  <div className="h-7 w-[3.75rem]" aria-hidden />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={(v) => { if (!addSaving) { setAddOpen(v); if (!v) setAddName(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Custom Document Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Name</label>
              <input
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
                placeholder="e.g. Weight Ticket"
                disabled={addSaving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" disabled={addSaving} onClick={() => { setAddOpen(false); setAddName(''); }}>
              Cancel
            </Button>
            <Button size="sm" disabled={!addName.trim() || addSaving} onClick={() => void handleAdd()}>
              {addSaving ? 'Adding…' : 'Add Type'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(v) => { if (!editSaving && !v) setEditTarget(null); }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Document Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleEdit(); }}
                disabled={editSaving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" disabled={editSaving} onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!editName.trim() || editSaving} onClick={() => void handleEdit()}>
              {editSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
