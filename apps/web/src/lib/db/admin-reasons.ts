/**
 * quick-600 (B5) — the closed `AdminReason` union.
 *
 * ONE MEMBER PER ROUTED UNIT OF WORK, not one per `getAdminDb(` call site — a
 * function that issues several statements on the admin connection to do one
 * job (e.g. read-then-update) shares a single reason. That is deliberate:
 * `getAdminDb(reason: AdminReason)` types the argument over this union, so
 * naming a new reason is a TYPE CHANGE in this reviewable file, and adding an
 * admin call inside an already-allowlisted file is still a deliberate edit
 * because `tests/security/admin-connection-allowlist.test.ts` asserts a
 * per-file CALL COUNT, not just file membership.
 *
 * REASON STRINGS SAY WHAT THE PATH DOES, NEVER THAT IT NEEDS ADMIN.
 * `'sysadmin invoice listing'`, not `'requires elevated access'`. Never the
 * words "bypass" or "cross-tenant" as the whole string — those describe the
 * MECHANISM, and the mechanism is exactly what `getAdminDb` already is. The
 * string is the thing a reviewer (or `logger.info('[admin-db] privileged
 * query', { reason })`, on every call) reads six months from now with no
 * other context.
 *
 * THIS RULE SURVIVES THE NEXT EDIT ONLY IF IT IS STATED HERE. Do not add a
 * reason that only restates the routing decision.
 */

export const ADMIN_REASONS = [
  // ── All-tenant cron sweeps (design §1.2 / §3.3 "All-tenant sweeps") ──────
  'compliance digest tenant sweep',
  'daily driver digest tenant sweep',
  'weekly owner digest tenant sweep',
  'reminders cron tenant sweep',
  'workflow digest active-tenant sweep',
  'workflow overdue-step sweep',
  'workflow blocked-instance sweep',
  'auto-close stale ticket sweep',

  // ── SysAdmin automation surface ───────────────────────────────────────────
  'sysadmin manual automation trigger',

  // ── SysAdmin tenant management ────────────────────────────────────────────
  'sysadmin trial extension',
  'sysadmin tenant listing',
  'sysadmin tenant create',
  'sysadmin tenant status change',
  'sysadmin tenant profile update',
  'sysadmin tenant settings update',
  'sysadmin tenant delete',

  // ── SysAdmin support ticket surface ───────────────────────────────────────
  'sysadmin ticket status update',
  'sysadmin ticket reply',
  'sysadmin ticket thread read',

  // ── BOOTSTRAP (pre-tenant / pre-auth reads — design §1.1 / §3.2) ──────────
  'tenant lookup by user id',
  'invitation lookup by token',
  'public shipment tracking lookup',

  // ── SysAdmin billing surface ──────────────────────────────────────────────
  'sysadmin invoice management',
  'sysadmin invoice audit trail',
  'overdue invoice sweep',
  'sysadmin invoice email lookup',
] as const;

export type AdminReason = (typeof ADMIN_REASONS)[number];
