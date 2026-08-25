/**
 * Document Import Phase 10 — the two properties that make or break Section 13.
 *
 * These are not coverage tests. Each one pins a decision that is easy to undo by
 * accident and whose failure would be silent in production:
 *
 *  1. SUBSCRIPTION IS THE WHOLE AUDIENCE for the six subscriber triggers. The
 *     phase brief names "notifications going to all owners regardless of
 *     subscription" as the most likely drift, and the only thing preventing it
 *     is `defaultRecipients: []` in the seed. A future edit adding a
 *     `tenant_owners` rule "so owners see it too" would break the acceptance
 *     test and look like a helpful change.
 *
 *  2. THE DEDUP WINDOW IS OPT-IN. Every pre-Phase-10 trigger must keep the
 *     behaviour it had. If `dedupWindowMs` ever acquired a default, 37 existing
 *     triggers would start suppressing sends nobody asked them to suppress.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NOTIFICATION_DEDUP_WINDOW_MS } from '../notification-constants';
import { resolveRecipients } from '../recipient-resolver';
import { wasSentWithinWindow } from '../idempotency';
import { tripTemplates } from '../../../../prisma/seeds/notification-template-data/trip';
import { importTemplates } from '../../../../prisma/seeds/notification-template-data/import';
import type { PrismaClient } from '@/generated/prisma/client';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  serializeError: (e: unknown) => ({ message: String(e) }),
}));

// ---------------------------------------------------------------------------
// 1. The seed shape — audiences, channels, and Section 13's table
// ---------------------------------------------------------------------------

const ALL = [...tripTemplates, ...importTemplates];

/** Section 13's audience column, transcribed. */
const SUBSCRIBER_TRIGGERS = [
  'inspection.passed',
  'inspection.passed_with_defects',
  'inspection.failed',
  'inspection.overridden',
  'trip.started',
  'trip.completed',
];

/** Section 13's rows that name Push in the Channels column. */
const PUSH_TRIGGERS = ['trip.assigned', 'trip.reminder', 'inspection.failed'];

describe('Phase 10 seed — Section 13 table', () => {
  it('registers exactly ten triggers', () => {
    // Seven ROWS in Section 13, three of them compound (the `·`).
    expect(ALL).toHaveLength(10);
  });

  it('gives every SUBSCRIBERS trigger an EMPTY defaultRecipients', () => {
    // THE acceptance test, expressed at the only layer that can guarantee it.
    // `resolveRecipients` unions rules with subscriptions; with no rules, the
    // union has exactly one source. Adding any rule here would silently address
    // people who never subscribed.
    for (const key of SUBSCRIBER_TRIGGERS) {
      const seed = ALL.find((t) => t.triggerKey === key);
      expect(seed, `${key} missing from the seed`).toBeDefined();
      expect(seed!.defaultRecipients, `${key} must have no recipient rules`).toEqual([]);
    }
  });

  it('gives every targeted trigger exactly one `related` rule', () => {
    // The four whose Section 13 audience is Driver or Uploader — a named
    // person, not a subscriber list.
    const targeted = ALL.filter((t) => !SUBSCRIBER_TRIGGERS.includes(t.triggerKey));
    expect(targeted.map((t) => t.triggerKey).sort()).toEqual([
      'import.failed',
      'import.needs_review',
      'trip.assigned',
      'trip.reminder',
    ]);
    for (const seed of targeted) {
      expect(seed.defaultRecipients).toHaveLength(1);
      expect(seed.defaultRecipients[0].type).toBe('related');
    }
  });

  it('enables push on exactly the three triggers whose row names Push', () => {
    for (const seed of ALL) {
      const shouldPush = PUSH_TRIGGERS.includes(seed.triggerKey);
      expect(seed.pushEnabled ?? false, `${seed.triggerKey} push`).toBe(shouldPush);
    }
  });

  it('never uses a {{token}} it has not declared', () => {
    // The seed runner enforces this too; asserted here so a bad template fails
    // in CI rather than at the moment somebody runs the seed against prod.
    for (const seed of ALL) {
      const declared = new Set(seed.availableVariables.map((v) => v.name));
      const text = seed.defaultSubject + JSON.stringify(seed.defaultBlockJson);
      for (const [, token] of text.matchAll(/\{\{(\w+)\}\}/g)) {
        expect(declared.has(token), `${seed.triggerKey} uses undeclared {{${token}}}`).toBe(true);
      }
    }
  });

  it('names the driver, truck, trip and failed items on inspection.failed', () => {
    // Section 13 item 4 names these four explicitly for this trigger.
    const seed = ALL.find((t) => t.triggerKey === 'inspection.failed')!;
    const declared = seed.availableVariables.map((v) => v.name);
    for (const v of ['driverName', 'truckUnit', 'tripNumber', 'failedItems']) {
      expect(declared).toContain(v);
    }
  });

  it('names the overriding user and the reason on inspection.overridden', () => {
    const seed = ALL.find((t) => t.triggerKey === 'inspection.overridden')!;
    const declared = seed.availableVariables.map((v) => v.name);
    expect(declared).toContain('overriddenBy');
    expect(declared).toContain('reason');
  });
});

// ---------------------------------------------------------------------------
// 2. The resolver — an empty rule set really does mean subscribers only
// ---------------------------------------------------------------------------

function fakeDb(over: Record<string, unknown> = {}) {
  return {
    user: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    notificationSubscription: { findMany: vi.fn().mockResolvedValue([]) },
    userNotificationPreference: { findMany: vi.fn().mockResolvedValue([]) },
    ...over,
  } as unknown as PrismaClient;
}

describe('resolveRecipients — subscription is the whole audience when there are no rules', () => {
  it('returns ONLY subscribers, and never queries the user table by role', async () => {
    const db = fakeDb({
      notificationSubscription: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ user: { id: 'u-sub', email: 'sub@x.com', isActive: true } }]),
      },
    });

    const out = await resolveRecipients(db, 'tenant-1', 'inspection.failed', [], {});

    expect(out.map((r) => r.userId)).toEqual(['u-sub']);
    // The proof that no broadcast happened: with no rules, the role/owner
    // lookup is never even attempted.
    expect((db as unknown as { user: { findMany: ReturnType<typeof vi.fn> } }).user.findMany)
      .not.toHaveBeenCalled();
  });

  it('returns NOBODY when nobody has subscribed', async () => {
    // "An unsubscribed owner receives nothing" — the phase brief's acceptance
    // test, at the resolver.
    const out = await resolveRecipients(fakeDb(), 'tenant-1', 'trip.started', [], {});
    expect(out).toEqual([]);
  });

  it('DOES broadcast when a rule is present — the behaviour being avoided', async () => {
    // Deliberately asserting the dangerous behaviour exists, so the previous
    // two tests cannot be read as "the resolver is safe by nature". It is not;
    // the seed's empty array is what makes it safe.
    const db = fakeDb({
      user: {
        findMany: vi.fn().mockResolvedValue([{ id: 'u-owner', email: 'owner@x.com' }]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    });
    const out = await resolveRecipients(db, 'tenant-1', 'driver.hos_violation', [
      { type: 'tenant_owners' },
    ], {});
    expect(out.map((r) => r.userId)).toEqual(['u-owner']);
  });

  it('defaults pushEnabled to true when the user has no preference row', async () => {
    const db = fakeDb({
      notificationSubscription: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ user: { id: 'u1', email: 'a@x.com', isActive: true } }]),
      },
    });
    const out = await resolveRecipients(db, 't', 'trip.started', [], {});
    expect(out[0].pushEnabled).toBe(true);
  });

  it('never offers push to an external-email recipient', async () => {
    // PushToken.userId is a non-null FK — there is no device to send to.
    const db = fakeDb({
      user: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    });
    const out = await resolveRecipients(db, 't', 'user.invited', [
      { type: 'external_email', payloadKey: 'invitedEmail' },
    ], { invitedEmail: 'nobody@x.com' });
    expect(out).toHaveLength(1);
    expect(out[0].userId).toBeNull();
    expect(out[0].pushEnabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. The rolling window
// ---------------------------------------------------------------------------

describe('wasSentWithinWindow', () => {
  let findFirst: ReturnType<typeof vi.fn>;
  let db: PrismaClient;

  beforeEach(() => {
    findFirst = vi.fn().mockResolvedValue(null);
    db = { notificationSendLog: { findFirst } } as unknown as PrismaClient;
  });

  const base = {
    triggerKey: 'inspection.failed',
    relatedEntity: { type: 'trip', id: 'trip-1' },
    recipientUserId: 'u1',
    recipientEmail: null,
    channel: 'IN_APP' as const,
    windowMs: NOTIFICATION_DEDUP_WINDOW_MS,
  };

  it('looks back exactly one window from now, not to a bucket boundary', async () => {
    // The bug this avoids: `floor(now / WINDOW)` puts an edge in the timeline,
    // and two emits 10 ms apart either side of it both send. Same class as
    // quick-541's UTC midnight. A lookback has no edge.
    const now = new Date('2026-08-25T12:00:00.000Z');
    await wasSentWithinWindow(db, { ...base, now });

    const since = findFirst.mock.calls[0][0].where.createdAt.gte as Date;
    expect(now.getTime() - since.getTime()).toBe(NOTIFICATION_DEDUP_WINDOW_MS);
    // Explicitly NOT a rounded boundary.
    expect(since.toISOString()).toBe('2026-08-25T11:55:00.000Z');
  });

  it('matches on channel, so suppressing an email does not suppress the push', async () => {
    await wasSentWithinWindow(db, { ...base, channel: 'PUSH' });
    expect(findFirst.mock.calls[0][0].where.channel).toBe('PUSH');
  });

  it('scopes to the entity, so another trip is never suppressed', async () => {
    await wasSentWithinWindow(db, base);
    const where = findFirst.mock.calls[0][0].where;
    expect(where.relatedEntityId).toBe('trip-1');
    expect(where.relatedEntityType).toBe('trip');
  });

  it('matches an entity-less trigger on NULL rather than on any entity', async () => {
    await wasSentWithinWindow(db, { ...base, relatedEntity: undefined });
    const where = findFirst.mock.calls[0][0].where;
    expect(where.relatedEntityId).toBeNull();
  });

  it('keys an external-email recipient by address, not by a null user id', async () => {
    await wasSentWithinWindow(db, {
      ...base,
      recipientUserId: null,
      recipientEmail: 'a@x.com',
      channel: 'EMAIL',
    });
    const where = findFirst.mock.calls[0][0].where;
    expect(where.recipientUserId).toBeNull();
    expect(where.recipientEmail).toBe('a@x.com');
  });

  it('reports a duplicate when a SENT row is inside the window', async () => {
    findFirst.mockResolvedValue({ id: 'log-1' });
    await expect(wasSentWithinWindow(db, base)).resolves.toBe(true);
  });

  it('FAILS OPEN on a database error', async () => {
    // Failing open duplicates a notification. Failing closed loses one — and
    // the one it would lose is "your brakes failed and the trip is blocked".
    findFirst.mockRejectedValue(new Error('connection reset'));
    await expect(wasSentWithinWindow(db, base)).resolves.toBe(false);
  });

  it('only counts SENT rows', async () => {
    await wasSentWithinWindow(db, base);
    expect(findFirst.mock.calls[0][0].where.status).toBe('SENT');
  });
});

describe('NOTIFICATION_DEDUP_WINDOW_MS', () => {
  it('is five minutes', () => {
    expect(NOTIFICATION_DEDUP_WINDOW_MS).toBe(300_000);
  });

  it('is long enough to absorb a backed-off retry', () => {
    // The floor from the constant's own reasoning: a 5xx retry can land 30–60s
    // later, which the pre-existing same-ISO-second scope misses entirely.
    expect(NOTIFICATION_DEDUP_WINDOW_MS).toBeGreaterThan(60_000);
  });
});
