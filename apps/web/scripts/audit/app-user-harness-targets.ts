/**
 * app-user-harness-targets.ts
 *
 * Every list in this file is quick-582's PREDICTION, carried here as a
 * comparison column only. The harness discovers live state at runtime and
 * reports divergence. Nothing here is an expected value and nothing here is
 * asserted.
 *
 * Predictions are transcribed verbatim from
 * `docs/diagnostics/app-user-grant-coverage.md` (quick-582, 2026-09-02),
 * sections 1-3. Physical table names for the six quick-588 transaction roots
 * are resolved from `apps/web/prisma/schema.prisma`'s `@@map` directives —
 * NOT guessed from the model name — and each entry below cites the schema
 * line the table name came from (line numbers as of this task; re-grep
 * `@@map` if the schema has moved since).
 *
 * Pure data. No I/O. No queries. Nothing in this file talks to the database.
 */

// ---------------------------------------------------------------------------
// Class (a) — missing or partial grant to app_user (9 tables, all zero-grant;
// the audit found no partial case). Source: coverage doc "1-2. The grant
// matrix" and "The 9 tables with zero grants".
// ---------------------------------------------------------------------------
export const PREDICTED_CLASS_A: readonly string[] = [
  '_prisma_migrations',
  'NotificationEmailConfig',
  'NotificationTemplate',
  'Plan',
  'Promo',
  'carrier_catalog_meta',
  'grid_preference',
  'grid_view',
  'route_matrix_cache',
] as const;

// ---------------------------------------------------------------------------
// Class (b) — FORCE RLS enabled, full CRUD grants, ZERO policies (3 tables).
// Source: coverage doc "Class (b) — 3 tables, and this is worse than the
// grant gap".
// ---------------------------------------------------------------------------
export const PREDICTED_CLASS_B: readonly string[] = [
  'stops',
  'route_template_stops',
  'carrier_documents',
] as const;

// ---------------------------------------------------------------------------
// Class (c) — RLS enabled, zero policies, NOT forced (1 table). Also a
// member of class (a) — it has no grant either. Source: coverage doc
// "Class (c) — 1 table".
// ---------------------------------------------------------------------------
export const PREDICTED_CLASS_C: readonly string[] = ['_prisma_migrations'] as const;

// ---------------------------------------------------------------------------
// Control — same carrier family as the class (b) tables, correctly has 2
// policies. Used as the "this is what healthy looks like" comparison in
// suite 3.
// ---------------------------------------------------------------------------
export const CONTROL_TABLE = 'facilities';

// ---------------------------------------------------------------------------
// The union of every table this harness touches, for the runtime discovery
// pass (suite 1(e) in the plan). Deduplicated by the harness itself, not
// here — this is just the source list.
// ---------------------------------------------------------------------------
export const ALL_PREDICTED_TABLES: readonly string[] = [
  ...PREDICTED_CLASS_A,
  ...PREDICTED_CLASS_B,
  ...PREDICTED_CLASS_C,
  CONTROL_TABLE,
];

// ---------------------------------------------------------------------------
// The six quick-588 transaction roots.
//
// PATH CORRECTION (fact 2 of the plan): the brief's file list was wrong for
// two of the six roots. The real paths, re-verified against the tree before
// this file was written:
//   - apps/web/src/app/(driver)/actions/driver-routes.ts
//       (getMyActiveDispatch, getMyDispatchHistory)
//   - apps/web/src/app/(driver)/actions/driver-load.ts
//       (getMyLoads)
// The other three files were confirmed present as given:
//   - apps/web/src/app/api/mobile/carrier/driver/dispatches/route.ts
//   - apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/route.ts
//   - apps/web/src/app/(owner)/carrier/stops/[id]/page.tsx
//
// Six roots, not five files: driver-routes.ts contributes two (its two
// exported query functions), which is where the sixth comes from.
//
// Physical table names, each cited to the schema.prisma @@map line it came
// from (verified 2026-09-03):
//   CarrierDriver   -> "carrier_drivers"      (schema.prisma:2125 model, @@map line 59 of that model)
//   Trip            -> "dispatches"           (schema.prisma:2373 model, @@map line 62 of that model)
//   CarrierLoad     -> "loads"                (schema.prisma:2437 model, @@map line 65 of that model)
//   CarrierStop     -> "stops"                (schema.prisma:2504 model, @@map line 73 of that model)
//   CarrierDocument -> "carrier_documents"    (schema.prisma:2579 model, @@map line 39 of that model)
//   CarrierExpense  -> "carrier_expenses"     (schema.prisma:2873 model, @@map line 39 of that model)
//
// `tables` is ordered: the anchor table (the one this root's tenant-scoping
// predicate actually filters — `carrier_drivers` or `dispatches`, both of
// which carry a real `org_id` column) always comes first, followed by every
// nested table the root reads. Every nested table in all six roots has a
// DIRECT `dispatch_id` foreign key to `dispatches` (confirmed against
// schema.prisma — CarrierStop, CarrierDocument, CarrierExpense and
// CarrierLoad all carry `dispatchId`), so suite 5 can join each nested table
// to `dispatches` in a single hop without guessing an intermediate path.
// ---------------------------------------------------------------------------

export interface TransactionRoot {
  id: string;
  file: string;
  fn: string;
  /** Anchor table first, then every nested table, all direct-FK-to-anchor-chain. */
  tables: readonly string[];
}

export const TRANSACTION_ROOTS: readonly TransactionRoot[] = [
  {
    id: 'A',
    file: 'apps/web/src/app/(driver)/actions/driver-routes.ts',
    fn: 'getMyActiveDispatch',
    tables: ['carrier_drivers', 'dispatches', 'stops', 'carrier_documents', 'loads'],
  },
  {
    id: 'B',
    file: 'apps/web/src/app/(driver)/actions/driver-routes.ts',
    fn: 'getMyDispatchHistory',
    tables: ['carrier_drivers', 'dispatches', 'stops', 'carrier_documents', 'loads'],
  },
  {
    id: 'C',
    file: 'apps/web/src/app/(driver)/actions/driver-load.ts',
    fn: 'getMyLoads',
    tables: ['carrier_drivers', 'dispatches', 'loads', 'stops'],
  },
  {
    id: 'D',
    file: 'apps/web/src/app/api/mobile/carrier/driver/dispatches/route.ts',
    fn: 'GET (list)',
    tables: ['carrier_drivers', 'dispatches', 'stops', 'carrier_documents'],
  },
  {
    id: 'E',
    file: 'apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/route.ts',
    fn: 'GET (detail)',
    tables: ['carrier_drivers', 'dispatches', 'stops', 'carrier_documents', 'carrier_expenses'],
  },
  {
    id: 'F',
    file: 'apps/web/src/app/(owner)/carrier/stops/[id]/page.tsx',
    fn: 'StopDetailPage (tenantPrisma.carrierDocument.findMany)',
    tables: ['dispatches', 'carrier_documents'],
  },
] as const;

// Every table named by TRANSACTION_ROOTS, deduplicated, for the runtime
// discovery pass — this file does not resolve them itself.
export const TRANSACTION_ROOT_TABLES: readonly string[] = Array.from(
  new Set(TRANSACTION_ROOTS.flatMap((r) => r.tables)),
);
