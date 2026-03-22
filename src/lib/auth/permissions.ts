/**
 * RBAC permission system for the MANAGER role.
 *
 * OWNER users always have all permissions (no restrictions).
 * MANAGER users have a permissions JSONB field stored in the database.
 * All other roles (DRIVER, etc.) have no permissions.
 */

// ============================================================
// Types
// ============================================================

export interface UserPermissions {
  canViewPayroll: boolean;
  canViewInvoices: boolean;
  canViewCRM: boolean;
  canViewAIDocuments: boolean;
  canViewLaneAnalytics: boolean;
  canViewProfitPredictor: boolean;
  canViewIFTA: boolean;
  canManageSettings: boolean;
  canViewBilling: boolean;
}

// ============================================================
// Default permission sets
// ============================================================

/** Default permissions for a newly invited MANAGER — all false until explicitly granted. */
export const DEFAULT_MANAGER_PERMISSIONS: UserPermissions = {
  canViewPayroll: false,
  canViewInvoices: false,
  canViewCRM: false,
  canViewAIDocuments: false,
  canViewLaneAnalytics: false,
  canViewProfitPredictor: false,
  canViewIFTA: false,
  canManageSettings: false,
  canViewBilling: false,
};

/** Full permissions for OWNER role — always all true. */
export const OWNER_PERMISSIONS: UserPermissions = {
  canViewPayroll: true,
  canViewInvoices: true,
  canViewCRM: true,
  canViewAIDocuments: true,
  canViewLaneAnalytics: true,
  canViewProfitPredictor: true,
  canViewIFTA: true,
  canManageSettings: true,
  canViewBilling: true,
};

// ============================================================
// Permission labels for UI display
// ============================================================

export const PERMISSION_LABELS: Record<
  keyof UserPermissions,
  { label: string; description: string }
> = {
  canViewPayroll: {
    label: 'Payroll',
    description: 'View and manage driver payroll records',
  },
  canViewInvoices: {
    label: 'Invoices',
    description: 'View and manage customer invoices',
  },
  canViewCRM: {
    label: 'CRM',
    description: 'View and manage customer records and interactions',
  },
  canViewAIDocuments: {
    label: 'AI Documents',
    description: 'Upload and extract data from freight documents using AI',
  },
  canViewLaneAnalytics: {
    label: 'Lane Analytics',
    description: 'View lane profitability and route analytics',
  },
  canViewProfitPredictor: {
    label: 'Profit Predictor',
    description: 'Use AI-powered profit predictions before accepting loads',
  },
  canViewIFTA: {
    label: 'IFTA Reports',
    description: 'Generate and view IFTA fuel tax reports',
  },
  canManageSettings: {
    label: 'Settings',
    description: 'Manage expense categories, templates, and integrations',
  },
  canViewBilling: {
    label: 'Billing',
    description: 'View subscription and billing information',
  },
};

// ============================================================
// Path-to-permission mapping (used in middleware)
// ============================================================

export const PERMISSION_GATED_PATHS: Array<{
  path: string;
  permission: keyof UserPermissions;
}> = [
  { path: '/payroll', permission: 'canViewPayroll' },
  { path: '/invoices', permission: 'canViewInvoices' },
  { path: '/crm', permission: 'canViewCRM' },
  { path: '/ai-documents', permission: 'canViewAIDocuments' },
  { path: '/lane-analytics', permission: 'canViewLaneAnalytics' },
  { path: '/profit-predictor', permission: 'canViewProfitPredictor' },
  { path: '/ifta', permission: 'canViewIFTA' },
  { path: '/settings', permission: 'canManageSettings' },
  { path: '/subscription', permission: 'canViewBilling' },
  { path: '/billing', permission: 'canViewBilling' },
];

// ============================================================
// Permission helpers
// ============================================================

/**
 * Type guard to check if an unknown value is a valid UserPermissions object.
 */
function isUserPermissions(value: unknown): value is Partial<UserPermissions> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if a user has a specific permission.
 *
 * - OWNER: always returns true
 * - MANAGER: returns the stored permission value (false if not set)
 * - All other roles: returns false
 */
export function hasPermission(
  permissions: UserPermissions | null,
  key: keyof UserPermissions,
  role: string
): boolean {
  if (role === 'OWNER') return true;
  if (role === 'MANAGER') return permissions?.[key] ?? false;
  return false;
}

/**
 * Parse and return permissions for a user.
 *
 * - OWNER: always returns OWNER_PERMISSIONS (all true)
 * - MANAGER: parses the stored JSON, falling back to DEFAULT_MANAGER_PERMISSIONS for missing keys
 * - All other roles: returns DEFAULT_MANAGER_PERMISSIONS (all false)
 */
export function getPermissions(user: {
  role: string;
  permissions: unknown;
}): UserPermissions {
  if (user.role === 'OWNER') return OWNER_PERMISSIONS;

  if (user.role === 'MANAGER') {
    if (!isUserPermissions(user.permissions)) {
      return { ...DEFAULT_MANAGER_PERMISSIONS };
    }

    // Merge stored permissions with defaults so any new keys default to false
    return {
      ...DEFAULT_MANAGER_PERMISSIONS,
      ...Object.fromEntries(
        Object.entries(user.permissions).filter(
          ([key]) => key in DEFAULT_MANAGER_PERMISSIONS
        )
      ),
    } as UserPermissions;
  }

  return { ...DEFAULT_MANAGER_PERMISSIONS };
}
