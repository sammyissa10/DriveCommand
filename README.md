# DriveCommand

Multi-tenant SaaS fleet management platform for trucking operators. Owners manage their fleet from the web portal or mobile app. Drivers execute routes from the mobile app.

---

## Monorepo Structure

This project is a [Turborepo](https://turbo.build/) monorepo with npm workspaces.

```
drivecommand/
  apps/
    web/          # Next.js 16 web app (owner portal, driver portal, sysadmin portal)
    mobile/       # Expo/React Native mobile app (owner + driver portals)
  packages/
    types/        # Shared TypeScript interfaces (@drivecommand/types)
    validation/   # Shared Zod schemas (@drivecommand/validation)
    api-client/   # Typed HTTP client for mobile → web API (@drivecommand/api-client)
```

| Workspace | Description |
|---|---|
| `apps/web` | Next.js 16 App Router web app — serves web portals AND acts as the API backend for mobile |
| `apps/mobile` | Expo SDK 55 + React Native 0.83 mobile app with NativeWind v4 |
| `packages/types` | Shared TypeScript interfaces used by both web and mobile |
| `packages/validation` | Shared Zod schemas for request/response validation |
| `packages/api-client` | Typed HTTP client that mobile uses to call web API routes |

---

## Tech Stack

| Layer | Web | Mobile |
|---|---|---|
| Framework | Next.js 16 (App Router) | Expo SDK 55 / React Native 0.83 |
| Language | TypeScript | TypeScript |
| Database | PostgreSQL via Supabase | — (calls web API) |
| ORM | Prisma 7 with @prisma/adapter-pg | — |
| Styling | Tailwind CSS + shadcn/ui | NativeWind v4 |
| Auth | Custom AES-256-GCM session cookie | Supabase Auth + SecureStore |
| State | React Server Components + Server Actions | React Query + React Context |
| Navigation | Next.js App Router | Expo Router (file-based) |
| Email | Gmail SMTP via Nodemailer | — |
| File Storage | Cloudflare R2 / AWS S3 | — |
| AI | Anthropic Claude | — |
| Maps | Leaflet + react-leaflet (web) | react-native-maps (mobile) |
| Deployment | Vercel | EAS Build (Expo Application Services) |
| Monorepo | Turborepo | Turborepo |

---

## Quick Start

### Prerequisites

- **Node.js 20+**
- **npm** (comes with Node.js) — the monorepo uses npm workspaces
- A **Supabase account** — [supabase.com](https://supabase.com)

### Install

```bash
git clone <repo-url>
cd drivecommand
npm install
```

Running `npm install` at the root installs dependencies for all workspaces (web, mobile, and shared packages). See [apps/web/docs/setup.md](apps/web/docs/setup.md) for full environment variable setup.

---

## Development Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start all apps in parallel via Turbo |
| `cd apps/web && npm run dev` | Start only the web app |
| `cd apps/mobile && npx expo start` | Start only the mobile app (use Android emulator) |
| `npm run build` | Build all apps via Turbo |
| `npm run lint` | Lint all workspaces |
| `npm run test` | Run tests for all workspaces |

> **Mobile testing note:** Always use an Android emulator. Native modules (MMKV, Maps) are incompatible with Expo Go. See the mobile docs for emulator startup steps.

---

## Documentation

- **Web app:** [apps/web/docs/](apps/web/docs/) — architecture, database schema, auth, setup, deployment
- **Mobile app:** [apps/mobile/docs/](apps/mobile/docs/) — architecture, auth flow, navigation, build process
