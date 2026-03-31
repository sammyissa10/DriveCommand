# Contributing to DriveCommand

## Project Overview

DriveCommand is a multi-tenant fleet management SaaS. It is a Turborepo monorepo with two apps:

- **`apps/web`** — Next.js 14 web app (owner portal, driver portal, admin portal, and the API backend for mobile)
- **`apps/mobile`** — React Native + Expo mobile app (owner portal and driver portal)

Three shared packages span both apps:

- **`@drivecommand/types`** — TypeScript interfaces for all API payloads and domain objects
- **`@drivecommand/validation`** — Zod schemas for validating API requests and responses
- **`@drivecommand/api-client`** — Typed HTTP client that calls the Next.js API routes

---

## Development Workflow

DriveCommand uses the **GSD (Get Shit Done)** system for all development:

- **Quick tasks and bug fixes** — `/gsd:quick`
- **New features** — full phase workflow: `/gsd:discuss-phase` → `/gsd:plan-phase` → `/gsd:execute-phase` → `/gsd:verify-work`
- **Progress check** — `/gsd:progress`

Do not work ad-hoc. All work should go through the appropriate GSD command so it is planned, committed, and documented correctly.

---

## Branch Naming

Use one of these prefixes:

| Prefix | When |
|--------|------|
| `feature/description` | New feature or capability |
| `fix/description` | Bug fix |
| `docs/description` | Documentation only |
| `refactor/description` | Refactoring with no behavior change |
| `chore/description` | Config, tooling, dependency updates |

Examples:
```
feature/driver-hos-display
fix/load-status-revert-logic
docs/mobile-api-reference
```

---

## Commit Conventions

DriveCommand uses Conventional Commits format:

```
type(scope): concise description

- bullet point for key change
- another key change
```

**Types:**

| Type | When |
|------|------|
| `feat` | New feature, endpoint, component |
| `fix` | Bug fix, error correction |
| `docs` | Documentation only |
| `refactor` | Code cleanup, no behavior change |
| `test` | Tests only |
| `chore` | Config, dependencies, tooling |

**Scope:** Use the GSD task ID (e.g., `quick-138`, `phase-39`) or a short subsystem name.

**Examples from this repo's git log:**
```
feat(quick-137): add /api/health endpoint and register in PUBLIC_PATHS
fix(quick-136): add 3 missing composite indexes
docs(quick-138): add mobile API reference and domain glossary
chore(phase-29): configure Turborepo workspaces and monorepo base
```

---

## Pre-Commit Checks

Always run the TypeScript type check before deploying:

```bash
# Web app
cd apps/web
npx tsc --noEmit

# Mobile app
cd apps/mobile
npx tsc --noEmit
```

Vercel runs `next build` (which includes `tsc`) on every deploy. Type errors that pass locally but fail on Vercel will break the deployment.

---

## Deployment

**Deploy via Vercel CLI only.** Never push to GitHub for deployment.

```bash
# Deploy web app to production
cd apps/web
vercel --prod
```

GitHub may lag behind Vercel's deployment state. Vercel is the source of truth. Do not rely on GitHub's auto-deploy webhooks.

**Mobile app deployments** use EAS Build:

```bash
cd apps/mobile

# Development build (for testing on emulator)
eas build --profile development --platform android

# Production build (for app store submission)
eas build --profile production --platform all

# OTA update (JS-only changes, no native rebuild needed)
eas update --branch production --message "Fix load status display"
```

---

## Code Style

The repo uses Prettier and ESLint configured at the root. Run before committing:

```bash
# Format all files
npx prettier --write .

# Lint
npx eslint .
```

**Styling conventions:**
- **Web:** Tailwind CSS utility classes + shadcn/ui components
- **Mobile:** NativeWind v4 (same Tailwind vocabulary as web)
- Do not mix inline styles with Tailwind classes

**TypeScript:**
- All new files should be `.ts` or `.tsx`
- Avoid `any` — use proper types from `@drivecommand/types`
- Prisma-generated types are in `apps/web/src/generated/prisma/`

---

## Database and Migrations

The database is PostgreSQL hosted on Supabase. Prisma is the ORM.

```bash
# Generate Prisma client after schema changes
cd apps/web
npx prisma generate

# Create a new migration
npx prisma migrate dev --name describe-the-change

# Deploy migrations to production (CI/CD)
npx prisma migrate deploy
```

**RLS (Row-Level Security):** All tables have RLS enabled. Mobile API routes must call `bypass_rls` in transactions (see `docs/glossary.md#bypass_rls`).

---

## Where to Find Documentation

| Topic | Location |
|-------|---------|
| Mobile API reference | `apps/mobile/docs/api.md` |
| Mobile architecture + ADRs | `apps/mobile/docs/architecture.md` |
| Mobile local dev setup | `apps/mobile/docs/local-development.md` |
| Mobile troubleshooting | `apps/mobile/docs/troubleshooting.md` |
| Web troubleshooting | `apps/web/docs/troubleshooting.md` |
| Web authentication | `apps/web/docs/auth.md` |
| Web database | `apps/web/docs/database.md` |
| Web deployment | `apps/web/docs/deployment.md` |
| Domain glossary | `docs/glossary.md` |
| Planning docs | `.planning/` |

---

## Testing

**Web:** Playwright E2E tests (see `apps/web/tests/` and Phase 27 planning docs).

**Mobile:** Android emulator only. Never Expo Go — native modules are incompatible. See `apps/mobile/docs/local-development.md` for the full setup sequence.

---

## Getting Help

- Check the docs listed above first
- Review `.planning/STATE.md` for current project state and decisions
- Check `.planning/phases/` and `.planning/quick/` for planning docs and summaries of past work
