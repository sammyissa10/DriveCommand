# Quick Task 572 — Email Brand Design System + Dispatcher Shell Rebuild

**Date:** 2026-09-01
**Follows:** quick-571 (the read-only inventory that scoped this)

## Why

Transactional email has never had the brand system applied. quick-571 established the ground truth:
the dispatcher shell used `#0f62fe`, the 29 standalone templates use `#1e40af`, Signal Blue is
`#0066CC`, and none of the 30 files had a logo image, dark-mode handling, an unsubscribe link or a
per-email preheader. This builds the shared system and rebuilds the dispatcher shell on it. It is
the foundation for the follow-on work; the 29 standalone templates are explicitly NOT in scope.

## Tasks

1. **Locate the logo, then build the system.** The brief's stop condition is a missing cleaned
   transparent PNG. Resolve which asset is actually the mark before writing any component, and if
   the requested 148x24 wordmark lockup does not exist, report the deviation rather than
   rasterising letterforms into a new brand asset.

2. **`src/emails/_system/`** — `tokens.ts` (every colour, stack, measurement; zero hex literals
   permitted in any component), then `Preheader`, `Header`, `StatusBar`, `DetailRows`, `Button`,
   `Footer`, `Shell`, `index.ts`. Table-based layout only — no flex, no grid, no absolute
   positioning. Dark mode as colour-only overrides inside a `prefers-color-scheme` block, so
   Outlook Windows (which evaluates no media query) is unaffected by construction.

3. **Rebuild `dynamic-template.tsx` on the Shell**, preserving the exported name and prop signature
   so `template-renderer.ts` keeps compiling; thread the new optional props through the renderer.
   Derive the preheader from body text when not supplied — never restore the constant.

4. **`scripts/email-render-qa.ts`** — render, screenshot light/dark x images-on/blocked, report the
   rendered byte size against Gmail's 102KB clip limit.

## Verification

- Four screenshots produced and actually looked at, not just generated.
- Byte size reported and under 102KB.
- Element offsets measured in a real browser, not eyeballed from a screenshot.
- Image blocking proven real by counting intercepted requests — a blocked run that intercepts
  nothing proves nothing.
- `tsc --noEmit` clean AND probed (inject an error into an edited file, confirm tsc reports it).
- Test baseline compared against HEAD via stash before attributing any failure to this work.
