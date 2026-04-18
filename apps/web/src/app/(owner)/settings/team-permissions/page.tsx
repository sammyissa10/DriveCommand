'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { UserRole } from '@/lib/auth/roles';
import {
  UserPermissions,
  PERMISSION_LABELS,
  DEFAULT_MANAGER_PERMISSIONS,
} from '@/lib/auth/permissions';
import {
  getTeamMembers,
  updateUserPermissions,
  inviteTeamMember,
  TeamMember,
} from '@/app/(owner)/actions/team-permissions';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Shield, UserPlus, Users, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const permissionKeys = Object.keys(DEFAULT_MANAGER_PERMISSIONS) as Array<keyof UserPermissions>;

function activeCount(permissions: UserPermissions) {
  return permissionKeys.filter((k) => permissions[k]).length;
}

function memberInitials(member: TeamMember) {
  if (member.firstName && member.lastName) {
    return `${member.firstName[0]}${member.lastName[0]}`.toUpperCase();
  }
  return member.email[0].toUpperCase();
}

function memberName(member: TeamMember) {
  return member.firstName && member.lastName
    ? `${member.firstName} ${member.lastName}`
    : member.email;
}

export default function TeamPermissionsPage() {
  const { user, isLoaded } = useAuth();
  const router = useRouter();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();

  // Which member's sheet is open
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);

  // Invite sheet state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteLastName, setInviteLastName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePermissions, setInvitePermissions] = useState<UserPermissions>({ ...DEFAULT_MANAGER_PERMISSIONS });

  useEffect(() => {
    if (isLoaded && user?.role === UserRole.MANAGER) router.replace('/carrier/dashboard');
  }, [isLoaded, user, router]);

  useEffect(() => {
    if (!isLoaded || user?.role !== UserRole.OWNER) return;
    getTeamMembers()
      .then(setMembers)
      .catch(() => toast.error('Failed to load team members'))
      .finally(() => setLoading(false));
  }, [isLoaded, user]);

  // Keep selectedMember in sync when members list updates
  useEffect(() => {
    if (selectedMember) {
      const updated = members.find((m) => m.id === selectedMember.id);
      if (updated) setSelectedMember(updated);
    }
  }, [members]);

  function handleToggle(memberId: string, key: keyof UserPermissions, value: boolean) {
    const member = members.find((m) => m.id === memberId);
    if (!member) return;
    const updated: UserPermissions = { ...member.permissions, [key]: value };
    setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, permissions: updated } : m));
    startTransition(async () => {
      try {
        await updateUserPermissions(memberId, updated);
        toast.success('Permissions updated');
      } catch {
        setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, permissions: member.permissions } : m));
        toast.error('Failed to update permissions');
      }
    });
  }

  function resetInviteForm() {
    setInviteFirstName('');
    setInviteLastName('');
    setInviteEmail('');
    setInvitePermissions({ ...DEFAULT_MANAGER_PERMISSIONS });
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteFirstName.trim() || !inviteLastName.trim()) {
      toast.error('First name, last name, and email are required');
      return;
    }
    setInviteLoading(true);
    try {
      const result = await inviteTeamMember({
        email: inviteEmail.trim(),
        firstName: inviteFirstName.trim(),
        lastName: inviteLastName.trim(),
        permissions: invitePermissions,
      });
      if (result.success) {
        toast.success(`Invitation sent to ${inviteEmail.trim()}`);
        setInviteOpen(false);
        resetInviteForm();
        getTeamMembers().then(setMembers).catch(() => {});
      } else {
        toast.error(result.error ?? 'Failed to send invitation');
      }
    } catch {
      toast.error('Failed to send invitation');
    } finally {
      setInviteLoading(false);
    }
  }

  if (!isLoaded || loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Team Permissions</h1>
            <p className="text-sm text-muted-foreground">
              Invite dispatchers, assistants, and partners — control what they can access
            </p>
          </div>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="gap-2 shrink-0">
          <UserPlus className="h-4 w-4" />
          Invite Team Member
        </Button>
      </div>

      {/* Empty state */}
      {members.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-10 w-10 text-muted-foreground mb-4" />
            <h3 className="font-medium mb-1">No team members yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Invite dispatchers, assistants, or partners and set their permissions before they join.
            </p>
            <Button onClick={() => setInviteOpen(true)} variant="outline" className="gap-2">
              <UserPlus className="h-4 w-4" />
              Invite Team Member
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Member list — compact rows, click to open permissions sheet */}
      {members.length > 0 && (
        <Card>
          <div className="divide-y divide-border">
            {members.map((member) => {
              const count = activeCount(member.permissions);
              return (
                <button
                  key={member.id}
                  onClick={() => setSelectedMember(member)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/40 transition-colors text-left"
                >
                  {/* Avatar */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                    {memberInitials(member)}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{memberName(member)}</p>
                    <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                  </div>
                  {/* Permission count badge */}
                  <Badge variant="secondary" className="shrink-0">
                    {count === 0 ? 'No extras' : `${count} permission${count === 1 ? '' : 's'}`}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Member permissions sheet */}
      <Sheet open={!!selectedMember} onOpenChange={(open) => { if (!open) setSelectedMember(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {selectedMember && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                    {memberInitials(selectedMember)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-semibold leading-tight truncate">{memberName(selectedMember)}</p>
                    <p className="text-xs text-muted-foreground font-normal truncate">{selectedMember.email}</p>
                  </div>
                </SheetTitle>
                <SheetDescription>
                  Toggle permissions on or off. Changes save instantly.
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-2">
                {permissionKeys.map((key) => {
                  const { label, description } = PERMISSION_LABELS[key];
                  return (
                    <div key={key} className="flex items-center gap-3 rounded-lg border p-3">
                      <Switch
                        id={`member-${selectedMember.id}-${key}`}
                        checked={selectedMember.permissions[key]}
                        onCheckedChange={(value) => handleToggle(selectedMember.id, key, value)}
                        className="shrink-0"
                      />
                      <Label htmlFor={`member-${selectedMember.id}-${key}`} className="cursor-pointer flex-1">
                        <span className="block text-sm font-medium leading-none">{label}</span>
                        <span className="block text-xs text-muted-foreground mt-0.5">{description}</span>
                      </Label>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Invite Team Member sheet */}
      <Sheet open={inviteOpen} onOpenChange={(open) => { setInviteOpen(open); if (!open) resetInviteForm(); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Invite Team Member
            </SheetTitle>
            <SheetDescription>
              Send an invitation to a dispatcher, assistant, or partner. Set their permissions now — they take effect as soon as they join.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleInvite} className="mt-6 space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="invite-first">First Name <span className="text-destructive">*</span></Label>
                <Input id="invite-first" placeholder="Jane" value={inviteFirstName} onChange={(e) => setInviteFirstName(e.target.value)} required disabled={inviteLoading} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-last">Last Name <span className="text-destructive">*</span></Label>
                <Input id="invite-last" placeholder="Smith" value={inviteLastName} onChange={(e) => setInviteLastName(e.target.value)} required disabled={inviteLoading} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email <span className="text-destructive">*</span></Label>
              <Input id="invite-email" type="email" placeholder="jane@yourcompany.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required disabled={inviteLoading} />
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground">Permissions</p>
                <p className="text-xs text-muted-foreground mt-0.5">Select what this team member can access. You can change this anytime.</p>
              </div>
              <div className="space-y-2">
                {permissionKeys.map((key) => {
                  const { label, description } = PERMISSION_LABELS[key];
                  return (
                    <div key={key} className="flex items-center gap-3 rounded-lg border p-3">
                      <Switch
                        id={`invite-${key}`}
                        checked={invitePermissions[key]}
                        onCheckedChange={(value) => setInvitePermissions((prev) => ({ ...prev, [key]: value }))}
                        disabled={inviteLoading}
                        className="shrink-0"
                      />
                      <Label htmlFor={`invite-${key}`} className="cursor-pointer flex-1">
                        <span className="block text-sm font-medium leading-none">{label}</span>
                        <span className="block text-xs text-muted-foreground mt-0.5">{description}</span>
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => { setInviteOpen(false); resetInviteForm(); }} disabled={inviteLoading}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={inviteLoading}>
                {inviteLoading ? 'Sending...' : 'Send Invitation'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
