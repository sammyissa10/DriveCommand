'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
} from '@/components/ui/command';
import { X, Plus, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  addSubscriber,
  removeSubscriber,
} from '@/app/(owner)/actions/tenant-notification-settings';
import type {
  TenantSubscriberRow,
  TenantUserRow,
  ActiveTemplateForTenant,
} from '@/app/(owner)/actions/tenant-notification-settings';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SubscribersTabProps {
  initialSubscribers: TenantSubscriberRow[];
  users: TenantUserRow[];
  triggers: ActiveTemplateForTenant[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SubscribersTab({ initialSubscribers, users, triggers }: SubscribersTabProps) {
  const [subscribers, setSubscribers] = useState<TenantSubscriberRow[]>(initialSubscribers);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedTriggerKey, setSelectedTriggerKey] = useState('');
  const [userOpen, setUserOpen] = useState(false);
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [, startTransition] = useTransition();

  // Group subscribers by triggerKey
  const grouped = new Map<string, TenantSubscriberRow[]>();
  for (const sub of subscribers) {
    const existing = grouped.get(sub.triggerKey) ?? [];
    grouped.set(sub.triggerKey, [...existing, sub]);
  }

  // Build a map of triggerKey -> displayName for lookup
  const triggerMap = new Map(triggers.map((t) => [t.triggerKey, t.displayName]));

  const handleRemove = (id: string) => {
    // Optimistic remove
    setSubscribers((prev) => prev.filter((s) => s.id !== id));

    startTransition(async () => {
      const result = await removeSubscriber(id);
      if (!result.success) {
        toast.error(result.error);
        // Reload would be needed to restore — for now just toast error
      } else {
        toast.success('Subscriber removed');
      }
    });
  };

  const handleAdd = () => {
    if (!selectedUserId || !selectedTriggerKey) {
      toast.error('Please select a user and a trigger');
      return;
    }

    // Duplicate check
    const isDuplicate = subscribers.some(
      (s) => s.triggerKey === selectedTriggerKey && s.userId === selectedUserId,
    );
    if (isDuplicate) {
      toast.error('Already subscribed');
      return;
    }

    startTransition(async () => {
      const result = await addSubscriber(selectedTriggerKey, selectedUserId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      // Optimistic add with full user info
      const user = users.find((u) => u.id === selectedUserId);
      if (user) {
        const newSub: TenantSubscriberRow = {
          id: result.id,
          tenantId: '',
          triggerKey: selectedTriggerKey,
          userId: selectedUserId,
          createdAt: new Date(),
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
          },
        };
        setSubscribers((prev) => [...prev, newSub]);
      }

      toast.success('Subscriber added');
      setShowAddDialog(false);
      setSelectedUserId('');
      setSelectedTriggerKey('');
    });
  };

  const selectedUser = users.find((u) => u.id === selectedUserId);
  const selectedTrigger = triggers.find((t) => t.triggerKey === selectedTriggerKey);

  return (
    <div className="space-y-4">
      {/* Add button */}
      <div className="flex justify-end">
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Subscriber
        </Button>
      </div>

      {/* Grouped subscriber cards */}
      {grouped.size === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">
          No subscribers yet. Add users to receive specific notifications.
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([triggerKey, subs]) => (
            <Card key={triggerKey}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-900">
                  {triggerMap.get(triggerKey) ?? triggerKey}
                  <span className="ml-2 text-xs font-mono text-gray-400">{triggerKey}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {subs.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm text-gray-900 truncate">
                          {sub.user.firstName && sub.user.lastName
                            ? `${sub.user.firstName} ${sub.user.lastName}`
                            : sub.user.email}
                        </span>
                        <span className="text-xs text-gray-500 truncate">{sub.user.email}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-gray-400 hover:text-red-600 shrink-0 ml-2"
                        onClick={() => handleRemove(sub.id)}
                      >
                        <X className="h-4 w-4" />
                        <span className="sr-only">Remove</span>
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Subscriber Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Subscriber</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* User picker */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">User</label>
              <Popover open={userOpen} onOpenChange={setUserOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                  >
                    {selectedUser ? selectedUser.email : 'Select user...'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search by email..." />
                    <CommandList>
                      <CommandEmpty>No users found.</CommandEmpty>
                      {users.map((user) => (
                        <CommandItem
                          key={user.id}
                          value={user.email}
                          onSelect={() => {
                            setSelectedUserId(user.id);
                            setUserOpen(false);
                          }}
                        >
                          <Check
                            className={`mr-2 h-4 w-4 ${selectedUserId === user.id ? 'opacity-100' : 'opacity-0'}`}
                          />
                          <div className="flex flex-col">
                            <span className="text-sm">{user.email}</span>
                            {user.firstName && (
                              <span className="text-xs text-gray-500">
                                {user.firstName} {user.lastName}
                              </span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Trigger picker */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Notification</label>
              <Popover open={triggerOpen} onOpenChange={setTriggerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                  >
                    {selectedTrigger ? selectedTrigger.displayName : 'Select notification...'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search notifications..." />
                    <CommandList>
                      <CommandEmpty>No notifications found.</CommandEmpty>
                      {triggers.map((trigger) => (
                        <CommandItem
                          key={trigger.triggerKey}
                          value={trigger.displayName}
                          onSelect={() => {
                            setSelectedTriggerKey(trigger.triggerKey);
                            setTriggerOpen(false);
                          }}
                        >
                          <Check
                            className={`mr-2 h-4 w-4 ${selectedTriggerKey === trigger.triggerKey ? 'opacity-100' : 'opacity-0'}`}
                          />
                          {trigger.displayName}
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddDialog(false);
                setSelectedUserId('');
                setSelectedTriggerKey('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={!selectedUserId || !selectedTriggerKey}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
