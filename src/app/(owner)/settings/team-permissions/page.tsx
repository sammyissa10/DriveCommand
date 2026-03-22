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
import { getTeamMembers, updateUserPermissions, TeamMember } from '@/app/(owner)/actions/team-permissions';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Users, Shield } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

export default function TeamPermissionsPage() {
  const { user, isLoaded } = useAuth();
  const router = useRouter();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingUserId, startTransition] = useTransition();

  // Redirect MANAGER users away — this page is OWNER-only
  useEffect(() => {
    if (isLoaded && user?.role === UserRole.MANAGER) {
      router.replace('/dashboard');
    }
  }, [isLoaded, user, router]);

  useEffect(() => {
    if (!isLoaded || user?.role !== UserRole.OWNER) return;

    getTeamMembers()
      .then(setMembers)
      .catch((err) => {
        console.error('Failed to load team members:', err);
        toast.error('Failed to load team members');
      })
      .finally(() => setLoading(false));
  }, [isLoaded, user]);

  function handleToggle(
    member: TeamMember,
    key: keyof UserPermissions,
    value: boolean
  ) {
    const updatedPermissions: UserPermissions = {
      ...member.permissions,
      [key]: value,
    };

    // Optimistic update
    setMembers((prev) =>
      prev.map((m) =>
        m.id === member.id ? { ...m, permissions: updatedPermissions } : m
      )
    );

    startTransition(async () => {
      try {
        await updateUserPermissions(member.id, updatedPermissions);
        toast.success('Permissions updated');
      } catch (err) {
        // Revert on error
        setMembers((prev) =>
          prev.map((m) =>
            m.id === member.id ? { ...m, permissions: member.permissions } : m
          )
        );
        toast.error('Failed to update permissions');
        console.error(err);
      }
    });
  }

  if (!isLoaded || loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  const permissionKeys = Object.keys(DEFAULT_MANAGER_PERMISSIONS) as Array<
    keyof UserPermissions
  >;

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Team Permissions
          </h1>
          <p className="text-sm text-muted-foreground">
            Control what your team members can access
          </p>
        </div>
      </div>

      {/* Empty state */}
      {members.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-10 w-10 text-muted-foreground mb-4" />
            <h3 className="font-medium mb-1">No team members yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Invite team members from the Drivers page to configure their
              permissions.
            </p>
            <Link
              href="/drivers"
              className="text-sm text-primary hover:underline font-medium"
            >
              Go to Drivers &rarr;
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Member cards */}
      {members.map((member) => (
        <Card key={member.id}>
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base font-semibold">
                  {member.firstName && member.lastName
                    ? `${member.firstName} ${member.lastName}`
                    : member.email}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {member.email}
                </p>
              </div>
              <Badge variant="secondary">Manager</Badge>
            </div>
          </CardHeader>

          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {permissionKeys.map((key) => {
                const { label, description } = PERMISSION_LABELS[key];
                const checked = member.permissions[key];

                return (
                  <div
                    key={key}
                    className="flex items-start gap-3 rounded-lg border p-3"
                  >
                    <Switch
                      id={`${member.id}-${key}`}
                      checked={checked}
                      onCheckedChange={(value) =>
                        handleToggle(member, key, value)
                      }
                      className="mt-0.5 shrink-0"
                    />
                    <Label
                      htmlFor={`${member.id}-${key}`}
                      className="cursor-pointer space-y-0.5"
                    >
                      <span className="block text-sm font-medium leading-none">
                        {label}
                      </span>
                      <span className="block text-xs text-muted-foreground leading-relaxed">
                        {description}
                      </span>
                    </Label>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
