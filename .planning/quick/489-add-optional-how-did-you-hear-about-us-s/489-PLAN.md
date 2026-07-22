# Quick Task 489 — Optional "How did you hear about us?"

## Goal
Optional acquisition-channel field on the signup wizard's final step; store on Tenant (value + free text for "Other"); surface on SysAdmin tenant detail. Strictly optional — never blocks signup.

## Plan
1. `Tenant.heardAbout String?` + `heardAboutOther String?` (nullable TEXT) in schema.prisma + raw-SQL migration `20260722000003`; `prisma generate`; apply on remote via MCP.
2. Shared `lib/onboarding/heard-about.ts` — `HEARD_ABOUT_OPTIONS` (google_search/referral/social_media/industry_event/other) + `heardAboutLabel()`.
3. `onboarding.schemas.ts`: `heardAbout` + `heardAboutOther` as `.string().optional()` (loose — never blocks).
4. `actions.tsx`: read both from FormData; add heardAbout to tenant.created event.
5. `provision-tenant.ts`: store both; free text only when `heardAbout === 'other'`.
6. `sign-up-form.tsx` step 2 (under Promo code): `<select name="heardAbout">` + conditional `<Input name="heardAboutOther">` on "Other", controlled by a `heardAbout` state.
7. Admin: `getTenantById` select + `tenants/[id]/page.tsx` "Acquisition" block.

## Verify
- tsc 0 errors; E2E empty signup completes; E2E Other+text stores + round-trips (verify DB fields getTenantById selects); clean up test tenants.

## Commits
1. `feat(quick-489): add Tenant.heardAbout + heardAboutOther columns + migration`
2. `feat(quick-489): optional 'How did you hear about us?' field + SysAdmin surfacing`

## Notes
- Use ABSOLUTE paths for file tools (shell cwd drifts to apps/web → relative paths create a stray apps/web/apps/web tree, as happened in task 488).
- Running dev server needs a restart after `prisma generate` to load the fresh client.
