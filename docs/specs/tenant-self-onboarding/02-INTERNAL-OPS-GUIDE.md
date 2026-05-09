# Tenant Self-Onboarding — Internal Operations Guide

**For:** DriveCommand operations team, customer success, and leadership
**Audience:** Non-technical
**Last updated:** 2026-04-25

---

## 1. What This System Does

A trucking company owner visits `drivecommand.io`, fills out a short form, and within seconds is logged in to a fully working DriveCommand workspace with a 14-day free trial. They see sample trucks, drivers, and loads so they understand what the system looks like with data. A 5-step checklist on their dashboard guides them through adding their own truck, driver, client, and dispatching their first load. We send them helpful emails along the way based on what they're doing (or not doing). Our team can see every new tenant in the SysAdmin portal with their activation progress, engagement, and a health score telling us if they're at risk of churning.

That is the entire system. Everything below explains the moving parts and how to operate them day to day.

---

## 2. The Customer Journey

### Day 0 — Signup

The owner goes to `drivecommand.io`, clicks "Start Free Trial," and fills in 6 fields:

1. First name
2. Last name
3. Work email
4. Password
5. Company name
6. Fleet size (1-3 trucks / 4-15 / 16-50 / 50+)

They click submit. In the background:
- A new tenant (workspace) is created
- An owner user is created with their info
- A 14-day trial is started
- They're logged in automatically and dropped on the welcome page
- A welcome email goes out from a named human ("Tom from DriveCommand")
- A separate confirmation email goes out asking them to verify their email

The welcome page shows them a dashboard pre-populated with sample records. Each sample is clearly tagged "SAMPLE" and there's a banner at the top reminding them these are demo records. A 5-item checklist sits on the right:

```
[X] Create your account
[ ] Add your first truck
[ ] Add your first driver
[ ] Add your first client
[ ] Dispatch your first load
```

They start at 20% complete (item 1 auto-checked). The visible progress bar gives them a small psychological win and a clear path forward.

### Day 0, Minute 30 — If They Stalled

If 30 minutes pass and they haven't added a real truck yet, our system sends them a "Need help?" email. This email is from the same named human and offers a quick path back into the app.

### Day 0 to Day 1 — As They Add Things

Each time they add a real (non-sample) truck, driver, client, or load, the system:
- Bumps their activation percentage by 20%
- Fires off the next nudge if appropriate (e.g., "Great, you added a truck — now add a driver")
- Logs the event for our SysAdmin dashboard

The activation event — the moment we consider them truly "activated" — is when they dispatch a real load (the load transitions to "in transit" with a real driver and real truck assigned). When that happens:
- They see a celebration screen
- They receive a celebration email
- 3 days later they get a follow-up email about driver onboarding checklists, document collection, and other deeper features

### Day 11 — Trial Ending Soon

3 days before their trial ends, they receive a "Your trial is ending soon" email. The email links to billing setup (currently a placeholder until Stripe is wired).

### Day 14 — Trial Ends

If they haven't paid, their subscription flips to "Past Due" and they see a banner in the app prompting them to add billing. They can still log in and see their data — they just can't perform new actions until they pay or get an extension.

---

## 3. Sample Data — Why and What

**Why we use sample data:** Brand-new users staring at an empty dashboard get overwhelmed. Research shows blank dashboards drive 30-50% of users to abandon in their first week. By pre-populating sample records, the user immediately understands what the product is for and can edit existing entries instead of inventing data from scratch.

**What we never do:** We never fabricate revenue numbers, KPIs, or earnings on the dashboard. The dashboard for a brand-new tenant either shows real zeros or says "Add your first load to see revenue" until real data exists. Sample loads have realistic distances and dates but the numbers in summary panels exclude them.

**What's in the sample seed (varies by fleet size):**

| Fleet Size | Sample Records |
|---|---|
| 1-3 trucks (Owner Operator) | 1 truck (2022 Freightliner Cascadia), 1 driver ("John Sample"), 1 client ("ACME Logistics"), 1 completed load (Chicago to Indianapolis), 1 in-transit load (Indianapolis to Detroit) |
| 4-15 trucks (Small) | 3 trucks of varied makes, 3 drivers, 2 clients, 1 completed load, 2 in-transit loads |
| 16-50 trucks (Medium) | 3 trucks, 3 drivers, 2 clients, 1 completed load, 2 in-transit loads |
| 50+ trucks (Large) | Same as Medium — at this size they'll likely import their own data |

Every sample record has a yellow SAMPLE pill next to it in the UI. There's a one-click "Replace with real data" button. Once a real record exists, sample records are visually de-emphasized but not deleted automatically — the user can keep them or delete them at their own pace.

---

## 4. The Automation System

The system sends emails and shows in-app messages based on user behavior, not arbitrary timers. Each automation is a row in a database table called `AutomationRule` that we can edit from the SysAdmin portal at `/admin/automations`.

**The automations that ship at launch:**

| When | What happens |
|---|---|
| Tenant signs up | Welcome email + email confirmation |
| 30 min after signup with no real truck | "Need help getting started?" email |
| User adds a real truck but no driver yet | In-app nudge immediately + email 24h later if still no driver |
| User creates a real load but doesn't dispatch | In-app nudge immediately + email 24h later if not dispatched |
| 3 days before trial ends | "Your trial is ending soon" email |
| Real load goes in-transit (activation event) | In-app celebration + congratulations email + 3-day follow-up about driver onboarding |

**How to edit the copy of any automation:** Go to `/admin/automations`, click the rule, edit the email body or trigger conditions, save. Changes take effect immediately for new triggers. There is no code deployment needed for copy changes.

**How to add a brand-new automation:** Edit existing rules from SysAdmin, but adding entirely new automations (new event triggers, new action types) requires a developer for v1. The visual workflow builder is on the roadmap but not in v1.

**Important:** Automations are SYSTEM-scoped by default (apply to every tenant). We can also create per-tenant overrides if a specific customer needs different copy or timing — but that's a rare special case.

---

## 5. The SysAdmin Portal — How to Use It

### 5.1 Tenant List (`/admin/tenants`)

The main view for monitoring. Shows every tenant with these columns:

- Company name
- Owner email
- Plan
- Status (Trial / Active / Past Due / Suspended)
- Created date
- Days remaining in trial
- Activation % (the 5-item checklist completion)
- Health score (0-100)

You can filter and sort. The most useful filter combinations:

- **"Trial ending in 3 days, not activated"** → Customer success outreach list. These are the trials we are about to lose.
- **"Health score below 40"** → At-risk customers. Worth a check-in call.
- **"Past Due, less than 7 days"** → Failed-payment retention list.

### 5.2 Tenant Detail Page (`/admin/tenants/<id>`)

Click any tenant to see a full profile. Eight panels:

**Header**
Tenant name, status, plan, days since signup, owner contact info. Action buttons: "Extend Trial," "Resend Confirmation Email," "Suspend Tenant," "Impersonate" (logs you in as the owner for support).

**Activation Panel**
Shows the 5-item checklist with completion timestamps. Tells us where the tenant is stuck.

**Engagement Panel**
DAU/WAU sparkline for the last 30 days, sessions per active user, last login timestamp.

**Adoption Panel**
Which features they've used (with first-use timestamp), which features they have access to but haven't tried.

**Resource Panel**
Storage used vs. plan limit, seats used vs. plan limit, document count, load count.

**Health Score**
Composite 0-100 score with the 3 biggest contributing factors called out (e.g., "No login in 7 days: -25").

**Activity Timeline**
Last 50 significant events: signup, first truck added, payment, automation triggered, login, etc.

**Billing Panel**
Plan, MRR (monthly recurring revenue), trial end date, subscription status. Once Stripe is wired, this will show payment method and next renewal date.

### 5.3 Common Tasks

**Extending a trial:** Click "Extend Trial" on the tenant detail page, choose extension days (7, 14, 30, custom), confirm. The system sets `manualExtensionUntil` on the subscription. This is our #1 retention save tool.

**Granting a no-card trial (sales-assisted):** When Stripe is wired and we have a sales-assisted deal, click "Mark as Manual Trial." This bypasses card collection. Until Stripe is wired, all tenants are effectively manual trials.

**Extending a promo:** Go to `/admin/promos`, edit the promo, change `activeTo` date or `bonusTrialDays`. Or create a new promo for a campaign.

**Editing automation copy:** Go to `/admin/automations`, find the rule (e.g., "welcome_owner"), edit the email body, save. New emails use the new copy starting immediately.

**Investigating a churn risk:** Open the tenant detail page. Check the Activity Timeline for the last login. Check the Engagement Panel for usage trend. Check the Health Score for the contributing factors. If concerning, use "Impersonate" to log in as the owner and see exactly what they see.

**Adding a system admin:** This requires a developer for v1 (set `User.isSystemAdmin = true` in the database). Or use the `ADMIN_SECRET_KEY` shared password for the team.

---

## 6. The Health Score Formula

The health score starts at 100 and subtracts based on negative signals:

| Signal | Penalty |
|---|---|
| No login in last 7 days | -25 |
| No login in last 14 days | additional -25 |
| Trial expired and no payment method | -30 |
| Activation not reached and signup > 7 days ago | -20 |
| Less than 1 key action in last 7 days | -15 |
| Subscription Past Due | -40 |

Score is computed once per day at 02:30 UTC. The 3 biggest negative factors are shown on the tenant detail page so we know exactly why a tenant is at risk.

---

## 7. Trial and Promo Mechanics

**Default trial:** 14 days from the moment of signup. Set on the Plan record (`defaultTrialDays`), so if we change it on the Starter plan, all new Starter trials use the new value.

**Promos add bonus days:** A promo can add bonus trial days on top of the plan default. Example: "SPRING2026" with 16 bonus days = 30-day trial.

**How promos are applied:** Two ways. Either the user enters a code on the signup form, or the URL contains `?promo=SPRING2026` and the form auto-applies it.

**SysAdmin can override:** After signup, only SysAdmin can extend a trial. We do this through the "Extend Trial" button which sets `manualExtensionUntil`. The system uses the LATER of `trialEndsAt` and `manualExtensionUntil` when evaluating whether the trial is still active.

**Promos can have limits:** `maxRedemptions` on a promo caps how many tenants can use it. Useful for limited-time campaigns.

---

## 8. Email Deliverability

All onboarding emails go out via Gmail SMTP from a real human's name (e.g., "Tom from DriveCommand"). This matters: research shows emails from real names get ~26% higher open rates than `no-reply@` emails. Reply-to is routed to a real inbox we monitor.

**To change the sender name:** Edit the email template in the codebase (developer task). The from-address is set globally in our SMTP config.

**To check whether an email actually sent:** Look at `NotificationLog` in the database, or query the Activity Timeline for that tenant on the SysAdmin detail page. Every send is logged.

**If a tenant says they didn't get the welcome email:** First, check the timeline — did the system attempt to send? If yes, ask them to check spam. If no, there's a bug. If the email confirmation token expired, hit "Resend Confirmation Email" on the tenant detail page.

---

## 9. What's Coming Later (Not in v1)

These were intentionally deferred to keep v1 shippable:

- **Stripe billing integration:** Currently no card is collected at signup. The 14-day trial begins but there's no charge attempt at the end. When Stripe is wired, we'll switch to card-required for a 3x conversion lift.
- **Tenant subdomains:** Currently `app.drivecommand.io/t/<slug>`. Subdomains (`acme.drivecommand.io`) are a future feature — the database is already designed to support this with no migration.
- **Magic link / SSO login:** Email + password only for v1. Google and Microsoft SSO come in v1.1.
- **Visual automation builder:** Edit copy and conditions in SysAdmin, but adding new event triggers or action types requires a developer in v1. A drag-drop visual builder is on the roadmap.
- **Owner role decomposition:** Currently the Owner is also the billing admin and tenant admin. Splitting these into separate roles is a v1.2 feature.
- **A/B testing framework:** Test different welcome emails, checklist copy, etc. Coming in v1.1.

---

## 10. Operating Cadence

### Daily (or every other day)

- Open `/admin/tenants` filtered by "Trial ending in 3 days, not activated." Reach out personally to anyone in that list.
- Open the at-risk filter (Health Score below 40). Decide if any deserve outreach.
- Glance at the tenant count, trial-to-paid conversion rate, and weekly signups.

### Weekly

- Review automation performance: which emails are getting opens? Which nudges aren't working? Edit copy as needed.
- Pull the activation funnel: of N signups this week, how many added a real truck? How many activated? Where's the drop?
- Promo report: which promos drove signups, and how did those tenants compare on activation rate?

### Monthly

- Refresh the seasonal promos. Retire expired ones. Plan the next campaign.
- Review the sample data — is it still a good seed? Does it match what users are actually doing in week one?
- Pull cohort retention data. Of tenants who signed up 3 months ago, how many are still active?

---

## 11. Glossary

- **Tenant:** A workspace. Each customer company gets one tenant. All their data is isolated from every other tenant by Row-Level Security.
- **Owner:** The first user created when a tenant signs up. Has full admin rights for the tenant. There's exactly one owner per tenant in v1.
- **Activation:** The moment a tenant dispatches their first real (non-sample) load with a real driver and real truck. This is our north-star onboarding metric.
- **Health Score:** 0-100 composite score of how at-risk a tenant is for churning. Higher is healthier.
- **MRR:** Monthly Recurring Revenue. Sum of all active tenants' monthly subscription prices.
- **DAU / WAU:** Daily / Weekly Active Users for that tenant.
- **Sample data:** Pre-populated demo records each tenant gets at first login. Tagged `isSample = true` in the database.
- **Promo:** A code or URL parameter that grants bonus trial days or a discount.
- **SysAdmin:** Internal-only DriveCommand admin portal at `/admin`. Gated by a shared secret key for the team.
- **Two-phase provisioning:** Tenant + owner user are created at signup. Sample data is seeded on first login. This pattern lets the database commit fast and defers heavier work to when the user actually arrives.
- **Bypass RLS:** A safe pattern for cross-tenant operations (signup, sysadmin queries) that temporarily disables tenant filtering. Used only in narrowly-scoped transactions.

---

## 12. Who to Ask

- **Trial extensions, promo creation, automation copy edits:** You can do these yourself in SysAdmin.
- **Adding a new system admin or changing user roles:** Developer task — open a request.
- **A tenant says they're locked out / can't reset password:** Use SysAdmin "Resend Confirmation Email" or "Impersonate" to investigate. If you can't resolve, open a developer ticket.
- **A tenant wants billing setup before Stripe is wired:** Tell them billing setup is launching soon. We can extend their trial in the meantime.
- **Suspicious signups (bot, fake emails):** Suspend the tenant from SysAdmin. Note the IP / signup pattern. If we see waves of these, talk to a developer about tightening rate limits.

---

*End of Internal Operations Guide.*
