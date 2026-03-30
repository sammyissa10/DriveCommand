/**
 * OpenAPI 3.1 specification generator for DriveCommand mobile API routes.
 *
 * Generates an OpenAPI spec for all /api/mobile/* endpoints.
 * Schema shapes mirror packages/validation schemas without modifying them.
 *
 * Usage: npx tsx scripts/generate-openapi.ts
 */

import { OpenAPIRegistry, OpenApiGeneratorV31, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Must be called before any .openapi() usage
extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

// ─── Request schemas (mirroring packages/validation) ────────────

const LoadCreateSchema = registry.register(
  'LoadCreate',
  z.object({
    customerId: z.string().uuid(),
    origin: z.string().min(1),
    destination: z.string().min(1),
    pickupDate: z.string(),
    deliveryDate: z.string().optional(),
    rate: z.number().positive(),
    notes: z.string().optional(),
  }).openapi({ title: 'LoadCreate', description: 'Payload for creating a new load' })
);

const RouteCreateSchema = registry.register(
  'RouteCreate',
  z.object({
    origin: z.string().min(1),
    destination: z.string().min(1),
    scheduledDate: z.string(),
    driverId: z.string().uuid(),
    truckId: z.string().uuid(),
    notes: z.string().optional(),
  }).openapi({ title: 'RouteCreate', description: 'Payload for creating a new route' })
);

const TruckCreateSchema = registry.register(
  'TruckCreate',
  z.object({
    make: z.string().min(1),
    model: z.string().min(1),
    year: z.number().int().min(1900),
    licensePlate: z.string().min(1),
    vin: z.string().length(17),
    odometer: z.number().min(0),
  }).openapi({ title: 'TruckCreate', description: 'Payload for registering a new truck' })
);

const DriverInviteSchema = registry.register(
  'DriverInvite',
  z.object({
    email: z.string().email(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    licenseNumber: z.string().min(1),
  }).openapi({ title: 'DriverInvite', description: 'Payload for inviting a new driver' })
);

// Keep references to avoid unused variable warnings
void LoadCreateSchema;
void RouteCreateSchema;
void TruckCreateSchema;
void DriverInviteSchema;

const bearerAuth = registry.registerComponent('securitySchemes', 'BearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'Supabase JWT',
  description: 'Bearer token issued by POST /api/auth/login',
});

// ─── Mobile API Paths ────────────────────────────────────────────

// Driver Dashboard
registry.registerPath({
  method: 'get',
  path: '/api/mobile/driver/dashboard',
  summary: 'Get driver dashboard data',
  description: 'Returns active load, today miles, stops completed, HOS hours remaining, and alerts.',
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    200: {
      description: 'Driver dashboard data',
      content: {
        'application/json': {
          schema: z.object({
            activeLoad: z.object({
              id: z.string().uuid(),
              origin: z.string(),
              destination: z.string(),
              status: z.string(),
            }).nullable(),
            todayMiles: z.number(),
            stopsCompleted: z.number(),
            hosHoursRemaining: z.number(),
            recentAlerts: z.array(z.unknown()),
          }).openapi({ title: 'DriverDashboardResponse' }),
        },
      },
    },
    401: { description: 'Unauthorized — missing or invalid Bearer token' },
    403: { description: 'Forbidden — OWNER role used driver endpoint' },
  },
});

// Driver Loads List
registry.registerPath({
  method: 'get',
  path: '/api/mobile/driver/loads',
  summary: 'List loads for the authenticated driver',
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    200: {
      description: 'Driver loads',
      content: {
        'application/json': {
          schema: z.object({
            loads: z.array(z.object({
              id: z.string().uuid(),
              origin: z.string(),
              destination: z.string(),
              status: z.string(),
              pickupDate: z.string(),
              deliveryDate: z.string().nullable(),
              rate: z.number(),
              customer: z.object({ companyName: z.string() }).nullable(),
            })).openapi({ title: 'DriverLoadsList' }),
          }),
        },
      },
    },
    401: { description: 'Unauthorized' },
  },
});

// Driver Load Status Update
registry.registerPath({
  method: 'patch',
  path: '/api/mobile/driver/loads/{id}/status',
  summary: 'Update load status',
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            status: z.enum(['PICKED_UP', 'IN_TRANSIT', 'DELIVERED']),
            notes: z.string().optional(),
          }).openapi({ title: 'LoadStatusUpdate' }),
        },
      },
    },
  },
  responses: {
    200: { description: 'Status updated successfully' },
    400: { description: 'Invalid status transition' },
    401: { description: 'Unauthorized' },
    403: { description: 'Forbidden — not your load' },
    404: { description: 'Load not found' },
  },
});

// Owner Dashboard
registry.registerPath({
  method: 'get',
  path: '/api/mobile/owner/dashboard',
  summary: 'Get owner dashboard KPIs',
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    200: {
      description: 'Owner dashboard KPIs',
      content: {
        'application/json': {
          schema: z.object({
            totalTrucks: z.number(),
            activeDrivers: z.number(),
            activeLoads: z.number(),
            pendingInvoicesTotal: z.number(),
            driversStatus: z.array(z.object({
              id: z.string(),
              name: z.string(),
              status: z.enum(['ACTIVE', 'INACTIVE', 'ON_ROUTE']),
            })),
          }).openapi({ title: 'OwnerDashboardResponse' }),
        },
      },
    },
    401: { description: 'Unauthorized' },
  },
});

// ─── Generator ──────────────────────────────────────────────────

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      version: '1.0.0',
      title: 'DriveCommand Mobile API',
      description: 'REST API consumed by the DriveCommand React Native mobile app. All endpoints require Bearer token authentication.',
      contact: {
        name: 'DriveCommand Support',
        url: 'https://drivecommand.com',
      },
    },
    servers: [
      {
        url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        description: 'API server',
      },
    ],
  });
}
