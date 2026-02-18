import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  const results: Record<string, unknown> = {};

  // Test 1: headers
  try {
    const h = await headers();
    results.tenantId = h.get('x-tenant-id');
    results.headersOk = true;
  } catch (e: any) {
    results.headersError = e.message;
  }

  // Test 2: raw database query (no RLS)
  try {
    const count = await prisma.$queryRaw`SELECT count(*)::int FROM "Tenant"`;
    results.dbCount = count;
    results.dbOk = true;
  } catch (e: any) {
    results.dbError = e.message;
    results.dbStack = e.stack?.split('\n').slice(0, 5);
  }

  // Test 3: Prisma model query (no RLS)
  try {
    const tenants = await prisma.tenant.findMany({ take: 2, select: { id: true, name: true } });
    results.tenants = tenants;
    results.modelQueryOk = true;
  } catch (e: any) {
    results.modelQueryError = e.message;
    results.modelQueryStack = e.stack?.split('\n').slice(0, 5);
  }

  // Test 4: Prisma with RLS extension
  try {
    const { withTenantRLS } = await import('@/lib/db/extensions/tenant-rls');
    // Use a known tenant ID from the database
    const tenantPrisma = prisma.$extends(withTenantRLS('023834c8-93c4-4ec0-8850-ce9593e158df'));
    const trucks = await tenantPrisma.truck.findMany({ take: 1 });
    results.rlsQueryOk = true;
    results.truckCount = trucks.length;
  } catch (e: any) {
    results.rlsQueryError = e.message;
    results.rlsQueryStack = e.stack?.split('\n').slice(0, 10);
  }

  return NextResponse.json(results, { status: 200 });
}
