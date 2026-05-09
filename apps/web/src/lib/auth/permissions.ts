/**
 * RBAC permission system for the MANAGER role.
 *
 * OWNER users always have all permissions (no restrictions).
 * MANAGER users have a permissions JSONB field stored in the database.
 * All other roles (DRIVER, etc.) have no permissions.
 *
 * Permission keys are route-based, mapping directly to the Carrier Ops pages.
 * Default for MANAGER is ALL TRUE — owner toggles OFF what they want to restrict.
 */

// ============================================================
// Types
// ============================================================

export interface UserPermissions {
  // Master toggle — when true, bypasses all granular permission checks for MANAGER
  fullAccess?: boolean;

  // Carrier Ops
  carrierDashboard: boolean;  // /carrier/dashboard
  clients: boolean;           // /carrier/clients
  contracts: boolean;         // /carrier/contracts
  templates: boolean;         // /carrier/templates
  dispatches: boolean;        // /carrier/dispatches
  carrierLoads: boolean;      // /carrier/loads

  // Fleet
  carrierDrivers: boolean;    // /carrier/fleet/drivers
  carrierTrucks: boolean;     // /carrier/fleet/trucks
  facilities: boolean;        // /carrier/facilities

  // Reports
  revenueReport: boolean;     // /carrier/reports/revenue
  driverPayReport: boolean;   // /carrier/reports/driver-pay
  arAgingReport: boolean;     // /carrier/reports/aging
  performanceReport: boolean; // /carrier/reports/performance

  // Intelligence
  liveMap: boolean;           // /live-map

  // Other
  aiDocuments: boolean;       // /ai-documents

  // Always accessible (NOT in permissions — hardcoded):
  // /support — always accessible to managers
  // /settings — limited view for managers (no team-permissions, no subscription)
}

// ============================================================
// Default permission sets
// ============================================================

/** Default permissions for a newly invited MANAGER — ALL TRUE.
 *  Owner toggles OFF what they want to restrict. */
export const DEFAULT_MANAGER_PERMISSIONS: UserPermissions = {
  carrierDashboard: true,
  clients: true,
  contracts: true,
  templates: true,
  dispatches: true,
  carrierLoads: true,
  carrierDrivers: true,
  carrierTrucks: true,
  facilities: true,
  revenueReport: true,
  driverPayReport: true,
  arAgingReport: true,
  performanceReport: true,
  liveMap: true,
  aiDocuments: true,
};

/** Full permissions for OWNER role — always all true. */
export const OWNER_PERMISSIONS: UserPermissions = {
  carrierDashboard: true,
  clients: true,
  contracts: true,
  templates: true,
  dispatches: true,
  carrierLoads: true,
  carrierDrivers: true,
  carrierTrucks: true,
  facilities: true,
  revenueReport: true,
  driverPayReport: true,
  arAgingReport: true,
  performanceReport: true,
  liveMap: true,
  aiDocuments: true,
};

// ============================================================
// Section groupings for UI display
// ============================================================

export interface PermissionSection {
  id: string;
  label: string;
  permissions: Array<{
    key: keyof UserPermissions;
    label: string;
    description: string;
    route: string;
  }>;
}

export const PERMISSION_SECTIONS: PermissionSection[] = [
  {
    id: 'carrier-ops',
    label: 'Carrier Ops',
    permissions: [
      { key: 'carrierDashboard', label: 'Carrier Dashboard', description: 'View the main carrier dashboard', route: '/carrier/dashboard' },
      { key: 'clients', label: 'Clients', description: 'View and manage clients', route: '/carrier/clients' },
      { key: 'contracts', label: 'Contracts', description: 'View and manage contracts', route: '/carrier/contracts' },
      { key: 'templates', label: 'Templates', description: 'View and manage templates', route: '/carrier/templates' },
      { key: 'dispatches', label: 'Dispatches', description: 'View and manage dispatches', route: '/carrier/dispatches' },
      { key: 'carrierLoads', label: 'Carrier Loads', description: 'View and manage carrier loads', route: '/carrier/loads' },
    ],
  },
  {
    id: 'fleet',
    label: 'Fleet',
    permissions: [
      { key: 'carrierDrivers', label: 'Carrier Drivers', description: 'View and manage carrier drivers', route: '/carrier/fleet/drivers' },
      { key: 'carrierTrucks', label: 'Carrier Trucks', description: 'View and manage carrier trucks', route: '/carrier/fleet/trucks' },
      { key: 'facilities', label: 'Facilities', description: 'View and manage facilities', route: '/carrier/facilities' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    permissions: [
      { key: 'revenueReport', label: 'Revenue Report', description: 'View revenue reports', route: '/carrier/reports/revenue' },
      { key: 'driverPayReport', label: 'Driver Pay Report', description: 'View driver pay reports', route: '/carrier/reports/driver-pay' },
      { key: 'arAgingReport', label: 'AR Aging Report', description: 'View accounts receivable aging reports', route: '/carrier/reports/aging' },
      { key: 'performanceReport', label: 'Performance Report', description: 'View performance reports', route: '/carrier/reports/performance' },
    ],
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    permissions: [
      { key: 'liveMap', label: 'Live Map', description: 'View the live fleet map', route: '/live-map' },
    ],
  },
  {
    id: 'other',
    label: 'Other',
    permissions: [
      { key: 'aiDocuments', label: 'AI Documents', description: 'Upload and extract data from freight documents using AI', route: '/ai-documents' },
    ],
  },
];

// ============================================================
// Permission labels for UI display (derived from PERMISSION_SECTIONS)
// ============================================================

export const PERMISSION_LABELS: Record<
  keyof UserPermissions,
  { label: string; description: string }
> = Object.fromEntries(
  PERMISSION_SECTIONS.flatMap((s) =>
    s.permissions.map((p) => [p.key, { label: p.label, description: p.description }])
  )
) as Record<keyof UserPermissions, { label: string; description: string }>;

// ============================================================
// Path-to-permission mapping (used in middleware)
// ============================================================

export const PERMISSION_GATED_PATHS: Array<{
  path: string;
  permission: keyof UserPermissions;
}> = [
  { path: '/carrier/dashboard', permission: 'carrierDashboard' },
  { path: '/carrier/clients', permission: 'clients' },
  { path: '/carrier/contracts', permission: 'contracts' },
  { path: '/carrier/templates', permission: 'templates' },
  { path: '/carrier/dispatches', permission: 'dispatches' },
  { path: '/carrier/loads', permission: 'carrierLoads' },
  { path: '/carrier/fleet/drivers', permission: 'carrierDrivers' },
  { path: '/carrier/fleet/trucks', permission: 'carrierTrucks' },
  { path: '/carrier/facilities', permission: 'facilities' },
  { path: '/carrier/reports/revenue', permission: 'revenueReport' },
  { path: '/carrier/reports/driver-pay', permission: 'driverPayReport' },
  { path: '/carrier/reports/aging', permission: 'arAgingReport' },
  { path: '/carrier/reports/performance', permission: 'performanceReport' },
  { path: '/live-map', permission: 'liveMap' },
  { path: '/ai-documents', permission: 'aiDocuments' },
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
 * - MANAGER: defaults to true — only returns false if explicitly set to false
 * - All other roles: returns false
 */
export function hasPermission(
  permissions: UserPermissions | null,
  key: keyof UserPermissions,
  role: string
): boolean {
  if (role === 'OWNER') return true;
  if (role === 'MANAGER') {
    // Full Access: bypass all granular permission checks
    if (permissions?.fullAccess === true) return true;
    // Default-all-true: if no permissions set, or key not set, treat as true
    return permissions?.[key] !== false;
  }
  return false;
}

/**
 * Parse and return permissions for a user.
 *
 * - OWNER: always returns OWNER_PERMISSIONS (all true)
 * - MANAGER: parses the stored JSON, falling back to DEFAULT_MANAGER_PERMISSIONS (all true) for missing keys
 * - All other roles: returns DEFAULT_MANAGER_PERMISSIONS (all true — but role guard blocks access anyway)
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

    // Merge stored permissions with defaults so any MISSING key defaults to true
    // Also preserve fullAccess which is not in DEFAULT_MANAGER_PERMISSIONS
    return {
      ...DEFAULT_MANAGER_PERMISSIONS,
      ...Object.fromEntries(
        Object.entries(user.permissions).filter(
          ([key]) => key in DEFAULT_MANAGER_PERMISSIONS || key === 'fullAccess'
        )
      ),
    } as UserPermissions;
  }

  return { ...DEFAULT_MANAGER_PERMISSIONS };
}
