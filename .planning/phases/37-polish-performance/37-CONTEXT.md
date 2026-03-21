# Phase 37: Polish + Performance - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Full design and performance pass across both driver and owner portals. Audit touch targets, replace remaining FlatLists with FlashList, add React Native Reanimated transitions and haptic feedback, implement dark mode via NativeWind, add skeleton loaders to all loading states, and verify correct behavior on both iOS and Android physical devices. No new features — only quality and feel.

</domain>

<decisions>
## Implementation Decisions

### Touch targets
- Minimum 48×48pt on all interactive elements (Apple HIG standard)
- Audit every Button, Pressable, tab bar item, list item, and form control
- Fix any element below 48px by adding padding (not changing visual size necessarily)

### Animation library
- React Native Reanimated v3 (already included with Expo SDK 52)
- FadeIn on screen mount (not slide — cleaner for tab navigation)
- SlideInRight for stack navigation (push screens)
- No animation on tab switch (native tab behavior is instant — don't fight it)
- LayoutAnimation for list item additions/removals

### Haptic feedback events
- Tab press: Haptics.impactAsync(Light)
- Form submit success: Haptics.notificationAsync(Success)
- Form submit error: Haptics.notificationAsync(Error)
- Status update confirmation: Haptics.impactAsync(Medium)
- Destructive action (cancel load, delete): Haptics.notificationAsync(Warning)
- Pull-to-refresh trigger point: Haptics.impactAsync(Light)

### Skeleton loaders
- Animated shimmer (using Reanimated loop animation on opacity 0.3→1→0.3)
- Replace ActivityIndicator spinners on all data-fetching screens
- Each screen gets its own skeleton that matches the real content shape
- Duration: 800ms per cycle

### FlashList audit
- Replace every FlatList, ScrollView with list content, and map()-rendered lists with FlashList
- Set estimatedItemSize accurately per list (measure actual rendered height)

### Dark mode
- App is dark-first by default (dark theme is the primary)
- System light mode support: NativeWind dark: variants already provide this
- Verify: status bar style, keyboard appearance, modal backgrounds
- Light mode: bg-white cards, text-slate-900 body, border-slate-200

### Platform-specific polish
- iOS: use SF Symbols via expo-symbols where appropriate (optional, nice-to-have)
- Android: ripple effect on all Pressable components (TouchableNativeFeedback pattern)
- Safe area: verify notch/Dynamic Island on iPhone 16 Pro and punch-hole on Android

### Claude's Discretion
- Exact shimmer animation implementation
- Whether to add spring animations to bottom sheet open/close
- Specific Reanimated entering/exiting animations for each screen type

</decisions>

<specifics>
## Specific Ideas

- The app should feel as native as possible — no web-like transitions, no janky animations
- Haptics are important for the driver experience — truck drivers wearing gloves need tactile feedback to know their tap registered

</specifics>

<deferred>
## Deferred Ideas

- Custom fonts beyond Poppins headings — future polish
- Micro-animations on individual data points (counter animations) — future polish
- Gesture-based navigation (swipe back on Android) — already handled by React Navigation default

</deferred>

---

*Phase: 37-polish-performance*
*Context gathered: 2026-03-21*
