import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../../.playwright/auth/owner.json') });

/**
 * TKT-0077 / TKT-0063 — Driver portal access must be manageable from the driver
 * detail page: see whether access is granted, grant it (first-time invite),
 * resend a pending invite, and revoke/restore. These read-only assertions
 * verify the correct state-driven control appears; they intentionally do NOT
 * click grant/revoke (that would send real emails / flip live state).
 *
 * Uses known demo-tenant drivers; each case self-skips if the driver has since
 * moved to a different access state.
 */
const CASES = [
  {
    id: '1f62b66d-9b85-4e7f-b67e-b2d825eac8df', // Carlos Rivera — no user, no email
    label: 'none / no email → disabled Grant',
    badge: 'No portal access',
    button: 'Grant portal access',
    disabled: true,
  },
  {
    id: 'c0b860f3-0336-45ed-9d57-86d85ad1640b', // John Doe — pending invitation
    label: 'pending → Resend invitation',
    badge: 'Invitation pending',
    button: 'Resend invitation',
    disabled: false,
  },
  {
    id: '3840eddc-b534-482b-8182-bea0a6617b13', // Michael Jordan — active account
    label: 'active → Revoke access',
    badge: 'Portal access active',
    button: 'Revoke access',
    disabled: false,
  },
];

test.describe('Carrier Driver — Portal access controls (TKT-0077/0063)', () => {
  for (const c of CASES) {
    test(`shows status + correct control: ${c.label}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name === 'mobile', 'Desktop driver detail actions');

      await page.goto(`/carrier/fleet/drivers/${c.id}`);
      await page.waitForLoadState('domcontentloaded');

      const desktop = page.locator('div.hidden.lg\\:block.space-y-6').first();

      // TKT-0063: the current access state must be visible.
      const badge = desktop.getByText(c.badge, { exact: true });
      if ((await badge.count()) === 0) {
        test.skip(true, `driver no longer in '${c.badge}' state`);
        return;
      }
      await expect(badge.first()).toBeVisible();

      // TKT-0077: the matching grant/resend/revoke control is present.
      const btn = desktop.getByRole('button', { name: c.button }).first();
      await expect(btn).toBeVisible();
      if (c.disabled) {
        await expect(btn).toBeDisabled();
      } else {
        await expect(btn).toBeEnabled();
      }
    });
  }
});
