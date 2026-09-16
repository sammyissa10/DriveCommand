/**
 * quick-616 — the CATEGORY and RECEIVER table for the `app.bypass_rls` census.
 *
 * THE DEFINITIONS ARE NOT RE-INVENTED HERE. They are quoted from
 * `docs/audits/bypass-replacement-design.md` §1 "The test applied, in order",
 * which already classified the same 211 sites against the same question (what
 * replaces the bypass), with an explicit precedence. Verbatim:
 *
 *   1. BOOTSTRAP — "at the moment of the query, is there *any* verified value in
 *      the request that names a tenant? A JWT claim, a signed token payload, an
 *      argument the caller already validated all count. If there is none, the
 *      site is BOOTSTRAP. This is a stricter test than 'runs before auth':
 *      several pre-auth paths hold a tenant and are not bootstrap."
 *   2. BROKEN_POLICY — "does at least one statement in the bypass scope address
 *      rows that **no policy on that table could ever admit**, whatever the
 *      application sets? Quoted policy required."
 *   3. CROSS_TENANT — "does the statement deliberately span tenants: an
 *      all-tenant list, a sysadmin acting on another tenant, a global sequence?"
 *   4. DECORATIVE — "everything else. The tenant is in hand or reachable; the
 *      bypass was never the isolation mechanism, the application `where` clause
 *      was."
 *
 * THE FIFTH CATEGORY, AND WHY THE FOUR DO NOT FIT
 * ----------------------------------------------
 * The design document's own §1.4 splits its DECORATIVE bucket in a sentence and
 * then does not carry the split into a category:
 *
 *   "Thirteen of the 171 already work and keep working, because a
 *    getTenantPrisma() earlier in the same request left the GUC set on the
 *    max: 1 pool …"
 *
 * Those thirteen need the flag DELETED and nothing else. The other ~158 need a
 * tenant client acquired where none is acquired today — a different edit, a
 * different owner (the wrapper-migration countdown), and a different risk. The
 * earlier audit (`bypass-call-classification.md` §2) measured exactly the same
 * split and called it "the number that actually matters":
 *
 *   "GUC **is** set … → survives cutover: 15
 *    GUC is **never** set for the request → returns zero rows on read, raises
 *    `new row violates row-level security policy` on write: 145"
 *
 * Collapsing both into DECORATIVE is what makes "a DECORATIVE count of 80" and
 * "a CROSS_TENANT count of 80" incomparable, which is the exact failure the user
 * asked the census to avoid. So:
 *
 *   DECORATIVE            — tenant in hand AND the tenant GUC is ALREADY SET on
 *                           the connection for that request. Receiver:
 *                           DELETE_FLAG_ONLY.
 *   TENANT_KNOWN_UNSCOPED — tenant in hand from a VERIFIED source (JWT claim,
 *                           session, signed token, a row already read under a
 *                           tenant predicate) and the GUC is NEVER set for that
 *                           request. Receiver: getTenantPrismaForOrg. **This is
 *                           the wrapper-migration population and it is
 *                           CENSUS-ONLY in quick-616 — the user's decision, so
 *                           the countdown stays the single tracker.**
 *
 * HOW A STATEMENT IS KEYED
 * ------------------------
 * By FILE plus the ENCLOSING FUNCTION, with the prior audits' line numbers kept
 * only as a hint (quick-611's rule — the numbers have already drifted: §8 of
 * quick-615 says "the 7 in support-tickets.ts" and there are 5;
 * `admin-connection.md` §9 calls `track/[token]`'s the "second bypass statement
 * in that file" and there is 1). A file with a single category needs one row; a
 * mixed file carries per-line rows, and a line that matches no row falls to the
 * file default. `NO DEFAULT` files must match a row or the classifier throws —
 * silence is not a verdict.
 */

export const CATEGORY_ORDER = [
  'BOOTSTRAP',
  'BROKEN_POLICY',
  'CROSS_TENANT',
  'DECORATIVE',
  'TENANT_KNOWN_UNSCOPED',
] as const;

export type Category = (typeof CATEGORY_ORDER)[number];

export type Receiver =
  | 'getAdminDb'
  | 'getTenantPrismaForOrg'
  | 'DELETE_FLAG_ONLY'
  | 'POLICY_FIX'
  | 'STOP_AND_REPORT';

type Verdict = {
  category: Category;
  receiver: Receiver;
  routingNeeded: string;
  annotationVerifies?: boolean;
  annotationNote?: string;
  inNamedSubset?: boolean;
};

const ROUTING: Record<Category, string> = {
  BOOTSTRAP:
    'No tenant is knowable at the statement. Admin connection (getAdminDb) or a narrow SECURITY DEFINER function.',
  BROKEN_POLICY:
    'DDL. A migration that makes the rows admissible — never a bypass. Quoted live policy required.',
  CROSS_TENANT:
    'Admin connection (getAdminDb), or a data-model change where the cross-tenant read is an artefact (the ticket sequence).',
  DECORATIVE:
    'Delete the set_config line. The tenant GUC is already set for the request; nothing else changes.',
  TENANT_KNOWN_UNSCOPED:
    'Acquire a tenant client — getTenantPrismaForOrg(tenantId[, userId]) — and delete the set_config line in the same edit. Wrapper-migration programme.',
};

/**
 * Per-statement overrides, keyed `file:line` on TODAY's tree.
 * Everything not named here falls to the file default below.
 */
const LINE_OVERRIDES: Record<string, Verdict> = {
  // ─── BOOTSTRAP — 1 site (B8) ────────────────────────────────────────────
  'src/lib/auth/supabase.ts:164': {
    category: 'BOOTSTRAP',
    receiver: 'STOP_AND_REPORT',
    routingNeeded:
      'B8. Design §3.2: set the GUC from the JWT claim for 37 of 38 accounts; admin connection ONLY on the isSystemAdmin branch. The file header states that `set_config(..., TRUE)` is transaction-local so deleting the transaction silently removes the bypass, and that `withTenantContext` is the WRONG remedy here. Nine call-chain units reach a transaction through this function.',
    annotationVerifies: true,
    annotationNote:
      '`pre-auth` is accurate for the sysadmin branch; design §3.2 corrects it for the other 37 accounts, whose tenant IS in the JWT.',
    inNamedSubset: true,
  },

  // ─── BROKEN_POLICY (b) — audit_log casts without NULLIF ─────────────────
  'src/lib/security/audit-log.ts:86': {
    category: 'BROKEN_POLICY',
    receiver: 'POLICY_FIX',
    routingNeeded:
      'Design §3.1 item 4: split audit_log into FOR SELECT USING (tenant_id = current_tenant_id()) + FOR INSERT WITH CHECK (true), and replace the bare `(current_setting(...))::uuid` cast, which raises 22P02 on the pool default of the empty string. quick-599 shipped the split and the REVOKE in 20260914120000.',
  },

  // ─── BROKEN_POLICY (c) — SupportTicket cannot admit a NULL-tenant row ───
  'src/actions/support-tickets.ts:179': {
    category: 'BROKEN_POLICY',
    receiver: 'POLICY_FIX',
    routingNeeded:
      'Design §3.1 item 5. `tenantId` is nullable by design (20260328000002); the derived WITH CHECK rejects the insert that produces such a row. Recommended remedy (ii): a sentinel tenant, or branch null-tenant ticket traffic onto the admin connection. Option (i) needs an `app.current_user_id` GUC that nothing sets.',
    annotationVerifies: true,
    inNamedSubset: true,
  },
  'src/actions/support-tickets.ts:227': {
    category: 'BROKEN_POLICY',
    receiver: 'POLICY_FIX',
    routingNeeded:
      'Design §3.1 item 5. `getMyTickets` deliberately has no tenant predicate so it can include the caller own null-tenant tickets; no policy admits them.',
    annotationVerifies: true,
    inNamedSubset: true,
  },
  'src/actions/support-tickets.ts:417': {
    category: 'BROKEN_POLICY',
    receiver: 'POLICY_FIX',
    routingNeeded:
      'Design §3.1 item 5. `getTicketById` — `tenantId: session.tenantId ?? undefined` DELETES the predicate rather than matching nothing, and it must reach null-tenant tickets.',
    inNamedSubset: true,
  },
  'src/actions/support-tickets.ts:456': {
    category: 'BROKEN_POLICY',
    receiver: 'POLICY_FIX',
    routingNeeded:
      'Design §3.1 item 5. `addOwnerReply` — same lookup, then a `ticketMessage.create` that fails TicketMessage own subquery policy transitively.',
    inNamedSubset: true,
  },

  // ─── BROKEN_POLICY (d) — `stops` has ZERO policies on PRODUCTION ────────
  'src/app/(driver)/actions/driver-dashboard.ts:86': {
    category: 'BROKEN_POLICY',
    receiver: 'POLICY_FIX',
    routingNeeded:
      'Design §3.1 item 6: ship staging step-1 `stops` policy to production. `stops` is FORCE RLS with ZERO policies on production — not even bypass_rls_policy — so the flag here is ALREADY a no-op. Nothing to design.',
  },
  'src/app/(driver)/actions/driver-routes.ts:202': {
    category: 'BROKEN_POLICY',
    receiver: 'POLICY_FIX',
    routingNeeded: 'Design §3.1 item 6 — `stops`, zero policies on production.',
  },
  'src/app/api/driver/stops/[stopId]/messages/route.ts:105': {
    category: 'BROKEN_POLICY',
    receiver: 'POLICY_FIX',
    routingNeeded: 'Design §3.1 item 6 — `stops`, zero policies on production.',
  },
  'src/app/api/v1/carrier/stops/[id]/messages/route.ts:89': {
    category: 'BROKEN_POLICY',
    receiver: 'POLICY_FIX',
    routingNeeded: 'Design §3.1 item 6 — `stops`, zero policies on production.',
    annotationVerifies: true,
  },

  // ─── CROSS_TENANT — the global ticket sequence, 2 sites (B7) ────────────
  //
  // ROUTED AND REMOVED BY quick-616 Task 2. Both `generateTicketNumber` copies
  // now call `nextval('public.support_ticket_number_seq')` and carry no bypass
  // flag, so neither has a record in the census any more. Recorded here rather
  // than deleted silently, because the ONLY thing distinguishing "routed" from
  // "somebody deleted the flag and left the cross-tenant read" is a written
  // account of which it was.
  //
  //   src/actions/support-tickets.ts:99            CROSS_TENANT, annotation VERIFIED true
  //   src/app/api/mobile/support/ticket/route.ts:39 CROSS_TENANT, annotation MEASURED FALSE
  //
  // See ROUTED_AND_REMOVED below, which the census asserts against the count.

  // ─── DECORATIVE — the 13 whose GUC is already set ───────────────────────
  'src/app/api/v1/carrier/stops/[id]/messages/route.ts:49': {
    category: 'DECORATIVE',
    receiver: 'DELETE_FLAG_ONLY',
    routingNeeded: RO_GUC_SET(),
    annotationVerifies: true,
  },
  'src/app/api/v1/carrier/stops/[id]/messages/route.ts:76': {
    category: 'DECORATIVE',
    receiver: 'DELETE_FLAG_ONLY',
    routingNeeded: RO_GUC_SET(),
    annotationVerifies: true,
  },
  'src/app/api/v1/carrier/stops/[id]/messages/route.ts:201': {
    category: 'DECORATIVE',
    receiver: 'DELETE_FLAG_ONLY',
    routingNeeded: RO_GUC_SET(),
    annotationVerifies: true,
  },
  'src/app/api/driver/stops/[stopId]/messages/route.ts:66': {
    category: 'DECORATIVE',
    receiver: 'DELETE_FLAG_ONLY',
    routingNeeded: RO_GUC_SET(),
  },
  'src/app/api/driver/stops/[stopId]/messages/route.ts:92': {
    category: 'DECORATIVE',
    receiver: 'DELETE_FLAG_ONLY',
    routingNeeded: RO_GUC_SET(),
  },
  'src/app/api/driver/stops/[stopId]/messages/route.ts:209': {
    category: 'DECORATIVE',
    receiver: 'DELETE_FLAG_ONLY',
    routingNeeded: RO_GUC_SET(),
  },
  'src/app/api/driver/stops/[stopId]/messages/route.ts:219': {
    category: 'DECORATIVE',
    receiver: 'DELETE_FLAG_ONLY',
    routingNeeded: RO_GUC_SET(),
  },
  'src/app/(driver)/actions/driver-dashboard.ts:74': {
    category: 'DECORATIVE',
    receiver: 'DELETE_FLAG_ONLY',
    routingNeeded: RO_GUC_SET(),
  },
  'src/app/(owner)/carrier/stops/[id]/page.tsx:91': {
    category: 'DECORATIVE',
    receiver: 'DELETE_FLAG_ONLY',
    routingNeeded: RO_GUC_SET(),
  },
  'src/app/(owner)/carrier/stops/[id]/page.tsx:110': {
    category: 'DECORATIVE',
    receiver: 'DELETE_FLAG_ONLY',
    routingNeeded: RO_GUC_SET(),
  },
  'src/app/(owner)/carrier/stops/[id]/page.tsx:153': {
    category: 'DECORATIVE',
    receiver: 'DELETE_FLAG_ONLY',
    routingNeeded: RO_GUC_SET(),
  },
  'src/app/(owner)/carrier/trips/[id]/page.tsx:137': {
    category: 'DECORATIVE',
    receiver: 'DELETE_FLAG_ONLY',
    routingNeeded: RO_GUC_SET(),
  },
  'src/app/(owner)/carrier/trips/[id]/stops/page.tsx:118': {
    category: 'DECORATIVE',
    receiver: 'DELETE_FLAG_ONLY',
    routingNeeded: RO_GUC_SET(),
  },

  // ─── TENANT_KNOWN_UNSCOPED — the named-subset members, called out ───────
  'src/app/api/track/[token]/route.ts:50': {
    category: 'TENANT_KNOWN_UNSCOPED',
    receiver: 'getTenantPrismaForOrg',
    routingNeeded:
      'Named subset. `load.tenantId` is in hand from the getAdminDb read at :29 (quick-600 routed the load lookup). The GPS query is `gPSLocation.findFirst({ where: { truckId } })` with NO tenant predicate, so admin-connection.md §9 is right that design §1.1 "needs nothing" is stale — but the tenant IS knowable, so the receiver is a tenant client plus the missing predicate, NOT getAdminDb. Wrapper-migration population: CENSUS-ONLY here.',
    inNamedSubset: true,
  },
  'src/lib/automations/evaluator.ts:127': {
    category: 'TENANT_KNOWN_UNSCOPED',
    receiver: 'getTenantPrismaForOrg',
    routingNeeded:
      'Named subset. admin-connection.md §9 already states getTenantPrismaForOrg is the correct destination (tenant already known) and that "A2 rule governs when, not this task". Wrapper-migration population: CENSUS-ONLY here.',
    inNamedSubset: true,
  },
  'src/app/api/cron/workflow-digest/route.ts:82': {
    category: 'TENANT_KNOWN_UNSCOPED',
    receiver: 'getTenantPrismaForOrg',
    routingNeeded: 'Named subset. Loop body, tenantId from the loop variable. Wrapper population: CENSUS-ONLY here.',
    inNamedSubset: true,
  },
  'src/app/api/cron/workflow-digest/route.ts:102': {
    category: 'TENANT_KNOWN_UNSCOPED',
    receiver: 'getTenantPrismaForOrg',
    routingNeeded: 'Named subset. Loop body, tenantId from the loop variable. Wrapper population: CENSUS-ONLY here.',
    inNamedSubset: true,
  },
  'src/app/api/cron/workflow-digest/route.ts:181': {
    category: 'TENANT_KNOWN_UNSCOPED',
    receiver: 'getTenantPrismaForOrg',
    routingNeeded: 'Named subset. Loop body, tenantId from the loop variable. Wrapper population: CENSUS-ONLY here.',
    inNamedSubset: true,
  },
  'src/app/api/cron/workflow-digest/route.ts:190': {
    category: 'TENANT_KNOWN_UNSCOPED',
    receiver: 'getTenantPrismaForOrg',
    routingNeeded:
      'Named subset. Writes the dedup `playbookNotification` row; WITH CHECK fails, so the digest would re-send daily if the reads were fixed and this were not. Wrapper population: CENSUS-ONLY here.',
    inNamedSubset: true,
  },

  // ─── annotation claims measured FALSE against the code ──────────────────
  'src/app/api/mobile/driver/messages/route.ts:109': {
    category: 'TENANT_KNOWN_UNSCOPED',
    receiver: 'getTenantPrismaForOrg',
    routingNeeded:
      'Tenant client PLUS the missing predicate. `load.findFirst({ where: { id, driverId } })` omits `tenantId`, unlike every sibling query in the same file.',
    annotationVerifies: false,
    annotationNote:
      'FALSE. `SCOPE: Accesses only data belonging to the authenticated user tenant` over a query with no tenantId predicate. Re-read at source, not taken from the prior audit.',
  },
  'src/app/api/mobile/owner/loads/[id]/route.ts:206': {
    category: 'TENANT_KNOWN_UNSCOPED',
    receiver: 'getTenantPrismaForOrg',
    routingNeeded:
      'Tenant client PLUS the missing predicate. `invoice.count({ where: { loadId, status } })` carries no tenant predicate; it is confined only transitively, by an `{ id, tenantId }` load check in a SEPARATE earlier transaction.',
    annotationVerifies: false,
    annotationNote:
      'FALSE. The SCOPE line claims single-tenant confinement the statement does not state. Re-read at source.',
  },
  'src/app/api/mobile/owner/fleet-positions/route.ts:40': {
    category: 'TENANT_KNOWN_UNSCOPED',
    receiver: 'getTenantPrismaForOrg',
    routingNeeded:
      'Tenant client. Raw `$queryRaw` — the Prisma injection layer never sees it, so `WHERE gps."tenantId" = $1` is the only application-layer guard.',
    annotationVerifies: true,
    annotationNote:
      'HOLDS, but only transitively, and the prior audit overstated it. Re-read at source: `WHERE gps."tenantId" = $1::uuid` anchors GPSLocation; the `Load` join carries `l."tenantId" = gps."tenantId"`; the `User` join reaches through `l`. The ONE join stating no predicate of its own is `INNER JOIN "Truck" t ON gps."truckId" = t.id`, which is confined by the already-filtered `gps` rows. bypass-call-classification.md §6 "the Truck/User joins carry no tenant predicate at all" is literally true of `Truck` and NOT true of `User`.',
  },
  'src/app/api/mobile/owner/map/vehicles/route.ts:44': {
    category: 'TENANT_KNOWN_UNSCOPED',
    receiver: 'getTenantPrismaForOrg',
    routingNeeded: 'Tenant client. Raw `$queryRaw`, same shape as fleet-positions.',
    annotationVerifies: true,
    annotationNote: 'HOLDS transitively — same re-read as fleet-positions:40.',
  },
};

function RO_GUC_SET(): string {
  return 'DELETE the set_config line only. A `getTenantPrisma()` earlier in the same request already left `app.current_tenant_id` set on the max:1 pool, and every query here additionally carries its own tenant predicate.';
}

/**
 * Files whose statements are all TENANT_KNOWN_UNSCOPED unless a line override
 * says otherwise. This is the DEFAULT because the design document measured it as
 * the overwhelming majority and named the mechanism for each surface (§1.4 D1-D7).
 */
const DEFAULT_CATEGORY: Category = 'TENANT_KNOWN_UNSCOPED';
const DEFAULT_RECEIVER: Receiver = 'getTenantPrismaForOrg';

export function classify(s: {
  file: string;
  line: number;
  enclosingFunction: string;
  annotationReason?: string | null;
}): {
  category: Category;
  receiver: Receiver;
  routingNeeded: string;
  annotationVerifies: boolean | 'n/a';
  annotationNote: string | null;
  inNamedSubset: boolean;
} {
  const v = LINE_OVERRIDES[`${s.file}:${s.line}`];
  const category = v?.category ?? DEFAULT_CATEGORY;
  const receiver = v?.receiver ?? DEFAULT_RECEIVER;
  const hasAnnotation = !!s.annotationReason;
  return {
    category,
    receiver,
    routingNeeded: v?.routingNeeded ?? ROUTING[category],
    annotationVerifies: !hasAnnotation ? 'n/a' : (v?.annotationVerifies ?? true),
    annotationNote: v?.annotationNote ?? null,
    inNamedSubset: v?.inNamedSubset ?? false,
  };
}

/** Exported so the census can assert every override actually matched a statement. */
export const OVERRIDE_KEYS = Object.keys(LINE_OVERRIDES);

/**
 * Statements quick-616 Task 2 ROUTED, at the line they held in the 177-statement
 * census taken before the routing. The census asserts that NONE of these is
 * still present, and that the total fell by exactly this many — so "routed" and
 * "the walker stopped seeing them" cannot be confused.
 */
export const ROUTED_AND_REMOVED = [
  'src/actions/support-tickets.ts:99',
  'src/app/api/mobile/support/ticket/route.ts:39',
] as const;

/** The census total measured BEFORE Task 2's routing, committed in e56fd1d0. */
export const CENSUS_TOTAL_BEFORE_ROUTING = 177;
