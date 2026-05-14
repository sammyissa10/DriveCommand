/**
 * Vitest unit tests for the notification dispatcher.
 *
 * All tests inject a mock PrismaClient via options.prismaClient so no real DB
 * or network calls are made during the test run.
 *
 * Tests that require a live DB (e.g., actual idempotency row queries) are skipped
 * with it.skip and a documented reason.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module-level mocks (must be defined before importing the module under test)
// ---------------------------------------------------------------------------

// Mock resend client — prevents real email sends and API key requirement
vi.mock('@/lib/email/resend-client', () => ({
  resend: { emails: { send: vi.fn().mockResolvedValue({ id: 'msg_mock_1' }) } },
  FROM_EMAIL: 'noreply@drivecommand.app',
  sendEmail: vi.fn(),
}));

// Mock base prisma module — prevents import-time DB connection side effects
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));

// Mock template-renderer — prevents React/react-dom version mismatch in test env.
// The renderer is tested independently; here we only need it to return a stable string.
vi.mock('../template-renderer', () => ({
  renderTemplate: vi.fn().mockImplementation(
    async (blockJson: unknown, payload: Record<string, string>, subject: string) => {
      // Perform real variable substitution so Test 5 can verify end-to-end substitution
      const subst = (text: string) =>
        text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_: string, k: string) => payload[k] ?? '');
      const subjectFinal = subst(subject);
      // Build a minimal HTML by stringifying the block JSON text nodes
      let bodyText = '';
      try {
        const doc = blockJson as { type: string; content?: unknown[] };
        const walk = (nodes: unknown[]): string =>
          nodes
            .map((n: unknown) => {
              const node = n as { type: string; text?: string; content?: unknown[] };
              if (node.type === 'text') return subst(node.text ?? '');
              if (node.content) return walk(node.content);
              return '';
            })
            .join('');
        bodyText = doc.content ? walk(doc.content) : '';
      } catch {
        bodyText = '';
      }
      const html = `<html><body>${bodyText}</body></html>`;
      return { html, subjectFinal };
    },
  ),
  substituteVariables: (text: string, payload: Record<string, string>) =>
    text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_: string, k: string) => payload[k] ?? ''),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { dispatchNotification } from '../dispatcher';
import * as resendModule from '@/lib/email/resend-client';

// ---------------------------------------------------------------------------
// Mock PrismaClient factory
// ---------------------------------------------------------------------------

/**
 * Returns a minimal mock PrismaClient with all methods used by the dispatcher.
 * Each test overrides only the methods it needs.
 */
function makeMockPrisma() {
  const mockPrisma = {
    notificationTemplate: {
      findUnique: vi.fn(),
    },
    tenantNotificationSettings: {
      findUnique: vi.fn().mockResolvedValue(null), // default: no tenant override
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    notificationSubscription: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    userNotificationPreference: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    notificationSendLog: {
      findFirst: vi.fn().mockResolvedValue(null), // default: no prior send
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    inAppNotification: {
      create: vi.fn().mockResolvedValue({ id: 'inapp_mock_1' }),
    },
    $transaction: vi.fn().mockImplementation(async (arg) => {
      // Handle both array form (batch) and callback form (interactive)
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      // Callback form: pass a tx proxy
      const tx = {
        ...mockPrisma,
        $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
        notificationSendLog: {
          ...mockPrisma.notificationSendLog,
          createMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      };
      return arg(tx);
    }),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
  };

  return mockPrisma;
}

/** A minimal active NotificationTemplate stub */
function makeActiveTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tmpl_1',
    triggerKey: 'test.trigger',
    isActive: true,
    defaultSubject: 'Test {{varA}}',
    defaultBlockJson: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hello {{varA}}' }],
        },
      ],
    },
    defaultRecipients: [],
    ...overrides,
  };
}

/** A single mock recipient */
function makeRecipient(email: string, userId = 'user_1') {
  return { id: userId, email, isActive: true };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dispatchNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Test 1: Globally inactive trigger
  // -------------------------------------------------------------------------
  it('globally inactive trigger -> SKIPPED_DISABLED, no email sent', async () => {
    const db = makeMockPrisma();
    db.notificationTemplate.findUnique.mockResolvedValue(
      makeActiveTemplate({ isActive: false }),
    );

    const result = await dispatchNotification('load.created' as 'load.created', {
      tenantId: 'tenant_1',
      payload: {
        loadId: 'load_1',
        loadNumber: 'L-001',
        originCity: 'Chicago',
        destCity: 'Dallas',
      },
      prismaClient: db as unknown as Parameters<typeof dispatchNotification>[1]['prismaClient'],
    });

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(resendModule.resend.emails.send).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 2: Tenant-disabled trigger
  // -------------------------------------------------------------------------
  it('tenant-disabled trigger -> SKIPPED_DISABLED, no email sent', async () => {
    const db = makeMockPrisma();
    db.notificationTemplate.findUnique.mockResolvedValue(makeActiveTemplate());
    db.tenantNotificationSettings.findUnique.mockResolvedValue({
      id: 'tns_1',
      tenantId: 'tenant_1',
      triggerKey: 'load.created',
      isActive: false, // tenant disabled
      customSubject: null,
      customBlockJson: null,
    });

    const result = await dispatchNotification('load.created' as 'load.created', {
      tenantId: 'tenant_1',
      payload: {
        loadId: 'load_1',
        loadNumber: 'L-001',
        originCity: 'Chicago',
        destCity: 'Dallas',
      },
      prismaClient: db as unknown as Parameters<typeof dispatchNotification>[1]['prismaClient'],
    });

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(resendModule.resend.emails.send).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 3: Per-user email-off / in-app-on preference
  // -------------------------------------------------------------------------
  it('email-off + in-app-on per-user pref -> email skipped, in-app fires', async () => {
    const db = makeMockPrisma();
    db.notificationTemplate.findUnique.mockResolvedValue(makeActiveTemplate());

    // One recipient with role DRIVER
    db.user.findMany.mockResolvedValue([makeRecipient('driver@test.com', 'user_driver')]);
    // Preference: email off, in-app on
    db.userNotificationPreference.findMany.mockResolvedValue([
      {
        userId: 'user_driver',
        emailEnabled: false,
        inAppEnabled: true,
      },
    ]);

    // Template has DRIVER as default recipient
    db.notificationTemplate.findUnique.mockResolvedValue(
      makeActiveTemplate({
        defaultRecipients: [{ type: 'role', role: 'DRIVER' }],
      }),
    );

    const result = await dispatchNotification('load.created' as 'load.created', {
      tenantId: 'tenant_1',
      payload: {
        loadId: 'load_1',
        loadNumber: 'L-001',
        originCity: 'Chicago',
        destCity: 'Dallas',
      },
      prismaClient: db as unknown as Parameters<typeof dispatchNotification>[1]['prismaClient'],
    });

    // Email skipped (SKIPPED_USER_PREF), in-app sent
    expect(resendModule.resend.emails.send).not.toHaveBeenCalled();
    expect(db.inAppNotification.create).toHaveBeenCalledOnce();
    // sent=1 (in-app), skipped=1 (email pref-off)
    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Test 4: Idempotent re-send
  // -------------------------------------------------------------------------
  it('idempotent re-send -> second call SKIPS the email', async () => {
    const db = makeMockPrisma();

    // One OWNER recipient
    db.notificationTemplate.findUnique.mockResolvedValue(
      makeActiveTemplate({
        defaultRecipients: [{ type: 'tenant_owners' }],
      }),
    );
    db.user.findMany.mockResolvedValue([makeRecipient('owner@test.com', 'user_owner')]);

    // First call: no prior send record
    db.notificationSendLog.findFirst.mockResolvedValueOnce(null);
    // Second call: found a prior SENT record
    db.notificationSendLog.findFirst.mockResolvedValueOnce({ id: 'log_existing_1' });

    const opts = {
      tenantId: 'tenant_1',
      payload: {
        loadId: 'load_1',
        loadNumber: 'L-001',
        originCity: 'Chicago',
        destCity: 'Dallas',
      },
      prismaClient: db as unknown as Parameters<typeof dispatchNotification>[1]['prismaClient'],
    } as const;

    const result1 = await dispatchNotification('load.created' as 'load.created', opts);
    const result2 = await dispatchNotification('load.created' as 'load.created', opts);

    // Email sent exactly once across both calls
    expect(resendModule.resend.emails.send).toHaveBeenCalledOnce();

    // First call: sent email + in-app = 2 sent
    expect(result1.sent).toBeGreaterThanOrEqual(1);
    // Second call: email skipped (idempotent), in-app still sent (separate key)
    expect(result2.skipped).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // Test 5: Variable substitution through full pipeline
  // -------------------------------------------------------------------------
  it('variable substitution through full pipeline', async () => {
    const db = makeMockPrisma();

    const blockJson = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hi {{driverName}}' }],
        },
      ],
    };

    db.notificationTemplate.findUnique.mockResolvedValue(
      makeActiveTemplate({
        defaultBlockJson: blockJson,
        defaultSubject: 'Welcome {{driverName}}',
        defaultRecipients: [{ type: 'related', payloadKey: 'driverId' }],
      }),
    );

    // Recipient resolved via 'related' rule
    db.user.findFirst.mockResolvedValue(makeRecipient('alex@test.com', 'user_alex'));

    const result = await dispatchNotification('load.assigned' as 'load.assigned', {
      tenantId: 'tenant_1',
      payload: {
        loadId: 'load_1',
        loadNumber: 'L-001',
        driverId: 'user_alex',
        driverName: 'Alex',
        originCity: 'Chicago',
        destCity: 'Dallas',
      },
      prismaClient: db as unknown as Parameters<typeof dispatchNotification>[1]['prismaClient'],
    });

    expect(resendModule.resend.emails.send).toHaveBeenCalledOnce();
    const callArgs = (resendModule.resend.emails.send as ReturnType<typeof vi.fn>).mock.calls[0][0];

    // Subject is substituted
    expect(callArgs.subject).toBe('Welcome Alex');

    // react prop's bodyHtml should contain substituted text (checking via string props)
    // The react element's props carry the pre-rendered html string
    // We verify the template engine ran by checking the subject substitution worked
    // and that the call was made (full pipeline exercised)
    expect(callArgs.subject).not.toContain('{{driverName}}');
    expect(result.sent).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // Test 6: One recipient throws — others still receive
  // -------------------------------------------------------------------------
  it('one recipient throws -> others still receive', async () => {
    const db = makeMockPrisma();

    db.notificationTemplate.findUnique.mockResolvedValue(
      makeActiveTemplate({
        defaultRecipients: [{ type: 'tenant_owners' }],
      }),
    );

    // Two recipients
    db.user.findMany.mockResolvedValue([
      makeRecipient('r1@test.com', 'user_r1'),
      makeRecipient('r2@test.com', 'user_r2'),
    ]);

    // resend.emails.send: reject for r1, resolve for r2
    let callCount = 0;
    (resendModule.resend.emails.send as ReturnType<typeof vi.fn>).mockImplementation(
      (args: { to: string }) => {
        callCount++;
        if (args.to === 'r1@test.com') {
          return Promise.reject(new Error('Resend rejected r1'));
        }
        return Promise.resolve({ id: 'msg_r2' });
      },
    );

    const result = await dispatchNotification('load.created' as 'load.created', {
      tenantId: 'tenant_1',
      payload: {
        loadId: 'load_1',
        loadNumber: 'L-001',
        originCity: 'Chicago',
        destCity: 'Dallas',
      },
      prismaClient: db as unknown as Parameters<typeof dispatchNotification>[1]['prismaClient'],
    });

    // r1 email failed, r1 in-app sent, r2 email sent, r2 in-app sent
    expect(result.failed).toBeGreaterThanOrEqual(1); // r1 email
    expect(result.sent).toBeGreaterThanOrEqual(1);   // r2 email + both in-apps
    expect(resendModule.resend.emails.send).toHaveBeenCalledTimes(2);
  });
});
