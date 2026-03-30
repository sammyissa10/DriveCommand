import { describe, it, expect } from 'vitest';
import {
  loadCreateSchema,
  routeCreateSchema,
  driverInviteSchema,
  truckCreateSchema,
} from '@drivecommand/validation';

describe('loadCreateSchema', () => {
  it('parses valid load data without throwing', () => {
    const validLoad = {
      customerId: '123e4567-e89b-12d3-a456-426614174000',
      origin: 'Chicago, IL',
      destination: 'Detroit, MI',
      pickupDate: '2026-04-01',
      rate: 1500,
    };
    expect(() => loadCreateSchema.parse(validLoad)).not.toThrow();
  });

  it('returns success: false with invalid customerId', () => {
    const result = loadCreateSchema.safeParse({
      customerId: 'not-a-uuid',
      origin: 'Chicago, IL',
      destination: 'Detroit, MI',
      pickupDate: '2026-04-01',
      rate: 1500,
    });
    expect(result.success).toBe(false);
  });

  it('returns success: false when origin is missing', () => {
    const result = loadCreateSchema.safeParse({
      customerId: '123e4567-e89b-12d3-a456-426614174000',
      destination: 'Detroit, MI',
      pickupDate: '2026-04-01',
      rate: 1500,
    });
    expect(result.success).toBe(false);
  });

  it('returns success: false when rate is negative', () => {
    const result = loadCreateSchema.safeParse({
      customerId: '123e4567-e89b-12d3-a456-426614174000',
      origin: 'Chicago, IL',
      destination: 'Detroit, MI',
      pickupDate: '2026-04-01',
      rate: -100,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/positive/i);
    }
  });
});

describe('routeCreateSchema', () => {
  it('parses valid route data', () => {
    const validRoute = {
      origin: 'Chicago, IL',
      destination: 'Detroit, MI',
      scheduledDate: '2026-04-01T08:00',
      driverId: '123e4567-e89b-12d3-a456-426614174000',
      truckId: '223e4567-e89b-12d3-a456-426614174001',
    };
    const result = routeCreateSchema.safeParse(validRoute);
    expect(result.success).toBe(true);
  });

  it('returns success: false when origin is missing', () => {
    const result = routeCreateSchema.safeParse({
      destination: 'Detroit, MI',
      scheduledDate: '2026-04-01T08:00',
      driverId: '123e4567-e89b-12d3-a456-426614174000',
      truckId: '223e4567-e89b-12d3-a456-426614174001',
    });
    expect(result.success).toBe(false);
  });
});

describe('driverInviteSchema', () => {
  it('parses valid driver invite data', () => {
    const validInvite = {
      email: 'driver@example.com',
      firstName: 'John',
      lastName: 'Doe',
      licenseNumber: 'DL123456',
    };
    const result = driverInviteSchema.safeParse(validInvite);
    expect(result.success).toBe(true);
  });

  it('returns success: false with invalid email', () => {
    const result = driverInviteSchema.safeParse({
      email: 'not-an-email',
      firstName: 'John',
      lastName: 'Doe',
      licenseNumber: 'DL123456',
    });
    expect(result.success).toBe(false);
  });

  it('returns success: false when firstName is empty', () => {
    const result = driverInviteSchema.safeParse({
      email: 'driver@example.com',
      firstName: '',
      lastName: 'Doe',
      licenseNumber: 'DL123456',
    });
    expect(result.success).toBe(false);
  });
});

describe('truckCreateSchema', () => {
  it('parses valid truck data', () => {
    const validTruck = {
      make: 'Kenworth',
      model: 'T680',
      year: 2022,
      licensePlate: 'ABC-1234',
      // VIN: 17 chars, no I/O/Q allowed (valid format)
      vin: '1XKWDB0X5LJ385429',
      odometer: 50000,
    };
    const result = truckCreateSchema.safeParse(validTruck);
    expect(result.success).toBe(true);
  });

  it('returns success: false with year out of range', () => {
    const result = truckCreateSchema.safeParse({
      make: 'Kenworth',
      model: 'T680',
      year: 1800, // too old — min is 1900
      licensePlate: 'ABC-1234',
      vin: '1XKWDB0X5LJ385429',
      odometer: 50000,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/1900/);
    }
  });

  it('returns success: false with invalid VIN (wrong length)', () => {
    const result = truckCreateSchema.safeParse({
      make: 'Kenworth',
      model: 'T680',
      year: 2022,
      licensePlate: 'ABC-1234',
      vin: 'SHORT', // not 17 chars
      odometer: 50000,
    });
    expect(result.success).toBe(false);
  });
});
