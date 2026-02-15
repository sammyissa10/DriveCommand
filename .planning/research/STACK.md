# Technology Stack

**Project:** DriveCommand
**Researched:** 2026-02-14 (Updated: 2026-02-15 for Milestone 2)
**Confidence:** HIGH

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 16.1+ | Full-stack React framework | Industry standard for SaaS in 2026. React Server Components reduce client bundle, Turbopack (default in v16) offers 5x faster builds and 100x faster incremental builds. Built-in API routes, middleware for tenant isolation, automatic code splitting. App Router is stable and production-ready. |
| React | 19.2+ | UI library | Stable release with Server Components, Actions, async transitions, and Partial Pre-rendering (19.2). Required by Next.js 16. |
| TypeScript | 5.8+ | Type safety | Direct execution in Node.js 23.6+ with --erasableSyntaxOnly flag. Prevents runtime errors critical for multi-tenant isolation. Improved type checking in v5.8 with conditional expression handling. |

### Database & ORM

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| PostgreSQL | 17.8+ | Primary database | Row-level security (RLS) is THE solution for multi-tenant data isolation. Proven at scale, excellent performance. v17 adds performance gains (up to 96% faster bulk loading), improved vacuum memory management, and enhanced logical replication with failover control for high availability. |
| Prisma | 7.x | ORM | Pure TypeScript in v7 (Rust engine removed). Better abstraction than Drizzle for rapid development, excellent DX with automatic migrations and type generation. Prisma Client extensions enable RLS implementation. Choose Prisma over Drizzle for batteries-included experience and team productivity. |

**RLS Strategy:** Use PostgreSQL Row-Level Security with tenant_id enforcement at database level. Prevents data leaks from buggy WHERE clauses. Set session variable for current tenant, define RLS policies on all tables. Use Prisma Client extensions to inject tenant context per request.

### Authentication & Authorization

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Clerk | Latest | Authentication provider | Best choice for SaaS in 2026. 40% faster implementation than Auth0, same-day Next.js 15+ support, transparent linear pricing vs Auth0's enterprise tiers. Multi-tenant support with organizations, pre-built UI components, user management dashboard. SOC 2 Type II + optional HIPAA compliance. Avoid NextAuth.js (requires building UI and managing infrastructure yourself). |

**Alternative (if budget-constrained):** NextAuth.js v5 (Auth.js) for self-hosted auth with full control, but requires significant engineering time for UI and maintenance.

### Styling & UI Components

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Tailwind CSS | 4.1+ | Utility-first CSS | v4 is 5x faster full builds, 100x faster incremental builds. CSS-first configuration with @theme directive. OKLCH colors for more vibrant UI. Auto-detects template files. Industry standard for rapid UI development. |
| shadcn/ui | Latest | Component library | Copy-paste components built on Radix UI primitives. Full control over code (not npm dependency). Excellent accessibility. Perfect for dashboards. Includes form components with React Hook Form + Zod integration. |

### Forms & Validation

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| React Hook Form | 7.x | Form state management | Performance leader for React forms. Minimal re-renders, excellent DX. Native integration with shadcn/ui Form component. |
| Zod | 3.x | Schema validation | Type-safe runtime validation. Single source of truth for TypeScript types and runtime checks. Use zodResolver with React Hook Form. Critical for multi-tenant apps to validate tenant_id in all mutations. |

### Data Fetching & State Management

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TanStack Query (React Query) | 5.90+ | Server state management | v5 is 20% smaller than v4. Essential for dashboard data fetching, caching, background refetching. useMutationState hook (v5) for global mutation tracking. Renamed cacheTime to gcTime for clarity. Requires React 18+ (useSyncExternalStore hook). |

**Note:** Use React Server Components for initial data loads, TanStack Query for client-side mutations and real-time updates.

### File Storage

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Cloudflare R2 | Latest | Object storage | Zero egress fees (vs $1000+/month on AWS S3 for media-heavy apps). S3-compatible API. 11 nines durability. Infrequent Access tier available. For 1TB storage + 10TB downloads/month: R2 costs ~$15/month vs S3 ~$1,050/month. Only downside: single storage tier (but Infrequent Access added in 2025). |

**Alternative (if AWS ecosystem required):** AWS S3 for deep AWS integration and multiple storage classes, but expect significant egress costs.

### Email Service

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Resend | Latest | Transactional email | Modern API built for Next.js. React Email integration lets you write emails as React components. Free tier: 100 emails/day, 3,000/month. $20/month for 50k emails. Better DX than SendGrid, though SendGrid has better deliverability reputation for enterprise. For fleet management reminders (moderate volume), Resend is ideal. |

**Alternative (if high-volume enterprise):** SendGrid for proven deliverability at scale (15+ years, ISP relationships), but older API and complex pricing.

### Payments (if monetized)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Stripe Billing | Latest | Subscription management | Industry standard for SaaS subscriptions. Flexible pricing models (usage-based, tiered, flat-fee). Smart Retries recovered $6.5B in 2024. Test clocks for integration testing. Real-time metrics dashboard. Compliance built-in. |

### Infrastructure & Deployment

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Vercel | Latest | Hosting platform | Created by Next.js team. Zero-config deployment, automatic previews for PRs, edge functions, built-in CDN, serverless functions. Optimized for Next.js 16. Free hobby tier, Pro at $20/month. |

**Alternatives:**
- **Railway** ($5+/month): Best for running database, Redis, background workers in same platform. More predictable pricing than Vercel for scaling.
- **Fly.io**: Edge deployment with VMs, good for WebSockets and real-time features.
- **Coolify (self-hosted)**: Open-source PaaS on your infrastructure. Vercel-like DX with git push deploys, preview URLs.

**Recommendation:** Start with Vercel (free), migrate to Railway when you need database + Redis + workers co-located, or when Vercel pricing becomes unpredictable.

### Error Monitoring & Observability

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Sentry | Latest | Error tracking | Multi-environment support (client, server, edge functions). Session replay, performance monitoring, source maps, breadcrumbs. Next.js wizard for setup. Reworked SDK for Turbopack compatibility in 2026. Captures structured logs and Vercel platform logs. Free tier: 5k errors/month. |

### Testing

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Vitest | Latest | Unit testing | Fast, Vite-powered test runner. Native TypeScript. Use with React Testing Library for component tests. Note: Async Server Components not supported, use E2E tests for those. |
| Playwright | Latest | E2E testing | Official Next.js recommendation for end-to-end tests. Cross-browser (Chromium, Firefox, WebKit). Parallel execution. Required for testing Server Components. |

### CI/CD

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| GitHub Actions | N/A | CI/CD pipeline | Native GitHub integration. Free for public repos, 2,000 minutes/month for private. Standard workflow: install deps → build → test → deploy. Use environments with protection rules for production. Cache dependencies aggressively. Pin action versions for security. |

---

## NEW: Milestone 2 Stack Additions

### Map Rendering

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| react-leaflet | 5.0.0 | React components for Leaflet maps | Open-source (BSD-2), zero API costs, excellent GPS trail rendering with Polyline/GeoJSON components, mature ecosystem, requires React 19 as peer dependency |
| leaflet | 1.9.4 | Core mapping library | Industry standard for 2D maps, completely free (no quotas or API limits), robust plugin ecosystem, perfect for fleet tracking routes, 145KB bundle size (with react-leaflet) |
| leaflet.markercluster | 1.5.3 | Fleet vehicle marker clustering | Handles 10K-50K markers with smooth animations, prevents map overcrowding with multiple vehicles, automatic zoom-based clustering, spiderfy clusters at bottom zoom level, essential for fleet tracking |
| leaflet-defaulticon-compatibility | 0.1.2 | Fix marker icon paths in webpack/Next.js | Solves Leaflet marker icon loading issues in Next.js builds (marker images won't display without this) |
| @types/leaflet | 1.9.x | TypeScript definitions for Leaflet | Official type definitions from DefinitelyTyped, required for TypeScript projects |
| @types/leaflet.markercluster | 1.5.x | TypeScript definitions for marker clustering | Prevents TypeScript errors with clustering plugin |

**Integration Pattern (Maps):**
```typescript
// app/components/FleetMap.tsx
"use client"

import dynamic from 'next/dynamic'

const MapComponent = dynamic(
  () => import('./MapComponentInner'),
  { ssr: false, loading: () => <div className="h-96 bg-gray-100 animate-pulse" /> }
)

export default MapComponent

// components/MapComponentInner.tsx
"use client"

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

export default function MapComponentInner({ vehicles }) {
  return (
    <MapContainer center={[39.8283, -98.5795]} zoom={4} className="h-96">
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
      />
      <MarkerClusterGroup>
        {vehicles.map(vehicle => (
          <Marker key={vehicle.id} position={[vehicle.lat, vehicle.lng]}>
            <Popup>{vehicle.name}</Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  )
}
```

**Why Leaflet over Mapbox GL:**
- **Zero cost:** Completely open-source, no API limits or monthly quotas
- **GPS trails:** Polyline and GeoJSON components handle route visualization perfectly
- **Lighter weight:** Smaller bundle size (145KB vs 500KB+ for Mapbox GL)
- **Sufficient for use case:** Fleet tracking doesn't need WebGL 3D extrusions or vector tiles
- **No vendor lock-in:** OpenStreetMap tiles are free and globally available
- **Marker clustering built-in:** leaflet.markercluster handles 10K+ markers efficiently

**When to consider Mapbox GL:**
- Real-time tracking of 500+ vehicles simultaneously (WebGL acceleration)
- Need for 3D building extrusions or advanced styling
- Custom vector tiles with brand-specific styling

### Charting and Data Visualization

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| recharts | 3.7.0 | React charting library | Built on D3 and React, built-in TypeScript types (no @types package needed), works with React 19, 11 chart types including donut/pie for compliance metrics, composable components match React patterns, declarative API, used by shadcn/ui |
| date-fns | 4.1.0 | Date formatting and time series | Tree-shakable functional API, optimal for analytics date ranges and time series, better bundle size than Moment.js (tree-shaking), more React-friendly immutable API than dayjs, works in Server Components |

**Chart Types for Fleet Dashboard:**
- **Line charts:** Fuel efficiency trends over time, safety score trends
- **Bar charts:** Safety scores by driver/truck, maintenance costs by vehicle
- **Area charts:** Cumulative metrics (total miles, fuel costs over time)
- **Pie/Donut charts:** Compliance percentages, fleet composition breakdown
- **Composed charts:** Multiple metrics on single chart (fuel cost + miles driven)

**React 19 Compatibility:**
Recharts 3.7.0 supports React 19. You may encounter peer dependency warnings during installation. Use `npm install recharts --legacy-peer-deps` if needed. Functional compatibility confirmed by community testing.

**Integration Pattern (Charts):**
```typescript
// app/components/SafetyChart.tsx
"use client"

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format } from 'date-fns'

export default function SafetyChart({ data }: { data: SafetyScore[] }) {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="date"
          tickFormatter={(date) => format(new Date(date), 'MMM d')}
        />
        <YAxis />
        <Tooltip
          contentStyle={{ backgroundColor: 'hsl(var(--card))' }}
          labelFormatter={(date) => format(new Date(date), 'MMM d, yyyy')}
        />
        <Bar dataKey="score" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

**Why Recharts over Tremor:**
- **Direct control:** Recharts gives you granular control over chart customization
- **Tremor is a wrapper:** Tremor is built on top of Recharts, adding opinionated styling
- **Your use case:** Fleet dashboards need custom styling to match brand, not pre-made themes
- **Portability:** Recharts knowledge transfers to any React project; Tremor is Tailwind-specific

**When to consider Tremor:**
- Rapid prototyping where you want beautiful defaults immediately
- Already using shadcn/ui and want matching aesthetics
- Don't need deep customization of chart internals

**Why Recharts over Chart.js:**
- **React-native API:** Declarative component-based approach vs imperative canvas API
- **Composability:** Charts built from smaller React components, easier to customize
- **TypeScript:** Built-in types, better DX with autocomplete
- **SVG rendering:** More flexible styling with CSS, better for responsive designs

### Icons and Navigation

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| lucide-react | 0.564.0 | Icon library for React | Tree-shakeable (only imported icons in bundle), 1400+ icons including fleet-specific ones (Truck, MapPin, Gauge, Fuel), actively maintained (published Feb 13, 2026), works with React 19, returns typed React components as inline SVG, SSR-safe |

**Relevant Icons for Fleet Management:**
- **Navigation:** `Menu`, `PanelRight`, `Navigation`, `LayoutDashboard`, `ChevronDown`, `ChevronRight`
- **Fleet:** `Truck`, `Car`, `Bus`, `Package`
- **Safety:** `AlertTriangle`, `Shield`, `ShieldAlert`, `AlertCircle`
- **Fuel:** `Fuel`, `Zap` (for electric), `Battery`, `Leaf` (eco-driving)
- **Maps:** `MapPin`, `Map`, `Route`, `Navigation2`, `Compass`
- **Metrics:** `Gauge`, `TrendingUp`, `TrendingDown`, `BarChart3`, `PieChart`, `LineChart`
- **Maintenance:** `Wrench`, `Calendar`, `Clock`, `CheckCircle2`

**Integration:**
```typescript
import { Truck, Gauge, MapPin, Fuel } from 'lucide-react'

// Can be used in Server or Client Components
<Truck className="w-5 h-5 text-blue-600" />
<Gauge className="w-4 h-4" strokeWidth={2.5} />
```

**Why Lucide over alternatives:**
- **Tree-shaking:** Only pays for what you use (vs react-icons which bundles everything)
- **Consistency:** All icons follow same design system (24x24 grid, consistent stroke width)
- **TypeScript:** Fully typed components with auto-complete
- **Customization:** Accepts all SVG props (size, color, strokeWidth, className, etc.)
- **SSR-safe:** Works in both Server and Client Components without hydration issues

### Sidebar Navigation (Samsara-style)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| shadcn/ui Sidebar | Latest | Collapsible sidebar navigation | Already using shadcn/ui, composable sidebar component released in 2024, supports collapsible sections, icon-only collapsed state, keyboard shortcuts (Cmd+B), mobile responsive, built on Radix UI primitives |

**Sidebar Component Integration:**
```typescript
// app/layout.tsx (or specific dashboard layout)
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Truck, MapPin, Gauge, Fuel, ChevronRight } from 'lucide-react'

export default function DashboardLayout({ children }) {
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Fleet</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <a href="/dashboard/trucks">
                      <Truck className="w-4 h-4" />
                      <span>Trucks</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton>
                      <MapPin className="w-4 h-4" />
                      <span>Tracking</span>
                      <ChevronRight className="ml-auto w-4 h-4 transition-transform group-data-[state=open]:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild className="pl-8">
                          <a href="/dashboard/tracking/live">Live Map</a>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild className="pl-8">
                          <a href="/dashboard/tracking/history">Route History</a>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </CollapsibleContent>
                </Collapsible>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <a href="/dashboard/safety">
                      <Gauge className="w-4 h-4" />
                      <span>Safety</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <a href="/dashboard/fuel">
                      <Fuel className="w-4 h-4" />
                      <span>Fuel</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <main className="flex-1">
        <SidebarTrigger />
        {children}
      </main>
    </SidebarProvider>
  )
}
```

**Samsara-style Features Achieved:**
- **Collapsible sections:** Use Collapsible component for nested menu items
- **Icon + text layout:** SidebarMenuButton supports icon + label
- **Collapsed state:** Sidebar collapses to icon-only mode
- **Keyboard shortcuts:** Built-in Cmd+B / Ctrl+B toggle
- **Mobile responsive:** Automatically adjusts for mobile (offcanvas mode)
- **Persistent state:** Collapsed state saved to localStorage via SidebarProvider

**Installation:**
```bash
npx shadcn@latest add sidebar
npx shadcn@latest add collapsible
```

### Mock Data Generation

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| @faker-js/faker | 10.3.0 | Generate realistic mock data | Industry standard for seed data, generates realistic GPS coordinates, timestamps, names, VINs, and metrics; active maintenance (published Feb 7, 2026), works with Prisma seed scripts, locale support for internationalization |

**Why Faker.js with Prisma seeds (not in-memory mocks):**
- **Requirement:** Mock data must flow through real API contracts (database models, server actions)
- **Type safety:** Prisma generates types from schema, seed data is validated against schema
- **RLS compliance:** Seed scripts set `tenantId` for proper multi-tenant isolation
- **Foreign key validation:** Database enforces referential integrity
- **Repeatability:** Idempotent seed scripts with `skipDuplicates: true`

**Integration Pattern (Mock Data):**
```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client'
import { faker } from '@faker-js/faker'

const prisma = new PrismaClient()

async function seedGPSRoutes() {
  const tenantId = 'your-tenant-id'

  const trucks = await prisma.truck.findMany({
    where: { tenantId },
    select: { id: true }
  })

  for (const truck of trucks) {
    const routes = Array.from({ length: 20 }, () => ({
      truckId: truck.id,
      tenantId, // Critical for RLS
      startLat: faker.location.latitude({ min: 33, max: 49 }),
      startLng: faker.location.longitude({ min: -125, max: -65 }),
      endLat: faker.location.latitude({ min: 33, max: 49 }),
      endLng: faker.location.longitude({ min: -125, max: -65 }),
      distance: faker.number.float({ min: 10, max: 500, precision: 0.1 }),
      fuelUsed: faker.number.float({ min: 5, max: 50, precision: 0.1 }),
      safetyScore: faker.number.int({ min: 60, max: 100 }),
      timestamp: faker.date.recent({ days: 30 }),
    }))

    await prisma.route.createMany({
      data: routes,
      skipDuplicates: true,
    })
  }
}

async function seedSafetyEvents() {
  const tenantId = 'your-tenant-id'

  const drivers = await prisma.driver.findMany({
    where: { tenantId },
    select: { id: true }
  })

  for (const driver of drivers) {
    const events = Array.from({ length: faker.number.int({ min: 5, max: 20 }) }, () => ({
      driverId: driver.id,
      tenantId,
      eventType: faker.helpers.arrayElement(['harsh_braking', 'speeding', 'sharp_turn', 'acceleration']),
      severity: faker.number.int({ min: 1, max: 10 }),
      timestamp: faker.date.recent({ days: 30 }),
      latitude: faker.location.latitude({ min: 33, max: 49 }),
      longitude: faker.location.longitude({ min: -125, max: -65 }),
    }))

    await prisma.safetyEvent.createMany({
      data: events,
      skipDuplicates: true,
    })
  }
}

async function seedFuelData() {
  const tenantId = 'your-tenant-id'

  const trucks = await prisma.truck.findMany({
    where: { tenantId },
    select: { id: true }
  })

  for (const truck of trucks) {
    const fuelRecords = Array.from({ length: 30 }, (_, i) => ({
      truckId: truck.id,
      tenantId,
      date: faker.date.recent({ days: 30 - i }),
      gallons: faker.number.float({ min: 20, max: 150, precision: 0.1 }),
      cost: faker.number.float({ min: 60, max: 450, precision: 0.01 }),
      milesDriven: faker.number.float({ min: 100, max: 600, precision: 0.1 }),
      mpg: null, // Calculated field
    }))

    await prisma.fuelRecord.createMany({
      data: fuelRecords.map(record => ({
        ...record,
        mpg: (record.milesDriven / record.gallons).toFixed(2)
      })),
      skipDuplicates: true,
    })
  }
}

async function main() {
  await seedGPSRoutes()
  await seedSafetyEvents()
  await seedFuelData()
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```

**Configure in package.json:**
```json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

**Run seeding:**
```bash
npx prisma db seed
```

---

## Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | 4.x | Date manipulation | For service schedule calculations, maintenance reminders, time series aggregation. |
| @tanstack/react-table | 8.x | Data tables | If building complex vehicle/driver tables with sorting, filtering, pagination. |
| zustand | 4.x | Client state | Lightweight state management (dashboard UI state, filters, modals). Use for client-only state, not server data. |
| react-dropzone | 14.x | File uploads | For vehicle document uploads. Handles drag-drop, validation, previews. |
| clsx | 2.x | Conditional className management | Already in project (via shadcn/ui pattern) - use for dynamic styling. |

## Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| ESLint | Code linting | Next.js includes eslint-config-next. Add @typescript-eslint for stricter rules. |
| Prettier | Code formatting | Standard config: 2-space indent, single quotes, trailing commas. |
| Husky | Git hooks | Run linting, type checking, tests before commits. |
| lint-staged | Staged file linting | Run Prettier and ESLint only on changed files. |
| tsx | TypeScript execution | For running Prisma seed scripts (faster than ts-node). |

## Installation

```bash
# Core dependencies (existing from v1.0)
npm install @prisma/client @clerk/nextjs zod react-hook-form @hookform/resolvers @tanstack/react-query

# UI components (existing)
npx shadcn@latest init
npx shadcn@latest add form input button table select dialog

# NEW: Map rendering (Milestone 2)
npm install react-leaflet@^5.0.0 leaflet@^1.9.4 leaflet.markercluster@^1.5.3 leaflet-defaulticon-compatibility@^0.1.2
npm install -D @types/leaflet @types/leaflet.markercluster

# NEW: Charts (Milestone 2)
npm install recharts@^3.7.0

# NEW: Icons (Milestone 2)
npm install lucide-react@^0.564.0

# NEW: Sidebar navigation (Milestone 2)
npx shadcn@latest add sidebar
npx shadcn@latest add collapsible

# NEW: Date utilities (Milestone 2)
npm install date-fns@^4.1.0

# NEW: Mock data generation (Milestone 2)
npm install -D @faker-js/faker@^10.3.0

# File upload
npm install react-dropzone

# Email (if using Resend)
npm install resend react-email

# Dev dependencies
npm install -D prisma @types/node typescript eslint prettier husky lint-staged tsx
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
npm install -D @playwright/test

# Error monitoring
npx @sentry/wizard@latest -i nextjs
```

## Alternatives Considered

| Category | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|---------------------|
| Framework | Next.js 16 | Remix, SvelteKit | Next.js has largest ecosystem, best Vercel integration, React Server Components are stable. Remix lacks RSC support. SvelteKit smaller community. |
| ORM | Prisma 7 | Drizzle | Drizzle is faster and smaller bundle, but Prisma wins on DX, migration tooling, and team velocity. For greenfield SaaS, Prisma's abstraction accelerates development. |
| Auth | Clerk | Auth0, NextAuth.js | Auth0 is enterprise-focused with complex pricing. NextAuth.js requires building UI yourself. Clerk balances DX, features, and transparent pricing. |
| Styling | Tailwind CSS 4 | CSS Modules, Styled Components | Tailwind is industry standard, faster in v4, smaller learning curve for new devs. CSS-in-JS has performance overhead. |
| Database | PostgreSQL 17 | MySQL, MongoDB | Only PostgreSQL has built-in Row-Level Security for multi-tenant isolation. MySQL lacks RLS. MongoDB (NoSQL) not ideal for relational data (vehicles → drivers → maintenance). |
| Hosting | Vercel | Netlify, AWS Amplify | Vercel built by Next.js creators, best Next.js optimization. Netlify comparable but less Next.js-specific. AWS Amplify has complex setup. |
| File Storage | Cloudflare R2 | AWS S3, Google Cloud Storage | R2 has zero egress fees, massive cost savings for user-facing file downloads. S3 only if deep AWS integration needed. |
| Email | Resend | SendGrid, AWS SES | Resend has modern API + React Email integration. SendGrid better for enterprise deliverability. AWS SES cheapest but requires more setup. |
| **Maps** | **Leaflet** | **Mapbox GL JS** | Mapbox has API costs after free tier (50K loads/month), requires API key management, WebGL complexity overkill for 2D routes, vendor lock-in |
| **Maps** | **Leaflet** | **Google Maps** | Expensive ($7/1000 loads after $200 credit), requires credit card, complex pricing |
| **Charts** | **Recharts** | **Tremor** | Tremor is built on Recharts (adds abstraction layer), opinionated Tailwind styling, less flexibility for custom branding |
| **Charts** | **Recharts** | **Chart.js** | Imperative API (not React-native), manual state management, less composable, canvas rendering less flexible for styling |
| **Charts** | **Recharts** | **Victory** | Heavier bundle size, more opinionated styling, less active development |
| **Icons** | **Lucide React** | **React Icons** | No tree-shaking (bundles all icon sets), inconsistent design across sets, larger bundle |
| **Icons** | **Lucide React** | **Heroicons** | Smaller icon library (~200 icons vs 1400+), missing fleet-specific icons (Fuel, Truck variants) |
| **Mock Data** | **Faker.js** | **Chance.js** | Less active maintenance (last update 2020), smaller ecosystem, fewer realistic generators |
| **Mock Data** | **Faker.js** | **casual** | Abandoned (last update 2016), security vulnerabilities |
| **Sidebar** | **shadcn/ui Sidebar** | **react-pro-sidebar** | Another dependency to manage, shadcn pattern gives full code control, styling conflicts |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Create React App | Unmaintained, deprecated by React team in 2023. No SSR, no RSC. | Next.js, Vite + React |
| Moment.js | Huge bundle size (67KB), unmaintained. | date-fns (lighter, tree-shakeable) |
| Redux (for server state) | Overkill for modern SaaS. Server state belongs in TanStack Query, not Redux. | TanStack Query for server state, Zustand for client UI state |
| Mongoose (with PostgreSQL) | Mongoose is for MongoDB. PostgreSQL needs SQL ORM. | Prisma or Drizzle |
| Firebase Auth | Vendor lock-in, harder to migrate. Not ideal for B2B SaaS with SSO requirements. | Clerk or Auth0 for B2B features |
| Webpack manual config | Next.js uses Turbopack by default in v16. Don't fight the framework. | Accept Next.js defaults |
| Heroku | Expensive compared to modern alternatives. No auto-scaling. $5-7/month for basic dyno. | Railway, Render, Fly.io for better pricing |
| Deprecated Next.js patterns | Pages Router, getServerSideProps, getStaticProps | App Router, Server Components, fetch with caching |
| **Mapbox GL JS v1.x** | **Changed to proprietary license, expensive for commercial use** | **Leaflet or MapLibre GL JS** |
| **faker (old package)** | **Abandoned in 2020, security vulnerabilities** | **@faker-js/faker** |
| **@types/recharts** | **Recharts 3.x has built-in types, stub package unnecessary** | **Import types directly from recharts** |
| **Static JSON mock files** | **Bypasses database validation, doesn't test RLS policies, stale data** | **Prisma seed scripts with Faker.js** |
| **react-leaflet-markercluster (old)** | **Deprecated, unmaintained (last update 2021)** | **react-leaflet-cluster (active fork)** |
| **Google Maps API** | **Expensive, complex pricing, requires credit card for all usage** | **Leaflet + OpenStreetMap (free)** |

## Stack Patterns by Variant

**If building MVP (3-6 months):**
- Use Clerk (fastest auth setup)
- Use Vercel (zero-config deployment)
- Use Prisma (rapid schema iteration)
- Use shadcn/ui (pre-built components)
- **Use Leaflet for maps (zero cost, no API limits)**
- **Use Recharts for dashboards (batteries-included, composable)**
- **Because:** Maximize velocity, minimize infrastructure work.

**If cost-conscious (bootstrap/side project):**
- Use NextAuth.js (free, self-hosted auth)
- Use Railway or Coolify (predictable pricing, includes database)
- Use Cloudflare R2 (free tier: 10GB storage, 1M reads/month)
- Use Resend free tier (3,000 emails/month)
- **Use Leaflet for maps (zero cost, no API limits)**
- **Use Recharts (no cost, open-source)**
- **Because:** Free/low tiers available, total cost under $20/month.

**If enterprise/high-compliance:**
- Use Auth0 (extensive compliance certifications)
- Use AWS RDS PostgreSQL (enterprise SLAs)
- Use AWS S3 (compliance certifications, data residency controls)
- Use SendGrid (proven deliverability)
- **Because:** Compliance requirements justify premium costs.

**If real-time features needed (live tracking, WebSockets):**
- Use Fly.io for hosting (persistent VMs, not serverless)
- Use Pusher or Ably for real-time channels
- **Consider Mapbox GL for 500+ simultaneous vehicles (WebGL acceleration)**
- **Use TanStack Query with polling (every 5-10s) for "near real-time" on budget**
- **Because:** Vercel serverless has cold starts and limits for long-lived connections.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Next.js 16.x | React 19+ | Next.js 16 requires React 19. React 18 not supported. |
| Prisma 7.x | PostgreSQL 12+ | PostgreSQL 17 recommended for RLS and performance. |
| TanStack Query 5.x | React 18+ | Uses useSyncExternalStore (React 18 API). |
| Tailwind CSS 4.x | Modern browsers | Safari 16.4+, Chrome 111+, Firefox 128+. For older browsers, use Tailwind v3.4. |
| TypeScript 5.8 | Node.js 23.6+ | Direct execution feature requires Node.js 23.6+. |
| **react-leaflet 5.0.0** | **React 19, Leaflet 1.9** | **Requires React 19 as peer dependency** |
| **recharts 3.7.0** | **React 16.8+, React 19** | **Peer dependency warnings with React 19 (use --legacy-peer-deps), functional** |
| **lucide-react 0.564.0** | **React 16.4+, React 19** | **No compatibility issues** |
| **leaflet.markercluster 1.5.3** | **Leaflet 1.0+** | **Works with Leaflet 1.9.4** |
| **date-fns 4.1.0** | **Framework agnostic** | **Works in Node.js and browsers, SSR-safe** |

## SSR and Hydration Considerations

### Maps (Leaflet)
- **SSR:** Not compatible (requires `window`, `document`, DOM APIs)
- **Solution:** `dynamic(() => import('./Map'), { ssr: false })`
- **Hydration:** N/A (client-only rendering)
- **Best practice:** Show loading skeleton while map loads client-side

### Charts (Recharts)
- **SSR:** Partially compatible (can render on server but may have hydration issues)
- **Solution:** Use "use client" directive, ensure data stability during hydration
- **Hydration:** Can work if data is consistent between server and client
- **Best practice:** Fetch data in Server Component, pass as props to chart Client Component

### Icons (Lucide)
- **SSR:** ✅ Fully compatible (renders as inline SVG)
- **Solution:** No special handling needed
- **Hydration:** No issues
- **Best practice:** Use freely in both Server and Client Components

**Critical Pattern for Next.js 16 App Router:**

```typescript
// Server Component fetches data
// app/dashboard/safety/page.tsx
import SafetyChart from '@/components/SafetyChart'
import { getSafetyScores } from '@/lib/actions'

export default async function SafetyDashboard() {
  const scores = await getSafetyScores() // Server-side fetch

  return (
    <div>
      <h1>Safety Dashboard</h1>
      <SafetyChart data={scores} /> {/* Client Component receives data */}
    </div>
  )
}

// Client Component renders chart
// components/SafetyChart.tsx
"use client"

import { BarChart, Bar, XAxis, YAxis } from 'recharts'

export default function SafetyChart({ data }) {
  return <BarChart width={600} height={300} data={data}>...</BarChart>
}
```

## CSS Requirements

### Leaflet Styles (Required)

Add to `app/globals.css`:

```css
/* Leaflet core styles */
@import 'leaflet/dist/leaflet.css';

/* Leaflet marker clustering styles */
@import 'leaflet.markercluster/dist/MarkerCluster.css';
@import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

/* Fix for marker icon paths in Next.js */
@import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
```

**Why:** Leaflet's CSS is not modular. Must be imported globally for markers, popups, controls, and clusters to render correctly.

**Alternative (if avoiding global CSS):**
- Import CSS in individual map components (but causes flash of unstyled content)
- Better to import once globally

### Recharts Customization

No CSS import required. Style via:
- Tailwind classes on container (ResponsiveContainer)
- Inline `stroke`, `fill`, `strokeWidth` props on chart elements
- Custom theme colors from `tailwind.config.js` via CSS variables
- Tooltip/Legend custom content components

**Example using Tailwind CSS variables:**
```typescript
<Bar
  dataKey="score"
  fill="hsl(var(--primary))"
  className="hover:opacity-80 transition-opacity"
/>
```

## Performance Considerations

### Map Rendering
- **Limit visible markers:** Use clustering for 100+ vehicles
- **Viewport culling:** Only render markers in current map bounds
- **Lazy load:** Use dynamic import with `ssr: false` to defer map bundle
- **Cluster performance:** leaflet.markercluster handles 10K-50K markers efficiently
- **Use chunkedLoading:** For 10K+ markers to prevent page freeze

### Chart Rendering
- **Recharts uses SVG:** Performant for <1000 data points
- **Downsample large datasets:** Aggregate daily data into weekly/monthly for longer time ranges
- **ResponsiveContainer:** Ensures proper sizing without manual calculations
- **Memoize data:** Use React.memo or useMemo to prevent unnecessary re-renders
- **Debounce filters:** Avoid re-rendering charts on every keystroke

### Bundle Size Impact

| Library | Bundle Size (gzipped) | Impact | Mitigation |
|---------|----------------------|--------|------------|
| react-leaflet + leaflet | ~145 KB | Medium | Lazy load with dynamic import (only loads on map pages) |
| recharts | ~450 KB | Medium | Tree-shakable (import only chart types used), code-split by route |
| date-fns | ~25 KB | Low | Excellent tree-shaking (import only functions used) |
| leaflet.markercluster | ~35 KB | Low | Only loaded with map component |
| lucide-react | ~1-2 KB per icon | Low | Tree-shakable (only imported icons in bundle) |
| @faker-js/faker | Dev only | None | Not included in production bundle |

**Total new bundle (milestone 2):** ~655 KB gzipped
- **Map pages:** +180 KB (Leaflet + clustering, lazy loaded)
- **Dashboard pages:** +475 KB (Recharts, shared across routes)
- **All pages:** +2-10 KB (Lucide icons, tree-shaken per page)

**Optimization strategy:**
1. **Route-based code splitting** (Next.js automatic)
2. **Lazy load maps** (dynamic import with ssr: false)
3. **Tree-shake Recharts** (import specific chart types)
4. **Tree-shake date-fns** (import specific functions)
5. **Tree-shake Lucide** (import specific icons)

## Multi-Tenant Architecture Notes

**Database Isolation Strategy:**
- **Shared database + Row-Level Security** (recommended for SaaS)
- All tenants share same PostgreSQL database and tables
- Every table has `tenant_id` column
- RLS policies enforce `tenant_id = current_setting('app.current_tenant_id')::uuid`
- Set session variable on each request via Prisma Client extension
- **Why:** Fast tenant onboarding (just insert row), cost-efficient, enables cross-tenant analytics for admins

**Alternative (not recommended):**
- Database-per-tenant: Complex migrations, expensive, hard to scale
- Schema-per-tenant: Still complex, harder to manage

**Tenant Context Flow:**
1. User authenticates with Clerk
2. Middleware reads user's organization ID (tenant_id)
3. Request handler creates Prisma client with RLS extension
4. Extension runs `SET app.current_tenant_id = $tenant_id`
5. All queries automatically filtered by RLS policies

**Critical:** Never trust client-provided tenant_id. Always derive from authenticated user's session.

**Mock Data for Multi-Tenant:**
- Seed scripts MUST include `tenantId` in all records
- Query existing tenant-scoped records (trucks, drivers) before creating related data
- Use `createMany` with `skipDuplicates: true` for idempotent seeding
- Never hardcode IDs across tenants (use foreign key relationships)
- GPS coordinates should be realistic for tenant's operating region

## Sources

### Official Documentation (HIGH confidence)
- [Next.js 16 Documentation](https://nextjs.org/docs) - Latest version, Turbopack defaults, App Router
- [React 19.2 Release Notes](https://react.dev/blog/2025/10/01/react-19-2) - Partial Pre-rendering, Activity component
- [TypeScript 5.8 Release Notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-8.html) - Direct execution, improved type checking
- [PostgreSQL 17 Release Notes](https://www.postgresql.org/docs/release/17.0/) - Performance improvements, logical replication enhancements
- [Tailwind CSS v4.0 Announcement](https://tailwindcss.com/blog/tailwindcss-v4) - Performance, CSS-first config, OKLCH colors
- [TanStack Query v5 Documentation](https://tanstack.com/query/latest) - API changes, useMutationState hook
- [Prisma Documentation](https://www.prisma.io/docs/orm) - Prisma 7 pure TypeScript architecture
- [Clerk Documentation](https://clerk.com/docs) - Multi-tenant SaaS patterns
- [Stripe SaaS Integration Guide](https://docs.stripe.com/saas) - Subscription billing best practices
- **[React Leaflet Official Documentation](https://react-leaflet.js.org/) - v5.x current version, React 19 compatibility (HIGH confidence)**
- **[Leaflet Official Documentation](https://leafletjs.com/) - Core mapping library, version 1.9.4 (HIGH confidence)**
- **[Recharts Official Documentation](https://recharts.github.io/) - v3.7.0 current stable (HIGH confidence)**
- **[Recharts npm package](https://www.npmjs.com/package/recharts) - Version 3.7.0 verification (HIGH confidence)**
- **[Lucide React Documentation](https://lucide.dev/guide/packages/lucide-react) - Official docs (HIGH confidence)**
- **[shadcn/ui Sidebar Component](https://ui.shadcn.com/docs/components/radix/sidebar) - Official component documentation (HIGH confidence)**
- **[date-fns Documentation](https://date-fns.org/) - Functional date utilities (HIGH confidence)**
- **[Prisma Seeding Documentation](https://www.prisma.io/docs/orm/prisma-migrate/workflows/seeding) - Official seeding guide (HIGH confidence)**
- **[@faker-js/faker npm](https://www.npmjs.com/package/@faker-js/faker) - Version 10.3.0 verification (HIGH confidence)**
- **[Leaflet.markercluster GitHub](https://github.com/Leaflet/Leaflet.markercluster) - Official clustering plugin (HIGH confidence)**

### Comparison Articles (MEDIUM-HIGH confidence)
- [Clerk vs Auth0 for Next.js](https://clerk.com/articles/clerk-vs-auth0-for-nextjs) - Technical comparison, 2026
- [Cloudflare R2 vs AWS S3 Comparison](https://www.cloudflare.com/pg-cloudflare-r2-vs-aws-s3/) - Pricing, feature parity
- [Resend vs SendGrid Comparison 2026](https://forwardemail.net/en/blog/resend-vs-sendgrid-email-service-comparison) - Developer experience, deliverability
- [Prisma vs Drizzle ORM 2026](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma) - Performance vs DX tradeoffs
- [PostgreSQL Row-Level Security Multi-Tenant](https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres) - RLS implementation patterns
- **[Mapbox vs Leaflet Comparison](https://medium.com/visarsoft-blog/leaflet-or-mapbox-choosing-the-right-tool-for-interactive-maps-53dea7cc3c40) - Architecture decision (MEDIUM confidence)**
- **[React Map Library Comparison - LogRocket](https://blog.logrocket.com/react-map-library-comparison/) - Technical comparison (MEDIUM confidence)**
- **[Recharts vs Chart.js Comparison](https://stackshare.io/stackups/js-chart-vs-recharts) - Technical comparison (MEDIUM confidence)**
- **[Best React Chart Libraries 2025 - LogRocket](https://blog.logrocket.com/best-react-chart-libraries-2025/) - Feature comparison (MEDIUM confidence)**
- **[Top 5 React Chart Libraries 2026 - Syncfusion](https://www.syncfusion.com/blogs/post/top-5-react-chart-libraries) - Current trends (MEDIUM confidence)**
- **[date-fns vs dayjs Comparison](https://www.dhiwise.com/post/date-fns-vs-dayjs-the-battle-of-javascript-date-libraries) - Bundle size analysis (MEDIUM confidence)**
- **[Tremor built on Recharts](https://www.tremor.so/) - Alternative comparison (HIGH confidence)**

### Integration Guides (MEDIUM confidence)
- **[React Leaflet on Next.js 15 App Router](https://xxlsteve.net/blog/react-leaflet-on-next-15/) - Integration patterns (MEDIUM confidence)**
- **[React Leaflet with Next.js - PlaceKit](https://placekit.io/blog/articles/making-react-leaflet-work-with-nextjs-493i) - SSR handling (MEDIUM confidence)**
- **[How to use Leaflet with Next.js - MapTiler](https://docs.maptiler.com/leaflet/examples/nextjs/) - Official guide (HIGH confidence)**
- **[Building Next.js Dashboard with Charts and SSR - Cube](https://cube.dev/blog/building-nextjs-dashboard-with-dynamic-charts-and-ssr) - Recharts + Next.js patterns (MEDIUM confidence)**
- **[Next.js and Recharts Dashboard - Ably](https://ably.com/blog/informational-dashboard-with-nextjs-and-recharts) - Implementation guide (MEDIUM confidence)**
- **[Leaflet Marker Clustering Tutorial](https://www.leighhalliday.com/leaflet-clustering) - Practical guide (MEDIUM confidence)**
- **[shadcn Sidebar Component Guide - CodeParrot](https://codeparrot.ai/blogs/why-developers-love-the-shadcn-sidebar-component) - Best practices (MEDIUM confidence)**

### SaaS Architecture Research (MEDIUM confidence, verified across multiple sources)
- [WorkOS Multi-Tenant Architecture Guide](https://workos.com/blog/developers-guide-saas-multi-tenant-architecture) - Tenant isolation strategies
- [Best Tech Stack for Multi-Tenant SaaS 2025](https://ideadope.com/roadmaps/best-tech-stack-for-multi-tenant-saas-mvp-to-scale) - Stack recommendations
- [Next.js SaaS Architecture Patterns](https://vladimirsiedykh.com/blog/saas-architecture-patterns-nextjs) - Modular monolith pattern
- [AWS Multi-Tenant Data Isolation with PostgreSQL RLS](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/) - Enterprise RLS patterns
- **[Prisma Multi-Tenant RLS Guide](https://medium.com/@francolabuschagne90/securing-multi-tenant-applications-using-row-level-security-in-postgresql-with-prisma-orm-4237f4d4bd35) - RLS seeding pattern (MEDIUM confidence)**

### Fleet Management Domain (MEDIUM confidence)
- [Fleet Management Software Development Guide 2025](https://www.inexture.com/fleet-management-software-for-logistics-and-delivery-operations/) - Industry feature requirements
- [Fleet Management Technology Trends 2025](https://intelliarts.com/blog/fleet-management-technology-trends/) - IoT, AI, cloud computing integration

---
*Stack research for: Multi-tenant Fleet Management SaaS*
*Researched: 2026-02-14 (Updated: 2026-02-15 for Milestone 2 - Maps, Charts, Icons, Mock Data, Sidebar Navigation)*
*Next.js 16 + PostgreSQL 17 + Clerk + Prisma 7 + Leaflet + Recharts + Lucide + Faker.js + shadcn/ui Sidebar*
