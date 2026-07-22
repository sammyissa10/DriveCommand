# Quick Task 491 — Fix FreightMap SSR hydration mismatch

## Problem
The red "1 Issue" dev badge on /sign-in and /sign-up is a hydration mismatch: FreightMap's d3-geo Albers projection (trig Math) yields last-ULP-different SVG path coords on Node (server) vs browser (client).

## Fix
Render the decorative SVG client-only — gate `<svg>` on a `mounted` flag (useEffect setMounted after hydration). Keep the container div for measurement. No visible regression (aria-hidden, fades in).

## Verify
- tsc 0 errors.
- Playwright console check: 0 hydration errors on both auth pages; map still renders.

## Commit
`fix(quick-491): render FreightMap client-only to remove SSR hydration mismatch`
