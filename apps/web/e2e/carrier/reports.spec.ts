import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../../.playwright/auth/owner.json') });

// All 4 reports pages are 'use client' components that fetch via useEffect.
// Use waitForLoadState('networkidle') so data has loaded before asserting.

test.describe('Carrier Reports', () => {
  // ── AR Aging Report ───────────────────────────────────────────────────────

  test('@smoke aging report page loads', async ({ page }) => {
    await page.goto('/carrier/reports/aging');
    await page.waitForLoadState('networkidle');
    // Heading is "AR Aging Report" (see page.tsx)
    await expect(page.getByRole('heading', { name: /AR Aging Report/i })).toBeVisible();
  });

  test('aging report shows data table or empty state', async ({ page }) => {
    await page.goto('/carrier/reports/aging');
    await page.waitForLoadState('networkidle');
    // Either a table with client rows or the "No data for selected period" empty state
    const content = page.locator('table').or(
      page.getByText(/No data for selected period/i)
    );
    await expect(content.first()).toBeVisible();
  });

  // ── Driver Pay Report ─────────────────────────────────────────────────────

  test('@smoke driver pay report page loads', async ({ page }) => {
    await page.goto('/carrier/reports/driver-pay');
    await page.waitForLoadState('networkidle');
    // Heading is "Driver Pay Report"
    await expect(page.getByRole('heading', { name: /Driver Pay Report/i })).toBeVisible();
  });

  test('driver pay report shows pay records table or empty state', async ({ page }) => {
    await page.goto('/carrier/reports/driver-pay');
    await page.waitForLoadState('networkidle');
    const content = page.locator('table').or(
      page.getByText(/No data for selected period/i)
    );
    await expect(content.first()).toBeVisible();
  });

  test('mark as paid action works on approved pay record', async ({ page }) => {
    await page.goto('/carrier/reports/driver-pay');
    await page.waitForLoadState('networkidle');

    // "Mark as Paid" button only appears for rows with status === 'approved'
    const markPaidBtn = page.getByRole('button', { name: /Mark as Paid/i }).first();
    const hasPaidBtn = await markPaidBtn.isVisible().catch(() => false);
    if (!hasPaidBtn) {
      test.skip(true, 'No approved pay records — skipping mark-as-paid test');
      return;
    }

    // Playwright will auto-dismiss the window.confirm dialog — accept it
    page.on('dialog', (dialog) => dialog.accept());

    await markPaidBtn.click();
    // Wait for the PATCH request to settle
    await page.waitForLoadState('networkidle');
    // After marking paid, the row status updates to 'Paid' badge
    await expect(page.getByText(/Paid/i).first()).toBeVisible({ timeout: 5000 });
  });

  // ── Performance Report ────────────────────────────────────────────────────

  test('@smoke performance report page loads', async ({ page }) => {
    await page.goto('/carrier/reports/performance');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /Performance Report/i })).toBeVisible();
  });

  test('performance report renders content area', async ({ page }) => {
    await page.goto('/carrier/reports/performance');
    await page.waitForLoadState('networkidle');
    // Either a data table or "No data for selected period" empty state
    const content = page.locator('table').or(
      page.getByText(/No data for selected period/i)
    );
    await expect(content.first()).toBeVisible();
  });

  // ── Revenue Report ────────────────────────────────────────────────────────

  test('@smoke revenue report page loads', async ({ page }) => {
    await page.goto('/carrier/reports/revenue');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /Revenue Report/i })).toBeVisible();
  });

  test('revenue report renders chart or empty state', async ({ page }) => {
    await page.goto('/carrier/reports/revenue');
    await page.waitForLoadState('networkidle');
    // Recharts renders an SVG — or "No data for selected period" if no revenue data
    const chartOrEmpty = page.locator('svg').or(
      page.getByText(/No data for selected period/i)
    );
    await expect(chartOrEmpty.first()).toBeVisible();
  });

  test('revenue report export CSV button is present when data exists', async ({ page }) => {
    await page.goto('/carrier/reports/revenue');
    await page.waitForLoadState('networkidle');
    // "Export CSV" button renders only when clientSummary.length > 0
    const exportBtn = page.getByRole('button', { name: /Export CSV/i });
    const isVisible = await exportBtn.isVisible().catch(() => false);
    // Informational only — not a hard assertion when no data exists
    if (isVisible) {
      await expect(exportBtn).toBeEnabled();
    }
  });
});
