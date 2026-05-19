'use client';

/**
 * SavedViewsMenu - Dropdown menu for saved view CRUD.
 *
 * Shows current view name (or "All [records]"), asterisk when dirty,
 * list of views, and actions: Save, Update, Delete, Reset.
 */

import * as React from 'react';
import { Check, ChevronDown, Save, Edit, Trash2, RotateCcw, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useSavedViews } from './useSavedViews';
import type { GridViewState } from '../core/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SavedViewsMenuProps {
  gridId: string;
  currentState: GridViewState;
  onApplyView: (state: GridViewState) => void;
  recordLabel?: string; // e.g., "clients", "contracts"
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SavedViewsMenu({
  gridId,
  currentState,
  onApplyView,
  recordLabel = 'records',
}: SavedViewsMenuProps) {
  const {
    views,
    selectedView,
    selectedViewId,
    isDirty,
    isLoading,
    saveView,
    updateCurrentView,
    deleteView,
    selectView,
    resetToDefault,
    isSaving,
    isDeleting,
  } = useSavedViews({ gridId, currentState });

  // Dialog states
  const [saveDialogOpen, setSaveDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = React.useState(false);
  const [pendingViewId, setPendingViewId] = React.useState<string | null>(null);

  // Save dialog form state
  const [viewName, setViewName] = React.useState('');
  const [setAsDefault, setSetAsDefault] = React.useState(false);

  // Current view display name
  const displayName = selectedView
    ? `${selectedView.name}${isDirty ? ' *' : ''}`
    : `All ${recordLabel}`;

  // Handle view selection
  const handleSelectView = (viewId: string | null) => {
    if (isDirty && selectedViewId) {
      // Show discard dialog
      setPendingViewId(viewId);
      setDiscardDialogOpen(true);
    } else {
      selectView(viewId);
      if (viewId) {
        const view = views.find((v) => v.id === viewId);
        if (view) {
          onApplyView(view.state);
        }
      }
    }
  };

  // Handle discard changes
  const handleDiscardChanges = () => {
    selectView(pendingViewId);
    if (pendingViewId) {
      const view = views.find((v) => v.id === pendingViewId);
      if (view) {
        onApplyView(view.state);
      }
    }
    setDiscardDialogOpen(false);
    setPendingViewId(null);
  };

  // Handle save new view
  const handleSaveView = async () => {
    if (!viewName.trim()) {
      toast.error('View name is required');
      return;
    }

    try {
      await saveView(viewName, setAsDefault);
      toast.success('View saved successfully');
      setSaveDialogOpen(false);
      setViewName('');
      setSetAsDefault(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save view');
    }
  };

  // Handle update current view
  const handleUpdateView = async () => {
    if (!selectedViewId) return;

    try {
      await updateCurrentView();
      toast.success('View updated successfully');
    } catch (error) {
      toast.error('Failed to update view');
    }
  };

  // Handle delete view
  const handleDeleteView = async () => {
    if (!selectedViewId) return;

    try {
      await deleteView(selectedViewId);
      toast.success('View deleted successfully');
      setDeleteDialogOpen(false);
    } catch (error) {
      toast.error('Failed to delete view');
    }
  };

  // Handle reset to default
  const handleResetToDefault = () => {
    resetToDefault();
    const defaultView = views.find((v) => v.isDefault);
    if (defaultView) {
      onApplyView(defaultView.state);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={isLoading}>
            {displayName}
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Saved Views</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {/* List of views */}
          {views.length === 0 ? (
            <DropdownMenuItem disabled>No saved views</DropdownMenuItem>
          ) : (
            <>
              {views.map((view) => (
                <DropdownMenuItem
                  key={view.id}
                  onClick={() => handleSelectView(view.id)}
                  className="flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    {view.isDefault && <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />}
                    {view.name}
                  </span>
                  {selectedViewId === view.id && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}

          {/* Actions */}
          <DropdownMenuItem onClick={() => setSaveDialogOpen(true)}>
            <Save className="mr-2 h-4 w-4" />
            Save current view as...
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={handleUpdateView}
            disabled={!selectedViewId || !isDirty || isSaving}
          >
            <Edit className="mr-2 h-4 w-4" />
            Update current view
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => setDeleteDialogOpen(true)}
            disabled={!selectedViewId || isDeleting}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete view
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={handleResetToDefault}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset to default
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Save dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save current view</DialogTitle>
            <DialogDescription>
              Save the current filters, sort, and column configuration as a named view.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="view-name">View name</Label>
              <Input
                id="view-name"
                placeholder="e.g., Active clients"
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="set-default"
                checked={setAsDefault}
                onCheckedChange={(checked) => setSetAsDefault(checked === true)}
              />
              <Label htmlFor="set-default" className="text-sm font-normal">
                Set as default view
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveView} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save view'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete view</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{selectedView?.name}&quot;? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteView} className="bg-destructive text-destructive-foreground">
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Discard changes dialog */}
      <AlertDialog open={discardDialogOpen} onOpenChange={setDiscardDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to the current view. What would you like to do?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingViewId(null)}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                setDiscardDialogOpen(false);
                setSaveDialogOpen(true);
              }}
            >
              Save as new
            </Button>
            <AlertDialogAction onClick={handleDiscardChanges}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
