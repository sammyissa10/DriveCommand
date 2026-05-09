# Phase 37: Polish + Performance - Context

**Gathered:** 2026-03-27 (updated after mobile audit)
**Status:** Ready for planning (Plans 01–03 complete, Plans 04+ use this)

<domain>
## Phase Boundary

Full design and performance pass across both driver and owner portals. No new features — only quality, consistency, and completing what's already stubbed. Covers: design system standardization (NativeWind everywhere), form validation and error states, accessibility basics, skeleton loaders on remaining screens, and stub screen cleanup.

**Note:** Plans 01–03 shipped: touch targets (48px), FlashList migration, skeleton loaders (driver portal), Reanimated animations, haptics, dark mode, ripple effects, tab labels, thumb-friendly sizing. Plans 04+ cover the remaining audit findings.

</domain>

<decisions>
## Implementation Decisions

### Plans 01–03 (already shipped — preserved for reference)
- Touch targets: minimum 48×48pt enforced across all interactive elements
- FlashList: every FlatList/ScrollView-with-list replaced
- Skeleton loaders: shimmer animation (Reanimated, 800ms cycle, 0.3→1→0.3 opacity) on all driver portal screens
- Animations: FadeIn on screen mount, spring BottomSheet, no animation on tab switch
- Haptics: Light on tab press, Success/Error on form submit, Medium on status update, Warning on destructive action, Light on pull-to-refresh
- Dark mode: dark-first default, NativeWind dark: variants, system light mode supported
- Android: ripple on all Pressables; iOS: safe area verified

### Design standardization (Plans 04+)
- NativeWind everywhere — full migration from inline StyleSheet across all screens
- Typography: Tailwind utilities only (text-sm, text-base, font-semibold, text-slate-900, etc.) — no hardcoded fontSize/fontWeight
- Spacing: Claude's discretion — pick a consistent scale (standard screen padding, card gap, section spacing) and apply everywhere
- Loading states: skeletons everywhere — no ActivityIndicator spinners on any data-fetching screen; every screen gets a content-shaped skeleton

### Form validation & errors
- Validation triggers on submit only (not real-time, not on blur)
- Inline field errors: red text below the field (text-red-500) + field border turns red
- Coverage: all forms — Create Load, Create Incident, HOS Status Update, Login, Fleet Message, Add Document
- API error handling: toast notification + keep form open and populated so user can fix and retry

### Accessibility
- Scope: basics only — accessibilityLabel + accessibilityRole on interactive elements
- All icon-only buttons get descriptive accessibilityLabel (FAB → "Add document", back → "Go back", filter → "Filter loads", etc.)
- Data elements get meaningful labels: KPI cards, status chips, stat displays read as full context (e.g., "12 active loads this month" not just "12")
- No full VoiceOver/TalkBack audit required — just label coverage pass

### Claude's Discretion
- Exact Tailwind spacing scale values (screen padding, card gap, section spacing)
- Which screens still need skeleton variants built (audit the remaining owner portal screens)
- accessibilityHint usage where helpful but not required
- Order of screen migrations within each plan

</decisions>

<specifics>
## Specific Ideas

- The design standardization is primarily an owner portal problem — driver portal is more consistent already
- "The app should feel as native as possible" — this was the original direction and still holds
- Haptics are especially important for the driver portal (truck drivers wearing gloves)
- The audit graded backend connectivity A — this phase is purely frontend/UX work

</specifics>

<deferred>
## Deferred Ideas

- Stub screens (Live Map, AI Documents, Incident Detail) — user did not select this area; treat as future phase or separate quick task
- Full VoiceOver/TalkBack testing and focus-order audit — future accessibility phase
- Custom fonts beyond Poppins headings — future polish
- Micro-animations on data points (counter animations) — future polish
- Gesture-based navigation (swipe back on Android) — already handled by React Navigation

</deferred>

---

*Phase: 37-polish-performance*
*Context gathered: 2026-03-27 (replanned after mobile audit)*
