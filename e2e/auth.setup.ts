import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '..', '.playwright', 'auth.json');

setup('authenticate', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill('demo@drivecommand.com');
  await page.getByLabel('Password').fill('demo1234');
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for redirect to dashboard
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  await expect(page).toHaveURL(/\/dashboard/);

  // Save auth state
  await page.context().storageState({ path: authFile });
});
