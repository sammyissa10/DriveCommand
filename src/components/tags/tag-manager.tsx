'use client';

/**
 * Tag Manager Component
 * Displays list of existing tags and provides UI to create/delete tags.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createTag, deleteTag } from '@/app/(owner)/actions/tags';
import { PRESET_COLORS } from '@/lib/validations/tag.schemas';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Plus, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type Tag = {
  id: string;
  name: string;
  color: string;
};

type TagManagerProps = {
  tags: Tag[];
};

export function TagManager({ tags }: TagManagerProps) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [error, setError] = useState<string | null>(null);

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsCreating(true);

    const formData = new FormData();
    formData.append('name', name);
    formData.append('color', selectedColor);

    try {
      const result = await createTag(formData);

      if (result && 'error' in result) {
        const err = result.error;
        if (typeof err === 'string') {
          setError(err);
        } else if (err && typeof err === 'object' && 'name' in err && Array.isArray(err.name)) {
          setError(err.name[0]);
        } else {
          setError('Failed to create tag');
        }
      } else if (result && 'success' in result) {
        // Reset form
        setName('');
        setSelectedColor(PRESET_COLORS[0]);
        router.refresh();
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    setIsDeletingId(tagId);
    try {
      await deleteTag(tagId);
      router.refresh();
    } catch (err) {
      console.error('Failed to delete tag:', err);
    } finally {
      setIsDeletingId(null);
      setDeleteConfirmId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tag Management</CardTitle>
        <CardDescription>
          Create and manage tags to organize your fleet
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Existing Tags List */}
        <div>
          <h3 className="text-sm font-medium mb-3">Existing Tags</h3>
          {tags.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tags created yet. Create your first tag to organize your fleet.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="outline"
                  className="pl-3 pr-2 py-1.5 gap-2"
                  style={{
                    borderColor: tag.color,
                  }}
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span>{tag.name}</span>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(tag.id)}
                    disabled={isDeletingId === tag.id}
                    className="ml-1 rounded-sm opacity-70 hover:opacity-100 transition-opacity disabled:opacity-50"
                  >
                    {isDeletingId === tag.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Create Tag Form */}
        <div>
          <h3 className="text-sm font-medium mb-3">Create New Tag</h3>
          <form onSubmit={handleCreateTag} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="tag-name" className="text-sm font-medium">
                Tag Name
              </label>
              <Input
                id="tag-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Long Haul, Local Delivery"
                maxLength={50}
                required
                disabled={isCreating}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Color</label>
              <div className="flex gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setSelectedColor(color)}
                    disabled={isCreating}
                    className={`w-8 h-8 rounded-full transition-all ${
                      selectedColor === color
                        ? 'ring-2 ring-offset-2 ring-offset-background ring-blue-500'
                        : 'opacity-60 hover:opacity-100'
                    }`}
                    style={{
                      backgroundColor: color,
                    }}
                    title={color}
                  />
                ))}
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <Button type="submit" disabled={isCreating || !name.trim()}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Tag
                </>
              )}
            </Button>
          </form>
        </div>
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteConfirmId !== null}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tag</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this tag? This will remove all
              assignments to trucks and drivers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && handleDeleteTag(deleteConfirmId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
