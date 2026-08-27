/**
 * in-app-failure-visibility.test.ts — quick-555.
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * A driver failed a critical brake item. The gate blocked the trip, the defect
 * was recorded, and `NotificationSendLog` logged three rows for
 * `inspection.failed`: EMAIL SENT, PUSH SENT, **IN_APP FAILED**.
 *
 * Nothing anywhere said why. The IN_APP catch in `dispatcher.ts` had no
 * `logger` call at all — the reason reached `NotificationSendLog.errorMessage`
 * and stopped there, in a table nobody queries. PUSH had carried the correct
 * `logger.error(message, error, context)` call since it was written, complete
 * with the DEC-11 §3 note about the error going second. EMAIL and IN_APP had
 * not. The rule was applied to one channel of three.
 *
 * The actual cause, captured by re-running the real writer against production
 * rather than inferred from the code: Prisma **P2002**, Postgres **23505**, on
 * `in_app_notifications_org_id_entity_id_type_key` — `UNIQUE (org_id,
 * entity_id, type)`, a key with **no `user_id`** — and the row holding the slot
 * belonged to a DIFFERENT user, written by a DIFFERENT trigger
 * (`trip.assigned`, "New trip 45a84a80 — …").
 *
 * ─── WHAT THIS FILE GUARANTEES ──────────────────────────────────────────────
 *
 * An IN_APP send may never record FAILED without surfacing a reason. That is the
 * one property; everything below is a way of failing if it stops holding.
 *
 * ─── HOW IT FAILS ───────────────────────────────────────────────────────────
 *
 *  - Delete the `logger.error` from the IN_APP catch and "a real error is
 *    logged, not just recorded" goes red: the audit row still says FAILED and
 *    `logger.error` was never called, which is precisely the silent state.
 *  - Delete it from the slot-taken branch and "a dropped notification is loud"
 *    goes red the same way.
 *  - Make the slot-taken branch record FAILED for a genuine duplicate, or
 *    SKIPPED_IDEMPOTENT for somebody else's row, and the two classification
 *    tests go red — the first would re-bury real losses among benign ones, the
 *    second would report a lost notification as fine.
 *  - Add a fourth channel whose catch records FAILED with no log, and the source
 *    scan at the bottom names the line. That is the one assertion that covers
 *    code nobody has written yet.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('@/lib/email/resend-client', () => ({
  resend: { emails: { send: vi.fn().mockResolvedValue({ id: 'msg_mock_1' }) } },
  FROM_EMAIL: 'noreply@drivecommand.app',
  sendEmail: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));

vi.mock('@/lib/logger', async () => {
  const actual = await vi.importActual<typeof import('@/lib/logger')>('@/lib/logger');
  return {
    ...actual,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});

import { dispatchNotification } from '../dispatcher';
import { logger } from '@/lib/logger';

const TENANT = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const OTHER_USER = '33333333-3333-3333-3333-333333333333';
const TRIP = '44444444-4444-4444-4444-444444444444';

/** Prisma's shape for a unique-constraint violation, as the real driver raises it. */
function p2002(): Error & { code: string; meta: unknown } {
  const err = new Error(
    'Invalid `prisma.inAppNotification.create()` invocation:\n\nUnique constraint failed on the fields: (`org_id`, `entity_id`, `type`)'
  ) as Error & { code: string; meta: unknown };
  err.code = 'P2002';
  err.meta = { modelName: 'InAppNotification', target: ['org_id', 'entity_id', 'type'] };
  return err;
}

type Audit = { channel: string; status: string; errorMessage?: string | null };

/**
 * Runs the REAL dispatcher against a mock Prisma, and returns the audit rows it
 * actually wrote. Only the database and the email transport are stubbed — the
 * classification logic under test runs for real.
 */
async function dispatchWith(opts: {
  createImpl: () => Promise<unknown>;
  occupant?: { id: string; userId: string | null; title: string; createdAt: Date } | null;
}): Promise<Audit[]> {
  const captured: Audit[] = [];

  const mockPrisma: Record<string, unknown> = {
    notificationTemplate: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'tmpl_1',
        triggerKey: 'inspection.failed',
        isActive: true,
        defaultSubject: 'Trip blocked — inspection failed',
        defaultBlockJson: { type: 'doc', content: [] },
        defaultHtmlCache: '<p>Trip blocked</p>',
        defaultRecipients: [],
      }),
    },
    tenantNotificationSettings: { findUnique: vi.fn().mockResolvedValue(null) },
    user: {
      findMany: vi.fn().mockResolvedValue([{ id: USER, email: 'owner@example.com', isActive: true }]),
      findFirst: vi.fn().mockResolvedValue({ id: USER, email: 'owner@example.com', isActive: true }),
    },
    notificationSubscription: {
      findMany: vi.fn().mockResolvedValue([{ userId: USER, user: { id: USER, email: 'owner@example.com', isActive: true } }]),
    },
    userNotificationPreference: { findMany: vi.fn().mockResolvedValue([]) },
    notificationSendLog: {
      findFirst: vi.fn().mockResolvedValue(null),
      createMany: vi.fn().mockImplementation(async ({ data }: { data: Audit[] }) => {
        captured.push(...data);
        return { count: data.length };
      }),
    },
    inAppNotification: {
      create: vi.fn().mockImplementation(opts.createImpl),
      findFirst: vi.fn().mockResolvedValue(opts.occupant ?? null),
    },
    pushToken: { findMany: vi.fn().mockResolvedValue([]) },
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
  };

  mockPrisma.$transaction = vi.fn().mockImplementation(async (arg: unknown) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    const tx = {
      ...mockPrisma,
      $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
      notificationSendLog: mockPrisma.notificationSendLog,
    };
    return (arg as (t: unknown) => unknown)(tx);
  });

  await dispatchNotification('inspection.failed' as never, {
    tenantId: TENANT,
    variables: {},
    relatedEntity: { type: 'trip', id: TRIP },
    prismaClient: mockPrisma as never,
  } as never);

  return captured;
}

const inApp = (audits: Audit[]) => audits.find((a) => a.channel === 'IN_APP');

describe('an IN_APP failure is never silent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a real error is logged, not just recorded in NotificationSendLog', async () => {
    // The exact silent state this task exists to remove: a FAILED audit row and
    // nothing anywhere saying why.
    const boom = new Error('connection terminated unexpectedly');
    const audits = await dispatchWith({ createImpl: async () => { throw boom; } });

    expect(inApp(audits)?.status).toBe('FAILED');

    const call = vi.mocked(logger.error).mock.calls.find((c) => String(c[0]).includes('in-app'));
    expect(
      call,
      'IN_APP recorded FAILED and logger.error was never called. That is the silent ' +
        'failure quick-555 exists to remove — the reason reaches NotificationSendLog ' +
        'and nowhere else, so nobody learns a notification was lost.'
    ).toBeDefined();

    // Error SECOND — DEC-11 §3. Passing it as the context collapses it to
    // `Error: [object Object]` and tells Sentry nothing, which is a different
    // way of being silent.
    expect(call?.[1]).toBe(boom);
    expect(call?.[2]).toMatchObject({ triggerKey: 'inspection.failed', recipientUserId: USER });
  });

  it('a dropped notification is LOUD and says why in words', async () => {
    // The production case: the slot is held by another user's row from another
    // trigger. This recipient's notification is lost.
    const audits = await dispatchWith({
      createImpl: async () => { throw p2002(); },
      occupant: {
        id: 'occ_1',
        userId: OTHER_USER,
        title: 'New trip 45a84a80 — BOUCHER KIA OF MILWAUKEE',
        createdAt: new Date('2026-08-27T02:13:01Z'),
      },
    });

    const row = inApp(audits);
    expect(row?.status).toBe('FAILED');

    // A Prisma stack trace is not a reason. The row must name the cause and say
    // plainly that nothing was delivered.
    expect(row?.errorMessage).toContain('org_id, entity_id, type');
    expect(row?.errorMessage).toContain('NOT delivered');
    expect(row?.errorMessage).toContain(OTHER_USER);

    const call = vi.mocked(logger.error).mock.calls.find((c) => String(c[0]).includes('slot already held'));
    expect(call, 'a lost notification must reach the logs, not only the audit table').toBeDefined();
    expect(call?.[2]).toMatchObject({ occupantUserId: OTHER_USER });
  });

  it('a genuine duplicate is a SKIP, not a failure', async () => {
    // Same person, same subject — the dedupe the unique constraint was built
    // for. Recording this as FAILED is what buried the real losses among the
    // benign ones, so the classification has to go the other way here.
    const audits = await dispatchWith({
      createImpl: async () => { throw p2002(); },
      occupant: {
        id: 'occ_2',
        userId: USER,
        title: 'Trip blocked — inspection failed',
        createdAt: new Date('2026-08-27T02:13:01Z'),
      },
    });

    expect(inApp(audits)?.status).toBe('SKIPPED_IDEMPOTENT');
    expect(
      vi.mocked(logger.error).mock.calls.filter((c) => String(c[0]).includes('in-app')),
      'a benign duplicate must not raise an error — an alert that cries wolf gets ' +
        'muted, and then the real losses are invisible again'
    ).toEqual([]);
  });

  it('a successful write is still SENT', async () => {
    // Guards the obvious regression: classification must not swallow the happy
    // path. Without this the suite could go green by failing everything.
    const audits = await dispatchWith({ createImpl: async () => ({ id: 'inapp_1' }) });
    expect(inApp(audits)?.status).toBe('SENT');
  });
});

describe('no channel records FAILED without logging (source guard)', () => {
  // The three tests above cover the branches that exist today. This one covers
  // the branch nobody has written yet — a fourth channel, or a new catch in an
  // existing one, added with an audit row and no log. That is exactly how IN_APP
  // and EMAIL came to be silent while PUSH was not.
  const FILE = path.resolve(__dirname, '..', 'dispatcher.ts');

  /** Repo is core.autocrlf=true — normalise or the line split differs on Windows. */
  function readDispatcher(): string {
    return fs.readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n');
  }

  it('read the real dispatcher (integrity floor)', () => {
    // A bad path returning '' would make the assertion below pass vacuously.
    const src = readDispatcher();
    expect(src.length).toBeGreaterThan(5000);
    expect(src).toContain('export async function dispatchNotification');
  });

  it("every `status: 'FAILED'` audit sits within reach of a logger.error", () => {
    const lines = readDispatcher().split('\n');
    const WINDOW = 40; // a catch block's log and its audit push stay close together

    const unlogged: string[] = [];
    lines.forEach((line, i) => {
      if (!/status:\s*'FAILED'/.test(line)) return;
      const from = Math.max(0, i - WINDOW);
      const near = lines.slice(from, i + WINDOW).join('\n');
      if (!near.includes('logger.error')) unlogged.push(`line ${i + 1}: ${line.trim()}`);
    });

    expect(
      unlogged,
      unlogged.length === 0
        ? ''
        : [
            "These `status: 'FAILED'` audit rows have no logger.error near them:",
            ...unlogged.map((u) => `  - ${u}`),
            '',
            'A channel that records FAILED with nothing in the logs is invisible: the',
            'reason lands in NotificationSendLog.errorMessage and no one ever reads it.',
            'That is how inspection.failed lost an in-app notification about a blocked',
            'truck. Log it with logger.error(message, error, context) — error SECOND.',
          ].join('\n')
    ).toEqual([]);
  });
});
