# DriveCommand Glossary

Domain terminology used across the DriveCommand codebase, API, and documentation.

---

## A

**Accessorial Charges**
Additional fees beyond the base freight rate, such as fuel surcharges, detention pay, liftgate fees, or layover charges. Not yet a structured field in DriveCommand — typically captured in load notes or invoice line items.

**ACCEPTED** (driver status label)
Driver-facing status label meaning the driver has accepted their dispatch. Maps to `DISPATCHED` in the database. See [Load Status Mapping](#load-status-mapping).

---

## B

**BOL (Bill of Lading)**
A legal document between a shipper and carrier listing the type, quantity, and destination of goods. Serves as a receipt and contract. In DriveCommand, drivers can upload BOL documents via the document management system.

**bypass_rls**
A PostgreSQL session configuration set at the start of every mobile API database transaction: `SELECT set_config('app.bypass_rls', 'on', TRUE)`. Required because mobile API routes authenticate via Supabase JWT Bearer tokens rather than session cookies. The RLS policies check for this config to allow the query to proceed. Every mobile route that sets this must be gated by `validateMobileToken()` or `withMobileAuth()` to ensure security. See `apps/web/src/lib/auth/mobile-auth.ts` for full documentation.

---

## C

**CANCELLED**
A terminal load status. The load has been cancelled and will not be delivered. Owner-only action; drivers cannot cancel loads.

**CDL (Commercial Driver's License)**
The required license class for operating commercial motor vehicles (CMVs) in the United States. Drivers upload CDL documents with expiry dates for compliance tracking.

**Compliance Dashboard**
The owner-facing view that aggregates driver document expiry (CDL, medical card, HAZMAT, etc.) and truck document expiry (registration, insurance) into a single alert list. Mobile endpoint: `GET /api/mobile/owner/compliance`.

**complianceStatus**
A computed field on driver and document objects: `ok` (all documents valid), `warning` (at least one document expiring within 30 days), `critical` (at least one document expired).

---

## D

**Deadhead Miles**
Miles driven with an empty trailer (no freight). Affects profitability per mile calculations. Not yet a structured field in DriveCommand.

**DELIVERED**
A load status indicating the freight has been delivered to the destination. Drivers can transition to this status via the mobile app. Owners can also set this directly.

**DISPATCHED** (DB enum)
Internal database status meaning the driver has accepted the dispatch (driver sees this as "ACCEPTED"). See [Load Status Mapping](#load-status-mapping).

**driverId**
In the mobile auth context, `auth.driverId` is the authenticated user's ID when their role is `DRIVER`. It equals `auth.userId`. Driver endpoints filter all data by this ID to ensure isolation.

**Driver Invitation**
The process of inviting a driver to join a fleet. Owner creates an invitation via `POST /api/mobile/owner/drivers/invite`, which sends an email and creates a `DriverInvitation` record with a 30-day expiry.

---

## E

**EAS (Expo Application Services)**
Expo's cloud build and deployment platform. Used to create development, preview, and production builds of the DriveCommand mobile app. Build profiles are defined in `apps/mobile/eas.json`.

**ELD (Electronic Logging Device)**
A GPS device mandated by the FMCSA that automatically records Hours of Service (HOS) data. DriveCommand has HOS manual entry; ELD integration is planned for a future milestone.

**EN_ROUTE** (driver status label)
Driver-facing status label meaning the driver is actively driving toward the destination. Maps to `IN_TRANSIT` in the database. See [Load Status Mapping](#load-status-mapping).

**EXPIRING**
A computed document status indicating the document expires within 30 days. Triggers a compliance warning.

**EXPIRED**
A computed document status indicating the document's expiry date is in the past. Triggers a critical compliance alert.

**expo-secure-store**
An Expo library that provides hardware-backed encrypted storage on the device. Used to store Supabase JWT access and refresh tokens in the DriveCommand mobile app. Cannot be used in Expo Go (requires a development build).

---

## F

**FleetMessage**
The database model for messages between owners and drivers. Messages can be scoped to a load (`loadId`), route (`routeId`), a specific recipient (`recipientId`), or broadcast to all drivers (`isBroadcast: true`).

---

## H

**HOS (Hours of Service)**
FMCSA regulations limiting the number of hours a commercial truck driver can drive per day and week. Key limits: 11-hour driving limit, 14-hour on-duty window. DriveCommand drivers record HOS status changes manually via the mobile app. ELD integration for automatic recording is planned.

**HOSStatus**
Enum values used for driver duty status entries: `OFF_DUTY`, `SLEEPER_BERTH`, `DRIVING`, `ON_DUTY`.

---

## I

**IFTA (International Fuel Tax Agreement)**
A tax agreement among US states and Canadian provinces that simplifies fuel tax reporting for interstate/interprovincial carriers. Requires tracking miles driven per jurisdiction. Not yet implemented in DriveCommand — planned as a future feature.

**IN_TRANSIT** (DB enum)
Internal database status equivalent to the driver's "EN_ROUTE" label. The driver is currently hauling the load.

**INVOICED**
A terminal load status indicating the load has been delivered and an invoice has been issued to the customer.

---

## J

**JWT (JSON Web Token)**
The authentication token format used by Supabase Auth. The mobile app stores the Supabase JWT in expo-secure-store and attaches it as a `Bearer` token in API requests. The web API validates the JWT via Supabase's public key.

---

## L

**Load**
The primary freight unit in DriveCommand. Represents a single freight shipment from origin to destination with a customer, driver, truck, rate, and status.

**Load Number**
Auto-generated identifier for a load in the format `LD-XXXX` (e.g., `LD-0042`). Sequential per tenant.

**Load Status Mapping**
The DriveCommand mobile app uses driver-friendly labels that differ from the internal database enum:

| Driver Label | DB Enum | Meaning |
|-------------|---------|---------|
| (created) | `PENDING` | Load created, awaiting driver acceptance |
| `ACCEPTED` | `DISPATCHED` | Driver accepted the dispatch |
| `EN_ROUTE` | `IN_TRANSIT` | Driver is actively hauling |
| `DELIVERED` | `DELIVERED` | Delivered to destination |
| — | `PICKED_UP` | Intermediate status (web-side; not a driver transition point) |
| — | `INVOICED` | Invoice issued (owner only) |
| — | `CANCELLED` | Load cancelled (owner only) |

---

## M

**MMKV (Memory-Mapped Key-Value)**
A fast, synchronous key-value storage library (`react-native-mmkv`) used in the DriveCommand mobile app for non-sensitive persistent data (preferences, cache flags, last-read timestamps). 30x faster than AsyncStorage. Auth tokens are stored in expo-secure-store, not MMKV.

**multi-tenant**
DriveCommand is a multi-tenant SaaS where each fleet company is a separate tenant. All data (loads, drivers, trucks, customers, etc.) is isolated per `tenantId`. RLS policies enforce this at the database level.

---

## N

**NativeWind**
A styling library that brings Tailwind CSS utility classes to React Native (`nativewind`). Used in the DriveCommand mobile app to maintain styling consistency with the web app's Tailwind/shadcn setup.

---

## O

**OFF_DUTY**
An HOS status indicating the driver is not working and not in the sleeper berth.

**ON_DUTY**
An HOS status indicating the driver is on duty but not driving (loading, unloading, inspections, etc.).

**OTA (Over-the-Air updates)**
A deployment mechanism that pushes JavaScript bundle updates to the mobile app without requiring an app store resubmission. Implemented via `expo-updates`. Only safe for non-native JS changes.

**OWNER**
A user role in DriveCommand representing the fleet owner or dispatcher. Has full access to all fleet data (loads, drivers, trucks, invoices, payroll, compliance). Mobile owner portal is served through the `(owner)/` route group.

---

## P

**PENDING**
Initial load status. The load has been created but the driver has not yet accepted it.

**PICKED_UP**
An intermediate load status indicating the driver has picked up the freight. Not exposed as a direct driver transition in the current mobile app flow (used primarily on the web side).

**POD (Proof of Delivery)**
Documentation confirming freight was delivered to the recipient. Drivers can upload delivery photos and documents via the mobile app.

**presigned URL**
A time-limited URL that grants temporary access to upload or download a file directly from S3/Supabase Storage without requiring API credentials. DriveCommand uses presigned PUT URLs for uploads and presigned GET URLs (15-minute expiry) for document viewing.

---

## R

**Rate Confirmation**
A PDF document confirming the rate and terms of a freight load. Generated on-demand by `GET /api/mobile/driver/loads/[id]/rate-confirmation` and returned as a base64-encoded PDF.

**RLS (Row-Level Security)**
A PostgreSQL feature that enforces access control at the database row level. DriveCommand uses RLS to ensure tenants cannot access each other's data. Mobile API routes bypass RLS (using `bypass_rls`) because they authenticate via Bearer tokens rather than the Postgres session mechanism, but all queries still filter by `tenantId`.

**Route**
A collection of stops and loads assigned to a driver and truck for a single trip. Contains `RouteStop` records ordered by position. Related to loads via `routeId` FK on the `Load` model.

**RouteStop**
An individual stop in a route (pickup, delivery, or waypoint). Has a `position` (ordering), `address`, `status` (`SCHEDULED`, `ARRIVED`, `DEPARTED`), and `departedAt` timestamp.

---

## S

**SLEEPER_BERTH**
An HOS status indicating the driver is in the sleeper berth section of the truck for mandatory rest.

**Supabase Auth**
The authentication provider used by the DriveCommand mobile app. Handles email/password login, JWT token issuance, and token refresh. Separate from the web app's custom AES-256-GCM session cookie system.

---

## T

**tenantId**
The unique identifier for a fleet organization (tenant) in DriveCommand. Every database record is scoped to a `tenantId`. All mobile API queries filter by `tenantId` extracted from the verified JWT.

**Tracking Token**
A unique token stored on an active load that the mobile app fetches via `GET /api/mobile/driver/tracking-token`. Used as supplementary context in GPS reporting.

**Turborepo**
The monorepo build system used by DriveCommand. Manages two apps (`apps/web`, `apps/mobile`) and three shared packages (`@drivecommand/types`, `@drivecommand/validation`, `@drivecommand/api-client`).

---

## V

**VALID**
A computed document status indicating the document is not expired and not expiring within 30 days.

**validateMobileToken**
A helper function in `apps/web/src/lib/auth/mobile-auth.ts` that verifies a Supabase JWT Bearer token from an incoming API request. Returns an auth context object with `userId`, `tenantId`, `role`, and `driverId` (for DRIVER role users). The older of the two mobile auth patterns.

---

## W

**withMobileAuth**
A higher-order function wrapper for Next.js API route handlers. The newer mobile auth pattern. Validates the JWT, enforces `allowedRoles`, and passes the `auth` context as a callback parameter. Reduces boilerplate compared to the older `validateMobileToken` pattern.
