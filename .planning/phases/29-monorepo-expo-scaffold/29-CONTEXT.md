# Phase 29: Monorepo Foundation + Expo Scaffold - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Convert the existing single Next.js repo into a Turborepo monorepo. Move web app to apps/web/. Extract shared TypeScript types and Zod validation schemas into packages/. Scaffold the Expo app at apps/mobile/ with Expo Router, NativeWind, and EAS configuration. The web app must continue to build and deploy identically after the restructure. No new features — this is infrastructure only.

</domain>

<decisions>
## Implementation Decisions

### Monorepo tool
- Turborepo (not Nx, not Yarn workspaces alone)
- Root package.json with `workspaces: ["apps/*", "packages/*"]`
- turbo.json pipeline: build depends on ^build, lint and test are independent
- Each workspace has its own package.json and tsconfig.json

### Web app placement
- Existing repo content moves to apps/web/ (not a git subtree — a simple mv)
- All existing paths, imports, and env vars remain identical inside apps/web/
- Vercel deployment points to apps/web/ as the root directory
- The web app must pass `turbo run build` after the move with zero errors

### Expo app scaffold
- Expo SDK 52 with the New Architecture enabled (newArchEnabled: true in app.json)
- Expo Router v4 with file-based routing (same mental model as Next.js App Router)
- NativeWind v4 + Tailwind CSS 3.x configured for React Native
- Bundle ID: com.drivecommand.app (used for both iOS and Android)
- App name: "DriveCommand"
- Version: 1.0.0 (build number 1)

### EAS configuration
- Three profiles in .eas.json: development (debug build, dev client), preview (production JS, internal distribution), production (App Store / Play Store submission)
- EAS project ID linked to expo.dev account
- Platform: both iOS and Android from day one

### Shared packages
- packages/types/ — TypeScript interfaces only (no runtime code, no imports from Next.js)
- packages/validation/ — Zod schemas moved from src/lib/validations/* (pure TS, no framework deps)
- packages/api-client/ — Typed fetch wrapper using EXPO_PUBLIC_API_URL env var + Bearer token auth; mirrors server action signatures as async functions returning the same types
- Each package: TypeScript source, compiled to dist/, exported via package.json "exports" field

### API client auth
- All api-client functions accept an optional `token?: string` parameter
- Token comes from MMKV storage in the mobile app (handled by caller, not the package)
- On web, api-client is not used (server actions used directly)
- Base URL from EXPO_PUBLIC_API_URL (set to local IP during dev, production URL in EAS secrets)

### Claude's Discretion
- Exact turbo.json caching configuration
- TypeScript path aliases within packages
- Whether to use `pnpm` or `npm` for workspaces (choose based on existing package-lock.json)
- Exact NativeWind configuration file structure

</decisions>

<specifics>
## Specific Ideas

- The web app must remain 100% deployable on Vercel without any changes to its internal code — only the directory it lives in changes
- The shared packages should be usable by both apps without any build step in development (use `tsx` or TypeScript project references for zero-build dev experience)
- The Expo app's first successful boot is the Definition of Done for this phase — see the app title screen on a physical device

</specifics>

<deferred>
## Deferred Ideas

- Shared UI component library (packages/ui/) — deferred; mobile components use NativeWind primitives, not web shadcn/ui
- Storybook for component development — future phase
- Shared test utilities — can be added to packages/ later

</deferred>

---

*Phase: 29-monorepo-expo-scaffold*
*Context gathered: 2026-03-21*
