// User roles
export type UserRole = 'OWNER' | 'DRIVER'

// Auth
export interface AuthUser {
  id: string
  email: string
  name: string
  role: UserRole
  tenantId: string
  companyName: string
}

export interface AuthSession {
  token: string
  user: AuthUser
}

// Trucks
export interface Truck {
  id: string
  tenantId: string
  name: string
  licensePlate: string
  make?: string | null
  model?: string | null
  year?: number | null
  vin?: string | null
  status: TruckStatus
  createdAt: string
  updatedAt: string
}

export type TruckStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE'

// Drivers
export interface Driver {
  id: string
  tenantId: string
  name: string
  email: string
  phone?: string | null
  licenseNumber?: string | null
  status: DriverStatus
  createdAt: string
  updatedAt: string
}

export type DriverStatus = 'ACTIVE' | 'INACTIVE'

// Loads
export interface Load {
  id: string
  tenantId: string
  loadNumber: string
  customerId?: string | null
  customerName?: string | null
  origin: string
  destination: string
  status: LoadStatus
  pickupDate?: string | null
  deliveryDate?: string | null
  rate?: number | null
  driverId?: string | null
  truckId?: string | null
  notes?: string | null
  createdAt: string
  updatedAt: string
}

export type LoadStatus = 'PENDING' | 'ACCEPTED' | 'EN_ROUTE' | 'DELIVERED' | 'INVOICED' | 'CANCELLED'

// Routes
export interface Route {
  id: string
  tenantId: string
  name: string
  status: RouteStatus
  driverId?: string | null
  truckId?: string | null
  origin: string
  destination: string
  scheduledDate?: string | null
  completedDate?: string | null
  notes?: string | null
  createdAt: string
  updatedAt: string
}

export type RouteStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'

// HOS
export type HOSStatus = 'OFF_DUTY' | 'SLEEPER_BERTH' | 'DRIVING' | 'ON_DUTY'

export interface HOSEntry {
  id: string
  tenantId: string
  driverId: string
  status: HOSStatus
  startTime: string
  endTime?: string | null
  location?: string | null
  notes?: string | null
  createdAt: string
  updatedAt: string
}

export interface HOSData {
  currentStatus: HOSStatus
  currentStatusSince: string
  timeInCurrentStatus: number
  todayEntries: HOSEntry[]
  drivingMinutesToday: number
  onDutyMinutesToday: number
  hoursUntil14Limit: number
  hoursUntil11DriveLimit: number
}

// Incidents
export type IncidentCategory = 'ACCIDENT' | 'VIOLATION' | 'MECHANICAL' | 'HAZARD' | 'OTHER'
export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH'

export interface Incident {
  id: string
  driverId: string
  tenantId: string
  category: IncidentCategory
  severity: IncidentSeverity
  description: string
  location?: string | null
  latitude?: number | null
  longitude?: number | null
  photoS3Key?: string | null
  reportedAt: string
  notes?: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateIncidentPayload {
  category: IncidentCategory
  severity: IncidentSeverity
  description: string
  latitude?: number | null
  longitude?: number | null
  photoS3Key?: string | null
}

// Messages
export interface FleetMessage {
  id: string
  tenantId: string
  routeId?: string | null
  loadId?: string | null
  senderId: string
  senderName: string
  recipientId?: string | null
  recipientName?: string | null
  isBroadcast: boolean
  body: string
  readAt?: string | null
  createdAt: string
}

// Documents
export type DocumentType = 'LICENSE' | 'MEDICAL_CARD' | 'APPLICATION' | 'GENERAL'
export type DocumentStatus = 'VALID' | 'EXPIRING' | 'EXPIRED'

export interface DriverDocument {
  id: string
  driverId: string
  tenantId: string
  type: DocumentType
  name: string
  s3Key: string
  expiryDate?: string | null
  status: DocumentStatus
  createdAt: string
}

// GPS
export interface GPSLocation {
  vehicleId: string
  truckId: string
  truckName: string
  driverName?: string | null
  latitude: number
  longitude: number
  speed?: number | null
  heading?: number | null
  altitude?: number | null
  timestamp: string
  status: 'MOVING' | 'IDLE' | 'OFFLINE'
}

// Geocoding
export interface AddressResult {
  formatted_address: string
  latitude: number
  longitude: number
  place_id: string // Nominatim's place_id as string
}

// Dashboard
export interface OwnerDashboardData {
  activeLoadsCount: number
  driversOnDutyCount: number
  revenueThisMonth: number
  openAlertsCount: number
  recentLoads: Load[]
}
