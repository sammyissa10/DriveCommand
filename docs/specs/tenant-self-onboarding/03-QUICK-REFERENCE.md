# Quick Reference — How to Build This in Claude Code

**For:** You. Right now. Sitting at VS Code with Claude Code open.
**Goal:** Get from these specs to working code with the GSD skill.

---

## 1. What We Are Building (One Paragraph)

A self-serve signup system for DriveCommand. New trucking companies sign up with 6 fields, get a 14-day trial, land in a workspace pre-populated with sample data, and are guided by a 5-step checklist plus behavior-driven emails toward dispatching their first real load. Our team monitors every tenant from the SysAdmin portal with activation, engagement, and health-score metrics. Stripe is deferred to the end so we can ship the rest first.

---

## 2. Files to Add to Your Repo

You have three documentation files. Put them in your `Specs/` folder so they live alongside other planning docs.

**Step 1.** In VS Code, open your DriveCommand repo.

**Step 2.** Inside the existing `Specs/` folder, create a new subfolder:
```
Specs/tenant-self-onboarding/
```

**Step 3.** Copy these three files into that folder:
```
Specs/tenant-self-onboarding/01-TECHNICAL-SPEC.md
Specs/tenant-self-onboarding/02-INTERNAL-OPS-GUIDE.md
Specs/tenant-self-onboarding/03-QUICK-REFERENCE.md   (this file)
```

That's it. Three files in one folder. Commit them so they live in the repo:
```bash
git add Specs/tenant-self-onboarding/
git commit -m "docs: tenant self-onboarding specs"
```

---

## 3. The Build Order

The technical spec breaks the work into 4 phases. Build them in this exact order. Each phase has a few small plans inside it. Use the GSD workflow for each one.

```
Phase A — Database foundation
Phase B — Signup + provisioning
Phase C — Onboarding UX + activation tracking
Phase D — Automations + telemetry + SysAdmin
```

Do NOT start Phase B until Phase A is verified working. Do NOT start Phase D until Phase C is verified working.

---

## 4. The GSD Workflow (Reminder)

For each phase, you run this loop in Claude Code:

```
/gsd:discuss-phase    →   /gsd:plan-phase    →   /gsd:execute-phase    →   /gsd:verify-work
```

Discuss = you and Claude align on what's in scope. Plan = Claude writes the step-by-step plan. Execute = Claude writes the code. Verify = Claude checks the work matches the plan.

---

## 5. The Prompts — In Order

Copy each prompt below into Claude Code in order. Wait for each one to finish before starting the next. Run the full GSD loop for each phase before moving on.

### Prompt 1 — Phase A (Database Foundation)

```
I want to build the database foundation for tenant self-onboarding. The full spec is in @Specs/tenant-self-onboarding/01-TECHNICAL-SPEC.md sections 4 and 11 (Phase A). Use the GSD skill. Run /gsd:discuss-phase to align on scope, then /gsd:plan-phase to produce the plans. Phase A has three plans: A-01 schema and migration with RLS, A-02 seed Plans and SYSTEM AutomationRules, A-03 Plan and Promo CRUD in SysAdmin. Stripe is deferred — leave Stripe columns nullable and do not write to them. After all three plans execute, run /gsd:verify-work and confirm the migration applies cleanly and TypeScript compiles.
```

---

### Prompt 2 — Phase B (Signup and Provisioning)

```
Phase A is done and verified. Now build Phase B from @Specs/tenant-self-onboarding/01-TECHNICAL-SPEC.md sections 5.3 through 5.8 and section 6 (the provisioning flow). Use the GSD skill. Phase B has three plans: B-01 validation schemas plus provision-tenant.ts plus seed-sample-data.ts plus hydrate-tenant.ts, B-02 the /sign-up page with the 6-field form and the signup server action plus session-set plus redirect to /onboarding/welcome, B-03 the email confirmation route and token helper and confirm-email plus welcome-owner React Email templates. The signup transaction must use bypass_rls and be fully atomic per section 6.1. The flow is path-based at /t/<slug>. Stripe is still deferred — do not collect a card. Run the full GSD loop and verify a real signup works end-to-end (form to logged-in welcome page in under 5 seconds).
```

---

### Prompt 3 — Phase C (Onboarding UX and Activation Tracking)

```
Phases A and B are done and verified. Now build Phase C from @Specs/tenant-self-onboarding/01-TECHNICAL-SPEC.md sections 5.7, 5.10, and 6.2 (first-landing hydration), plus section 8 (activation update points). Use the GSD skill. Phase C has three plans: C-01 the /onboarding/welcome page with the 5-item checklist plus sample-data banner plus SAMPLE pill component, C-02 activation tracker hooks into existing Truck Driver Customer Load create actions plus completion percent calculation, C-03 modify existing dashboards to show the sample-data banner and SAMPLE pills and exclude samples from KPI counts. The activation event is when a real load reaches IN_PROGRESS — that flips isActivated true and emits tenant.activated. Run the full GSD loop and verify that adding a real truck bumps the bar from 20 to 40 percent and dispatching a real load fires tenant.activated.
```

---

### Prompt 4 — Phase D (Automations, Telemetry, SysAdmin)

```
Phases A through C are done and verified. Now build the final phase from @Specs/tenant-self-onboarding/01-TECHNICAL-SPEC.md sections 5.9, 5.11, 5.12, and section 7 (automations engine), plus section 8.3 and 8.4 (telemetry crons). Use the GSD skill. Phase D has three plans: D-01 AppEvent plus emitEvent plus the automation evaluator plus action handlers (send_email and in_app_message) plus template registry, D-02 cron routes (run-scheduled-automations every 15 min, aggregate-tenant-metrics daily, compute-health-scores daily) plus vercel.json registration, D-03 SysAdmin tenant detail page enhancements (six panels per spec section 5.12) plus /admin/automations rule list and editor plus extendTrial action. Use the existing Gmail SMTP transport and React Email pattern. Run the full GSD loop and verify the welcome email actually sends, the 30-min nudge fires correctly when no progress, and SysAdmin shows the new tenant with activation percent and health score.
```

---

### Prompt 5 — Final Verification

```
All four phases are done. Run /gsd:verify-work across the whole feature using the verification checklist in @Specs/tenant-self-onboarding/01-TECHNICAL-SPEC.md section 12. Cross-check against the operations guide in @Specs/tenant-self-onboarding/02-INTERNAL-OPS-GUIDE.md to make sure the operational stories work — can the team really extend a trial from SysAdmin? Can they edit automation copy without a deploy? Can they see the activity timeline? Report any gaps and fix them.
```

---

### Prompt 6 — Stripe (Later, When Ready)

This one runs only AFTER everything above is shipped and Stripe credentials are set up.

```
The tenant self-onboarding system is live without Stripe. Now wire Stripe per @Specs/tenant-self-onboarding/01-TECHNICAL-SPEC.md section 9. Use the GSD skill. The work is: set stripeProductId on each Plan and stripeCouponId on each Promo, create Stripe Customer plus Subscription on first authenticated landing or on /billing/setup, add webhook handler at /api/webhooks/stripe to update Subscription.status and currentPeriodStart/End from Stripe events, build the actual /billing/setup page using Stripe Checkout, and switch the signup flow to card-required for the higher conversion. Run the full GSD loop and verify a card on file converts a trial to active correctly.
```

---

## 6. Where Things Will End Up in the Codebase

After Claude Code is done, you'll see new files in these locations. This is just so you know what to expect. You don't have to create any of these manually — Claude Code will.

```
prisma/schema.prisma                                    (modified)
migrations/<timestamp>__tenant_self_onboarding.sql      (new)
migrations/<timestamp>__seed_plans_and_automations.sql  (new)

src/lib/validations/onboarding.schemas.ts               (new)
src/lib/onboarding/provision-tenant.ts                  (new)
src/lib/onboarding/seed-sample-data.ts                  (new)
src/lib/onboarding/hydrate-tenant.ts                    (new)
src/lib/onboarding/activation-tracker.ts                (new)
src/lib/automations/event-bus.ts                        (new)
src/lib/automations/evaluator.ts                        (new)
src/lib/automations/actions/send-email.ts               (new)
src/lib/automations/actions/in-app-notification.ts      (new)
src/lib/automations/template-registry.ts                (new)
src/lib/telemetry/event-types.ts                        (new)
src/lib/telemetry/track.ts                              (new)
src/lib/email/tokens.ts                                 (new)

src/app/(auth)/sign-up/page.tsx                         (new)
src/app/(auth)/sign-up/sign-up-form.tsx                 (new)
src/app/(auth)/sign-up/actions.ts                       (new)
src/app/api/email-confirm/[token]/route.ts              (new)
src/app/onboarding/welcome/page.tsx                     (new)
src/app/onboarding/welcome/checklist.tsx                (new)

src/components/onboarding/sample-data-banner.tsx        (new)
src/components/onboarding/sample-pill.tsx               (new)

src/app/(admin)/tenants/page.tsx                        (modified)
src/app/(admin)/tenants/[id]/page.tsx                   (modified)
src/app/(admin)/tenants/[id]/actions.ts                 (modified)
src/app/(admin)/automations/page.tsx                    (new)
src/app/(admin)/automations/[id]/edit/page.tsx          (new)
src/app/(admin)/promos/page.tsx                         (new)
src/app/(admin)/promos/new/page.tsx                     (new)

src/app/api/cron/run-scheduled-automations/route.ts     (new)
src/app/api/cron/aggregate-tenant-metrics/route.ts      (new)
src/app/api/cron/compute-health-scores/route.ts         (new)

src/emails/confirm-email.tsx                            (new)
src/emails/welcome-owner.tsx                            (new)
src/emails/no-progress-nudge.tsx                        (new)
src/emails/next-step-add-driver.tsx                     (new)
src/emails/next-step-dispatch-load.tsx                  (new)
src/emails/trial-ending-soon.tsx                        (new)
src/emails/activation-celebration.tsx                   (new)
src/emails/driver-onboarding-checklist-prompt.tsx       (new)

vercel.json                                             (modified)
```

---

## 7. Things to Watch For (Things That Will Bite You)

**1. Don't run `prisma migrate dev`.**
This project uses raw SQL migrations applied by `scripts/migrate.mjs` at deploy time, not Prisma's migration command. If Claude Code tries to use `prisma migrate dev`, push back. The migration file goes in `migrations/<timestamp>__name.sql`.

**2. RLS is the security boundary, not application code.**
Every new tenant-scoped table needs RLS enabled, FORCED, plus the two policies (tenant_isolation and bypass_rls). If you ever see code that filters by tenantId without RLS being on, that's a bug — push back.

**3. The signup transaction is the only place outside SysAdmin that uses bypass_rls.**
If Claude Code suggests using bypass_rls in regular tenant code paths, that's wrong. Bypass is only for: signup (no session yet), SysAdmin queries (cross-tenant by design), and cron jobs (need to read all tenants).

**4. Sample data must be excluded from billable counts.**
When computing seatsUsed, storageBytes, or anything that maps to plan limits, filter `WHERE isSample = false`. If you don't, sample drivers will count against the seat limit.

**5. The activation event is non-trivial — check it carefully.**
A tenant is activated when a real (non-sample) load reaches IN_PROGRESS with a real (non-sample) truck and real (non-sample) driver assigned. All three conditions must hold. Test the negative cases.

**6. Email confirmation tokens are single-use.**
Once redeemed, the token is invalidated. Don't let Claude Code build a token that can be reused.

**7. Email open rate jumps if it's from a real human name.**
The from-address should be "Tom from DriveCommand" or similar. Not "no-reply@drivecommand.io". Reply-to should route to a real inbox.

**8. Stripe stays deferred until the rest is shipped.**
Every Stripe column stays nullable. The signup flow does not collect a card. The trial countdown still works — it just doesn't charge anything when it expires. When the trial ends with no payment method, the tenant flips to PAST_DUE and sees a "Billing setup coming soon" message. Stripe wiring is the very last prompt (Prompt 6).

---

## 8. After Each Phase — Sanity Check

Run these in the terminal after each phase before moving to the next:

```bash
npx tsc --noEmit              # No TypeScript errors
npm run lint                   # No lint errors
npx playwright test --project=chromium --grep @smoke   # Smoke tests pass
```

If any fail, fix before moving on. Don't pile up problems across phases.

---

## 9. If You Get Stuck

If Claude Code goes off the rails or builds something that doesn't match the spec, do this:

1. Stop the current task.
2. In Claude Code, point at the specific section of the spec it's deviating from. Example: "The plan you just made doesn't match section 6.1 of the technical spec — re-read that section and fix the plan before executing."
3. Re-run the GSD plan-phase or execute-phase.

If you need to back out something Claude Code already wrote, use git: `git restore` the files, then re-prompt with the corrected scope.

---

## 10. The Three Documents — What Each One Is For

| File | When You Read It |
|---|---|
| `01-TECHNICAL-SPEC.md` | When you (or Claude Code) need the exact details — schema fields, file paths, flow steps, RLS policies. This is the source of truth. |
| `02-INTERNAL-OPS-GUIDE.md` | When you're explaining the system to a non-technical teammate, training customer success, or writing onboarding for a new hire on the operations side. |
| `03-QUICK-REFERENCE.md` (this file) | When you're sitting at VS Code about to build. Tells you the prompts to run and where to put things. |

---

*End of Quick Reference.*
