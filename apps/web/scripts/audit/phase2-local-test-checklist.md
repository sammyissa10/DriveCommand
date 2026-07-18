# Phase 2 Local Test Checklist

**DO NOT proceed to production cutover until every item passes.**

---

## Section 1: Setup

- [ ] dev server starts without error (`npm run dev` from `apps/web`)
- [ ] `/login` page loads
- [ ] Sign in as `owner@test.com` / `TestPass123!` succeeds

---

## Section 2: Core Page Smoke Tests

> Check each page — look for 500s in the browser network tab and server errors in the terminal.

- [ ] `/carrier/dashboard` — loads without error
- [ ] `/carrier/loads` — data appears
- [ ] `/carrier/dispatches` — data appears
- [ ] `/carrier/clients` — data appears or correct empty state
- [ ] `/carrier/drivers` — data appears
- [ ] `/carrier/trucks` — data appears
- [ ] `/carrier/routes` — data appears
- [ ] `/carrier/contracts` — data appears
- [ ] `/carrier/reports/revenue` — loads without error
- [ ] `/carrier/driver-pay` — assignments visible
- [ ] `/carrier/driver-pay/settlements` — loads without error

---

## Section 3: Cross-Tenant Isolation Spot Check

- [ ] Sign out
- [ ] Sign in as `owner_b@test.com` / `TestPass123!`
- [ ] Confirm you see **different** data than `owner@test.com` (different loads, drivers, etc.)
- [ ] No 500s in network tab

---

## Section 4: Write Path Test

> Catches missing INSERT/UPDATE grants.

- [ ] Create a new load via `/carrier/loads/new`
- [ ] Edit an existing driver
- [ ] Delete something (a draft, a test record, anything)

---

## Section 5: Driver Portal Test

- [ ] Sign out
- [ ] Sign in as `driver@test.com` / `TestPass123!`
- [ ] Driver portal pages load with the driver's own data (no 500s)

---

## Section 6: Settlement / PDF Generation

> Catches Storage and signed URL issues.

- [ ] Open a finalized settlement
- [ ] PDF generates and opens successfully

---

## Section 7: Final Checks

- [ ] Zero 500 errors observed in network tab anywhere during the session
- [ ] No console errors mentioning "permission denied" or "RLS"

---

## After All Checks

Paste back **any checklist items that failed**, along with:
- The network error (status code + response body)
- The terminal error (Prisma error message + query)

**Only when ALL items pass** is it safe to proceed to production cutover (Phase 2).

---

## Revert Instructions

If you need to revert to the postgres superuser connection:

1. Open `apps/web/.env.local`
2. Uncomment the `ORIGINAL_DATABASE_URL_BACKUP_2026-06-02` line
3. Comment out the `DATABASE_URL` line below it
4. Save the file
5. Restart the dev server (`Ctrl+C`, then `npm run dev` from `apps/web`)
