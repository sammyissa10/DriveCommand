import path from 'path';

/**
 * Auth state file paths for all 3 roles.
 * These files are created by e2e/auth.setup.ts before any tests run.
 * They are gitignored — stored in .playwright/auth/.
 */

export const OWNER_AUTH = path.join(__dirname, '../../.playwright/auth/owner.json');
export const SYSADMIN_AUTH = path.join(__dirname, '../../.playwright/auth/sysadmin.json');
export const DRIVER_AUTH = path.join(__dirname, '../../.playwright/auth/driver.json');

/** Legacy path — kept for backward compatibility with pre-Phase-27 specs */
export const LEGACY_AUTH = path.join(__dirname, '../../.playwright/auth.json');
