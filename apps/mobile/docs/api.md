# Mobile API Reference

All mobile API endpoints are served by the Next.js web app under the `/api/mobile/` prefix.

**Base URL (development):** `http://10.0.2.2:3000/api/mobile`
**Base URL (production):** `https://app.drivecommand.com/api/mobile`

---

## Authentication

All endpoints require a Supabase JWT Bearer token in the `Authorization` header:

```
Authorization: Bearer <supabase_access_token>
```

Two auth patterns exist in the codebase:

- **`withMobileAuth` wrapper** (newer pattern) — used in newer routes; extracts `auth` object into the handler callback. Role enforcement via `allowedRoles` option.
- **`validateMobileToken` + manual check** (older pattern) — used in most routes; calls `validateMobileToken(req)` and then manually checks `auth.role` or `auth.driverId`.

Both patterns validate the same Supabase JWT and return identical auth context.

**Common error responses:**

| Status | Meaning |
|--------|---------|
| 401 | Missing or invalid token |
| 403 | Valid token but wrong role |
| 429 | Rate limited |
| 500 | Internal server error |

---

## Endpoint Summary

| # | Method | Path | Auth | Description |
|---|--------|------|------|-------------|
| 1 | GET | `/driver/dashboard` | DRIVER | Driver dashboard KPIs |
| 2 | GET | `/driver/loads` | DRIVER | Driver load list (paginated) |
| 3 | GET | `/driver/loads/[id]` | DRIVER | Driver load detail |
| 4 | POST | `/driver/loads/[id]/status` | DRIVER | Update load status |
| 5 | PATCH | `/driver/loads/[id]/revert` | DRIVER | Revert load status |
| 6 | GET | `/driver/loads/[id]/rate-confirmation` | DRIVER | Download rate confirmation PDF |
| 7 | GET | `/driver/documents` | DRIVER | Driver document list |
| 8 | POST | `/driver/documents` | DRIVER | Create document record |
| 9 | GET | `/driver/documents/[id]/url` | DRIVER | Get presigned S3 URL |
| 10 | POST | `/driver/documents/upload-url` | DRIVER | Get presigned upload URL |
| 11 | GET | `/driver/hos` | DRIVER | Today's HOS data |
| 12 | POST | `/driver/hos` | DRIVER | Record HOS status change |
| 13 | GET | `/driver/incidents` | DRIVER | Driver incident list |
| 14 | POST | `/driver/incidents` | DRIVER | Create incident report |
| 15 | POST | `/driver/incidents/upload-photo` | DRIVER | Get presigned photo upload URL |
| 16 | GET | `/driver/messages` | DRIVER | Driver messages |
| 17 | POST | `/driver/messages` | DRIVER | Send message |
| 18 | GET | `/driver/messages/route-thread` | DRIVER | Route-scoped messages |
| 19 | POST | `/driver/messages/route-thread` | DRIVER | Post route-scoped message |
| 20 | POST | `/driver/messages/mark-read` | DRIVER | Mark messages as read |
| 21 | GET | `/driver/messages/unread-count` | DRIVER | Unread message count |
| 22 | GET | `/driver/route` | DRIVER | Active route |
| 23 | GET | `/driver/tracking-token` | DRIVER | Active load tracking token |
| 24 | GET | `/owner/dashboard` | OWNER | Owner dashboard KPIs |
| 25 | GET | `/owner/loads` | OWNER | Owner load list (paginated) |
| 26 | POST | `/owner/loads` | OWNER | Create load |
| 27 | GET | `/owner/loads/[id]` | OWNER | Owner load detail |
| 28 | PATCH | `/owner/loads/[id]` | OWNER | Update load |
| 29 | PATCH | `/owner/loads/[id]/assign-truck` | OWNER | Assign/unassign truck |
| 30 | GET | `/owner/drivers` | OWNER | All drivers with compliance status |
| 31 | GET | `/owner/drivers/active` | OWNER | Active driver picker list |
| 32 | POST | `/owner/drivers/invite` | OWNER | Invite driver |
| 33 | GET | `/owner/drivers/[id]` | OWNER | Driver detail |
| 34 | GET | `/owner/trucks` | OWNER | Truck list (paginated) |
| 35 | POST | `/owner/trucks` | OWNER | Create truck |
| 36 | GET | `/owner/trucks/[id]` | OWNER | Truck detail |
| 37 | GET | `/owner/invoices` | OWNER | Invoice stats and recent list |
| 38 | POST | `/owner/invoices` | OWNER | Create draft invoice |
| 39 | GET | `/owner/invoices/[id]` | OWNER | Invoice detail |
| 40 | GET | `/owner/customers` | OWNER | Customer picker list |
| 41 | POST | `/owner/customers` | OWNER | Create customer |
| 42 | GET | `/owner/compliance` | OWNER | Compliance alerts |
| 43 | GET | `/owner/crm` | OWNER | CRM stats and customer list |
| 44 | GET | `/owner/payroll` | OWNER | Payroll stats and records |
| 45 | GET | `/owner/fleet-positions` | OWNER | Latest GPS position per truck |
| 46 | GET | `/owner/map/vehicles` | OWNER | Vehicle map data with status |
| 47 | GET | `/owner/fleet/messages` | OWNER | Fleet message conversations |
| 48 | POST | `/owner/fleet/messages` | OWNER | Send fleet message |
| 49 | GET | `/owner/fleet/messages/[recipientId]` | OWNER | Message thread |
| 50 | POST | `/owner/fleet/messages/[recipientId]` | OWNER | Post to thread |
| 51 | POST | `/support/ticket` | ANY | Submit support ticket |
| 52 | POST | `/support/upload-screenshot` | ANY | Upload support screenshot |

---

## Driver Endpoints

### 1. GET /api/mobile/driver/dashboard

Returns KPI data for the driver's home screen.

**Auth:** DRIVER role required

**Response:**
```json
{
  "activeLoad": {
    "id": "uuid",
    "loadNumber": "LD-0042",
    "status": "IN_TRANSIT",
    "origin": "Chicago, IL",
    "destination": "Detroit, MI",
    "customer": { "id": "uuid", "companyName": "Acme Corp" },
    "truck": { "id": "uuid", "make": "Freightliner", "model": "Cascadia", "licensePlate": "ABC-123" }
  },
  "todayMiles": 0,
  "stopsCompleted": 2,
  "hosHoursRemaining": 11.0,
  "recentAlerts": []
}
```

**Notes:**
- `activeLoad` is `null` if the driver has no active load
- `todayMiles` and `hosHoursRemaining` are placeholders pending ELD integration
- `stopsCompleted` counts RouteStop records with status `DEPARTED` today

---

### 2. GET /api/mobile/driver/loads

Returns the driver's loads filtered by status group.

**Auth:** DRIVER role required

**Query Parameters:**

| Param | Type | Default | Values |
|-------|------|---------|--------|
| `status` | string | `active` | `active`, `history` |
| `page` | number | `1` | 1-based page number |
| `limit` | number | `50` | 1–100 |

- `active` returns loads with status: `PENDING`, `DISPATCHED`, `PICKED_UP`, `IN_TRANSIT`
- `history` returns loads with status: `DELIVERED`, `INVOICED`, `CANCELLED`

**Response:**
```json
{
  "loads": [
    {
      "id": "uuid",
      "loadNumber": "LD-0042",
      "status": "IN_TRANSIT",
      "origin": "Chicago, IL",
      "destination": "Detroit, MI",
      "pickupDate": "2026-03-31T08:00:00Z",
      "customer": { "id": "uuid", "companyName": "Acme Corp" },
      "updatedAt": "2026-03-31T10:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 12, "totalPages": 1 }
}
```

---

### 3. GET /api/mobile/driver/loads/[id]

Returns full load detail. Enforces that the load belongs to the authenticated driver.

**Auth:** DRIVER role required

**Path:** `/api/mobile/driver/loads/:id`

**Response:**
```json
{
  "id": "uuid",
  "loadNumber": "LD-0042",
  "status": "IN_TRANSIT",
  "origin": "Chicago, IL",
  "destination": "Detroit, MI",
  "customer": { "id": "uuid", "companyName": "Acme Corp", "email": "...", "phone": "..." },
  "truck": { "id": "uuid", "make": "Freightliner", "model": "Cascadia", "licensePlate": "ABC-123" },
  "route": { "id": "uuid", "stops": [...] },
  "stops": [
    { "id": "uuid", "position": 1, "address": "...", "status": "ARRIVED", ... }
  ]
}
```

**Errors:** 403 if load belongs to another driver, 404 if not found

---

### 4. POST /api/mobile/driver/loads/[id]/status

Updates a load's status using driver-friendly labels.

**Auth:** DRIVER role required

**Request Body:**
```json
{ "status": "ACCEPTED" | "EN_ROUTE" | "DELIVERED" }
```

**Status mapping (driver label → DB value):**

| Driver Label | DB Status | Valid from |
|-------------|-----------|------------|
| `ACCEPTED` | `DISPATCHED` | `PENDING` |
| `EN_ROUTE` | `IN_TRANSIT` | `DISPATCHED` |
| `DELIVERED` | `DELIVERED` | `IN_TRANSIT` |

Only the valid next transition is permitted from each current status.

**Response:**
```json
{ "success": true, "load": { ...updatedLoad } }
```

**Errors:** 400 if invalid status or invalid transition, 403 if not driver's load, 404 if not found

---

### 5. PATCH /api/mobile/driver/loads/[id]/revert

Reverts a load's status back one step. No request body required.

**Auth:** DRIVER role required

**Allowed revert transitions:**

| From | To |
|------|----|
| `PICKED_UP` | `DISPATCHED` |
| `IN_TRANSIT` | `PICKED_UP` |
| `DISPATCHED` | Blocked (cannot revert to PENDING) |

**Response:**
```json
{ "success": true, "load": { ...updatedLoad } }
```

**Errors:** 400 if revert not allowed, 403 if not driver's load, 404 if not found

---

### 6. GET /api/mobile/driver/loads/[id]/rate-confirmation

Generates a rate confirmation PDF for the load and returns it as base64.

**Auth:** DRIVER role required

**Available for statuses:** `DISPATCHED`, `PICKED_UP`, `IN_TRANSIT`, `DELIVERED`

**Response:**
```json
{ "pdf": "<base64string>", "filename": "RateConfirmation-LD-0042.pdf" }
```

**Errors:** 400 if load status is not eligible, 403 if not driver's load, 404 if not found

---

### 7. GET /api/mobile/driver/documents

Returns all documents for the authenticated driver with computed expiry status.

**Auth:** DRIVER role required

**Response:**
```json
{
  "documents": [
    {
      "id": "uuid",
      "fileName": "CDL-2026.pdf",
      "s3Key": "tenant-xxx/drivers/...",
      "contentType": "application/pdf",
      "sizeBytes": 204800,
      "documentType": "CDL",
      "expiryDate": "2027-01-15T00:00:00Z",
      "notes": null,
      "createdAt": "2026-01-01T00:00:00Z",
      "status": "VALID"
    }
  ]
}
```

Documents are sorted: `EXPIRED` first, then `EXPIRING` (within 30 days), then `VALID`.

**Document status values:** `VALID`, `EXPIRING`, `EXPIRED`

**Note:** `documentType` is stored in the DB's `description` field. Valid type keys: `CDL`, `MEDICAL_CARD`, `HAZMAT`, `INSURANCE`, `REGISTRATION`, `INSPECTION`, `OTHER`

---

### 8. POST /api/mobile/driver/documents

Creates a document record after the file has been uploaded to S3.

**Auth:** DRIVER role required

**Request Body:**
```json
{
  "type": "CDL",
  "name": "CDL Renewal 2027",
  "s3Key": "tenant-xxx/drivers/fileId-filename.pdf",
  "contentType": "application/pdf",
  "sizeBytes": 204800,
  "expiryDate": "2027-01-15"
}
```

**Required fields:** `type`, `name`, `s3Key`, `contentType`, `sizeBytes`
**Optional:** `expiryDate` (ISO date string)

**Constraints:**
- `s3Key` must start with `tenant-{tenantId}/drivers/`
- `contentType` must be `application/pdf`, `image/jpeg`, `image/png`, `image/heic`, or `image/webp`
- `sizeBytes` must be positive

**Response:** `201` with `{ document: DriverDocument }`

---

### 9. GET /api/mobile/driver/documents/[id]/url

Returns a presigned S3 GET URL for viewing a document. URL expires in 15 minutes.

**Auth:** DRIVER role required

**Response:** `{ "url": "https://s3.amazonaws.com/..." }`

**Errors:** 403 if document belongs to another driver, 404 if not found

---

### 10. POST /api/mobile/driver/documents/upload-url

Generates a presigned S3 PUT URL for direct-to-S3 upload.

**Auth:** DRIVER role required

**Request Body:**
```json
{ "fileName": "cdl.pdf", "contentType": "application/pdf", "sizeBytes": 204800 }
```

**Constraints:** Max file size 25MB. Allowed types: `application/pdf`, `image/jpeg`, `image/png`, `image/heic`, `image/webp`

**Response:** `{ "uploadUrl": "https://s3.amazonaws.com/...", "s3Key": "tenant-xxx/drivers/..." }`

---

### 11. GET /api/mobile/driver/hos

Returns today's HOS entries with calculated clock values.

**Auth:** DRIVER role required

**Response:**
```json
{
  "currentStatus": "DRIVING",
  "currentStatusSince": "2026-03-31T08:00:00Z",
  "timeInCurrentStatus": 3600,
  "todayEntries": [
    {
      "id": "uuid",
      "status": "OFF_DUTY",
      "startTime": "2026-03-31T00:00:00Z",
      "endTime": "2026-03-31T07:00:00Z"
    }
  ],
  "drivingMinutesToday": 60.0,
  "onDutyMinutesToday": 90.0,
  "hoursUntil14Limit": 13.5,
  "hoursUntil11DriveLimit": 10.0
}
```

---

### 12. POST /api/mobile/driver/hos

Records a duty status change. Closes the current open entry and creates a new one.

**Auth:** DRIVER role required

**Request Body:**
```json
{ "status": "DRIVING", "notes": "Optional note" }
```

**Valid status values:** `OFF_DUTY`, `SLEEPER_BERTH`, `DRIVING`, `ON_DUTY`

**Response:** `201` with `{ entry: HOSEntry }`

**Errors:** 400 if already in the requested status

---

### 13. GET /api/mobile/driver/incidents

Returns a paginated list of the driver's incidents, newest first. Returns up to 50 records.

**Auth:** DRIVER role required

**Response:**
```json
{
  "incidents": [
    {
      "id": "uuid",
      "category": "MECHANICAL",
      "severity": "MEDIUM",
      "description": "Tire blowout on I-90",
      "latitude": 41.8781,
      "longitude": -87.6298,
      "reportedAt": "2026-03-31T10:00:00Z"
    }
  ]
}
```

---

### 14. POST /api/mobile/driver/incidents

Creates an incident report for the authenticated driver.

**Auth:** DRIVER role required

**Request Body:**
```json
{
  "category": "ACCIDENT",
  "severity": "HIGH",
  "description": "Minor collision at intersection...",
  "latitude": 41.8781,
  "longitude": -87.6298,
  "photoS3Key": "tenant-xxx/drivers/photo.jpg"
}
```

**Valid categories:** `ACCIDENT`, `VIOLATION`, `MECHANICAL`, `HAZARD`, `OTHER`
**Valid severities:** `LOW`, `MEDIUM`, `HIGH`
**Description:** 10–500 characters
**Optional:** `latitude`, `longitude`, `photoS3Key`

**Response:** `201` with `{ incident: DriverIncident }`

---

### 15. POST /api/mobile/driver/incidents/upload-photo

Generates a presigned S3 PUT URL for incident photo upload.

**Auth:** DRIVER role required

**Request Body:**
```json
{ "fileName": "photo.jpg", "contentType": "image/jpeg", "sizeBytes": 1048576 }
```

**Constraints:** Max 10MB. Allowed types: `image/jpeg`, `image/png`

**Response:** `{ "uploadUrl": "...", "s3Key": "tenant-xxx/drivers/..." }`

---

### 16. GET /api/mobile/driver/messages

Returns messages from the driver's load conversations. Uses cursor-based pagination.

**Auth:** DRIVER role required

**Query Parameters:**

| Param | Default | Description |
|-------|---------|-------------|
| `cursor` | none | Message ID for cursor pagination |
| `limit` | `50` | 1–100 |

**Response:**
```json
{
  "messages": [
    {
      "id": "uuid",
      "tenantId": "uuid",
      "senderId": "uuid",
      "senderRole": "OWNER",
      "body": "You're dispatched for load LD-0042",
      "loadId": "uuid",
      "createdAt": "2026-03-31T09:00:00Z"
    }
  ],
  "nextCursor": "uuid | null"
}
```

Messages are returned oldest-first for chat display.

---

### 17. POST /api/mobile/driver/messages

Sends a message from the driver.

**Auth:** DRIVER role required

**Request Body:**
```json
{ "body": "On my way", "loadId": "optional-load-uuid" }
```

**Response:** `201` with the created `FleetMessage` object

---

### 18. GET /api/mobile/driver/messages/route-thread

Returns messages scoped to a specific route, ordered oldest-first.

**Auth:** DRIVER role required

**Query Parameters:** `routeId` (required)

**Response:** Array of `FleetMessage` objects

**Errors:** 400 if `routeId` missing, 403 if route not assigned to driver

---

### 19. POST /api/mobile/driver/messages/route-thread

Creates a route-scoped message from the driver.

**Auth:** DRIVER role required

**Request Body:**
```json
{ "routeId": "uuid", "body": "Arrived at pickup" }
```

**Response:** `201` with the created `FleetMessage` object

---

### 20. POST /api/mobile/driver/messages/mark-read

Acknowledges all messages as read. Read state is tracked client-side via MMKV; this endpoint exists for API symmetry.

**Auth:** DRIVER role required

**Response:** `{ "success": true }`

---

### 21. GET /api/mobile/driver/messages/unread-count

Returns the count of messages from non-drivers sent after a given timestamp.

**Auth:** DRIVER role required

**Query Parameters:**

| Param | Default | Description |
|-------|---------|-------------|
| `since` | 7 days ago | ISO timestamp for unread cutoff |

**Response:** `{ "count": 3 }`

---

### 22. GET /api/mobile/driver/route

Returns the driver's currently active (non-completed) route.

**Auth:** DRIVER role required

**Response:**
```json
{
  "route": {
    "id": "uuid",
    "name": "Chicago → Detroit Run",
    "origin": "Chicago, IL",
    "destination": "Detroit, MI",
    "status": "IN_PROGRESS",
    "scheduledDate": "2026-03-31T08:00:00Z",
    "loads": [
      { "id": "uuid", "loadNumber": "LD-0042", "status": "IN_TRANSIT", "sequence": 1 }
    ],
    "truck": { "make": "Freightliner", "model": "Cascadia", "year": 2022, "licensePlate": "ABC-123" }
  }
}
```

Returns `{ "route": null }` if no active route is found.

---

### 23. GET /api/mobile/driver/tracking-token

Returns the tracking token for the driver's active load. The mobile app stores this in MMKV.

**Auth:** DRIVER role required

**Response:** `{ "trackingToken": "token-string | null" }`

---

## Owner Endpoints

### 24. GET /api/mobile/owner/dashboard

Returns KPI data for the owner's home screen.

**Auth:** OWNER role required

**Response:**
```json
{
  "kpis": {
    "activeLoadsCount": 8,
    "driversOnDutyCount": 3,
    "revenueThisMonth": 42500.00,
    "openAlertsCount": 2
  },
  "activeLoads": [
    {
      "id": "uuid",
      "loadNumber": "LD-0042",
      "status": "IN_TRANSIT",
      "origin": "Chicago, IL",
      "destination": "Detroit, MI",
      "customer": { "id": "uuid", "companyName": "Acme Corp" },
      "truck": { "id": "uuid", "make": "Freightliner", "model": "Cascadia", "licensePlate": "ABC-123" },
      "driverName": "John Smith"
    }
  ],
  "driverStatuses": [
    {
      "id": "uuid",
      "name": "John Smith",
      "hosStatus": "DRIVING",
      "activeLoadNumber": "LD-0042"
    }
  ]
}
```

- `openAlertsCount` = expiring documents (within 30 days) + trucks in maintenance
- `activeLoads` returns top 5 most recently updated active loads
- `driverStatuses` returns all DRIVER users in the tenant

---

### 25. GET /api/mobile/owner/loads

Returns all loads for the owner's tenant, filtered by status tab.

**Auth:** OWNER role required

**Query Parameters:**

| Param | Default | Values |
|-------|---------|--------|
| `status` | `active` | `all`, `active`, `pending`, `delivered` |
| `page` | `1` | 1-based |
| `limit` | `50` | 1–100 |

- `active`: `DISPATCHED`, `PICKED_UP`, `IN_TRANSIT`
- `pending`: `PENDING`
- `delivered`: `DELIVERED`, `INVOICED`
- `all`: no filter

**Response:**
```json
{
  "loads": [ { ...load, "driver": { "id": "uuid", "name": "John Smith" } } ],
  "pagination": { "page": 1, "limit": 50, "total": 24, "totalPages": 1 }
}
```

---

### 26. POST /api/mobile/owner/loads

Creates a new load in `PENDING` status.

**Auth:** OWNER role required

**Request Body:**
```json
{
  "customerId": "uuid",
  "customerName": "Acme Corp",
  "origin": "Chicago, IL",
  "destination": "Detroit, MI",
  "pickupDate": "2026-04-01",
  "rate": 1500.00,
  "driverId": "optional-uuid",
  "routeId": "optional-uuid"
}
```

**Required:** `origin`, `destination`. Either `customerId` or `customerName` required.
Load number is auto-generated (`LD-XXXX` format).

**Response:** `201` with `{ load: Load }`

---

### 27. GET /api/mobile/owner/loads/[id]

Returns full load detail for any load in the owner's tenant.

**Auth:** OWNER role required

**Response:** Load object with `customer`, `truck`, `driver` (normalized name), `route` with `stops` (ordered by position), and `stops` flattened to top-level.

**Errors:** 403 if not owner, 404 if not found

---

### 28. PATCH /api/mobile/owner/loads/[id]

Updates a load's status, driver assignment, or notes.

**Auth:** OWNER role required

**Request Body (all fields optional):**
```json
{
  "status": "DELIVERED",
  "driverId": "uuid | null",
  "notes": "Delivered on time"
}
```

**Valid status values:** `PENDING`, `DISPATCHED`, `PICKED_UP`, `IN_TRANSIT`, `DELIVERED`, `INVOICED`, `CANCELLED`
(`null` for `driverId` unassigns the driver)

**Response:** `{ load: ...updatedLoad }`

---

### 29. PATCH /api/mobile/owner/loads/[id]/assign-truck

Assigns or unassigns a truck on a load.

**Auth:** OWNER role required

**Request Body:**
```json
{ "truckId": "uuid | null" }
```

(`null` unassigns the truck)

**Response:** `{ "success": true, "load": { ...load with truck } }`

**Errors:** 404 if load or truck not found, 403 if truck belongs to different tenant

---

### 30. GET /api/mobile/owner/drivers

Returns all active drivers with compliance status and current HOS/load info.

**Auth:** OWNER role required

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "John Smith",
    "email": "john@example.com",
    "phone": null,
    "status": "on_duty",
    "currentLoadNumber": "LD-0042",
    "hosStatus": "DRIVING",
    "complianceStatus": "ok",
    "expiringDocCount": 0,
    "expiredDocCount": 0
  }
]
```

- `status`: `on_duty` (has active HOS or active load) or `off_duty`
- `complianceStatus`: `ok`, `warning` (doc expiring within 30 days), `critical` (doc expired)

---

### 31. GET /api/mobile/owner/drivers/active

Returns a minimal list of active drivers for use in dropdowns and pickers.

**Auth:** OWNER role required

**Response:**
```json
[ { "id": "uuid", "name": "John Smith" } ]
```

---

### 32. POST /api/mobile/owner/drivers/invite

Sends a driver invitation email and creates a `DriverInvitation` record.

**Auth:** OWNER role required

**Request Body:**
```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "licenseNumber": "D123456"
}
```

**Required:** `firstName`, `lastName`, `email`

**Response:**
```json
{ "success": true, "invitationId": "uuid", "emailSent": true, "message": "Invitation sent to jane@example.com" }
```

**Errors:** 409 if user with email already exists in tenant

---

### 33. GET /api/mobile/owner/drivers/[id]

Returns full driver detail.

**Auth:** OWNER role required

**Response:**
```json
{
  "id": "uuid",
  "name": "John Smith",
  "email": "john@example.com",
  "phone": null,
  "hosStatus": "DRIVING",
  "hosStartTime": "2026-03-31T08:00:00Z",
  "complianceStatus": "warning",
  "currentLoad": { "id": "uuid", "loadNumber": "LD-0042", "status": "IN_TRANSIT", ... },
  "documents": [ { "id": "uuid", "documentType": "CDL", "status": "EXPIRING", ... } ],
  "recentIncidents": [ { "id": "uuid", "category": "MECHANICAL", "severity": "LOW", ... } ]
}
```

Documents sorted: `EXPIRED` first, then `EXPIRING`, then `VALID`.
`recentIncidents` returns last 3 incidents.

**Errors:** 404 if driver not found in tenant

---

### 34. GET /api/mobile/owner/trucks

Returns all non-archived trucks with computed operational status.

**Auth:** OWNER role required

**Query Parameters:** `page` (default 1), `limit` (default 50, max 100)

**Response:**
```json
{
  "trucks": [
    {
      "id": "uuid",
      "make": "Freightliner",
      "model": "Cascadia",
      "year": 2022,
      "licensePlate": "ABC-123",
      "odometer": 150000,
      "inMaintenance": false,
      "status": "Ready to Use",
      "variant": "default"
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 5, "totalPages": 1 }
}
```

**Status priority:** In Use → In Maintenance → Expired Docs → Ready to Use

---

### 35. POST /api/mobile/owner/trucks

Creates a new truck.

**Auth:** OWNER role required

**Request Body:**
```json
{
  "make": "Freightliner",
  "model": "Cascadia",
  "year": 2022,
  "vin": "1FUJGLDR0CLBP8795",
  "licensePlate": "ABC-123",
  "odometer": 150000,
  "registrationNumber": "REG-2026",
  "registrationExpiry": "2026-12-31",
  "insuranceNumber": "INS-001",
  "insuranceExpiry": "2026-06-30"
}
```

**Required:** `make`, `model`, `year`, `vin` (17 chars, no I/O/Q), `licensePlate`, `odometer`
**Optional:** registration/insurance fields (stored in `documentMetadata` JSONB)

**Response:** `201` with `{ truck: Truck }`

**Errors:** 409 if VIN or license plate already exists

---

### 36. GET /api/mobile/owner/trucks/[id]

Returns full truck detail including computed status.

**Auth:** OWNER role required

**Response:** Full truck record with `status`, `documentMetadata`, and timestamps.

**Errors:** 404 if not found

---

### 37. GET /api/mobile/owner/invoices

Returns invoice stats and the 20 most recent invoices.

**Auth:** OWNER role required

**Response:**
```json
{
  "stats": {
    "total": 45,
    "draft": 5,
    "overdue": 3,
    "outstandingAmount": 12500.00,
    "paidAmount": 85000.00
  },
  "invoices": [
    {
      "id": "uuid",
      "invoiceNumber": "INV-123456",
      "status": "SENT",
      "totalAmount": 2500.00,
      "customerName": "Acme Corp",
      "dueDate": "2026-04-15T00:00:00Z",
      "createdAt": "2026-03-31T00:00:00Z"
    }
  ]
}
```

---

### 38. POST /api/mobile/owner/invoices

Creates a draft invoice.

**Auth:** OWNER role required

**Request Body:**
```json
{
  "description": "Freight services - March 2026",
  "amount": 2500.00,
  "customerId": "optional-uuid",
  "dueDate": "2026-04-15"
}
```

**Required:** `description`, `amount` (must be > 0)

**Response:** `201` with `{ invoice: { id, invoiceNumber } }`

---

### 39. GET /api/mobile/owner/invoices/[id]

Returns full invoice detail with line items.

**Auth:** OWNER role required

**Response:**
```json
{
  "id": "uuid",
  "invoiceNumber": "INV-123456",
  "status": "SENT",
  "customerName": "Acme Corp",
  "issueDate": "...",
  "dueDate": "...",
  "paidDate": null,
  "notes": null,
  "subtotal": 2500.00,
  "tax": 0.00,
  "totalAmount": 2500.00,
  "items": [ { "id": "uuid", "description": "...", "quantity": 1, "unitPrice": 2500.00, "amount": 2500.00 } ],
  "createdByName": "John Owner",
  "createdAt": "..."
}
```

**Errors:** 404 if not found

---

### 40. GET /api/mobile/owner/customers

Returns minimal customer list for use in dropdown pickers, sorted alphabetically.

**Auth:** OWNER role required

**Response:** `[ { "id": "uuid", "name": "Acme Corp" } ]`

---

### 41. POST /api/mobile/owner/customers

Creates a new customer.

**Auth:** OWNER role required

**Request Body:**
```json
{
  "companyName": "Acme Corp",
  "contactName": "Jane Smith",
  "email": "jane@acme.com",
  "phone": "555-0100"
}
```

**Required:** `companyName`

**Response:** `201` with `{ customer: { id, companyName } }`

**Errors:** 409 if customer with same name already exists

---

### 42. GET /api/mobile/owner/compliance

Returns compliance summary and document expiry alerts.

**Auth:** OWNER role required

**Query Parameters:** `page` (default 1), `limit` (default 50)

**Response:**
```json
{
  "summary": {
    "expiredCount": 1,
    "expiringSoonCount": 3,
    "totalDriversTracked": 5,
    "totalTrucksTracked": 4
  },
  "alerts": [
    {
      "entityName": "John Smith",
      "documentType": "MEDICAL_CARD",
      "status": "EXPIRED",
      "daysUntilExpiry": -5
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 12, "totalPages": 1 }
}
```

Alerts cover both driver documents and truck registration/insurance from `documentMetadata`.
Sorted: `EXPIRED` first, then by `daysUntilExpiry` ascending.

---

### 43. GET /api/mobile/owner/crm

Returns CRM stats and paginated customer list.

**Auth:** OWNER role required

**Query Parameters:** `page` (default 1), `limit` (default 50)

**Response:**
```json
{
  "stats": { "total": 28, "active": 24, "vip": 3 },
  "customers": [
    { "id": "uuid", "companyName": "Acme Corp", "status": "ACTIVE", "priority": "VIP", "phone": "...", "email": "..." }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 28, "totalPages": 1 }
}
```

---

### 44. GET /api/mobile/owner/payroll

Returns payroll stats and the 20 most recent payroll records.

**Auth:** OWNER role required

**Response:**
```json
{
  "stats": { "total": 40, "draft": 5, "approved": 3, "totalPaid": 85000.00 },
  "records": [
    {
      "id": "uuid",
      "status": "PAID",
      "periodStart": "2026-03-01T00:00:00Z",
      "periodEnd": "2026-03-15T00:00:00Z",
      "totalPay": 2400.00,
      "driverName": "John Smith"
    }
  ]
}
```

---

### 45. GET /api/mobile/owner/fleet-positions

Returns the latest GPS position for each truck. Uses `DISTINCT ON truckId` to return one record per truck.

**Auth:** OWNER role required

**Response:**
```json
[
  {
    "truckId": "uuid",
    "latitude": 41.8781,
    "longitude": -87.6298,
    "speed": 65.5,
    "heading": 180,
    "timestamp": "2026-03-31T10:00:00Z",
    "truck": { "make": "Freightliner", "model": "Cascadia", "licensePlate": "ABC-123" },
    "driverName": "John Smith",
    "loadNumber": "LD-0042"
  }
]
```

Returns empty array if no GPS data exists.

---

### 46. GET /api/mobile/owner/map/vehicles

Returns vehicle positions with computed status for the live map screen.

**Auth:** OWNER role required

**Status computation:**
- `OFFLINE`: last GPS ping older than 10 minutes
- `MOVING`: last ping within 10 min and speed > 8 km/h
- `IDLE`: last ping within 10 min and speed ≤ 8 km/h

**Response:**
```json
{
  "vehicles": [
    {
      "truckId": "uuid",
      "truckName": "Freightliner Cascadia · ABC-123",
      "driverName": "John Smith",
      "driverId": "uuid",
      "latitude": 41.8781,
      "longitude": -87.6298,
      "speed": 65.5,
      "heading": 180,
      "lastPingAt": "2026-03-31T10:00:00Z",
      "status": "MOVING",
      "loadNumber": "LD-0042"
    }
  ]
}
```

---

### 47. GET /api/mobile/owner/fleet/messages

Returns fleet message conversations grouped by recipient, with last message preview.

**Auth:** OWNER role required

**Query Parameters:** `cursor`, `limit` (default 50)

**Response:**
```json
{
  "conversations": [
    {
      "recipientId": "uuid | load:uuid | route:uuid | null",
      "recipientName": "John Smith",
      "isBroadcast": false,
      "lastMessage": "You're dispatched...",
      "lastMessageAt": "2026-03-31T09:00:00Z",
      "unreadCount": 0
    }
  ],
  "nextCursor": "uuid | null"
}
```

Special `recipientId` values: `null` (broadcast), `load:uuid` (load thread), `route:uuid` (route thread)

---

### 48. POST /api/mobile/owner/fleet/messages

Creates a fleet message and sends push notifications.

**Auth:** OWNER role required

**Request Body:**
```json
{
  "body": "Heads up: road closure on I-90",
  "isBroadcast": true,
  "recipientId": "optional-driver-uuid"
}
```

- `isBroadcast: true` — sends to all active drivers; `recipientId` not needed
- `isBroadcast: false` — `recipientId` required

**Body limit:** 500 characters

**Response:** `201` with `{ message: { id, recipientName, body, isBroadcast, createdAt } }`

---

### 49. GET /api/mobile/owner/fleet/messages/[recipientId]

Returns the full message thread for a conversation.

**Auth:** OWNER role required

**Path parameter special values:**
- `broadcast` — all broadcast messages
- `load:{uuid}` — all messages for a load
- `route:{uuid}` — all messages for a route
- `{driverId}` — direct message thread with that driver

**Response:**
```json
{
  "messages": [
    {
      "id": "uuid",
      "senderId": "uuid",
      "senderRole": "OWNER",
      "senderName": "Fleet Owner",
      "body": "You're dispatched",
      "isBroadcast": false,
      "createdAt": "2026-03-31T09:00:00Z"
    }
  ],
  "recipientName": "John Smith"
}
```

---

### 50. POST /api/mobile/owner/fleet/messages/[recipientId]

Creates a new message in a thread and sends push notifications.

**Auth:** OWNER role required

**Same path parameter special values as GET** (see endpoint 49)

**Request Body:** `{ "body": "string" }` (max 500 characters)

**Push notification behavior:**
- Broadcast thread: pushes to all active DRIVER users
- Direct thread: pushes to the specific driver
- Load/route thread: no push (group context)

**Response:** `201` with `{ message: { id, senderId, senderRole, senderName, body, isBroadcast, createdAt } }`

---

## Support Endpoints

### 51. POST /api/mobile/support/ticket

Creates a support ticket from a mobile user (driver or owner).

**Auth:** Any authenticated user (DRIVER or OWNER)

**Request Body:**
```json
{
  "category": "BUG",
  "priority": "HIGH",
  "title": "Load status button not responding",
  "description": "When I press the Accept button on load LD-0042...",
  "fromPage": "/loads/uuid",
  "screenshotKey": "optional-s3-key"
}
```

**Valid categories:** `BILLING`, `BUG`, `FEATURE`, `GENERAL` (default: `GENERAL`)
**Valid priorities:** `LOW`, `NORMAL`, `HIGH`, `URGENT` (default: `NORMAL`)
**`title`:** 3–200 characters
**`description`:** 10–2000 characters

Ticket number is auto-generated (`TKT-XXXX` format). Platform is hardcoded as `MOBILE`.

**Response:** `201` with `{ ticketNumber: "TKT-0042" }`

---

### 52. POST /api/mobile/support/upload-screenshot

Uploads a support screenshot to Supabase Storage and returns the storage key.

**Auth:** Any authenticated user (DRIVER or OWNER)

**Request Body:**
```json
{ "base64": "<base64-encoded-image>", "mimeType": "image/png" }
```

**Constraints:** Max 10MB. Allowed types: `image/jpeg`, `image/png`

**Response:** `{ "s3Key": "tenant-xxx/support/fileId-screenshot.png" }`

Use the returned `s3Key` as `screenshotKey` when creating the ticket.
