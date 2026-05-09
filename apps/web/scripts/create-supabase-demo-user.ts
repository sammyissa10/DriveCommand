/**
 * One-time script to create the demo user in Supabase Auth.
 *
 * PREREQUISITE: Add your real SUPABASE_SERVICE_ROLE_KEY to apps/web/.env.local first.
 * Get it from: Supabase Dashboard -> Settings -> API -> service_role (secret key)
 *
 * Run with:
 *   cd apps/web
 *   npx tsx scripts/create-supabase-demo-user.ts
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const DEMO_USER_ID = 'a0a6fe40-78a5-4b4e-8499-8ed1cc4fa63a';
const DEMO_TENANT_ID = '7e9eca25-1f97-46ed-9365-e67be49436d5';

const DEMO_METADATA = {
  role: 'OWNER',
  tenantId: DEMO_TENANT_ID,
  firstName: 'Demo',
  lastName: 'User',
  isSystemAdmin: false,
  permissions: {
    canViewPayroll: true,
    canViewInvoices: true,
    canViewCRM: true,
    canViewAIDocuments: true,
    canViewLaneAnalytics: true,
    canViewProfitPredictor: true,
    canViewIFTA: true,
    canManageSettings: true,
    canViewBilling: true,
  },
};

async function main() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY === 'placeholder-user-must-add-real-key') {
    console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is not set or is still the placeholder.');
    console.error('Get it from: Supabase Dashboard -> Settings -> API -> service_role (secret key)');
    process.exit(1);
  }

  console.log('Creating demo user in Supabase Auth...');

  const { data, error } = await supabase.auth.admin.createUser({
    id: DEMO_USER_ID,
    email: 'demo@drivecommand.com',
    password: 'demo1234',
    email_confirm: true,
    user_metadata: { firstName: DEMO_METADATA.firstName, lastName: DEMO_METADATA.lastName },
    app_metadata: {
      role: DEMO_METADATA.role,
      tenantId: DEMO_METADATA.tenantId,
      isSystemAdmin: DEMO_METADATA.isSystemAdmin,
      permissions: DEMO_METADATA.permissions,
    },
  });

  if (error) {
    if (error.message?.includes('already been registered') || error.message?.includes('already exists')) {
      console.log('Demo user already exists in Supabase Auth. Updating metadata...');
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        DEMO_USER_ID,
        {
          password: 'demo1234',
          user_metadata: { firstName: DEMO_METADATA.firstName, lastName: DEMO_METADATA.lastName },
          app_metadata: {
            role: DEMO_METADATA.role,
            tenantId: DEMO_METADATA.tenantId,
            isSystemAdmin: DEMO_METADATA.isSystemAdmin,
            permissions: DEMO_METADATA.permissions,
          },
        }
      );
      if (updateError) {
        console.error('Update failed:', updateError);
        process.exit(1);
      } else {
        console.log('Demo user metadata updated successfully.');
      }
    } else {
      console.error('Failed to create demo user:', error);
      process.exit(1);
    }
  } else {
    console.log('Demo user created successfully:', data.user.id);
  }

  console.log('Done. You can now sign in with demo@drivecommand.com / demo1234');
}

main();
