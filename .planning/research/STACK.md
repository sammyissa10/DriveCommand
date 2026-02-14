# Technology Stack

**Project:** DriveCommand
**Researched:** 2026-02-14
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

## Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | 4.x | Date manipulation | Lighter than Moment.js. For service schedule calculations, maintenance reminders. |
| @tanstack/react-table | 8.x | Data tables | If building complex vehicle/driver tables with sorting, filtering, pagination. |
| zustand | 4.x | Client state | Lightweight state management (dashboard UI state, filters, modals). Use for client-only state, not server data. |
| react-dropzone | 14.x | File uploads | For vehicle document uploads. Handles drag-drop, validation, previews. |
| recharts | 2.x | Charts/graphs | If building dashboard analytics (fuel costs, maintenance trends). |

## Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| ESLint | Code linting | Next.js includes eslint-config-next. Add @typescript-eslint for stricter rules. |
| Prettier | Code formatting | Standard config: 2-space indent, single quotes, trailing commas. |
| Husky | Git hooks | Run linting, type checking, tests before commits. |
| lint-staged | Staged file linting | Run Prettier and ESLint only on changed files. |

## Installation

```bash
# Initialize Next.js project
npx create-next-app@latest drivecommand --typescript --tailwind --app --use-npm

# Core dependencies
npm install @prisma/client @clerk/nextjs zod react-hook-form @hookform/resolvers @tanstack/react-query

# UI components
npx shadcn@latest init
npx shadcn@latest add form input button table select dialog

# File upload
npm install react-dropzone

# Date utilities
npm install date-fns

# Email (if using Resend)
npm install resend react-email

# Dev dependencies
npm install -D prisma @types/node typescript eslint prettier husky lint-staged
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

## Stack Patterns by Variant

**If building MVP (3-6 months):**
- Use Clerk (fastest auth setup)
- Use Vercel (zero-config deployment)
- Use Prisma (rapid schema iteration)
- Use shadcn/ui (pre-built components)
- **Because:** Maximize velocity, minimize infrastructure work.

**If cost-conscious (bootstrap/side project):**
- Use NextAuth.js (free, self-hosted auth)
- Use Railway or Coolify (predictable pricing, includes database)
- Use Cloudflare R2 (free tier: 10GB storage, 1M reads/month)
- Use Resend free tier (3,000 emails/month)
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
- **Because:** Vercel serverless has cold starts and limits for long-lived connections.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Next.js 16.x | React 19+ | Next.js 16 requires React 19. React 18 not supported. |
| Prisma 7.x | PostgreSQL 12+ | PostgreSQL 17 recommended for RLS and performance. |
| TanStack Query 5.x | React 18+ | Uses useSyncExternalStore (React 18 API). |
| Tailwind CSS 4.x | Modern browsers | Safari 16.4+, Chrome 111+, Firefox 128+. For older browsers, use Tailwind v3.4. |
| TypeScript 5.8 | Node.js 23.6+ | Direct execution feature requires Node.js 23.6+. |

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

### Comparison Articles (MEDIUM-HIGH confidence)
- [Clerk vs Auth0 for Next.js](https://clerk.com/articles/clerk-vs-auth0-for-nextjs) - Technical comparison, 2026
- [Cloudflare R2 vs AWS S3 Comparison](https://www.cloudflare.com/pg-cloudflare-r2-vs-aws-s3/) - Pricing, feature parity
- [Resend vs SendGrid Comparison 2026](https://forwardemail.net/en/blog/resend-vs-sendgrid-email-service-comparison) - Developer experience, deliverability
- [Prisma vs Drizzle ORM 2026](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma) - Performance vs DX tradeoffs
- [PostgreSQL Row-Level Security Multi-Tenant](https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres) - RLS implementation patterns

### SaaS Architecture Research (MEDIUM confidence, verified across multiple sources)
- [WorkOS Multi-Tenant Architecture Guide](https://workos.com/blog/developers-guide-saas-multi-tenant-architecture) - Tenant isolation strategies
- [Best Tech Stack for Multi-Tenant SaaS 2025](https://ideadope.com/roadmaps/best-tech-stack-for-multi-tenant-saas-mvp-to-scale) - Stack recommendations
- [Next.js SaaS Architecture Patterns](https://vladimirsiedykh.com/blog/saas-architecture-patterns-nextjs) - Modular monolith pattern
- [AWS Multi-Tenant Data Isolation with PostgreSQL RLS](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/) - Enterprise RLS patterns

### Fleet Management Domain (MEDIUM confidence)
- [Fleet Management Software Development Guide 2025](https://www.inexture.com/fleet-management-software-for-logistics-and-delivery-operations/) - Industry feature requirements
- [Fleet Management Technology Trends 2025](https://intelliarts.com/blog/fleet-management-technology-trends/) - IoT, AI, cloud computing integration

---
*Stack research for: Multi-tenant Fleet Management SaaS*
*Researched: 2026-02-14*
*Next.js 16 + PostgreSQL 17 + Clerk + Prisma 7 + Cloudflare R2*
