/**
 * Staging seed: two fully-populated tenants for Phase 0 Prompt 2's click-through
 * and Prompt 3's cross-tenant visibility tests.
 *
 * Each tenant gets: an owner, a dispatcher, two drivers, a client, a truck,
 * two facilities, a trip, a load with two stops, a route template with two
 * template stops, and one document row.
 *
 * Database-only by design. Unlike scripts/seed-qa-accounts.ts this makes NO
 * Supabase Auth calls, so it cannot reach a different project than the one
 * DATABASE_URL names. Seeded users therefore have no login; that is Prompt 2's
 * concern and is recorded in docs/audits/staging-environment.md.
 *
 * Idempotent — re-running skips what already exists.
 *
 * Run with (from apps/web):
 *   DATABASE_URL="<staging 5432 session string>" npx tsx scripts/seed-staging.ts
 */

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// ---------------------------------------------------------------------------
// Production guard — this script must never reach the production project.
// ---------------------------------------------------------------------------

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Refusing to run.');
}
if (connectionString.includes(PRODUCTION_REF)) {
  throw new Error(
    `DATABASE_URL points at the production project (${PRODUCTION_REF}). Refusing to run.`
  );
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

let created = 0;
let skipped = 0;

function note(action: 'CREATED' | 'SKIP', what: string) {
  if (action === 'CREATED') created++;
  else skipped++;
  console.log(`${action} — ${what}`);
}

// ---------------------------------------------------------------------------
// Tenant shape
// ---------------------------------------------------------------------------

interface TenantSpec {
  name: string;
  slug: string;
  domain: string;
  clientName: string;
  unitNumber: string;
  originName: string;
  destName: string;
  templateName: string;
}

const TENANTS: TenantSpec[] = [
  {
    name: 'Staging Alpha Carriers',
    slug: 'staging-alpha',
    domain: 'alpha.staging.test',
    clientName: 'Alpha Freight Co',
    unitNumber: 'A-101',
    originName: 'Alpha Origin Warehouse',
    destName: 'Alpha Destination Site',
    templateName: 'Alpha Daily Lane',
  },
  {
    name: 'Staging Beta Logistics',
    slug: 'staging-beta',
    domain: 'beta.staging.test',
    clientName: 'Beta Shippers LLC',
    unitNumber: 'B-201',
    originName: 'Beta Origin Warehouse',
    destName: 'Beta Destination Site',
    templateName: 'Beta Daily Lane',
  },
];

// ---------------------------------------------------------------------------
// Seed one tenant
// ---------------------------------------------------------------------------

async function seedTenant(spec: TenantSpec): Promise<void> {
  console.log(`\n=== ${spec.name} (${spec.slug}) ===`);

  // Tenant -------------------------------------------------------------
  let tenant = await prisma.tenant.findUnique({ where: { slug: spec.slug } });
  if (tenant) {
    note('SKIP', `Tenant ${spec.slug}`);
  } else {
    tenant = await prisma.tenant.create({
      data: { name: spec.name, slug: spec.slug, contactEmail: `owner@${spec.domain}` },
    });
    note('CREATED', `Tenant ${spec.slug}`);
  }
  const orgId = tenant.id;

  // Users --------------------------------------------------------------
  async function ensureUser(
    email: string,
    role: 'OWNER' | 'MANAGER' | 'DRIVER',
    firstName: string,
    lastName: string
  ) {
    const existing = await prisma.user.findFirst({ where: { tenantId: orgId, email } });
    if (existing) {
      note('SKIP', `User ${email}`);
      return existing;
    }
    const user = await prisma.user.create({
      data: { tenantId: orgId, email, role, firstName, lastName },
    });
    note('CREATED', `User ${email} (${role})`);
    return user;
  }

  const owner = await ensureUser(`owner@${spec.domain}`, 'OWNER', 'Olive', 'Owner');
  // No DISPATCHER role exists — UserRole is OWNER | MANAGER | DRIVER.
  // The dispatcher is a MANAGER and is what Trip.dispatcherId points at.
  const dispatcher = await ensureUser(`dispatch@${spec.domain}`, 'MANAGER', 'Dana', 'Dispatch');
  const driverUser1 = await ensureUser(`driver1@${spec.domain}`, 'DRIVER', 'Dee', 'Driverone');
  const driverUser2 = await ensureUser(`driver2@${spec.domain}`, 'DRIVER', 'Dex', 'Drivertwo');

  // Carrier drivers ----------------------------------------------------
  async function ensureDriver(userId: string, firstName: string, lastName: string) {
    const existing = await prisma.carrierDriver.findFirst({
      where: { orgId, firstName, lastName },
    });
    if (existing) {
      note('SKIP', `CarrierDriver ${firstName} ${lastName}`);
      return existing;
    }
    const d = await prisma.carrierDriver.create({
      data: {
        orgId,
        userId,
        firstName,
        lastName,
        email: `${firstName.toLowerCase()}@${spec.domain}`,
        payModel: 'per_mile',
        payPeriod: 'weekly',
        status: 'active',
        cdlClass: 'A',
      },
    });
    note('CREATED', `CarrierDriver ${firstName} ${lastName}`);
    return d;
  }

  const driver1 = await ensureDriver(driverUser1.id, 'Dee', 'Driverone');
  await ensureDriver(driverUser2.id, 'Dex', 'Drivertwo');

  // Client -------------------------------------------------------------
  let client = await prisma.carrierClient.findFirst({ where: { orgId, name: spec.clientName } });
  if (client) {
    note('SKIP', `Client ${spec.clientName}`);
  } else {
    client = await prisma.carrierClient.create({
      data: { orgId, name: spec.clientName, status: 'active' },
    });
    note('CREATED', `Client ${spec.clientName}`);
  }

  // Truck --------------------------------------------------------------
  let truck = await prisma.carrierTruck.findFirst({
    where: { orgId, unitNumber: spec.unitNumber },
  });
  if (truck) {
    note('SKIP', `Truck ${spec.unitNumber}`);
  } else {
    truck = await prisma.carrierTruck.create({
      data: {
        orgId,
        vehicleId: spec.unitNumber,
        unitNumber: spec.unitNumber,
        truckType: 'semi',
        status: 'active',
      },
    });
    note('CREATED', `Truck ${spec.unitNumber}`);
  }

  // Facilities ---------------------------------------------------------
  async function ensureFacility(
    name: string,
    facilityType: string,
    city: string,
    state: string
  ) {
    const existing = await prisma.carrierFacility.findFirst({ where: { orgId, name } });
    if (existing) {
      note('SKIP', `Facility ${name}`);
      return existing;
    }
    const f = await prisma.carrierFacility.create({
      data: {
        orgId,
        name,
        facilityType,
        addressLine1: '1 Staging Way',
        city,
        state,
        zip: '60601',
        country: 'US',
      },
    });
    note('CREATED', `Facility ${name}`);
    return f;
  }

  const origin = await ensureFacility(spec.originName, 'warehouse', 'Chicago', 'IL');
  const dest = await ensureFacility(spec.destName, 'customer_site', 'Milwaukee', 'WI');

  // Trip (dispatches) --------------------------------------------------
  // CarrierStop.dispatchId is NOT NULL, so "a load with stops" requires a trip.
  const tripNote = `staging-seed:${spec.slug}`;
  let trip = await prisma.trip.findFirst({ where: { orgId, notes: tripNote } });
  if (trip) {
    note('SKIP', `Trip for ${spec.slug}`);
  } else {
    trip = await prisma.trip.create({
      data: {
        orgId,
        primaryDriverId: driver1.id,
        truckId: truck.id,
        dispatcherId: dispatcher.id,
        scheduledDeparture: new Date('2026-09-15T14:00:00Z'),
        status: 'planned',
        hosCycle: 'us_70',
        notes: tripNote,
      },
    });
    note('CREATED', `Trip for ${spec.slug}`);
  }

  // Load ---------------------------------------------------------------
  const loadRef = `STG-${spec.slug.toUpperCase()}-1`;
  let load = await prisma.carrierLoad.findFirst({ where: { orgId, referenceNumber: loadRef } });
  if (load) {
    note('SKIP', `Load ${loadRef}`);
  } else {
    load = await prisma.carrierLoad.create({
      data: {
        orgId,
        clientId: client.id,
        dispatchId: trip.id,
        referenceNumber: loadRef,
        loadType: 'ftl',
        rateType: 'flat',
        rateAmount: 1850,
        status: 'assigned',
        commodityDescription: 'Palletised dry goods',
      },
    });
    note('CREATED', `Load ${loadRef}`);
  }

  const tripId = trip.id;
  const loadId = load.id;

  // Stops --------------------------------------------------------------
  async function ensureStop(sequenceOrder: number, stopType: string, facilityId: string) {
    const existing = await prisma.carrierStop.findFirst({
      where: { dispatchId: tripId, sequenceOrder },
    });
    if (existing) {
      note('SKIP', `Stop ${sequenceOrder} (${stopType})`);
      return;
    }
    await prisma.carrierStop.create({
      data: {
        dispatchId: tripId,
        loadId,
        sequenceOrder,
        stopType,
        facilityId,
        status: 'pending',
      },
    });
    note('CREATED', `Stop ${sequenceOrder} (${stopType})`);
  }

  await ensureStop(1, 'pickup', origin.id);
  await ensureStop(2, 'delivery', dest.id);

  // Route template -----------------------------------------------------
  let template = await prisma.routeTemplate.findFirst({
    where: { orgId, templateName: spec.templateName },
  });
  if (template) {
    note('SKIP', `RouteTemplate ${spec.templateName}`);
  } else {
    template = await prisma.routeTemplate.create({
      data: {
        orgId,
        templateName: spec.templateName,
        clientId: client.id,
        scheduleType: 'on_call',
        equipmentType: 'dry_van',
      },
    });
    note('CREATED', `RouteTemplate ${spec.templateName}`);
  }

  const templateId = template.id;

  async function ensureTemplateStop(
    sequenceOrder: number,
    stopType: string,
    facilityId: string
  ) {
    const existing = await prisma.routeTemplateStop.findFirst({
      where: { routeTemplateId: templateId, sequenceOrder },
    });
    if (existing) {
      note('SKIP', `TemplateStop ${sequenceOrder} (${stopType})`);
      return;
    }
    await prisma.routeTemplateStop.create({
      data: { routeTemplateId: templateId, sequenceOrder, stopType, facilityId },
    });
    note('CREATED', `TemplateStop ${sequenceOrder} (${stopType})`);
  }

  await ensureTemplateStop(1, 'pickup', origin.id);
  await ensureTemplateStop(2, 'delivery', dest.id);

  // Document -----------------------------------------------------------
  const existingDoc = await prisma.carrierDocument.findFirst({
    where: { parentType: 'load', parentId: loadId },
  });
  if (existingDoc) {
    note('SKIP', `Document for load ${loadRef}`);
  } else {
    await prisma.carrierDocument.create({
      data: {
        parentType: 'load',
        parentId: loadId,
        loadId,
        documentType: 'RATE_CONFIRMATION',
        fileUrl: `staging/${spec.slug}/rate-confirmation.pdf`,
        filename: 'rate-confirmation.pdf',
        uploadedBy: owner.id,
      },
    });
    note('CREATED', `Document for load ${loadRef}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  for (const spec of TENANTS) {
    await seedTenant(spec);
  }
  console.log(`\nDone. created=${created} skipped=${skipped}`);
}

main()
  .catch((e) => {
    console.error('SEED FAILED:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
