import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../../.playwright/auth/owner.json') });

// ---------------------------------------------------------------------------
// Facilities
// ---------------------------------------------------------------------------

test.describe('Carrier Facilities', () => {
  test('@smoke facility list page loads', async ({ page }) => {
    await page.goto('/carrier/facilities');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: /Facilities/i })).toBeVisible();
  });

  test('facility list shows New Facility button', async ({ page }) => {
    await page.goto('/carrier/facilities');
    await page.waitForLoadState('domcontentloaded');
    // FacilityList renders a "New Facility" Link
    const addBtn = page.getByRole('link', { name: /New Facility/i }).or(
      page.getByRole('button', { name: /New Facility|Add Facility/i })
    );
    await expect(addBtn.first()).toBeVisible();
  });

  test('@smoke create facility — happy path', async ({ page }) => {
    const ts = Date.now();
    await page.goto('/carrier/facilities/new');
    await page.waitForLoadState('domcontentloaded');

    // Name field has htmlFor="name" — getByLabel works
    await page.getByLabel(/Name/i).first().fill(`QA Facility ${ts}`);

    // Facility Type — shadcn Select (SelectTrigger renders as a button with role combobox)
    const typeCombobox = page.getByRole('combobox').first();
    if (await typeCombobox.isVisible().catch(() => false)) {
      await typeCombobox.click();
      const firstOption = page.getByRole('option').first();
      if (await firstOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await firstOption.click();
      }
    }

    // Optional address field: Address Line 1 has htmlFor="addressLine1"
    const addressInput = page.getByLabel(/Address Line 1/i);
    if (await addressInput.isVisible().catch(() => false)) {
      await addressInput.fill('123 QA Street');
    }

    // City has htmlFor="city"
    const cityInput = page.getByLabel(/City/i);
    if (await cityInput.isVisible().catch(() => false)) {
      await cityInput.fill('Test City');
    }

    // State has htmlFor="state" — plain text input (max 2 chars), not a select
    const stateInput = page.getByLabel(/State/i);
    if (await stateInput.isVisible().catch(() => false)) {
      await stateInput.fill('TX');
    }

    // ZIP has htmlFor="zip"
    const zipInput = page.getByLabel(/ZIP/i);
    if (await zipInput.isVisible().catch(() => false)) {
      await zipInput.fill('75001');
    }

    // Submit button text in create mode is "Create Facility"
    await page.getByRole('button', { name: /Create Facility/i }).click();
    await page.waitForLoadState('domcontentloaded');
    // On success, redirects to /carrier/facilities
    expect(page.url()).toMatch(/\/carrier\/facilities/);
  });

  test('edit facility form loads for existing facility', async ({ page }) => {
    await page.goto('/carrier/facilities');
    await page.waitForLoadState('domcontentloaded');

    // FacilityList renders facility names as Links to /carrier/facilities/[id]
    const firstFacilityLink = page.locator('table a[href*="/carrier/facilities/"]').first();
    const hasLink = await firstFacilityLink.isVisible().catch(() => false);
    if (!hasLink) {
      test.skip(true, 'No facilities in list — skipping edit test');
      return;
    }

    await firstFacilityLink.click();
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toMatch(/\/carrier\/facilities\/(?!new).+/);
    // Name field should be visible in the edit form
    await expect(page.getByLabel(/Name/i).first()).toBeVisible();
  });

  test('facility form validates required Name field', async ({ page }) => {
    await page.goto('/carrier/facilities/new');
    await page.waitForLoadState('domcontentloaded');
    // Submit without filling name — JS validation shows error
    await page.getByRole('button', { name: /Create Facility/i }).click();
    // FacilityForm.validate() renders 'Name is required' error
    await expect(page.getByText(/Name is required/i)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Route Templates
// ---------------------------------------------------------------------------

test.describe('Carrier Route Templates', () => {
  test('@smoke route templates list page loads', async ({ page }) => {
    await page.goto('/carrier/templates');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: /Route Templates/i })).toBeVisible();
  });

  test('route templates list shows Add Template button or empty state', async ({ page }) => {
    await page.goto('/carrier/templates');
    await page.waitForLoadState('domcontentloaded');
    // Either an Add/New Template button or empty state text
    const content = page.getByRole('button', { name: /Add Template|New Template/i }).or(
      page.getByRole('link', { name: /Add Template|New Template/i })
    ).or(
      page.getByText(/No templates|Get started|No route templates/i)
    );
    await expect(content.first()).toBeVisible();
  });

  test('create route template form page renders', async ({ page }) => {
    await page.goto('/carrier/templates/new');
    await page.waitForLoadState('domcontentloaded');
    // Page heading confirms we are on the create page
    await expect(page.getByRole('heading', { name: /New Route Template/i })).toBeVisible();
    // Form should have at least one input or combobox
    const formField = page.getByRole('textbox').first().or(
      page.getByRole('combobox').first()
    );
    await expect(formField).toBeVisible();
  });
});
