import { Prisma, FleetSizeBucket, LoadStatus, UserRole } from '../../generated/prisma';

// Use the canonical Prisma transaction client type
type TX = Prisma.TransactionClient;

interface SeedConfig {
  trucksCount: number;
  driversCount: number;
  customersCount: number;
}

const SEED_CONFIGS: Record<FleetSizeBucket, SeedConfig> = {
  [FleetSizeBucket.OWNER_OPERATOR]: { trucksCount: 1, driversCount: 1, customersCount: 1 },
  [FleetSizeBucket.SMALL]:          { trucksCount: 3, driversCount: 3, customersCount: 2 },
  [FleetSizeBucket.MEDIUM]:         { trucksCount: 3, driversCount: 3, customersCount: 2 },
  [FleetSizeBucket.LARGE]:          { trucksCount: 3, driversCount: 3, customersCount: 2 },
};

const SAMPLE_DRIVER_NAMES = [
  { firstName: 'Alex',   lastName: 'Sample' },
  { firstName: 'Jordan', lastName: 'Sample' },
  { firstName: 'Taylor', lastName: 'Sample' },
];

export async function seedSampleData(
  tx: TX,
  tenantId: string,
  tenantSlug: string,
  bucket: FleetSizeBucket,
  ownerUserId: string,
): Promise<void> {
  const cfg = SEED_CONFIGS[bucket];

  // Trucks
  const trucks = await Promise.all(
    Array.from({ length: cfg.trucksCount }, (_, i) =>
      tx.truck.create({
        data: {
          tenantId,
          make: (['Freightliner', 'Peterbilt', 'Kenworth'] as const)[i % 3],
          model: (['Cascadia', '389', 'T680'] as const)[i % 3],
          year: 2020 + i,
          vin: `SAMPLE${tenantId.replace(/-/g, '').substring(0, 10).toUpperCase()}${i + 1}`,
          licensePlate: `SMPL${String(i + 1).padStart(3, '0')}`,
          odometer: 50000 + i * 10000,
          isDispatchReady: true,
          isSample: true,
        },
      })
    )
  );

  // Sample driver Users — display-only rows, no Supabase Auth identity.
  // passwordHash is set to an invalid placeholder that bcrypt can never match,
  // so these rows cannot be used to authenticate.
  const SAMPLE_PASSWORD_PLACEHOLDER = 'SAMPLE—NOT_A_REAL_LOGIN';

  await Promise.all(
    Array.from({ length: cfg.driversCount }, (_, i) => {
      const name = SAMPLE_DRIVER_NAMES[i % SAMPLE_DRIVER_NAMES.length];
      return tx.user.create({
        data: {
          tenantId,
          email: `sample.driver.${i + 1}@${tenantSlug}.sample.invalid`,
          passwordHash: SAMPLE_PASSWORD_PLACEHOLDER,
          role: UserRole.DRIVER,
          firstName: name.firstName,
          lastName: name.lastName,
          isActive: true,
          isSample: true,
        },
      });
    })
  );

  // Customers
  const customerNames = ['Acme Freight Co.', 'Blue Ridge Logistics', 'Summit Carriers Inc.'];
  const customers = await Promise.all(
    Array.from({ length: cfg.customersCount }, (_, i) =>
      tx.customer.create({
        data: {
          tenantId,
          companyName: customerNames[i % customerNames.length],
          contactName: (['Jane Smith', 'Carlos Rivera', 'Priya Patel'] as const)[i % 3],
          email: `contact${i + 1}@sample.drivecommand.test`,
          phone: `555-010${i}`,
          isSample: true,
        },
      })
    )
  );

  // Loads — completed + in-transit
  // OWNER_OPERATOR: 1 completed + 1 in-transit = 2 loads
  // SMALL/MEDIUM/LARGE: 1 completed + 2 in-transit = 3 loads
  const loadSpecs: Array<{ status: LoadStatus; suffix: string; daysOffset: number }> = [
    { status: LoadStatus.DELIVERED,  suffix: '001', daysOffset: -7 },
    { status: LoadStatus.IN_TRANSIT, suffix: '002', daysOffset: 0 },
  ];
  if (bucket !== FleetSizeBucket.OWNER_OPERATOR) {
    loadSpecs.push({ status: LoadStatus.IN_TRANSIT, suffix: '003', daysOffset: 1 });
  }

  const now = new Date();
  for (const spec of loadSpecs) {
    const customer = customers[0]; // All sample loads go to first customer
    const truck = trucks[0];
    const pickupDate = new Date(now.getTime() + spec.daysOffset * 86_400_000 - 86_400_000);
    const deliveryDate = new Date(now.getTime() + spec.daysOffset * 86_400_000);

    await tx.load.create({
      data: {
        tenantId,
        loadNumber: `SAMPLE-${spec.suffix}`,
        customerId: customer.id,
        truckId: truck.id,
        driverId: ownerUserId, // owner is also the driver on sample loads
        origin: 'Chicago, IL',
        destination: 'Detroit, MI',
        pickupDate,
        deliveryDate,
        weight: 42000,
        commodity: 'General Freight',
        rate: 1200.00,
        status: spec.status,
        isSample: true,
      },
    });
  }
}
