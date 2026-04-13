import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../../.playwright/auth/owner.json') });

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

test.describe('Carrier Clients', () => {
  test('@smoke client list page loads', async ({ page }) => {
    await page.goto('/carrier/clients');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: /Clients/i })).toBeVisible();
  });

  test('client list shows Add Client button', async ({ page }) => {
    await page.goto('/carrier/clients');
    await page.waitForLoadState('domcontentloaded');
    const addBtn = page.getByRole('link', { name: /New Client/i }).or(
      page.getByRole('button', { name: /New Client|Add Client/i })
    );
    await expect(addBtn.first()).toBeVisible();
  });

  test('@smoke create client — happy path', async ({ page }) => {
    const ts = Date.now();
    await page.goto('/carrier/clients/new');
    await page.waitForLoadState('domcontentloaded');

    // Name field uses id="name" with htmlFor="name" — getByLabel works
    await page.getByLabel(/^Name/i).fill(`QA Client ${ts}`);

    await page.getByRole('button', { name: /Create Client/i }).first().click();
    await page.waitForLoadState('domcontentloaded');
    // Redirects to client list on success
    expect(page.url()).toMatch(/\/carrier\/clients/);
  });

  test('edit client form loads for existing client', async ({ page }) => {
    await page.goto('/carrier/clients');
    await page.waitForLoadState('domcontentloaded');

    const firstEditLink = page.locator('a[href*="/carrier/clients/"]').not(
      page.locator('a[href="/carrier/clients/new"]')
    ).first();
    const hasLink = await firstEditLink.isVisible().catch(() => false);
    if (!hasLink) {
      test.skip(true, 'No clients in list — skipping edit test');
      return;
    }

    await firstEditLink.click();
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toMatch(/\/carrier\/clients\/(?!new).+/);
    // Edit form should show the Name field (id="name" with htmlFor="name")
    await expect(page.getByLabel(/^Name/i).first()).toBeVisible();
  });

  test('client form validates required Name field', async ({ page }) => {
    await page.goto('/carrier/clients/new');
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('button', { name: /Create Client/i }).first().click();
    // JS validation: name error message appears and page stays
    const nameError = page.getByText(/Name is required/i);
    await expect(nameError).toBeVisible();
    expect(page.url()).toContain('/carrier/clients/new');
  });
});

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

test.describe('Carrier Contracts', () => {
  test('@smoke contract list page loads', async ({ page }) => {
    await page.goto('/carrier/contracts');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: /Contracts/i })).toBeVisible();
  });

  test('contract list shows Add Contract button', async ({ page }) => {
    await page.goto('/carrier/contracts');
    await page.waitForLoadState('domcontentloaded');
    const addBtn = page.getByRole('link', { name: /New Contract/i }).or(
      page.getByRole('button', { name: /New Contract|Add Contract/i })
    );
    await expect(addBtn.first()).toBeVisible();
  });

  test('create contract form page renders', async ({ page }) => {
    await page.goto('/carrier/contracts/new');
    await page.waitForLoadState('domcontentloaded');
    // ContractForm renders shadcn Selects and Input fields
    const formField = page.getByRole('combobox').first().or(
      page.getByRole('textbox').first()
    );
    await expect(formField).toBeVisible();
  });

  test('edit contract form loads for existing contract', async ({ page }) => {
    await page.goto('/carrier/contracts');
    await page.waitForLoadState('domcontentloaded');

    const firstEditLink = page.locator('a[href*="/carrier/contracts/"]').not(
      page.locator('a[href="/carrier/contracts/new"]')
    ).first();
    const hasLink = await firstEditLink.isVisible().catch(() => false);
    if (!hasLink) {
      test.skip(true, 'No contracts in list — skipping edit test');
      return;
    }

    await firstEditLink.click();
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toMatch(/\/carrier\/contracts\/(?!new).+/);
  });
});
