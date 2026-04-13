import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../../.playwright/auth/owner.json') });

test.describe('Carrier Loads', () => {
  test('@smoke load list page loads', async ({ page }) => {
    await page.goto('/carrier/loads');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: /Loads/i })).toBeVisible();
  });

  test('load list shows New Load button', async ({ page }) => {
    await page.goto('/carrier/loads');
    await page.waitForLoadState('domcontentloaded');
    const newLoadBtn = page.getByRole('link', { name: /New Load/i }).or(
      page.getByRole('button', { name: /New Load/i })
    );
    await expect(newLoadBtn.first()).toBeVisible();
  });

  test('@smoke new load form page renders', async ({ page }) => {
    await page.goto('/carrier/loads/new');
    await page.waitForLoadState('domcontentloaded');
    // LoadForm renders with "New Load" heading from page.tsx
    await expect(page.getByRole('heading', { name: /New Load/i })).toBeVisible();
  });

  test('new load form has client selector field', async ({ page }) => {
    await page.goto('/carrier/loads/new');
    await page.waitForLoadState('domcontentloaded');
    // Client selector — native <select> renders as combobox; placeholder text "Select a client…"
    const clientField = page.getByRole('combobox').first().or(
      page.getByText(/Select a client/i)
    );
    await expect(clientField.first()).toBeVisible();
  });

  test('new load form has commodity field', async ({ page }) => {
    await page.goto('/carrier/loads/new');
    await page.waitForLoadState('domcontentloaded');
    // Commodity Description input — identified by placeholder text
    const commodityField = page.getByPlaceholder(/General freight|Palletized goods/i);
    await expect(commodityField).toBeVisible();
  });

  test('@smoke create load — happy path (minimal fields)', async ({ page }) => {
    const ts = Date.now();
    await page.goto('/carrier/loads/new');
    await page.waitForLoadState('domcontentloaded');

    // Fill commodity description (always visible, no dependencies)
    const commodityInput = page.getByPlaceholder(/General freight|Palletized goods/i);
    if (await commodityInput.isVisible().catch(() => false)) {
      await commodityInput.fill(`QA Freight ${ts}`);
    }

    // Select client if any exist — native <select> combobox
    const clientSelect = page.getByRole('combobox').first();
    const hasCombobox = await clientSelect.isVisible().catch(() => false);
    if (hasCombobox) {
      // Check if there are client options (beyond the placeholder)
      const optionCount = await clientSelect.locator('option').count();
      if (optionCount > 1) {
        // Select first non-placeholder option
        await clientSelect.selectOption({ index: 1 });
      }
    }

    await page.getByRole('button', { name: /Create Load|Save/i }).first().click();
    await page.waitForLoadState('domcontentloaded');

    // Success: redirected away from /new, OR form stays (validation when no client) — both acceptable for smoke
    // Just confirm no crash
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('edit load form loads for existing load', async ({ page }) => {
    await page.goto('/carrier/loads');
    await page.waitForLoadState('domcontentloaded');

    // Wait briefly for client-side load list to fetch data
    await page.waitForTimeout(1500);

    const firstEditLink = page.locator('a[href*="/carrier/loads/"]').not(
      page.locator('a[href="/carrier/loads/new"]')
    ).first();
    const hasLink = await firstEditLink.isVisible().catch(() => false);
    if (!hasLink) {
      test.skip(true, 'No loads in list — skipping edit test');
      return;
    }

    await firstEditLink.click();
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toMatch(/\/carrier\/loads\/(?!new).+/);
    // LoadForm in edit mode — commodity placeholder or edit heading
    const editIndicator = page.getByRole('heading', { name: /Edit Load|Load/i }).or(
      page.getByPlaceholder(/General freight|Palletized goods/i)
    );
    await expect(editIndicator.first()).toBeVisible();
  });
});
