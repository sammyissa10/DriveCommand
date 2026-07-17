'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
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
import {
  MobileScreen,
  LargeTitleHeader,
  EntityRow,
  MonogramAvatar,
  StatusPill,
  EmptyState,
  Skeleton,
  SheetContainer,
  SheetInput,
  PrimaryButton,
  type StatusTone,
} from '@/components/ui/ds';

const TOTAL_PERMISSIONS = PERMISSION_SECTIONS.reduce((acc, s) => acc + s.permissions.length, 0);

function activeCount(p: UserPermissions) {
  return PERMISSION_SECTIONS.flatMap((s) => s.permissions).filter((perm) => p[perm.key]).length;
}

function memberName(m: TeamMember) {
  return m.firstName && m.lastName ? `${m.firstName} ${m.lastName}` : m.email;
}

function formatLastUpdated(isoDate: string) {
  const date = new Date(isoDate);
  const diffDays = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function accessPill(m: TeamMember): { label: string; tone: StatusTone } {
  if (m.permissions.fullAccess) return { label: 'Full access', tone: 'success' };
  const c = activeCount(m.permissions);
  if (c === TOTAL_PERMISSIONS) return { label: 'Full access', tone: 'success' };
  if (c === 0) return { label: 'No access', tone: 'neutral' };
  return { label: `${c}/${TOTAL_PERMISSIONS}`, tone: 'accent' };
}

// ---------------------------------------------------------------------------
// DsSwitch — the ds has no switch; a compact iOS-style one for the toggle rows.
// ---------------------------------------------------------------------------
function DsSwitch({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        'relative h-[30px] w-[50px] shrink-0 rounded-full transition',
        on ? 'bg-ds-accent' : 'bg-ds-elevated',
        disabled && 'opacity-40',
      )}
    >
      <span
        className={cn(
          'absolute top-[3px] h-6 w-6 rounded-full bg-white transition-all',
          on ? 'left-[23px]' : 'left-[3px]',
        )}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// PermissionEditorMobile — shared by the member + invite sheets.
// ---------------------------------------------------------------------------
function PermissionEditorMobile({
  permissions,
  onChange,
  disabled,
}: {
  permissions: UserPermissions;
  onChange: (updated: UserPermissions) => void;
  disabled?: boolean;
}) {
  const allDisabled = disabled || permissions.fullAccess === true;

  function toggle(key: keyof UserPermissions, value: boolean) {
    onChange({ ...permissions, [key]: value });
  }
  function sectionSet(sectionId: string, value: boolean) {
    const section = PERMISSION_SECTIONS.find((s) => s.id === sectionId);
    if (!section) return;
    const updated = { ...permissions };
    section.permissions.forEach((p) => {
      updated[p.key] = value;
    });
    onChange(updated);
  }
  function enableAll() {
    onChange({ ...DEFAULT_MANAGER_PERMISSIONS });
  }
  function disableAll() {
    const updated = {} as UserPermissions;
    PERMISSION_SECTIONS.flatMap((s) => s.permissions).forEach((p) => {
      updated[p.key] = false;
    });
    onChange(updated);
  }

  return (
    <div className="space-y-5">
      {/* Full Access master */}
      <div className="flex items-center justify-between rounded-[16px] bg-ds-accent/[0.12] p-4">
        <div className="min-w-0 pr-3">
          <p className="text-[15px] font-semibold text-ds-txt">Full Access</p>
          <p className="mt-0.5 text-[12px] text-ds-txt2">Grant access to all pages</p>
        </div>
        <DsSwitch
          on={permissions.fullAccess === true}
          onChange={(v) => onChange({ ...permissions, fullAccess: v })}
          disabled={disabled}
        />
      </div>

      {/* Enable / disable all */}
      <div className={cn('flex gap-2', allDisabled && !disabled && 'pointer-events-none opacity-50')}>
        <button
          type="button"
          onClick={enableAll}
          disabled={allDisabled}
          className="h-9 flex-1 rounded-[10px] bg-ds-card text-[13px] font-semibold text-ds-accent transition active:opacity-75 disabled:opacity-50"
        >
          Enable all
        </button>
        <button
          type="button"
          onClick={disableAll}
          disabled={allDisabled}
          className="h-9 flex-1 rounded-[10px] bg-ds-card text-[13px] font-semibold text-ds-txt2 transition active:opacity-75 disabled:opacity-50"
        >
          Disable all
        </button>
      </div>

      {/* Sections */}
      <div className={cn('space-y-5', allDisabled && !disabled && 'pointer-events-none opacity-50')}>
        {PERMISSION_SECTIONS.map((section) => (
          <div key={section.id}>
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="text-[12px] font-semibold uppercase tracking-[0.6px] text-ds-txt2">
                {section.label}
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => sectionSet(section.id, true)}
                  disabled={allDisabled}
                  className="text-[12px] font-medium text-ds-accent disabled:opacity-50"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => sectionSet(section.id, false)}
                  disabled={allDisabled}
                  className="text-[12px] font-medium text-ds-txt3 disabled:opacity-50"
                >
                  None
                </button>
              </div>
            </div>
            <div className="overflow-hidden rounded-[16px] bg-ds-card">
              {section.permissions.map((perm, i) => (
                <div key={perm.key}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] text-ds-txt">{perm.label}</p>
                      <p className="mt-0.5 text-[12px] text-ds-txt3">{perm.description}</p>
                    </div>
                    <DsSwitch on={permissions[perm.key] === true} onChange={(v) => toggle(perm.key, v)} disabled={allDisabled} />
                  </div>
                  {i < section.permissions.length - 1 ? <div className="ml-4 h-px bg-ds-hairline" /> : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Info */}
      <div className="space-y-1 rounded-[16px] bg-ds-card p-3 text-[12px] text-ds-txt3">
        <p>Support and Settings are always accessible to team members.</p>
        <p>Team Permissions and Subscription are owner-only.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TeamPermissionsMobile — self-contained (owner-gated fetch + mutations).
// ---------------------------------------------------------------------------
export function TeamPermissionsMobile() {
  const { user, isLoaded } = useAuth();
  const router = useRouter();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();

  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const selected = members.find((m) => m.id === selectedId) ?? null;

  function updatePermissions(memberId: string, updated: UserPermissions) {
    const previous = members.find((m) => m.id === memberId)?.permissions;
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, permissions: updated } : m)));
    startTransition(async () => {
      try {
        await updateUserPermissions(memberId, updated);
        toast.success('Permissions updated');
      } catch {
        if (previous) setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, permissions: previous } : m)));
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

  async function handleInvite() {
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

  const ready = isLoaded && !loading;

  return (
    <MobileScreen className="pb-10 pt-2">
      <LargeTitleHeader
        title="Team"
        subtitle="Invite dispatchers, assistants & partners"
        onBack={() => router.back()}
        onAdd={() => setInviteOpen(true)}
        addLabel="Invite team member"
      />

      {!ready ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="min-h-[92px] rounded-[20px] bg-ds-card p-4">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="mt-2 h-3 w-1/3" />
            </div>
          ))}
        </div>
      ) : members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No team members yet"
          message="Tap + in the top right to invite your first dispatcher, assistant, or partner."
        />
      ) : (
        <div className="space-y-3">
          {members.map((m) => {
            const a = accessPill(m);
            return (
              <EntityRow
                key={m.id}
                leading={<MonogramAvatar name={memberName(m)} />}
                title={memberName(m)}
                subline={m.email}
                pill={<StatusPill label={a.label} tone={a.tone} />}
                onClick={() => setSelectedId(m.id)}
                ariaLabel={`${memberName(m)}, ${a.label}`}
              />
            );
          })}
        </div>
      )}

      {/* Member permissions sheet */}
      <SheetContainer
        open={!!selected}
        onCancel={() => setSelectedId(null)}
        title={selected ? memberName(selected) : 'Member'}
        subtitle={selected ? `Saves instantly · updated ${formatLastUpdated(selected.updatedAt)}` : undefined}
        cancelLabel="Done"
      >
        {selected ? (
          <div className="pt-1">
            <PermissionEditorMobile
              permissions={selected.permissions}
              onChange={(u) => updatePermissions(selected.id, u)}
            />
          </div>
        ) : null}
      </SheetContainer>

      {/* Invite sheet */}
      <SheetContainer
        open={inviteOpen}
        onCancel={() => {
          if (inviteLoading) return;
          setInviteOpen(false);
          resetInviteForm();
        }}
        title="Invite team member"
        subtitle="Set permissions now — they apply when they join."
      >
        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <SheetInput
              label="First name"
              required
              value={inviteFirstName}
              onChange={(e) => setInviteFirstName(e.target.value)}
              placeholder="Jane"
              disabled={inviteLoading}
            />
            <SheetInput
              label="Last name"
              required
              value={inviteLastName}
              onChange={(e) => setInviteLastName(e.target.value)}
              placeholder="Smith"
              disabled={inviteLoading}
            />
          </div>
          <SheetInput
            label="Email"
            required
            type="email"
            inputMode="email"
            autoCapitalize="none"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="jane@yourcompany.com"
            disabled={inviteLoading}
          />

          <div>
            <p className="text-[13px] font-medium text-ds-txt">Permissions</p>
            <p className="mt-0.5 text-[12px] text-ds-txt3">
              All enabled by default. Turn off what this member should not access.
            </p>
          </div>
          <PermissionEditorMobile
            permissions={invitePermissions}
            onChange={setInvitePermissions}
            disabled={inviteLoading}
          />

          <div className="pt-1">
            <PrimaryButton
              label={inviteLoading ? 'Sending…' : 'Send invitation'}
              onClick={handleInvite}
              loading={inviteLoading}
            />
          </div>
        </div>
      </SheetContainer>
    </MobileScreen>
  );
}
