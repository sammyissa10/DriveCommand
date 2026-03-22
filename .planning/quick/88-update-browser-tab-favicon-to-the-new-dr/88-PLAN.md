---
phase: quick-88
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/layout.tsx
  - public/site.webmanifest
autonomous: true
must_haves:
  truths:
    - "Browser tab shows the new DriveCommand chevron favicon"
    - "Multiple icon sizes declared for different device contexts"
    - "PWA manifest provides icons for home screen installation"
  artifacts:
    - path: "src/app/layout.tsx"
      provides: "Metadata with multi-size icon declarations"
      contains: "icon"
    - path: "public/site.webmanifest"
      provides: "PWA manifest with icon entries"
      contains: "icons"
    - path: "src/app/favicon.ico"
      provides: "Auto-served favicon.ico by Next.js App Router"
  key_links:
    - from: "src/app/layout.tsx"
      to: "public/favicon.png"
      via: "metadata.icons.icon"
      pattern: "favicon\\.png"
    - from: "public/site.webmanifest"
      to: "public/logo-192.png"
      via: "icons array"
      pattern: "logo-192"
---

<objective>
Update the DriveCommand browser tab favicon and icon metadata to use the new logo assets.

Purpose: The old icon.svg was deleted and new logo assets (favicon.png, logo-32.png, logo-192.png, favicon.ico) are already in place. This plan ensures the metadata in layout.tsx declares all icon sizes correctly, and adds a web manifest for PWA icon support.

Output: Correct favicon display in browser tabs, proper multi-size icon declarations, and a PWA-ready web manifest.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/layout.tsx
@public/favicon.png
@public/logo-32.png
@public/logo-192.png
@src/app/favicon.ico
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update layout.tsx icon metadata and create web manifest</name>
  <files>src/app/layout.tsx, public/site.webmanifest</files>
  <action>
    1. Update the `metadata.icons` object in `src/app/layout.tsx` to include multiple icon sizes:
       - icon: array with two entries:
         - { url: '/favicon.png', type: 'image/png' }
         - { url: '/logo-32.png', sizes: '32x32', type: 'image/png' }
       - apple: { url: '/logo-192.png', sizes: '192x192', type: 'image/png' }
       (Keep the existing apple entry as-is)
    2. Add `manifest: '/site.webmanifest'` to the metadata object (at the top level, alongside title/description/icons).
    3. Create `public/site.webmanifest` with:
       ```json
       {
         "name": "DriveCommand",
         "short_name": "DriveCommand",
         "icons": [
           { "src": "/logo-32.png", "sizes": "32x32", "type": "image/png" },
           { "src": "/logo-192.png", "sizes": "192x192", "type": "image/png" },
           { "src": "/logo.png", "sizes": "512x512", "type": "image/png" }
         ],
         "theme_color": "#1a1a2e",
         "background_color": "#1a1a2e",
         "display": "standalone"
       }
       ```
    4. Verify `src/app/favicon.ico` exists (Next.js App Router auto-serves it at /favicon.ico — no metadata entry needed).
    5. Add '/site.webmanifest' to the public paths array in `src/middleware.ts` (the array near line 28 that already includes '/favicon.ico' and '/favicon.png') so it bypasses auth middleware.
  </action>
  <verify>
    - `npm run build` completes without errors
    - Grep layout.tsx for 'logo-32' confirms 32x32 icon entry exists
    - Grep layout.tsx for 'manifest' confirms manifest link exists
    - `cat public/site.webmanifest` shows valid JSON with icon entries
    - Grep middleware.ts for 'webmanifest' confirms it's in the public paths
  </verify>
  <done>
    - layout.tsx metadata declares favicon.png (default), logo-32.png (32x32), and logo-192.png (apple-touch)
    - layout.tsx metadata includes manifest link to /site.webmanifest
    - public/site.webmanifest exists with DriveCommand name and 3 icon sizes
    - Middleware allows /site.webmanifest through without auth
    - Build succeeds
  </done>
</task>

</tasks>

<verification>
- `npm run build` passes
- layout.tsx metadata.icons has multiple size entries
- public/site.webmanifest is valid JSON
- No references to the old icon.svg remain anywhere in src/
</verification>

<success_criteria>
Browser tab favicon uses the new DriveCommand logo. Multiple icon sizes are declared for different device contexts. A web manifest exists for PWA home screen installation support. Build passes cleanly.
</success_criteria>

<output>
After completion, create `.planning/quick/88-update-browser-tab-favicon-to-the-new-dr/88-SUMMARY.md`
</output>
