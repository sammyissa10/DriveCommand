/**
 * Fuel Record Seed Generator
 *
 * Generates fuel records with realistic odometer progression.
 */

import { PrismaClient, Prisma, FuelType } from '@prisma/client';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

interface Truck {
  id: string;
  unitNumber?: string;
  odometer?: number;
}

/**
 * Generate fuel records with progressive odometer readings
 *
 * For each truck:
 * - Generate 8-12 fill-up records over last 30 days
 * - Each fill-up adds 200-400 miles to odometer
 * - Realistic diesel prices and quantities
 */
export async function seedFuelRecords(
  tenantId: string,
  trucks: Truck[]
): Promise<number> {
  const allRecords: Prisma.FuelRecordCreateManyInput[] = [];

  for (const truck of trucks) {
    // Generate 8-12 fuel fill-up records over last 30 days
    const recordCount = faker.number.int({ min: 8, max: 12 });

    // Start from truck's current odometer (or 0 if not set)
    let currentOdometer = truck.odometer ?? 0;

    // Distribute fill-ups evenly over last 30 days
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Sort by timestamp ascending (oldest first)
    const timestamps: Date[] = [];
    for (let i = 0; i < recordCount; i++) {
      const timestamp = faker.date.between({ from: thirtyDaysAgo, to: now });
      timestamps.push(timestamp);
    }
    timestamps.sort((a, b) => a.getTime() - b.getTime());

    for (const timestamp of timestamps) {
      // Each fill-up adds 200-400 miles to odometer
      const milesSinceLastFillup = faker.number.int({ min: 200, max: 400 });
      currentOdometer += milesSinceLastFillup;

      // Fuel type: DIESEL for all fleet trucks
      const fuelType = FuelType.DIESEL;

      // Quantity: 50-150 gallons per fill-up
      const quantity = new Prisma.Decimal(
        faker.number.float({ min: 50, max: 150, fractionDigits: 2 }).toFixed(2)
      );

      // Unit cost: $3.20-$4.50/gallon (realistic diesel prices)
      const unitCost = new Prisma.Decimal(
        faker.number.float({ min: 3.2, max: 4.5, fractionDigits: 2 }).toFixed(2)
      );

      // Total cost: quantity * unitCost
      const totalCost = new Prisma.Decimal(
        (parseFloat(quantity.toString()) * parseFloat(unitCost.toString())).toFixed(2)
      );

      // Location: random truck stop name
      const location = faker.helpers.arrayElement([
        "Love's Travel Stop",
        'Pilot Flying J',
        'TA Petro',
        'Shell',
        'Chevron',
        'Speedway',
        "Buc-ee's",
        'Travel Centers of America',
      ]);

      allRecords.push({
        truckId: truck.id,
        timestamp,
        fuelType,
        quantity,
        unitCost,
        totalCost,
        location,
        odometer: currentOdometer,
        isEstimated: false,
        tenantId,
        // Latitude/longitude: null (fuel station coordinates not critical for Phase 11)
        latitude: null,
        longitude: null,
      });
    }
  }

  // Insert all fuel records in a single transaction with RLS context
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;
    await tx.fuelRecord.createMany({ data: allRecords });
  });

  return allRecords.length;
}
