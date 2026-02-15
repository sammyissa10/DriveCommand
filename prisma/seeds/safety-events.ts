/**
 * Safety Event Seed Generator
 *
 * Generates safety events linked to actual GPS trail coordinates.
 */

import { PrismaClient, Prisma, SafetyEventType, SeverityLevel } from '@prisma/client';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

interface Truck {
  id: string;
}

interface GPSLocation {
  truckId: string;
  latitude: any;
  longitude: any;
  timestamp: Date;
}

/**
 * Generate safety events linked to GPS coordinates from generated trails
 *
 * For each truck:
 * - Generate 5-15 random safety events
 * - Each event occurs at an actual GPS location on the truck's route
 * - Event types weighted toward HARSH_BRAKING and SPEEDING
 */
export async function seedSafetyEvents(
  tenantId: string,
  trucks: Truck[],
  gpsLocations: GPSLocation[]
): Promise<number> {
  const allEvents: Prisma.SafetyEventCreateManyInput[] = [];

  for (const truck of trucks) {
    // Get this truck's GPS locations
    const truckLocations = gpsLocations.filter((loc) => loc.truckId === truck.id);

    if (truckLocations.length === 0) {
      console.warn(`No GPS locations found for truck ${truck.id}, skipping safety events`);
      continue;
    }

    // Generate 5-15 random safety events per truck
    const eventCount = faker.number.int({ min: 5, max: 15 });

    for (let i = 0; i < eventCount; i++) {
      // Pick a random GPS location from the truck's trail
      const location = faker.helpers.arrayElement(truckLocations);

      // Pick random event type with weighted distribution
      const eventType = faker.helpers.weightedArrayElement([
        { weight: 30, value: SafetyEventType.HARSH_BRAKING },
        { weight: 30, value: SafetyEventType.SPEEDING },
        { weight: 20, value: SafetyEventType.HARSH_ACCELERATION },
        { weight: 10, value: SafetyEventType.HARSH_CORNERING },
        { weight: 5, value: SafetyEventType.LANE_DEPARTURE },
        { weight: 3, value: SafetyEventType.COLLISION },
        { weight: 2, value: SafetyEventType.ROLLOVER_RISK },
      ]);

      // Severity based on event type
      let severity: SeverityLevel;
      if (eventType === SafetyEventType.SPEEDING) {
        severity = faker.helpers.arrayElement([
          SeverityLevel.HIGH,
          SeverityLevel.HIGH,
          SeverityLevel.CRITICAL,
        ]);
      } else if (eventType === SafetyEventType.HARSH_BRAKING) {
        severity = faker.helpers.arrayElement([
          SeverityLevel.MEDIUM,
          SeverityLevel.MEDIUM,
          SeverityLevel.HIGH,
        ]);
      } else if (
        eventType === SafetyEventType.COLLISION ||
        eventType === SafetyEventType.ROLLOVER_RISK
      ) {
        severity = SeverityLevel.CRITICAL;
      } else {
        severity = faker.helpers.arrayElement([SeverityLevel.LOW, SeverityLevel.MEDIUM]);
      }

      // G-force: only for harsh braking/acceleration/cornering events
      let gForce: Prisma.Decimal | null = null;
      if (
        eventType === SafetyEventType.HARSH_BRAKING ||
        eventType === SafetyEventType.HARSH_ACCELERATION ||
        eventType === SafetyEventType.HARSH_CORNERING
      ) {
        gForce = new Prisma.Decimal(
          faker.number.float({ min: 0.5, max: 2.5, fractionDigits: 2 }).toFixed(2)
        );
      }

      // Speed: 45-95 mph (higher for speeding events)
      const speed = new Prisma.Decimal(
        eventType === SafetyEventType.SPEEDING
          ? faker.number.float({ min: 75, max: 95, fractionDigits: 1 }).toFixed(1)
          : faker.number.float({ min: 45, max: 75, fractionDigits: 1 }).toFixed(1)
      );

      // SpeedLimit: only for speeding events (55-75 mph, lower than actual speed)
      let speedLimit: Prisma.Decimal | null = null;
      if (eventType === SafetyEventType.SPEEDING) {
        speedLimit = new Prisma.Decimal(
          faker.number.float({ min: 55, max: 70, fractionDigits: 0 }).toFixed(0)
        );
      }

      // Metadata: context field
      const context = faker.helpers.arrayElement([
        'Highway',
        'Interstate',
        'City streets',
        'Residential',
      ]);

      allEvents.push({
        truckId: truck.id,
        eventType,
        severity,
        timestamp: location.timestamp,
        latitude: location.latitude,
        longitude: location.longitude,
        speed,
        gForce,
        speedLimit,
        metadata: { context },
        tenantId,
        // driverId and routeId are null (not available in seed data)
        driverId: null,
        routeId: null,
      });
    }
  }

  // Insert all safety events in a single transaction with RLS context
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;
    await tx.safetyEvent.createMany({ data: allEvents });
  });

  return allEvents.length;
}
