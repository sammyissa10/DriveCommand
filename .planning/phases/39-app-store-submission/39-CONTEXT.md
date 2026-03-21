# Phase 39: App Store Submission + Launch - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Prepare all App Store and Google Play store assets (icon, screenshots, descriptions, privacy policy), submit both stores, manage review feedback, and execute the launch rollout. The phase ends when the app is live on both stores and available for download.

</domain>

<decisions>
## Implementation Decisions

### App name and metadata
- App name: "DriveCommand"
- Subtitle (iOS): "Fleet Management for Truckers"
- Short description (Android): "Manage your trucking fleet from anywhere" (max 80 chars)
- Category: Business
- Age rating: 4+ (no objectionable content)

### Screenshots
- Show real app screens, not mockups
- Content: realistic data from seed (not Lorem ipsum, not empty states)
- Required iPhone sizes: 6.7" (iPhone 16 Pro Max) and 6.5" (iPhone 14 Plus)
- iPad 12.9" screenshots required (mark app as universal)
- Android: Phone screenshots (1080×1920 or 1440×2960)
- Show both portals: start with driver screens (primary audience), then owner screens
- Screenshot order: Login → Driver Dashboard → Active Load → Map (owner) → Driver HOS

### Privacy policy
- Required by both stores before submission
- Host at a public URL: e.g., drivecommand.com/privacy or a static page on the web app
- Must cover: location data collection (background), camera access, push notifications, account data
- A basic, clear privacy policy is sufficient — not a legal document

### App Store keywords (iOS)
- "fleet management trucking dispatch driver HOS logistics freight"
- 100 character limit for keywords field
- Do not repeat words from the title or subtitle

### Review notes (both stores)
- Include demo account credentials for reviewers
- Explain background location: "Used to report driver position to dispatchers during deliveries"
- Note: app requires account creation (no guest mode)

### Rollout strategy
- iOS: 100% rollout (no phased rollout option for first release)
- Android: 10% rollout → monitor 24 hours → 50% → 100%

### Claude's Discretion
- Exact screenshot caption text (shown below screenshots in store)
- Color scheme for any marketing screenshots (use in-app dark theme)
- Whether to create a preview video (nice-to-have, not required)

</decisions>

<specifics>
## Specific Ideas

- Screenshots should feature realistic trucking data — "Load #DC-1042: Chicago, IL → Memphis, TN" feels more authentic than generic text
- The app icon should be the DriveCommand DC chevron logo on a dark (#0f172a) background — consistent with the web favicon

</specifics>

<deferred>
## Deferred Ideas

- App preview video (30-second demo) — future submission update
- Apple Search Ads campaign — post-launch marketing
- Google Play Store listing A/B testing — post-launch
- Localization (Spanish for US trucking market) — future milestone

</deferred>

---

*Phase: 39-app-store-submission*
*Context gathered: 2026-03-21*
