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
  // quick-606 — four more all-tenant sweeps, each previously issued on the BARE
  // client. Measured as TC001 (carrier-auto-dispatch, purge-deleted x28,
  // carrier-compliance-alerts) or, worse, as a SILENT PARTIAL SWEEP that
  // reported ok:true having covered 1 of 2 tenants (trip-reminders).
  'compliance alert tenant sweep',
  'soft-delete purge tenant sweep',
  'trip reminder tenant sweep',
  'auto-dispatch generation tenant sweep',

  // ── SysAdmin automation surface ───────────────────────────────────────────
  'sysadmin manual automation trigger',
  // quick-613 — the three `AutomationRule` units of work in the same file, each
  // previously issued on the BARE (tenant) client. `toggleRuleActive` was
  // measured 42501 under `app_user` in quick-612 §3; the two reads are
  // all-tenant by intent (the run counts and the run list span every tenant).
  // The manual trigger's own two reads REUSE the reason above — same unit of
  // work as the `automationRun` writes already routed there, so no fourth
  // member is minted.
  'sysadmin automation rule listing',
  'sysadmin automation rule detail read',
  'sysadmin automation rule activation toggle',

  // ── SysAdmin tenant management ────────────────────────────────────────────
  'sysadmin trial extension',
  'sysadmin tenant listing',
  'sysadmin tenant create',
  'sysadmin tenant status change',
  'sysadmin tenant profile update',
  'sysadmin tenant settings update',
  'sysadmin tenant delete',
  // quick-615 — the READ half of the same surface. quick-600 routed this file's
  // seven MUTATIONS (create, status change x2, profile, settings, trial,
  // delete) from a design-doc-derived census and stated in its own
  // ROUTING-MANIFEST that it "does not claim to have found every site"; the
  // fourteen reads it left behind are all cross-tenant by construction — a
  // sysadmin administering an ARBITRARY tenant, with `tenant_self_read` spelled
  // `id = current_tenant_id()` and carrying no second branch that could ever
  // have admitted them. Measured class: TC001 at the app_user cutover, and a
  // SILENT ZERO with the tripwire off — a tenant list showing no tenants.
  //
  // `sysadmin tenant listing` above is REUSED by `getAllTenants` (:32) and by
  // the support page's tenant filter: same job, and the union is a vocabulary,
  // not a call-site register. Three more statements (`:123`, `:198`, `:239`)
  // mint nothing at all — they are receiver swaps onto an admin client already
  // in scope in their own function.
  'sysadmin platform metrics',
  'sysadmin tenant detail read',
  'sysadmin owner invitation resend',
  'sysadmin owner email change',

  // ── SysAdmin support ticket surface ───────────────────────────────────────
  'sysadmin ticket status update',
  'sysadmin ticket reply',
  'sysadmin ticket thread read',
  // quick-615 — the LIST, which was never routed while three of its siblings
  // were. One acquisition covers the `SupportTicket` scan and all three of the
  // `Promise.all` joins that decorate it, `auth.users` included: splitting one
  // `Promise.all` across two connections is quick-561's "fixing one bell and
  // leaving the other".
  'sysadmin ticket listing',

  // ── SysAdmin notification surface ─────────────────────────────────────────
  // quick-615 — `NotificationSendLog` only. The other eight statements in
  // `(admin)/actions/notifications.ts` are on `NotificationTemplate` /
  // `NotificationEmailConfig`, both RLS-OFF under the Section 4.12 allowlist,
  // and are DELIBERATELY left on the tenant connection: `app_user` holds full
  // DML on them from the Phase 1 grants and nothing raises. That file stays
  // MIXED on purpose — do not "finish the job".
  'sysadmin notification send log listing',
  'sysadmin notification delivery statistics',

  // ── SysAdmin user administration ──────────────────────────────────────────
  // quick-615 — neither of these ever has a tenant: `getAllUsers` spans every
  // tenant, and `updateUserProfile`'s input is `{userId, …}`. The update path
  // shares ONE acquisition across its read-before-write, its write, its
  // COMPENSATING ROLLBACK and its re-read — a rollback that landed on a
  // different connection from the write it reverses would be worse than the
  // failure it is compensating for.
  'sysadmin user listing',
  'sysadmin user profile update',

  // ── SysAdmin tenant-detail panels ─────────────────────────────────────────
  // quick-615 — three server components under `(admin)/tenants/[id]/`, each a
  // single statement, each rendering an ARBITRARY tenant for an operator who is
  // not in it. The automation-run one is 614 §2.1 B-7's asymmetry: quick-613
  // routed the `/automations` screen's run list and this byte-similar one was
  // never in that task's census.
  'sysadmin tenant activation progress read',
  'sysadmin tenant automation run list',
  'sysadmin tenant billing summary read',

  // ── Automation scheduling (cron + evaluator) ──────────────────────────────
  // quick-615 — the reads that DISCOVER which tenants are candidates, plus the
  // platform-scope rule lookup that decides whether a sweep runs at all. Both
  // run before any tenant is known. The per-candidate dedup reads in the same
  // loops are NOT here: they hold the loop variable and went to
  // `getTenantPrismaForOrg`, which is the whole point of separating the two
  // classes.
  'automation cron candidate sweep',
  'automation evaluator scan',

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
