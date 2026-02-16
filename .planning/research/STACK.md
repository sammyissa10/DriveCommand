# Technology Stack

**Project:** DriveCommand
**Researched:** 2026-02-14 (Updated: 2026-02-16 for Milestone 3)
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

| Technology | Version | Purpose | When to Use |
|------------|---------|---------|-------------|
| Vitest | Latest | Unit testing | Fast, Vite-powered test runner. Native TypeScript. Use with React Testing Library for component tests. Note: Async Server Components not supported, use E2E tests for those. |
| Playwright | Latest | E2E testing | Official Next.js recommendation for end-to-end tests. Cross-browser (Chromium, Firefox, WebKit). Parallel execution. Required for testing Server Components. |

### CI/CD

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| GitHub Actions | N/A | CI/CD pipeline | Native GitHub integration. Free for public repos, 2,000 minutes/month for private. Standard workflow: install deps → build → test → deploy. Use environments with protection rules for production. Cache dependencies aggressively. Pin action versions for security. |

---

## Milestone 2: Fleet Intelligence Stack Additions (Completed)

### Map Rendering

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| react-leaflet | 5.0.0 | React components for Leaflet maps | Open-source (BSD-2), zero API costs, excellent GPS trail rendering with Polyline/GeoJSON components, mature ecosystem, requires React 19 as peer dependency |
| leaflet | 1.9.4 | Core mapping library | Industry standard for 2D maps, completely free (no quotas or API limits), robust plugin ecosystem, perfect for fleet tracking routes, 145KB bundle size (with react-leaflet) |
| leaflet.markercluster | 1.5.3 | Fleet vehicle marker clustering | Handles 10K-50K markers with smooth animations, prevents map overcrowding with multiple vehicles, automatic zoom-based clustering, spiderfy clusters at bottom zoom level, essential for fleet tracking |
| leaflet-defaulticon-compatibility | 0.1.2 | Fix marker icon paths in webpack/Next.js | Solves Leaflet marker icon loading issues in Next.js builds (marker images won't display without this) |
| @types/leaflet | 1.9.x | TypeScript definitions for Leaflet | Official type definitions from DefinitelyTyped, required for TypeScript projects |
| @types/leaflet.markercluster | 1.5.x | TypeScript definitions for marker clustering | Prevents TypeScript errors with clustering plugin |

### Charting and Data Visualization

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| recharts | 3.7.0 | React charting library | Built on D3 and React, built-in TypeScript types (no @types package needed), works with React 19, 11 chart types including donut/pie for compliance metrics, composable components match React patterns, declarative API, used by shadcn/ui |
| date-fns | 4.1.0 | Date formatting and time series | Tree-shakable functional API, optimal for analytics date ranges and time series, better bundle size than Moment.js (tree-shaking), more React-friendly immutable API than dayjs, works in Server Components |

### Icons and Navigation

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| lucide-react | 0.564.0 | Icon library for React | Tree-shakeable (only imported icons in bundle), 1400+ icons including fleet-specific ones (Truck, MapPin, Gauge, Fuel), actively maintained (published Feb 13, 2026), works with React 19, returns typed React components as inline SVG, SSR-safe |

### Sidebar Navigation (Samsara-style)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| shadcn/ui Sidebar | Latest | Collapsible sidebar navigation | Already using shadcn/ui, composable sidebar component released in 2024, supports collapsible sections, icon-only collapsed state, keyboard shortcuts (Cmd+B), mobile responsive, built on Radix UI primitives |

### Mock Data Generation

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| @faker-js/faker | 10.3.0 | Generate realistic mock data | Industry standard for seed data, generates realistic GPS coordinates, timestamps, names, VINs, and metrics; active maintenance (published Feb 7, 2026), works with Prisma seed scripts, locale support for internationalization |

---

## NEW: Milestone 3 Stack Additions (Route Finance, Page Consolidation, Driver Documents)

### Form Management (New Addition)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| react-hook-form | ^7.54.2 | Advanced form state management for line-item arrays and edit mode | Industry standard for complex forms with dynamic arrays. Subscription-based updates minimize re-renders. Built-in support for useFieldArray for expense line items. Already partially integrated via Zod in project. Essential for route finance tracking with multiple expense/payment rows. |
| @hookform/resolvers | ^3.10.0 | Zod integration with react-hook-form | Official resolver package that bridges Zod schemas (already in project at 4.3.6) with react-hook-form validation. Enables declarative validation for dynamic form arrays. |

### Financial Calculations (New Addition)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| decimal.js | ^10.6.0 | Client-side financial calculations | TypeScript-safe decimal arithmetic for profit calculations (revenue - expenses). Prisma already uses Prisma.Decimal (which wraps decimal.js) for database storage. Use this for client-side display and calculations to avoid floating-point precision errors. |
| Intl.NumberFormat | (native) | Currency formatting for display | Built-in browser API for formatting currency values. No additional package needed. Use for displaying monetary amounts in USD format. Zero bundle size impact. |

### File Upload Enhancement (New Addition)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| react-dropzone | ^14.3.5 | Drag-and-drop file upload for driver documents | Mature library (15.0.0 latest as of Feb 2026) with proven Next.js compatibility. Provides drag-and-drop UX enhancement over existing file input. Works with existing S3 presigned upload flow. Handles edge cases (mobile, accessibility) that custom implementation would miss. |

### Existing Stack (Reuse - No Installation Required)

| Technology | Current Version | How It's Used for Milestone 3 |
|------------|-----------------|-------------------------------|
| Prisma with Decimal | 7.4.0 | Already handles money storage with @db.Decimal(10, 2) for fuel costs. Extend same pattern for route expenses and payments. |
| AWS SDK S3 | 3.990.0 | Already handles presigned URLs and document storage. Reuse for driver document uploads (license, application, general docs). |
| shadcn/ui components | Latest | Already has Form, Input, Button, Toggle. Use Toggle component for edit/view mode switching on route page. |
| Zod | 4.3.6 | Already used for validation. Extend with z.array() schemas for line-item validation. |

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

# Map rendering (Milestone 2 - already installed)
npm install react-leaflet@^5.0.0 leaflet@^1.9.4 leaflet.markercluster@^1.5.3 leaflet-defaulticon-compatibility@^0.1.2
npm install -D @types/leaflet @types/leaflet.markercluster

# Charts (Milestone 2 - already installed)
npm install recharts@^3.7.0

# Icons (Milestone 2 - already installed)
npm install lucide-react@^0.564.0

# Sidebar navigation (Milestone 2 - already installed)
npx shadcn@latest add sidebar
npx shadcn@latest add collapsible

# Date utilities (Milestone 2 - already installed)
npm install date-fns@^4.1.0

# Mock data generation (Milestone 2 - already installed)
npm install -D @faker-js/faker@^10.3.0

# NEW: Milestone 3 - Route Finance & UX Enhancements
npm install react-hook-form@^7.54.2 @hookform/resolvers@^3.10.0 decimal.js@^10.6.0 react-dropzone@^14.3.5

# File upload (reusing existing, enhancing with drag-drop)
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

## Milestone 3 Implementation Patterns

### 1. Route Finance Tracking (Line-Item Expenses & Payments)

**Database Layer:**
- Reuse Prisma Decimal pattern already established in FuelRecord model
- Schema: `amount Decimal @db.Decimal(10, 2)` for all monetary fields
- Store in cents precision (2 decimal places) for USD

**Application Layer:**
- Use react-hook-form's `useFieldArray` for dynamic expense/payment rows
- Zod schema: `z.object({ lineItems: z.array(z.object({ amount: z.string().regex(/^\d+\.\d{2}$/) })) })`
- Convert Prisma.Decimal to decimal.js Decimal for calculations, then back for storage

**Display Layer:**
- Format with `new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)`
- Display profit as calculated field (not stored): `revenue.minus(totalExpenses)`

### 2. Route Page Consolidation (View/Edit Mode Toggle)

**State Management:**
- Boolean state: `const [isEditMode, setIsEditMode] = useState(false)`
- Conditional rendering: Same component, different templates based on state

**UI Components:**
- Use shadcn/ui Toggle component for Edit/View switch in header
- Keep existing RouteDetail component for view mode
- Render RouteForm (wrapped with react-hook-form) for edit mode
- No separate /edit route - merge into single page with mode toggle

**Data Flow:**
- Server Component: Fetch route data + drivers + trucks in one page component
- Client Component: Handle mode state and form submission
- On save: Optimistic update or revalidatePath('/routes/[id]')

### 3. Driver Document Uploads

**Upload Flow:**
- Wrap react-dropzone around existing document upload infrastructure
- Keep presigned URL flow (already implemented in document.repository.ts)
- Add document type categorization: LICENSE, APPLICATION, GENERAL
- Reuse DocumentUpload component with react-dropzone enhancement

**Implementation:**
```typescript
// Enhance existing DocumentUpload component
import { useDropzone } from 'react-dropzone'

const { getRootProps, getInputProps } = useDropzone({
  accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png'] },
  maxSize: 10 * 1024 * 1024, // 10MB (existing limit)
  onDrop: handleFileChange // Use existing upload logic
})
```

## New Schema Extensions (Milestone 3)

```prisma
model RouteExpense {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @db.Uuid
  routeId     String   @db.Uuid
  description String
  amount      Decimal  @db.Decimal(10, 2)  // Reuse existing pattern
  category    String?
  receiptUrl  String?
  createdAt   DateTime @default(now()) @db.Timestamptz

  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  route       Route    @relation(fields: [routeId], references: [id], onDelete: Cascade)
}

model RoutePayment {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @db.Uuid
  routeId     String   @db.Uuid
  amount      Decimal  @db.Decimal(10, 2)  // Reuse existing pattern
  paidAt      DateTime @db.Timestamptz
  method      String?  // e.g., "CASH", "CHECK", "TRANSFER"
  createdAt   DateTime @default(now()) @db.Timestamptz

  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  route       Route    @relation(fields: [routeId], references: [id], onDelete: Cascade)
}

// Extend Document model with type categorization for driver docs
enum DocumentType {
  TRUCK_DOCUMENT
  ROUTE_DOCUMENT
  DRIVER_LICENSE
  DRIVER_APPLICATION
  DRIVER_GENERAL
}

// Add to Document model:
// documentType DocumentType @default(TRUCK_DOCUMENT)
// driverId     String?      @db.Uuid
// driver       User?        @relation(fields: [driverId], references: [id])
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
| Maps | Leaflet | Mapbox GL JS | Mapbox has API costs after free tier (50K loads/month), requires API key management, WebGL complexity overkill for 2D routes, vendor lock-in |
| Maps | Leaflet | Google Maps | Expensive ($7/1000 loads after $200 credit), requires credit card, complex pricing |
| Charts | Recharts | Tremor | Tremor is built on Recharts (adds abstraction layer), opinionated Tailwind styling, less flexibility for custom branding |
| Charts | Recharts | Chart.js | Imperative API (not React-native), manual state management, less composable, canvas rendering less flexible for styling |
| Charts | Recharts | Victory | Heavier bundle size, more opinionated styling, less active development |
| Icons | Lucide React | React Icons | No tree-shaking (bundles all icon sets), inconsistent design across sets, larger bundle |
| Icons | Lucide React | Heroicons | Smaller icon library (~200 icons vs 1400+), missing fleet-specific icons (Fuel, Truck variants) |
| Mock Data | Faker.js | Chance.js | Less active maintenance (last update 2020), smaller ecosystem, fewer realistic generators |
| Mock Data | Faker.js | casual | Abandoned (last update 2016), security vulnerabilities |
| Sidebar | shadcn/ui Sidebar | react-pro-sidebar | Another dependency to manage, shadcn pattern gives full code control, styling conflicts |
| **Form Management (NEW)** | **react-hook-form** | **Formik** | Formik has larger bundle size, more re-renders, less performant for dynamic arrays. react-hook-form has better useFieldArray API. |
| **Form Management (NEW)** | **react-hook-form** | **Manual state** | Never for line items - useFieldArray handles all edge cases (keying, validation, focus management) that manual state misses. |
| **Currency Display (NEW)** | **Intl.NumberFormat** | **currency.js library** | No need for extra library when native API suffices for USD-only display formatting. currency.js only if need currency conversion. |
| **Decimal Math (NEW)** | **decimal.js** | **Store as integers (cents)** | Integer storage (cents) is valid alternative for extreme performance at scale (millions of records). Current approach more maintainable and standard for financial SaaS. |
| **File Upload UX (NEW)** | **react-dropzone** | **Custom HTML5 drag API** | Never for production - react-dropzone handles edge cases (mobile, accessibility) that custom implementation would miss. |

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
| Mapbox GL JS v1.x | Changed to proprietary license, expensive for commercial use | Leaflet or MapLibre GL JS |
| faker (old package) | Abandoned in 2020, security vulnerabilities | @faker-js/faker |
| @types/recharts | Recharts 3.x has built-in types, stub package unnecessary | Import types directly from recharts |
| Static JSON mock files | Bypasses database validation, doesn't test RLS policies, stale data | Prisma seed scripts with Faker.js |
| react-leaflet-markercluster (old) | Deprecated, unmaintained (last update 2021) | react-leaflet-cluster (active fork) |
| Google Maps API | Expensive, complex pricing, requires credit card for all usage | Leaflet + OpenStreetMap (free) |
| **@db.Money (PostgreSQL)** | **Does not store currency info, has unexpected rounding behavior, not recommended by Prisma documentation** | **@db.Decimal(10, 2) with Prisma.Decimal type (already used in project)** |
| **Native number type for money** | **Floating-point precision errors (0.1 + 0.2 !== 0.3)** | **Prisma.Decimal for DB, decimal.js for calculations** |
| **react-currency-format** | **Unnecessary dependency when Intl.NumberFormat is native and sufficient** | **Intl.NumberFormat (built into browsers)** |
| **Separate /edit routes** | **Creates navigation overhead and duplicate data fetching** | **Toggle edit mode on same page component** |
| **Client-side routing for mode toggle** | **Causes unnecessary URL changes and history pollution** | **Boolean state in client component** |

## Stack Patterns by Variant

**If building MVP (3-6 months):**
- Use Clerk (fastest auth setup)
- Use Vercel (zero-config deployment)
- Use Prisma (rapid schema iteration)
- Use shadcn/ui (pre-built components)
- Use Leaflet for maps (zero cost, no API limits)
- Use Recharts for dashboards (batteries-included, composable)
- **Because:** Maximize velocity, minimize infrastructure work.

**If cost-conscious (bootstrap/side project):**
- Use NextAuth.js (free, self-hosted auth)
- Use Railway or Coolify (predictable pricing, includes database)
- Use Cloudflare R2 (free tier: 10GB storage, 1M reads/month)
- Use Resend free tier (3,000 emails/month)
- Use Leaflet for maps (zero cost, no API limits)
- Use Recharts (no cost, open-source)
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
- Consider Mapbox GL for 500+ simultaneous vehicles (WebGL acceleration)
- Use TanStack Query with polling (every 5-10s) for "near real-time" on budget
- **Because:** Vercel serverless has cold starts and limits for long-lived connections.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Next.js 16.x | React 19+ | Next.js 16 requires React 19. React 18 not supported. |
| Prisma 7.x | PostgreSQL 12+ | PostgreSQL 17 recommended for RLS and performance. |
| TanStack Query 5.x | React 18+ | Uses useSyncExternalStore (React 18 API). |
| Tailwind CSS 4.x | Modern browsers | Safari 16.4+, Chrome 111+, Firefox 128+. For older browsers, use Tailwind v3.4. |
| TypeScript 5.8 | Node.js 23.6+ | Direct execution feature requires Node.js 23.6+. |
| react-leaflet 5.0.0 | React 19, Leaflet 1.9 | Requires React 19 as peer dependency |
| recharts 3.7.0 | React 16.8+, React 19 | Peer dependency warnings with React 19 (use --legacy-peer-deps), functional |
| lucide-react 0.564.0 | React 16.4+, React 19 | No compatibility issues |
| leaflet.markercluster 1.5.3 | Leaflet 1.0+ | Works with Leaflet 1.9.4 |
| date-fns 4.1.0 | Framework agnostic | Works in Node.js and browsers, SSR-safe |
| **react-hook-form 7.54.2** | **React 16.8+, React 19** | **Requires React hooks (16.8+). Fully compatible with React 19.** |
| **@hookform/resolvers 3.10.0** | **Zod 3.x, 4.x** | **Works with current Zod 4.3.6. No breaking changes expected.** |
| **react-dropzone 14.3.5** | **Next.js 16, React 19** | **Requires React 16.8+. Latest version (15.0.0) also compatible but 14.x is stable for production.** |
| **decimal.js 10.6.0** | **TypeScript 5.x** | **Includes TypeScript definitions. No peer dependencies.** |

## Performance Considerations

### react-hook-form with useFieldArray
- **Good performance up to 100 line items** - Subscription model only re-renders changed fields
- **Important:** Always use `field.id` as React key, not array index (prevents re-render bugs)
- **Validation:** Validate entire form on submit, not on every keystroke for line items
- **Avoid:** Stacking multiple array operations (append then remove then append)

### Decimal.js Calculations
- **Minimal overhead** - Only used for display calculations, not stored
- **Pattern:** DB (Prisma.Decimal) → App (decimal.js) → Display (Intl.NumberFormat)
- **Never mix** - Don't mix Decimal instances with native numbers (causes precision loss)

### react-dropzone
- **No performance impact** - Only active during file selection/drop
- **Existing validation preserved** - 10MB limit, file type checks already implemented
- **Mobile compatible** - Falls back to file input on devices without drag support

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
| **react-hook-form** | **~35 KB** | **Low** | **Tree-shakable, only pay for features used (useForm, useFieldArray)** |
| **decimal.js** | **32 KB** | **Low** | **Only imported where financial calculations needed** |
| **react-dropzone** | **~20 KB** | **Low** | **Only loaded on pages with file uploads** |

**Total new bundle (milestone 3):** ~87 KB gzipped
- **Route finance pages:** +67 KB (react-hook-form + decimal.js)
- **Driver document pages:** +20 KB (react-dropzone)
- **Edit mode toggle:** 0 KB (uses existing shadcn/ui Toggle)

**Cumulative bundle (all milestones):** ~742 KB gzipped
- **Maps:** +180 KB
- **Charts:** +475 KB
- **Forms & finance:** +67 KB
- **File uploads:** +20 KB
- **Icons:** +2-10 KB

**Optimization strategy:**
1. **Route-based code splitting** (Next.js automatic)
2. **Lazy load maps** (dynamic import with ssr: false)
3. **Tree-shake Recharts** (import specific chart types)
4. **Tree-shake date-fns** (import specific functions)
5. **Tree-shake Lucide** (import specific icons)
6. **Tree-shake react-hook-form** (import only useForm, useFieldArray)

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
- [React Leaflet Official Documentation](https://react-leaflet.js.org/) - v5.x current version, React 19 compatibility (HIGH confidence)
- [Leaflet Official Documentation](https://leafletjs.com/) - Core mapping library, version 1.9.4 (HIGH confidence)
- [Recharts Official Documentation](https://recharts.github.io/) - v3.7.0 current stable (HIGH confidence)
- [Recharts npm package](https://www.npmjs.com/package/recharts) - Version 3.7.0 verification (HIGH confidence)
- [Lucide React Documentation](https://lucide.dev/guide/packages/lucide-react) - Official docs (HIGH confidence)
- [shadcn/ui Sidebar Component](https://ui.shadcn.com/docs/components/radix/sidebar) - Official component documentation (HIGH confidence)
- [date-fns Documentation](https://date-fns.org/) - Functional date utilities (HIGH confidence)
- [Prisma Seeding Documentation](https://www.prisma.io/docs/orm/prisma-migrate/workflows/seeding) - Official seeding guide (HIGH confidence)
- [@faker-js/faker npm](https://www.npmjs.com/package/@faker-js/faker) - Version 10.3.0 verification (HIGH confidence)
- [Leaflet.markercluster GitHub](https://github.com/Leaflet/Leaflet.markercluster) - Official clustering plugin (HIGH confidence)
- **[react-hook-form Documentation](https://react-hook-form.com/docs) - Official API docs (HIGH confidence)**
- **[useFieldArray Documentation](https://react-hook-form.com/docs/usefieldarray) - Dynamic form arrays (HIGH confidence)**
- **[decimal.js npm](https://www.npmjs.com/package/decimal.js?activeTab=readme) - Version 10.6.0 verification (HIGH confidence)**
- **[decimal.js API Reference](https://mikemcl.github.io/decimal.js/) - Official API documentation (HIGH confidence)**
- **[react-dropzone npm](https://www.npmjs.com/package/react-dropzone) - Version 14.3.5/15.0.0 verification (HIGH confidence)**
- **[react-dropzone Official Docs](https://react-dropzone.js.org/) - API reference (HIGH confidence)**
- **[Intl.NumberFormat - MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat) - Native currency formatting API (HIGH confidence)**

### Prisma & Database Best Practices (HIGH confidence)
- **[Recommended Prisma Schema Type for Money - GitHub Discussion](https://github.com/prisma/prisma/discussions/10160) - Community consensus on Decimal for money (HIGH confidence)**
- **[API with NestJS #147 - Wanago.io](https://wanago.io/2024/03/04/api-nestjs-money-postgresql-prisma/) - Decimal type implementation patterns (MEDIUM confidence)**
- **[Avoid usage of @db.Money - Prisma Docs](https://www.prisma.io/docs/postgres/query-optimization/recommendations/avoid-db-money) - Official recommendation against @db.Money (HIGH confidence)**
- **[Working with Money in Postgres - Crunchy Data](https://www.crunchydata.com/blog/working-with-money-in-postgres) - PostgreSQL NUMERIC vs MONEY best practices (HIGH confidence)**

### Form & Validation Patterns (MEDIUM-HIGH confidence)
- **[Form Validation with Zod and React Hook Form - Contentful](https://www.contentful.com/blog/react-hook-form-validation-zod/) - Integration pattern (MEDIUM-HIGH confidence)**
- **[How to Validate Forms with Zod and React-Hook-Form - freeCodeCamp](https://www.freecodecamp.org/news/react-form-validation-zod-react-hook-form/) - Implementation guide (MEDIUM confidence)**
- **[Dynamic hooks with react + react-hook-form and zod validation - Hashnode](https://devmohami.hashnode.dev/dynamic-hooks-with-react-react-hook-form-and-zod-validation) - Dynamic array validation patterns (MEDIUM confidence)**
- **[Performance with large forms - GitHub Discussion](https://github.com/orgs/react-hook-form/discussions/9446) - Performance best practices (HIGH confidence)**
- **[React Hook Form - Combined Add/Edit Form Example - Jason Watmore](https://jasonwatmore.com/post/2020/10/14/react-hook-form-combined-add-edit-create-update-form-example) - View/edit toggle pattern (MEDIUM confidence)**

### File Upload & UX Patterns (MEDIUM confidence)
- **[Building a Drag-and-Drop File Uploader with Next.js - Medium](https://medium.com/@codewithmarish/building-a-drag-and-drop-file-uploader-with-next-js-1cfaf504f8ea) - Next.js integration pattern (MEDIUM confidence)**
- **[Drag and Drop File Upload Component in Next.js - Digittrix](https://www.digittrix.com/scripts/drag-and-drop-file-upload-component-in-nextjs) - Implementation guide (MEDIUM confidence)**
- **[Currency Input - shadcn/ui Patterns](https://www.shadcn.io/patterns/input-special-5) - Currency input implementation pattern (HIGH confidence)**
- **[Toggle - shadcn/ui](https://ui.shadcn.com/docs/components/radix/toggle) - Edit/view mode toggle component (HIGH confidence)**

### Decimal & Financial Calculations (MEDIUM-HIGH confidence)
- **[Exact Calculations in TypeScript + Node.js - Medium](https://medium.com/@tbreijm/exact-calculations-in-typescript-node-js-b7333803609e) - Why decimal.js over native numbers (MEDIUM confidence)**
- **[Decimal with TypeScript - MojoAuth](https://mojoauth.com/binary-encoding-decoding/decimal-with-typescript) - TypeScript integration (MEDIUM confidence)**
- **[DECIMAL vs NUMERIC Datatype in PostgreSQL - GeeksforGeeks](https://www.geeksforgeeks.org/postgresql/decimal-vs-numeric-datatype-in-postgresql/) - Database type comparison (MEDIUM confidence)**

### Comparison Articles (MEDIUM-HIGH confidence)
- [Clerk vs Auth0 for Next.js](https://clerk.com/articles/clerk-vs-auth0-for-nextjs) - Technical comparison, 2026
- [Cloudflare R2 vs AWS S3 Comparison](https://www.cloudflare.com/pg-cloudflare-r2-vs-aws-s3/) - Pricing, feature parity
- [Resend vs SendGrid Comparison 2026](https://forwardemail.net/en/blog/resend-vs-sendgrid-email-service-comparison) - Developer experience, deliverability
- [Prisma vs Drizzle ORM 2026](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma) - Performance vs DX tradeoffs
- [PostgreSQL Row-Level Security Multi-Tenant](https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres) - RLS implementation patterns
- [Mapbox vs Leaflet Comparison](https://medium.com/visarsoft-blog/leaflet-or-mapbox-choosing-the-right-tool-for-interactive-maps-53dea7cc3c40) - Architecture decision (MEDIUM confidence)
- [React Map Library Comparison - LogRocket](https://blog.logrocket.com/react-map-library-comparison/) - Technical comparison (MEDIUM confidence)
- [Recharts vs Chart.js Comparison](https://stackshare.io/stackups/js-chart-vs-recharts) - Technical comparison (MEDIUM confidence)
- [Best React Chart Libraries 2025 - LogRocket](https://blog.logrocket.com/best-react-chart-libraries-2025/) - Feature comparison (MEDIUM confidence)
- [Top 5 React Chart Libraries 2026 - Syncfusion](https://www.syncfusion.com/blogs/post/top-5-react-chart-libraries) - Current trends (MEDIUM confidence)
- [date-fns vs dayjs Comparison](https://www.dhiwise.com/post/date-fns-vs-dayjs-the-battle-of-javascript-date-libraries) - Bundle size analysis (MEDIUM confidence)
- [Tremor built on Recharts](https://www.tremor.so/) - Alternative comparison (HIGH confidence)

### Integration Guides (MEDIUM confidence)
- [React Leaflet on Next.js 15 App Router](https://xxlsteve.net/blog/react-leaflet-on-next-15/) - Integration patterns (MEDIUM confidence)
- [React Leaflet with Next.js - PlaceKit](https://placekit.io/blog/articles/making-react-leaflet-work-with-nextjs-493i) - SSR handling (MEDIUM confidence)
- [How to use Leaflet with Next.js - MapTiler](https://docs.maptiler.com/leaflet/examples/nextjs/) - Official guide (HIGH confidence)
- [Building Next.js Dashboard with Charts and SSR - Cube](https://cube.dev/blog/building-nextjs-dashboard-with-dynamic-charts-and-ssr) - Recharts + Next.js patterns (MEDIUM confidence)
- [Next.js and Recharts Dashboard - Ably](https://ably.com/blog/informational-dashboard-with-nextjs-and-recharts) - Implementation guide (MEDIUM confidence)
- [Leaflet Marker Clustering Tutorial](https://www.leighhalliday.com/leaflet-clustering) - Practical guide (MEDIUM confidence)
- [shadcn Sidebar Component Guide - CodeParrot](https://codeparrot.ai/blogs/why-developers-love-the-shadcn-sidebar-component) - Best practices (MEDIUM confidence)

### SaaS Architecture Research (MEDIUM confidence, verified across multiple sources)
- [WorkOS Multi-Tenant Architecture Guide](https://workos.com/blog/developers-guide-saas-multi-tenant-architecture) - Tenant isolation strategies
- [Best Tech Stack for Multi-Tenant SaaS 2025](https://ideadope.com/roadmaps/best-tech-stack-for-multi-tenant-saas-mvp-to-scale) - Stack recommendations
- [Next.js SaaS Architecture Patterns](https://vladimirsiedykh.com/blog/saas-architecture-patterns-nextjs) - Modular monolith pattern
- [AWS Multi-Tenant Data Isolation with PostgreSQL RLS](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/) - Enterprise RLS patterns
- [Prisma Multi-Tenant RLS Guide](https://medium.com/@francolabuschagne90/securing-multi-tenant-applications-using-row-level-security-in-postgresql-with-prisma-orm-4237f4d4bd35) - RLS seeding pattern (MEDIUM confidence)

### Fleet Management Domain (MEDIUM confidence)
- [Fleet Management Software Development Guide 2025](https://www.inexture.com/fleet-management-software-for-logistics-and-delivery-operations/) - Industry feature requirements
- [Fleet Management Technology Trends 2025](https://intelliarts.com/blog/fleet-management-technology-trends/) - IoT, AI, cloud computing integration

---
*Stack research for: Multi-tenant Fleet Management SaaS*
*Researched: 2026-02-14 (Updated: 2026-02-16 for Milestone 3 - Route Finance, Page Consolidation, Driver Documents)*
*Next.js 16 + PostgreSQL 17 + Clerk + Prisma 7 + Leaflet + Recharts + Lucide + Faker.js + shadcn/ui + react-hook-form + decimal.js + react-dropzone*
