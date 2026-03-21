# Phase 38: EAS Build Pipeline + CI/CD + Beta Distribution - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Set up the complete build and distribution infrastructure: EAS code signing for iOS and Android, GitHub Actions CI/CD workflows (lint/test on PR, OTA update on main, production build on tag), TestFlight external beta for iOS, and Google Play Internal Track + Open Testing for Android. At the end of this phase, any merge to main auto-ships an OTA update to beta testers.

</domain>

<decisions>
## Implementation Decisions

### EAS build profiles
- development: debug build, dev client, internal distribution, simulator + device
- preview: production JS bundle, internal distribution (TestFlight internal + Play Internal Track)
- production: App Store/Play Store submission build, auto-increment build number

### Code signing approach
- iOS: EAS Managed credentials (EAS handles provisioning profiles and certificates automatically)
- Android: EAS Managed credentials (EAS generates and stores the upload keystore)
- This removes the need for Xcode or Android Studio on CI

### GitHub Actions trigger rules
- PR opened/updated: lint + type check + unit tests (fast feedback, no EAS build)
- Merge to main: eas update (OTA JS push to production channel) — no native rebuild needed for JS changes
- Git tag v*: eas build production + eas submit (full store submission)

### OTA update strategy
- EAS Update branch: "production" — all installed apps receive JS updates automatically
- Native rebuilds only when: new Expo modules added, permissions changed, native config changed
- This means most bug fixes ship in ~2 minutes without App Store review

### TestFlight setup
- External testing group (not just internal) — allows up to 10,000 testers
- Testers added by email invitation
- 90-day beta expiry — apps stop working if not updated, so EAS Update covers the gaps

### Google Play Open Testing
- Required: 20 testers for 14 days minimum before applying for production access
- Start this clock as early as possible (Week 7 of development = Phase 38)
- Open testing: anyone with the link can join
- After 14-day period: apply for production access in Play Console

### Claude's Discretion
- Exact GitHub Actions YAML structure and job names
- Whether to use pnpm or npm in CI (match local)
- Exact EAS Update configuration (channel naming)

</decisions>

<specifics>
## Specific Ideas

- The GitHub Actions PR comment with a QR code for the preview build is a great developer experience — implement if feasible
- EAS Update should happen silently in the background — drivers should not be interrupted for JS updates

</specifics>

<deferred>
## Deferred Ideas

- Fastlane integration — not needed with EAS handling everything
- Crash reporting (Sentry) — future phase (add expo-sentry after launch)
- Performance monitoring — future phase

</deferred>

---

*Phase: 38-eas-pipeline-beta*
*Context gathered: 2026-03-21*
