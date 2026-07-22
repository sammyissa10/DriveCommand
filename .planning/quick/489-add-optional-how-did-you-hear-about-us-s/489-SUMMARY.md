# Quick Task 489 — Summary

Added an optional "How did you hear about us?" field to the tenant signup wizard's final step, stored it on `Tenant`, and surfaced it in the SysAdmin tenant detail.

## Changes (2 code commits + docs)
**`b1096622` — DB:** `Tenant.heardAbout String?` + `Tenant.heardAboutOther String?` (both nullable TEXT). Raw-SQL migration `20260722000003_add_tenant_heard_about` (`ADD COLUMN IF NOT EXISTS`, no `prisma migrate dev`); applied + verified on remote DB; `prisma generate` synced the client.

**`d8b19cbc` — App + admin:**
- **Shared options** `lib/onboarding/heard-about.ts`: `HEARD_ABOUT_OPTIONS` (Google search / Referral / Social media / Industry event / Other) + `heardAboutLabel()` — used by both form (client) and admin (server) so the stored key and its label never drift.
- **Form** (`sign-up-form.tsx`, step 2, under Promo code): a `<select name="heardAbout">` with a blank "Select an option…" default; selecting **Other** reveals a free-text `<Input name="heardAboutOther" maxLength={200}>` (controlled via a small `heardAbout` state). Labeled "(optional)".
- **Schema** (`onboarding.schemas.ts`): `heardAbout` + `heardAboutOther` as `z.string().max(...).optional()` — loosely typed so an unexpected value can never fail account creation.
- **Action** (`actions.tsx`): reads both from FormData (undefined when empty); adds `heardAbout` to the `tenant.created` event.
- **Provisioning** (`provision-tenant.ts`): stores `heardAbout` + `heardAboutOther` on `Tenant.create`; the free text is kept **only when `heardAbout === 'other'`** (stray text for fixed options is dropped).
- **SysAdmin** (`tenants.ts` `getTenantById` select + `tenants/[id]/page.tsx`): new "Acquisition" block in the Tenant Info card showing "Heard about us: {label}" + the free text for Other, or "Not provided". (Also surfaces `truckCount` from task 488.)

## Requirements met
1. ✅ Select with the 5 options; free-text input appears only for "Other".
2. ✅ Stored on `Tenant` (value + free text); columns added via raw-SQL migration.
3. ✅ Strictly optional — empty submits fine, no validation error, never blocks creation.
4. ✅ Surfaced on the SysAdmin tenant detail page.

## Verification
- `tsc --noEmit` → **0 errors**.
- **Real E2E** (Playwright, 390px, fresh dev server), two signups:
  - **Empty**: acquisition left blank → signup **redirected to `/onboarding/welcome`**; DB `heardAbout=null, heardAboutOther=null` (optional, no block). ✅
  - **Other + free text**: selected "Other", the free-text input revealed and was filled → signup completed; DB `heardAbout='other', heardAboutOther='Found via a trucking podcast ad'`. ✅
- **Admin round-trip** verified at the data layer: the stored fields are exactly what `getTenantById` now selects, and the page renders `heardAboutLabel(tenant.heardAbout)` + the free text (tsc-verified JSX). The authenticated SysAdmin browser render was NOT driven here (no sysadmin creds); the "other" test tenant was **left in place** so the value can be eyeballed live at `localhost:3000/tenants/a802496e-deb3-414f-982f-28c209f2832c` (dev server has the admin-page changes; prod does not until deploy).

## Cleanup
- Deleted the "empty" test tenant (`672a0c1c…`) + its 4 auth users, verified gone.
- **Left the "other" test tenant `a802496e-deb3-414f-982f-28c209f2832c`** intentionally for live admin verification — pending deletion once confirmed (same safe deletion procedure).
- Dev server on :3000 was restarted (fresh Prisma client) and left running.
- Not deployed, not pushed.
