---
phase: quick-395
plan: 395
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(admin)/actions/users.ts
  - apps/web/src/app/(admin)/users/users-list.tsx
  - apps/web/src/app/(admin)/users/edit-user-modal.tsx
  - apps/web/src/app/(admin)/tenants/[id]/tenant-users-section.tsx
autonomous: true

must_haves:
  truths:
    - "Sysadmin can edit firstName, lastName, role, and isActive on any non-sysadmin user from the /users page"
    - "Sysadmin can edit the same four fields from the per-tenant users table on /tenants/[id]"
    - "Toggling isActive to false bans the user's Supabase Auth session (terminates active sessions)"
    - "Toggling isActive to true unbans the user's Supabase Auth session"
    - "If the Supabase ban/unban call fails the Prisma update is reverted so the two systems stay in sync"
    - "email, tenantId, isSystemAdmin, isSample, passwordHash, id, createdAt cannot be edited through this UI"
    - "role dropdown is restricted to OWNER/MANAGER/DRIVER (UserRole enum) — no sysadmin-like option"
  artifacts:
    - path: "apps/web/src/app/(admin)/actions/users.ts"
      provides: "updateUserProfile server action with Zod whitelist, requireAdminAccess, read-before-write, Supabase ban/unban + Prisma rollback on failure"
      contains: "export async function updateUserProfile"
    - path: "apps/web/src/app/(admin)/users/edit-user-modal.tsx"
      provides: "Shared client modal with 4 editable fields, useState + useTransition + router.refresh()"
      contains: "export function EditUserModal"
    - path: "apps/web/src/app/(admin)/users/users-list.tsx"
      provides: "Actions column with Edit button that opens EditUserModal"
      contains: "EditUserModal"
    - path: "apps/web/src/app/(admin)/tenants/[id]/tenant-users-section.tsx"
      provides: "Edit User dropdown item above Send Password Reset, mounts EditUserModal"
      contains: "EditUserModal"
  key_links:
    - from: "apps/web/src/app/(admin)/users/edit-user-modal.tsx"
      to: "updateUserProfile server action"
      via: "direct server action import + useTransition"
      pattern: "updateUserProfile\\("
    - from: "apps/web/src/app/(admin)/actions/users.ts"
      to: "createAdminClient (Supabase admin)"
      via: "auth.admin.updateUserById ban_duration"
      pattern: "auth\\.admin\\.updateUserById"
    - from: "apps/web/src/app/(admin)/tenants/[id]/tenant-users-section.tsx"
      to: "EditUserModal from /users/edit-user-modal"
      via: "import + state-driven mount"
      pattern: "import.*EditUserModal"
---

<objective>
TKT-0037 Part 2 — Build a shared user-edit modal that lets sysadmins update firstName, lastName, role, and isActive for any non-sysadmin user, wired into both the global /users page (TKT-0036) and the per-tenant users table on /tenants/[id]. Toggling isActive must call Supabase Admin ban/unban so the Auth session is actually terminated; if Supabase fails, the Prisma update is reverted to keep both systems consistent.

Purpose: The /users page is currently read-only and the tenant detail page only has Reset Password + Change Role. Sysadmins have no way to fix typos in names, change isActive, or otherwise correct user records. Setting isActive=false on its own does NOT terminate the Supabase session — the user stays logged in — which is a real security gap.

Output: One shared server action (updateUserProfile), one shared modal (EditUserModal), and two integrated table surfaces (/users Actions column + /tenants/[id] dropdown item). No schema changes.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/src/app/(admin)/actions/users.ts
@apps/web/src/app/(admin)/users/users-list.tsx
@apps/web/src/app/(admin)/tenants/[id]/tenant-users-section.tsx
@apps/web/src/app/(admin)/tenants/[id]/reset-password-button.tsx
@apps/web/src/lib/supabase/admin.ts

# Reference shape — UserRole enum
# apps/web/prisma/schema.prisma:14-18
# enum UserRole { OWNER MANAGER DRIVER }

# Reference shape — User model
# apps/web/prisma/schema.prisma:236-260
# Editable: firstName, lastName, role, isActive
# Read-only: id, email, tenantId, passwordHash, isSystemAdmin, isSample, createdAt
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add updateUserProfile server action with Supabase ban/unban + rollback</name>
  <files>apps/web/src/app/(admin)/actions/users.ts</files>
  <action>
Extend the existing `apps/web/src/app/(admin)/actions/users.ts` file (which already has `getAllUsers` and `AdminUserRow`). The file already has `'use server'` at the top and `requireAdminAccess()` defined — reuse them, do NOT redefine.

Add at the top (alongside existing imports):
```ts
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
```

Add the Zod schema and action below `getAllUsers`:

```ts
const updateUserProfileSchema = z.object({
  userId: z.string().uuid(),
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  role: z.enum(['OWNER', 'MANAGER', 'DRIVER']),
  isActive: z.boolean(),
});

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;

export type UpdateUserProfileResult =
  | { success: true; user: AdminUserRow }
  | { success: false; error: string };

/**
 * Update a non-sysadmin user's whitelisted profile fields.
 *
 * Side-effect contract:
 *   - If isActive transitions, calls Supabase Admin API to ban/unban
 *     (ban_duration: '876000h' for ban, 'none' for unban — terminates session).
 *   - If the Supabase call fails, the Prisma update is reverted in a
 *     compensating transaction so the two systems stay consistent.
 *
 * Hard guards:
 *   - Refuses to touch users where isSystemAdmin = true.
 *   - role enum is restricted to OWNER/MANAGER/DRIVER by Zod (no sysadmin path).
 *   - Never reads email, tenantId, passwordHash, isSystemAdmin, isSample from input.
 */
export async function updateUserProfile(
  input: UpdateUserProfileInput
): Promise<UpdateUserProfileResult> {
  await requireAdminAccess();

  const parsed = updateUserProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const { userId, firstName, lastName, role, isActive } = parsed.data;

  // Read-before-write: capture previous state for rollback + isActive transition check
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, firstName: true, lastName: true, role: true,
      isActive: true, isSystemAdmin: true,
    },
  });
  if (!existing) return { success: false, error: 'User not found' };
  if (existing.isSystemAdmin) {
    return { success: false, error: 'Cannot edit a system administrator through this UI' };
  }

  // Apply Prisma update
  await prisma.user.update({
    where: { id: userId },
    data: { firstName, lastName, role, isActive },
  });

  // If isActive changed, sync Supabase session state
  if (existing.isActive !== isActive) {
    try {
      const supabase = createAdminClient();
      const { error: sbErr } = await supabase.auth.admin.updateUserById(userId, {
        ban_duration: isActive ? 'none' : '876000h', // ~100 years = effectively permanent
      });
      if (sbErr) throw sbErr;
    } catch (err) {
      // Compensating rollback — restore previous Prisma state
      await prisma.user.update({
        where: { id: userId },
        data: {
          firstName: existing.firstName,
          lastName: existing.lastName,
          role: existing.role,
          isActive: existing.isActive,
        },
      });
      const msg = err instanceof Error ? err.message : 'Supabase ban/unban failed';
      return { success: false, error: `Failed to sync Supabase session: ${msg}. Changes reverted.` };
    }
  }

  const updated = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, firstName: true, lastName: true, email: true, role: true,
      isActive: true, createdAt: true, tenantId: true,
      tenant: { select: { name: true } },
    },
  });
  if (!updated) return { success: false, error: 'User vanished after update' };

  return { success: true, user: updated };
}
```

Key implementation notes that MUST be respected:
- Do NOT add email, tenantId, passwordHash, isSystemAdmin, or isSample to the schema or the update data — they must stay read-only.
- Do NOT swallow the Supabase error — catch, compensate via Prisma, and surface the message to the caller.
- The isSystemAdmin guard is mandatory: even if a sysadmin tries via DevTools, the action must refuse.
- The Supabase admin client uses the service role key — keep it server-side only (already enforced by 'use server').
  </action>
  <verify>
1. `cd apps/web && npx tsc --noEmit` — no new TypeScript errors in users.ts
2. Grep confirms exports: `EditUserModal` not yet, but `updateUserProfile`, `updateUserProfileSchema`, `UpdateUserProfileResult` all exported from users.ts
3. No new dependency added to package.json (zod and @supabase/supabase-js already present)
  </verify>
  <done>
updateUserProfile server action exists in apps/web/src/app/(admin)/actions/users.ts, validates 4-field whitelist via Zod, refuses isSystemAdmin users, calls Supabase auth.admin.updateUserById with ban_duration on isActive transition, and reverts the Prisma update on Supabase failure. Returns discriminated union `{ success: true, user } | { success: false, error }`.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create shared EditUserModal client component</name>
  <files>apps/web/src/app/(admin)/users/edit-user-modal.tsx</files>
  <action>
Create a new file `apps/web/src/app/(admin)/users/edit-user-modal.tsx` modeled on the modal styling already used by `ResetPasswordButton` and the inline `ChangeRoleModal` inside `tenant-users-section.tsx` (fixed-inset backdrop, white card with rounded-xl border, header / body / footer rows). Do NOT introduce react-hook-form or shadcn Dialog primitives — match the existing plain-div modal pattern.

Required structure:

```tsx
'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { updateUserProfile, type AdminUserRow } from '@/app/(admin)/actions/users';

// Lighter shape accepted by the tenant-detail call site (no tenant/createdAt needed)
export interface EditableUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: 'OWNER' | 'MANAGER' | 'DRIVER';
  isActive: boolean;
}

interface EditUserModalProps {
  user: EditableUser | AdminUserRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (updated: AdminUserRow) => void;
}

export function EditUserModal({ user, open, onOpenChange, onSuccess }: EditUserModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<'OWNER' | 'MANAGER' | 'DRIVER'>('DRIVER');
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reset form whenever the user prop changes (modal reused across rows)
  useEffect(() => {
    if (user) {
      setFirstName(user.firstName ?? '');
      setLastName(user.lastName ?? '');
      setRole(user.role as 'OWNER' | 'MANAGER' | 'DRIVER');
      setIsActive(user.isActive);
      setError(null);
    }
  }, [user]);

  if (!open || !user) return null;

  function handleSave() {
    if (!user) return;
    setError(null);
    startTransition(async () => {
      const result = await updateUserProfile({
        userId: user.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role,
        isActive,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onSuccess?.(result.user);
      router.refresh();
      onOpenChange(false);
    });
  }

  // Render: backdrop + card with:
  //   - Header: "Edit User" + close button
  //   - Body (in order):
  //       Read-only Email row (gray text, helper "Email cannot be changed here")
  //       First Name input (required, maxLength=100)
  //       Last Name input (required, maxLength=100)
  //       Role select with 3 options (OWNER / MANAGER / DRIVER)
  //       isActive checkbox with label "Active" and helper text:
  //          "Unchecking will sign the user out of all sessions"
  //       Error banner (red) when `error` is set
  //   - Footer: Cancel + Save (Save is disabled when isPending or
  //     firstName.trim()==='' or lastName.trim()===''; label "Saving..." while pending)
  // Use the same Tailwind classes as ResetPasswordButton's modal for visual parity.
}
```

The render JSX should follow the exact modal scaffolding from `reset-password-button.tsx` lines 95-220 (fixed inset-0 z-50, absolute inset-0 bg-black/40 backdrop with onClick close, relative z-10 max-w-md card, border-b/border-t separators, rounded-md inputs). Increase max-w-sm to max-w-md to fit the form comfortably.

Constraints:
- DO NOT render email as an editable input — show as read-only text with helper copy
- DO NOT render any tenantId / isSystemAdmin / passwordHash field
- DO NOT submit if firstName or lastName trim to empty
- DO NOT call the server action outside startTransition — keeps the Save button properly disabled during the request
- onOpenChange(false) only after success; on error the modal stays open with the error banner
  </action>
  <verify>
1. `cd apps/web && npx tsc --noEmit` — no TypeScript errors
2. File exports `EditUserModal` and `EditableUser` named exports
3. Visual check (manual, post-deploy): open from a row, change firstName, save — modal closes, table reflects new name after refresh
  </verify>
  <done>
edit-user-modal.tsx exists, renders a fixed-position modal with 4 editable fields (firstName, lastName, role, isActive) and email shown as read-only. Save button is wired through useTransition to updateUserProfile, calls router.refresh() and onOpenChange(false) on success, surfaces server-action errors inline on failure. The modal works against both AdminUserRow (from /users) and the lighter EditableUser shape (from /tenants/[id]).
  </done>
</task>

<task type="auto">
  <name>Task 3: Wire EditUserModal into both /users list and tenant-users-section</name>
  <files>apps/web/src/app/(admin)/users/users-list.tsx, apps/web/src/app/(admin)/tenants/[id]/tenant-users-section.tsx</files>
  <action>
**Part A — /users page integration (`users-list.tsx`):**

1. Add imports at the top:
   ```ts
   import { EditUserModal } from './edit-user-modal';
   ```

2. Add modal state inside `UsersList`:
   ```ts
   const [editingUser, setEditingUser] = useState<AdminUserRow | null>(null);
   ```

3. Add a new "Actions" column as the LAST entry in the `columns` array, rightmost:
   ```ts
   {
     id: 'actions',
     header: 'Actions',
     cell: ({ row }) => (
       <button
         type="button"
         onClick={() => setEditingUser(row.original)}
         className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
       >
         Edit
       </button>
     ),
   },
   ```

4. Mount the modal at the bottom of the returned JSX (after the table's closing `</div>`):
   ```tsx
   <EditUserModal
     user={editingUser}
     open={editingUser !== null}
     onOpenChange={(open) => { if (!open) setEditingUser(null); }}
   />
   ```

Do NOT touch any other column, filter, or the search bar. Server-rendered data refreshes via `router.refresh()` already wired in the modal.

**Part B — Tenant detail integration (`tenant-users-section.tsx`):**

1. Add imports at the top:
   ```ts
   import { EditUserModal, type EditableUser } from '@/app/(admin)/users/edit-user-modal';
   ```

2. Add new state inside `TenantUsersSection`:
   ```ts
   const [editingUser, setEditingUser] = useState<EditableUser | null>(null);
   ```

3. Extend `ActionsDropdown` to accept and call an `onEdit` callback. Update its props interface and add a new menu item ABOVE "Send Password Reset":
   ```tsx
   <button
     type="button"
     onClick={() => { setOpen(false); onEdit(user); }}
     className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
   >
     Edit User
   </button>
   ```
   Then below it keep "Send Password Reset", and keep the existing conditional "Change Role" item unchanged.

4. Pass the new callback from `TenantUsersSection`:
   ```tsx
   <ActionsDropdown
     user={user}
     onSendReset={(u) => setResetConfirm(u)}
     onChangeRole={(u) => { if (u.role !== 'OWNER') setRoleModalUser(u as ChangeRoleModalUser); }}
     onEdit={(u) => setEditingUser({
       id: u.id,
       firstName: u.firstName,
       lastName: u.lastName,
       email: u.email,
       role: u.role,
       isActive: u.isActive,
     })}
   />
   ```

5. Mount the modal next to the existing `ChangeRoleModal` block (before the closing `</div>` of the section). On success, optimistically update the local users list so the section reflects the change without a hard refresh:
   ```tsx
   <EditUserModal
     user={editingUser}
     open={editingUser !== null}
     onOpenChange={(open) => { if (!open) setEditingUser(null); }}
     onSuccess={(updated) => {
       setUsers((prev) => prev.map((u) => (u.id === updated.id
         ? { ...u, firstName: updated.firstName, lastName: updated.lastName,
             role: updated.role as 'OWNER' | 'MANAGER' | 'DRIVER', isActive: updated.isActive }
         : u)));
       const name = [updated.firstName, updated.lastName].filter(Boolean).join(' ') || updated.email;
       showBanner('success', `Updated profile for ${name}`);
     }}
   />
   ```

Do NOT change the existing Reset Password flow, the Change Role flow, the API fetch, or the table layout beyond the new dropdown entry.

**After both edits, run typecheck and commit:**

```bash
cd apps/web && npx tsc --noEmit
```

If typecheck passes, commit from the repo root:
```bash
git add apps/web/src/app/\(admin\)/actions/users.ts \
        apps/web/src/app/\(admin\)/users/users-list.tsx \
        apps/web/src/app/\(admin\)/users/edit-user-modal.tsx \
        apps/web/src/app/\(admin\)/tenants/\[id\]/tenant-users-section.tsx
git commit -m "feat(admin): add user profile edit modal with Supabase ban/unban [TKT-0037 Part 2]"
```

Do NOT push — per workflow preferences, only the user pushes at the end of GSD orchestration.
  </action>
  <verify>
1. `cd apps/web && npx tsc --noEmit` — no TypeScript errors
2. Grep `EditUserModal` finds it imported in both users-list.tsx and tenant-users-section.tsx
3. Grep "Edit User" in tenant-users-section.tsx — dropdown item present, positioned above "Send Password Reset"
4. Grep "Actions" header in users-list.tsx columns array — present as last column
5. Git log shows one new commit with the message above
  </verify>
  <done>
/users page has an Edit button in a new rightmost Actions column that opens EditUserModal. /tenants/[id] users table has an "Edit User" item in the per-row ⋯ dropdown above "Send Password Reset" that opens the SAME EditUserModal. Both surfaces close on success, refresh data, and surface server-action errors inline. Single commit landed locally, not pushed.
  </done>
</task>

</tasks>

<verification>
End-to-end checks the user can perform after Vercel deploy:

1. `/users` (sysadmin) → click Edit on any user row → modal opens with firstName/lastName/role/isActive prefilled, email shown read-only
2. Change firstName, save → table row updates with new name
3. Uncheck Active on a user who is logged in via another browser/incognito → that browser hits a 401 on next API call (Supabase session terminated)
4. Re-check Active → user can sign in again
5. Simulate Supabase failure (e.g., temporarily revoke SUPABASE_SERVICE_ROLE_KEY in dev): toggling isActive surfaces a red error banner and the user's row in the DB still shows the OLD isActive value (rollback worked)
6. `/tenants/[id]` → expand Users section → click ⋯ on any user → "Edit User" appears above "Send Password Reset" → opens same modal, same behavior
7. Verify email field cannot be edited from either surface (rendered as read-only text)
8. Verify role dropdown only shows OWNER / MANAGER / DRIVER — no sysadmin option
</verification>

<success_criteria>
- updateUserProfile server action validates 4 whitelisted fields and rejects everything else
- isSystemAdmin users cannot be edited through the modal (server-side guard)
- isActive transitions call Supabase auth.admin.updateUserById with ban_duration
- Supabase failure triggers a Prisma rollback to the previous state
- /users and /tenants/[id] both open the same shared modal
- tsc --noEmit passes with zero new errors
- One feat commit landed, not pushed
</success_criteria>

<output>
After completion, no SUMMARY.md is required for quick tasks; the commit message itself documents the change. The user will push when ready to deploy.
</output>
