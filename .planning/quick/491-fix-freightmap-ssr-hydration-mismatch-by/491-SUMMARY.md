# Quick Task 491 — Summary

Fixed the `FreightMap` SSR hydration mismatch that produced the red "1 Issue" dev badge on the **sign-in** and **sign-up** auth screens.

## Root cause
`FreightMap` (`components/auth/freight-map.tsx`) draws US state outlines with d3-geo's `geoAlbersUsa` projection. Albers is trigonometric (`Math.sin/cos/sqrt`), and those transcendental functions differ by a last ULP between Node's V8 (server render) and the browser's V8 (client). So the SSR'd SVG path `d` strings didn't byte-match the client's → React hydration mismatch. (Shared component → both auth pages were affected.)

## Fix (1 commit `6e0ea6b2`)
Render the `<svg>` **client-only**: added a `mounted` flag (`useEffect(() => setMounted(true), [])`) and gate the SVG on it. The container `<div ref>` still SSRs (so `getBoundingClientRect` measurement works), but the mismatching SVG paths never SSR. The map is purely decorative (`aria-hidden`) and already fades in via animation, so there's no visible regression.

## Verification
- `tsc --noEmit` → **0 errors**.
- Playwright console check at 1280px on both pages: **0 hydration errors** (was 1), and the map still renders (64 state paths present after mount) on both `/sign-in` and `/sign-up`.

## Notes
- Not deployed, not pushed.
