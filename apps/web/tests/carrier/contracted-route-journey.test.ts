/**
 * Contracted Recurring Route Journey — End-to-End Integration Test
 *
 * Validates the complete 15-step carrier ops pipeline:
 *   Client → Contract → Facilities → Route Template → Dispatch Generation →
 *   Stop Arrival → Document Compliance (BOL/POD enforcement) → Stop Completion →
 *   Revenue Calculation → Driver Pay Record Generation
 *
 * Requires a real PostgreSQL database with migrations applied.
 * Automatically skipped when DATABASE_URL is not set.
 *
 * Pattern: service functions called directly (bypassing HTTP route handlers and auth).
 * Setup/teardown uses $transaction with bypass_rls.
 */

import { describe, it, expect } from 'vitest';

// Skip the entire suite when no DB is available
const hasDatabase = !!process.env.DATABASE_URL;
const describeWithDb = hasDatabase ? describe : describe.skip;

describeWithDb('Contracted Recurring Route Journey (E2E)', () => {
  // IDs needed in finally block — declared at describe scope
  let orgId: string;
  let userId: string;
  let driverId: string;
  let truckId: string;

  it(
    'completes the full 15-step contracted recurring route journey',
    { timeout: 120000 },
    async () => {
      // -----------------------------------------------------------------------
      // Dynamic imports — deferred so describe.skip works without crashing
      // -----------------------------------------------------------------------
      const { PrismaClient } = await import('../../src/generated/prisma/client');
      const { PrismaPg } = await import('@prisma/adapter-pg');
      const { Pool } = await import('pg');

      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 2,
      });
      const adapter = new PrismaPg(pool);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prisma = new (PrismaClient as any)({ adapter });

      // Service function imports — use the same DB via @/lib/db/prisma singleton
      const { createClient } = await import('@/lib/carrier/clients');
      const { createContract } = await import('@/lib/carrier/contracts');
      const { createFacility } = await import('@/lib/carrier/facilities');
      const { createRouteTemplate } = await import('@/lib/carrier/route-templates');
      const { generateDispatches } = await import('@/lib/carrier/dispatch-generator');
      const { listDispatches, transitionDispatchStatus } = await import('@/lib/carrier/dispatches');
      const { arriveStop, completeStop } = await import('@/lib/carrier/stop-completion');

      // Variables shared between try and finally
      let dispatchId: string | undefined;
      let pickupStop: { id: string } | undefined;
      let deliveryStop: { id: string } | undefined;
      let loadId: string | undefined;
      let template: { id: string } | undefined;
      const dispatchIds: string[] = [];

      try {
        // -------------------------------------------------------------------
        // SETUP — Create test tenant, user, driver, truck via bypass_rls
        // -------------------------------------------------------------------
        const tenant = await prisma.$transaction(async (tx: any) => {
          await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
          return tx.tenant.create({
            data: {
              name: 'Test Carrier Ops Tenant',
              timezone: 'UTC',
            },
          });
        });
        orgId = tenant.id;

        const user = await prisma.$transaction(async (tx: any) => {
          await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
          return tx.user.create({
            data: {
              tenantId: orgId,
              email: `carrier-test-${Date.now()}@example.com`,
              role: 'OWNER',
            },
          });
        });
        userId = user.id;

        const driver = await prisma.$transaction(async (tx: any) => {
          await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
          return tx.carrierDriver.create({
            data: {
              orgId,
              firstName: 'Test',
              lastName: 'Driver',
              payModel: 'per_mile',
              payRate: '0.55',
            },
          });
        });
        driverId = driver.id;

        const truck = await prisma.$transaction(async (tx: any) => {
          await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
          return tx.carrierTruck.create({
            data: {
              orgId,
              unitNumber: 'TEST-001',
            },
          });
        });
        truckId = truck.id;

        // -------------------------------------------------------------------
        // STEP 1 — Create client
        // -------------------------------------------------------------------
        const client = await createClient(orgId, { name: 'Midwest Tire Distributors' });
        expect(client).toBeDefined();
        expect(client.id).toBeDefined();
        expect(typeof client.id).toBe('string');
        expect(client.name).toBe('Midwest Tire Distributors');

        // -------------------------------------------------------------------
        // STEP 2 — Create contract
        // NOTE: The contracts table constraint only allows rate_type IN
        // ('per_mile', 'flat', 'per_load', 'hourly'). We use 'flat' here.
        // After dispatch generation, we update the load's rateType to 'per_stop'
        // to exercise the per_stop revenue formula (65 * delivery_stop_count = 65).
        // -------------------------------------------------------------------
        const contract = await createContract(orgId, client.id, {
          rateType: 'flat',
          baseRate: '65.00',
          fuelSurchargeMethod: 'per_mile',
          fuelSurchargeRate: '0.08',
        });
        expect(contract.contractNumber).toMatch(/^CN-/);
        expect(contract.rateType).toBe('flat');

        // -------------------------------------------------------------------
        // STEP 3 — Create two facilities (warehouse + shop)
        // -------------------------------------------------------------------
        const warehouse = await createFacility(orgId, {
          name: 'Midwest Tire Warehouse',
          facilityType: 'warehouse',
          city: 'Chicago',
          state: 'IL',
        });
        const shop = await createFacility(orgId, {
          name: 'Midwest Tire Shop #1',
          facilityType: 'customer_site',
          city: 'Milwaukee',
          state: 'WI',
        });
        expect(warehouse.id).toBeDefined();
        expect(shop.id).toBeDefined();

        // -------------------------------------------------------------------
        // STEP 4 — Create route template + stops
        // -------------------------------------------------------------------
        template = await createRouteTemplate(orgId, {
          templateName: 'MWT Daily Delivery',
          clientId: client.id,
          contractId: contract.id,
          scheduleType: 'fixed_days',
          recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
          equipmentType: 'dry_van',
          autoGenerateDaysAhead: 7,
          defaultDriverId: driverId,
          defaultTruckId: truckId,
        });
        expect(template.id).toBeDefined();

        // Create RouteTemplateStop records via Prisma directly (no service function exists)
        await prisma.$transaction(async (tx: any) => {
          await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
          await tx.routeTemplateStop.create({
            data: {
              routeTemplateId: template!.id,
              sequenceOrder: 1,
              stopType: 'pickup',
              facilityId: warehouse.id,
              bolRequired: true,
              podRequired: false,
            },
          });
          await tx.routeTemplateStop.create({
            data: {
              routeTemplateId: template!.id,
              sequenceOrder: 2,
              stopType: 'delivery',
              facilityId: shop.id,
              bolRequired: false,
              podRequired: true,
            },
          });
        });

        // -------------------------------------------------------------------
        // STEP 5 — Generate dispatches (14 days ahead to ensure at least 1 weekday)
        // -------------------------------------------------------------------
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 14);
        const throughDate = futureDate.toISOString().split('T')[0];

        const genResult = await generateDispatches(orgId, template.id, throughDate);
        expect(genResult.dispatchesCreated).toBeGreaterThanOrEqual(1);

        // -------------------------------------------------------------------
        // STEP 6 — List dispatches and find our generated one
        // -------------------------------------------------------------------
        const dispatches = await listDispatches(orgId, {
          routeTemplateId: template.id,
        });
        expect(dispatches.items.length).toBeGreaterThanOrEqual(1);
        const dispatch = dispatches.items[0];
        expect(dispatch.status).toBe('planned');
        expect(dispatch.routeTemplateId).toBe(template.id);
        dispatchId = dispatch.id;
        dispatchIds.push(dispatchId);

        // -------------------------------------------------------------------
        // STEP 7 — Transition dispatch planned → in_progress
        // -------------------------------------------------------------------
        const transResult = await transitionDispatchStatus(orgId, dispatchId, 'in_progress');
        expect(transResult).not.toBeNull();
        expect('error' in transResult!).toBe(false);

        // Verify actualDeparture was set
        const updatedDispatch = await prisma.$transaction(async (tx: any) => {
          await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
          return tx.carrierDispatch.findFirst({ where: { id: dispatchId } });
        });
        expect(updatedDispatch!.actualDeparture).not.toBeNull();

        // -------------------------------------------------------------------
        // STEP 8 — Get stops, link to load, arrive at pickup stop
        // -------------------------------------------------------------------
        const stops = await prisma.$transaction(async (tx: any) => {
          await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
          return tx.carrierStop.findMany({
            where: { dispatchId },
            orderBy: { sequenceOrder: 'asc' },
          });
        });

        pickupStop = stops.find((s: any) => s.stopType === 'pickup')!;
        deliveryStop = stops.find((s: any) => s.stopType === 'delivery')!;
        expect(pickupStop).toBeDefined();
        expect(deliveryStop).toBeDefined();

        // Find the load created by dispatch-generator
        const load = await prisma.$transaction(async (tx: any) => {
          await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
          return tx.carrierLoad.findFirst({ where: { dispatchId, orgId } });
        });
        expect(load).not.toBeNull();
        loadId = load!.id;

        // Manually link stops to the load AND update rateType to 'per_stop'
        // The contracts table constraint only allows 'flat'/'per_mile'/'per_load'/'hourly',
        // so the contract uses 'flat'. We override the load's rateType to 'per_stop' here
        // to exercise the per_stop revenue formula in the revenue calculator.
        await prisma.$transaction(async (tx: any) => {
          await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
          await tx.carrierStop.update({
            where: { id: pickupStop!.id },
            data: { loadId },
          });
          await tx.carrierStop.update({
            where: { id: deliveryStop!.id },
            data: { loadId },
          });
          // Override rateType to per_stop to test the per_stop revenue formula
          await tx.carrierLoad.update({
            where: { id: loadId },
            data: { rateType: 'per_stop' },
          });
        });

        // Arrive at pickup stop
        const arriveResult = await arriveStop(orgId, pickupStop!.id);
        expect('data' in arriveResult).toBe(true);
        if ('data' in arriveResult) {
          expect(arriveResult.data.arrivedAt).not.toBeNull();
          expect(arriveResult.data.status).toBe('arrived');
        }

        // -------------------------------------------------------------------
        // STEP 9 — Upload BOL document + set bolNumber on pickup stop
        // -------------------------------------------------------------------
        await prisma.$transaction(async (tx: any) => {
          await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
          await tx.carrierDocument.create({
            data: {
              parentType: 'stop',
              parentId: pickupStop!.id,
              stopId: pickupStop!.id,
              documentType: 'bol',
              fileUrl: 'test://bol.pdf',
              filename: 'test-bol.pdf',
              uploadedBy: userId,
            },
          });
          await tx.carrierStop.update({
            where: { id: pickupStop!.id },
            data: { bolNumber: 'BOL-TEST-001' },
          });
        });

        // Verify BOL document and bolNumber are present
        const bolDoc = await prisma.$transaction(async (tx: any) => {
          await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
          return tx.carrierDocument.findFirst({
            where: { stopId: pickupStop!.id, documentType: 'bol' },
          });
        });
        expect(bolDoc).not.toBeNull();
        expect(bolDoc!.filename).toBe('test-bol.pdf');

        const pickupWithBol = await prisma.$transaction(async (tx: any) => {
          await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
          return tx.carrierStop.findFirst({ where: { id: pickupStop!.id } });
        });
        expect(pickupWithBol!.bolNumber).toBe('BOL-TEST-001');

        // -------------------------------------------------------------------
        // STEP 10 — Complete pickup stop (BOL present — should succeed)
        // -------------------------------------------------------------------
        const completePickupResult = await completeStop(orgId, pickupStop!.id);
        expect('data' in completePickupResult).toBe(true);
        if ('data' in completePickupResult) {
          expect(completePickupResult.data.status).toBe('completed');
          const notes = JSON.parse(completePickupResult.data.notes ?? '{}');
          expect(notes.dwell_minutes).toBeGreaterThanOrEqual(0);
        }

        // -------------------------------------------------------------------
        // STEP 11 — CRITICAL: Attempt delivery stop completion WITHOUT POD
        //           Expected: 422 with exact error message
        // -------------------------------------------------------------------
        // First arrive at delivery stop
        const arriveDeliveryResult = await arriveStop(orgId, deliveryStop!.id);
        expect('data' in arriveDeliveryResult).toBe(true);

        // Try to complete WITHOUT POD document — must be rejected
        const failResult = await completeStop(orgId, deliveryStop!.id);
        expect('error' in failResult).toBe(true);
        if ('error' in failResult) {
          expect(failResult.status).toBe(422);
          expect(failResult.error).toBe('POD document required before completing this stop.');
        }

        // -------------------------------------------------------------------
        // STEP 12 — Upload POD document + set podNumber on delivery stop
        // -------------------------------------------------------------------
        await prisma.$transaction(async (tx: any) => {
          await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
          await tx.carrierDocument.create({
            data: {
              parentType: 'stop',
              parentId: deliveryStop!.id,
              stopId: deliveryStop!.id,
              documentType: 'pod',
              fileUrl: 'test://pod.pdf',
              filename: 'test-pod.pdf',
              uploadedBy: userId,
            },
          });
          await tx.carrierStop.update({
            where: { id: deliveryStop!.id },
            data: { podNumber: 'POD-TEST-001' },
          });
        });

        // -------------------------------------------------------------------
        // STEP 13 — Complete delivery stop (POD present — should succeed and cascade)
        // -------------------------------------------------------------------
        const completeDeliveryResult = await completeStop(orgId, deliveryStop!.id);
        expect('data' in completeDeliveryResult).toBe(true);
        if ('data' in completeDeliveryResult) {
          expect(completeDeliveryResult.data.status).toBe('completed');
        }

        // -------------------------------------------------------------------
        // STEP 14 — Verify load status and revenue calculation
        //           per_stop: baseRate(65) * delivery_stop_count(1) = 65
        //           fuelSurchargeMethod=per_mile, actualMiles=0 → FSC=0
        //           totalRevenue = 65
        // -------------------------------------------------------------------
        const finalLoad = await prisma.$transaction(async (tx: any) => {
          await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
          return tx.carrierLoad.findFirst({ where: { id: loadId } });
        });
        expect(finalLoad!.status).toBe('delivered');
        expect(Number(finalLoad!.totalRevenue)).toBeGreaterThan(0);
        expect(Number(finalLoad!.totalRevenue)).toBe(65);

        // -------------------------------------------------------------------
        // STEP 15 — Verify driver pay record was auto-generated
        // -------------------------------------------------------------------
        const payRecords = await prisma.$transaction(async (tx: any) => {
          await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
          return tx.driverPayRecord.findMany({
            where: { dispatchId, orgId },
          });
        });
        expect(payRecords.length).toBeGreaterThanOrEqual(1);
        const primaryPayRecord = payRecords.find((pr: any) => pr.driverId === driverId);
        expect(primaryPayRecord).toBeDefined();
        expect(primaryPayRecord!.status).toBe('pending');
      } finally {
        // -------------------------------------------------------------------
        // TEARDOWN — Delete in reverse dependency order using bypass_rls
        // -------------------------------------------------------------------
        try {
          await prisma.$transaction(async (tx: any) => {
            await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

            // Pay records — filter by dispatchId
            if (dispatchIds.length > 0) {
              await tx.driverPayRecord.deleteMany({ where: { dispatchId: { in: dispatchIds } } });
            }

            // Documents attached to stops (all docs for this org's stops)
            if (orgId) {
              // Get all stop IDs for this org's dispatches, then delete their docs
              const allDispatches = await tx.carrierDispatch.findMany({
                where: { orgId },
                select: { id: true },
              });
              const allDispatchIds = allDispatches.map((d: any) => d.id);
              if (allDispatchIds.length > 0) {
                const allStops = await tx.carrierStop.findMany({
                  where: { dispatchId: { in: allDispatchIds } },
                  select: { id: true },
                });
                const allStopIds = allStops.map((s: any) => s.id);
                if (allStopIds.length > 0) {
                  await tx.carrierDocument.deleteMany({ where: { stopId: { in: allStopIds } } });
                }
                // Delete all stops for all dispatches (must happen before dispatch delete)
                await tx.carrierStop.deleteMany({ where: { dispatchId: { in: allDispatchIds } } });
              }
            }

            // Loads
            if (orgId) {
              await tx.carrierLoad.deleteMany({ where: { orgId } });
            }

            // Dispatches (all stops deleted above)
            if (orgId) {
              await tx.carrierDispatch.deleteMany({ where: { orgId } });
            }

            // Route template stops
            if (template?.id) {
              await tx.routeTemplateStop.deleteMany({ where: { routeTemplateId: template.id } });
            }

            // Route templates
            if (orgId) {
              await tx.routeTemplate.deleteMany({ where: { orgId } });
            }

            // Contracts
            if (orgId) {
              await tx.carrierContract.deleteMany({ where: { orgId } });
            }

            // Facilities
            if (orgId) {
              await tx.carrierFacility.deleteMany({ where: { orgId } });
            }

            // Clients
            if (orgId) {
              await tx.carrierClient.deleteMany({ where: { orgId } });
            }

            // Trucks
            if (orgId) {
              await tx.carrierTruck.deleteMany({ where: { orgId } });
            }

            // Drivers
            if (orgId) {
              await tx.carrierDriver.deleteMany({ where: { orgId } });
            }

            // Users
            if (orgId) {
              await tx.user.deleteMany({ where: { tenantId: orgId } });
            }

            // Tenant
            if (orgId) {
              await tx.tenant.deleteMany({ where: { id: orgId } });
            }
          });
        } catch (cleanupErr) {
          console.error('Cleanup failed (non-fatal):', cleanupErr);
        }

        await prisma.$disconnect();
        await pool.end();
      }
    }
  );
});
