'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { UserRole } from '@/lib/auth/roles';
import {
  UserPermissions,
  PERMISSION_SECTIONS,
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

const TOTAL_PERMISSIONS = PERMISSION_SECTIONS.reduce((acc, s) => acc + s.permissions.length, 0);

function activeCount(permissions: UserPermissions) {
  return PERMISSION_SECTIONS.flatMap((s) => s.permissions).filter((p) => permissions[p.key]).length;
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

function formatLastUpdated(isoDate: string) {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ============================================================
// Permission section component shared by member sheet + invite sheet
// ============================================================

interface PermissionEditorProps {
  permissions: UserPermissions;
  onChange: (updated: UserPermissions) => void;
  disabled?: boolean;
  idPrefix: string;
}

function PermissionEditor({ permissions, onChange, disabled, idPrefix }: PermissionEditorProps) {
  // When fullAccess is on, all individual toggles are greyed out
  const allDisabled = disabled || permissions.fullAccess === true;

  function handleToggle(key: keyof UserPermissions, value: boolean) {
    onChange({ ...permissions, [key]: value });
  }

  function handleSectionEnable(sectionId: string) {
    const section = PERMISSION_SECTIONS.find((s) => s.id === sectionId);
    if (!section) return;
    const updated = { ...permissions };
    section.permissions.forEach((p) => { updated[p.key] = true; });
    onChange(updated);
  }

  function handleSectionDisable(sectionId: string) {
    const section = PERMISSION_SECTIONS.find((s) => s.id === sectionId);
    if (!section) return;
    const updated = { ...permissions };
    section.permissions.forEach((p) => { updated[p.key] = false; });
    onChange(updated);
  }

  function handleEnableAll() {
    const updated = { ...DEFAULT_MANAGER_PERMISSIONS }; // all true
    onChange(updated);
  }

  function handleDisableAll() {
    const updated = {} as UserPermissions;
    PERMISSION_SECTIONS.flatMap((s) => s.permissions).forEach((p) => { updated[p.key] = false; });
    onChange(updated);
  }

  return (
    <div className="space-y-6">
      {/* Full Access master toggle */}
      <div className="flex items-center justify-between rounded-lg border-2 border-primary/20 bg-primary/5 p-4">
        <div className="flex-1 min-w-0">
          <Label htmlFor={`${idPrefix}-fullAccess`} className="cursor-pointer">
            <span className="block text-sm font-semibold leading-none">Full Access</span>
            <span className="block text-xs text-muted-foreground mt-1">Grant access to all pages</span>
          </Label>
        </div>
        <Switch
          id={`${idPrefix}-fullAccess`}
          checked={permissions.fullAccess === true}
          onCheckedChange={(value) => onChange({ ...permissions, fullAccess: value })}
          disabled={disabled}
          className="shrink-0 ml-4"
        />
      </div>

      {permissions.fullAccess && (
        <Badge variant="default" className="bg-green-600 hover:bg-green-600 text-white">
          Full Access Granted
        </Badge>
      )}

      {/* Master controls */}
      <div className={`flex items-center gap-2 ${allDisabled && !disabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleEnableAll}
          disabled={allDisabled}
          className="text-xs h-7"
        >
          Enable All
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDisableAll}
          disabled={allDisabled}
          className="text-xs h-7"
        >
          Disable All
        </Button>
      </div>

      {/* Grouped sections */}
      <div className={`space-y-6 ${allDisabled && !disabled ? 'opacity-50 pointer-events-none' : ''}`}>
        {PERMISSION_SECTIONS.map((section) => (
          <div key={section.id} className="space-y-2">
            {/* Section header */}
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                {section.label}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSectionEnable(section.id)}
                  disabled={allDisabled}
                  className="text-xs h-6 px-2"
                >
                  Enable All
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSectionDisable(section.id)}
                  disabled={allDisabled}
                  className="text-xs h-6 px-2"
                >
                  Disable All
                </Button>
              </div>
            </div>

            {/* Permission toggles */}
            <div className="space-y-1.5">
              {section.permissions.map((perm) => (
                <div key={perm.key} className="flex items-center gap-3 rounded-lg border p-3">
                  <Switch
                    id={`${idPrefix}-${perm.key}`}
                    checked={permissions[perm.key]}
                    onCheckedChange={(value) => handleToggle(perm.key, value)}
                    disabled={allDisabled}
                    className="shrink-0"
                  />
                  <Label htmlFor={`${idPrefix}-${perm.key}`} className="cursor-pointer flex-1">
                    <span className="block text-sm font-medium leading-none">{perm.label}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">{perm.description}</span>
                  </Label>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Info card */}
      <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
        <p>Support and Settings are always accessible to team members.</p>
        <p>Team Permissions and Subscription are owner-only.</p>
      </div>
    </div>
  );
}

// ============================================================
// Page
// ============================================================

export function TeamPermissionsDesktop() {
  const { user, isLoaded } = useAuth();
  const router = useRouter();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();

  // Which member's sheet is open
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  // Local permissions state for the open sheet (for optimistic updates)
  const [editingPermissions, setEditingPermissions] = useState<UserPermissions | null>(null);

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

  // Keep selectedMember + editingPermissions in sync when members list updates
  useEffect(() => {
    if (selectedMember) {
      const updated = members.find((m) => m.id === selectedMember.id);
      if (updated) {
        setSelectedMember(updated);
        // Only update editingPermissions if not currently editing (sheet just opened)
      }
    }
  }, [members]); // eslint-disable-line react-hooks/exhaustive-deps

  function openMemberSheet(member: TeamMember) {
    setSelectedMember(member);
    setEditingPermissions({ ...member.permissions });
  }

  function handlePermissionsChange(memberId: string, updated: UserPermissions) {
    // Optimistic update
    setEditingPermissions(updated);
    setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, permissions: updated } : m));

    const previousPermissions = members.find((m) => m.id === memberId)?.permissions;
    startTransition(async () => {
      try {
        await updateUserPermissions(memberId, updated);
        toast.success('Permissions updated');
      } catch {
        // Revert optimistic update
        if (previousPermissions) {
          setEditingPermissions(previousPermissions);
          setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, permissions: previousPermissions } : m));
        }
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
                  onClick={() => openMemberSheet(member)}
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
                  <Badge
                    variant="secondary"
                    className={`shrink-0 ${member.permissions.fullAccess ? 'bg-green-600/10 text-green-700 dark:text-green-400' : ''}`}
                  >
                    {member.permissions.fullAccess ? 'Full access' : count === TOTAL_PERMISSIONS ? 'Full access' : count === 0 ? 'No access' : `${count} of ${TOTAL_PERMISSIONS}`}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Member permissions sheet */}
      <Sheet open={!!selectedMember} onOpenChange={(open) => { if (!open) { setSelectedMember(null); setEditingPermissions(null); } }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {selectedMember && editingPermissions && (
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

              {/* Last updated */}
              <p className="mt-2 text-xs text-muted-foreground">
                Last updated: {formatLastUpdated(selectedMember.updatedAt)}
              </p>

              <div className="mt-6">
                <PermissionEditor
                  permissions={editingPermissions}
                  onChange={(updated) => handlePermissionsChange(selectedMember.id, updated)}
                  idPrefix={`member-${selectedMember.id}`}
                />
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
                <p className="text-xs text-muted-foreground mt-0.5">All permissions are enabled by default. Disable what this team member should not access.</p>
              </div>
              <PermissionEditor
                permissions={invitePermissions}
                onChange={setInvitePermissions}
                disabled={inviteLoading}
                idPrefix="invite"
              />
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
