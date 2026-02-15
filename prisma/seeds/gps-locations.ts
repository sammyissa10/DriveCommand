/**
 * GPS Location Seed Generator
 *
 * Generates realistic GPS trails for trucks using Turf.js interpolation
 * along US interstate routes.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import * as turf from '@turf/turf';
import { faker } from '@faker-js/faker';
import { ROUTE_PAIRS } from './route-data.js';

const prisma = new PrismaClient();

interface Truck {
  id: string;
  unitNumber?: string;
  odometer?: number;
}

/**
 * Generate GPS trails for trucks using Turf.js interpolation
 *
 * For each truck:
 * - Pick 3-5 random route pairs
 * - Generate smooth GPS trail between origin and destination
 * - Interpolate points every 1-2 miles (to avoid 50K+ records)
 * - Add GPS drift for realism
 */
export async function seedGPSLocations(
  tenantId: string,
  trucks: Truck[]
): Promise<number> {
  const allLocations: Prisma.GPSLocationCreateManyInput[] = [];

  for (const truck of trucks) {
    // Pick 3-5 random routes for this truck
    const routeCount = faker.number.int({ min: 3, max: 5 });
    const selectedRoutes = faker.helpers.arrayElements(ROUTE_PAIRS, routeCount);

    for (const route of selectedRoutes) {
      // Random start time within last 30 days
      const startTime = faker.date.recent({ days: 30 });

      // Create LineString between origin and destination
      // IMPORTANT: Turf uses [lng, lat] order (GeoJSON standard)
      const line = turf.lineString([
        [route.origin.lng, route.origin.lat],
        [route.destination.lng, route.destination.lat],
      ]);

      // Calculate total distance in miles
      const totalDistance = turf.length(line, { units: 'miles' });

      // Calculate realistic trip duration (distance / 60 mph average)
      const tripDurationHours = totalDistance / 60;
      const tripDurationMs = tripDurationHours * 60 * 60 * 1000;

      // Generate points every 2 miles (to keep total under 50K records)
      // For a 1000-mile route: 500 points
      // For 25 trucks x 4 routes x 500 avg points = 50K records
      const intervalMiles = 2;
      const numPoints = Math.floor(totalDistance / intervalMiles);

      for (let i = 0; i <= numPoints; i++) {
        const distanceAlongRoute = i * intervalMiles;

        // Get interpolated point
        const point = turf.along(line, distanceAlongRoute, { units: 'miles' });

        // Extract coordinates (remember: [lng, lat] order)
        const [lng, lat] = point.geometry.coordinates;

        // Add GPS drift for realism (100-500m offset)
        const driftLat = faker.number.float({ min: -0.005, max: 0.005 });
        const driftLng = faker.number.float({ min: -0.005, max: 0.005 });

        const driftedLat = lat + driftLat;
        const driftedLng = lng + driftLng;

        // Calculate timestamp (proportional to distance)
        const progressRatio = distanceAlongRoute / totalDistance;
        const timestamp = new Date(startTime.getTime() + progressRatio * tripDurationMs);

        // Speed: 55-65 mph with variation
        const speed = faker.number.float({ min: 55, max: 65, fractionDigits: 1 });

        // Heading: bearing to next point (or previous for last point)
        let heading: number;
        if (i < numPoints) {
          const nextPoint = turf.along(line, (i + 1) * intervalMiles, { units: 'miles' });
          heading = turf.bearing(point, nextPoint);
        } else {
          const prevPoint = turf.along(line, (i - 1) * intervalMiles, { units: 'miles' });
          heading = turf.bearing(prevPoint, point);
        }

        // Normalize heading to 0-360
        if (heading < 0) heading += 360;

        // Altitude: 100-2000m random
        const altitude = faker.number.float({ min: 100, max: 2000, fractionDigits: 1 });

        // Accuracy: 5-15m random
        const accuracy = faker.number.float({ min: 5, max: 15, fractionDigits: 1 });

        allLocations.push({
          truckId: truck.id,
          latitude: new Prisma.Decimal(driftedLat.toFixed(8)),
          longitude: new Prisma.Decimal(driftedLng.toFixed(8)),
          timestamp,
          speed: new Prisma.Decimal(speed.toFixed(1)),
          heading: new Prisma.Decimal(heading.toFixed(1)),
          altitude: new Prisma.Decimal(altitude.toFixed(1)),
          accuracy: new Prisma.Decimal(accuracy.toFixed(1)),
          tenantId,
        });
      }
    }
  }

  // Insert all GPS locations in a single transaction with RLS context
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;
    await tx.gPSLocation.createMany({ data: allLocations });
  });

  return allLocations.length;
}
