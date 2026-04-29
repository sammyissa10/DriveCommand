-- ============================================================
-- Migration: 20260429000002_seed_plans_and_automations
--
-- Purpose: Phase 47 Plan 02 — Seed Data
--   Inserts 3 subscription Plans (starter, pro, fleet) and
--   6 SYSTEM AutomationRules with correct triggerEvent values
--   and actionsJson payloads per spec section 7.4.
--
-- All INSERTs use ON CONFLICT ("key") DO NOTHING for idempotency.
-- NOTE: Do NOT wrap in BEGIN/COMMIT — migrate.mjs wraps each migration
--       in its own transaction.
-- ============================================================


-- ============================================================
-- SECTION 1: SEED PLANS
-- ============================================================

INSERT INTO "Plan" (
    "id", "key", "name", "description",
    "defaultTrialDays", "monthlyPriceCents",
    "maxTrucks", "maxUsers",
    "isActive", "sortOrder",
    "createdAt", "updatedAt"
)
VALUES
    (
        gen_random_uuid(),
        'starter',
        'Starter',
        'For owner-operators and small fleets',
        14, 4900,
        5, 5,
        TRUE, 1,
        NOW(), NOW()
    ),
    (
        gen_random_uuid(),
        'pro',
        'Pro',
        'For growing fleets',
        14, 9900,
        20, 20,
        TRUE, 2,
        NOW(), NOW()
    ),
    (
        gen_random_uuid(),
        'fleet',
        'Fleet',
        'For large fleets — unlimited trucks and users',
        14, 19900,
        NULL, NULL,
        TRUE, 3,
        NOW(), NOW()
    )
ON CONFLICT ("key") DO NOTHING;


-- ============================================================
-- SECTION 2: SEED SYSTEM AUTOMATION RULES
-- ============================================================

-- Rule 1: welcome_owner
-- Fires immediately on tenant.created — sends welcome email + confirm email
INSERT INTO "AutomationRule" (
    "id", "key", "name", "description",
    "triggerEvent", "conditionsJson", "actionsJson",
    "scope", "tenantId", "isActive", "runOncePerTenant",
    "createdAt", "updatedAt"
)
VALUES (
    gen_random_uuid(),
    'welcome_owner',
    'Welcome Owner',
    'Sends welcome email and email confirmation link immediately after signup',
    'tenant.created',
    '{}',
    '[
        {
            "type": "send_email",
            "template": "welcome_owner",
            "delaySeconds": 0,
            "to": "owner",
            "fromName": "Tom from DriveCommand"
        },
        {
            "type": "send_email",
            "template": "confirm_email",
            "delaySeconds": 0,
            "to": "owner",
            "fromName": "DriveCommand"
        }
    ]'::jsonb,
    'SYSTEM', NULL, TRUE, TRUE,
    NOW(), NOW()
)
ON CONFLICT ("key") DO NOTHING;

-- Rule 2: no_progress_nudge
-- Fires 30 minutes after tenant.created if no activation progress
INSERT INTO "AutomationRule" (
    "id", "key", "name", "description",
    "triggerEvent", "conditionsJson", "actionsJson",
    "scope", "tenantId", "isActive", "runOncePerTenant",
    "createdAt", "updatedAt"
)
VALUES (
    gen_random_uuid(),
    'no_progress_nudge',
    'No Progress Nudge',
    'Nudges owner 30 minutes after signup if they have not added a truck yet',
    'tenant.created',
    '{}',
    '[
        {
            "type": "send_email",
            "template": "no_progress_nudge",
            "delaySeconds": 1800,
            "to": "owner",
            "fromName": "Tom from DriveCommand"
        }
    ]'::jsonb,
    'SYSTEM', NULL, TRUE, TRUE,
    NOW(), NOW()
)
ON CONFLICT ("key") DO NOTHING;

-- Rule 3: add_driver_nudge
-- Fires after first real truck is created, if no real driver exists yet
INSERT INTO "AutomationRule" (
    "id", "key", "name", "description",
    "triggerEvent", "conditionsJson", "actionsJson",
    "scope", "tenantId", "isActive", "runOncePerTenant",
    "createdAt", "updatedAt"
)
VALUES (
    gen_random_uuid(),
    'add_driver_nudge',
    'Add Driver Nudge',
    'Reminds owner to add a driver after their first real truck is created',
    'truck.created.real',
    '{"activation.firstRealDriverAt": {"isNull": true}}',
    '[
        {
            "type": "in_app_message",
            "key": "add_driver_nudge",
            "delaySeconds": 0
        },
        {
            "type": "send_email",
            "template": "next_step_add_driver",
            "delaySeconds": 86400,
            "to": "owner",
            "fromName": "Tom from DriveCommand"
        }
    ]'::jsonb,
    'SYSTEM', NULL, TRUE, TRUE,
    NOW(), NOW()
)
ON CONFLICT ("key") DO NOTHING;

-- Rule 4: dispatch_load_nudge
-- Fires after first real load is created, if no load has gone in-transit yet
INSERT INTO "AutomationRule" (
    "id", "key", "name", "description",
    "triggerEvent", "conditionsJson", "actionsJson",
    "scope", "tenantId", "isActive", "runOncePerTenant",
    "createdAt", "updatedAt"
)
VALUES (
    gen_random_uuid(),
    'dispatch_load_nudge',
    'Dispatch Load Nudge',
    'Reminds owner to dispatch their first load after creating it',
    'load.created.real',
    '{"activation.firstLoadInTransitAt": {"isNull": true}}',
    '[
        {
            "type": "in_app_message",
            "key": "dispatch_load_nudge",
            "delaySeconds": 0
        },
        {
            "type": "send_email",
            "template": "next_step_dispatch_load",
            "delaySeconds": 86400,
            "to": "owner",
            "fromName": "Tom from DriveCommand"
        }
    ]'::jsonb,
    'SYSTEM', NULL, TRUE, TRUE,
    NOW(), NOW()
)
ON CONFLICT ("key") DO NOTHING;

-- Rule 5: trial_ending_soon
-- Daily cron trigger — fires when trial ends in 3-4 days
-- runOncePerTenant=FALSE because it fires daily (not just once per tenant)
INSERT INTO "AutomationRule" (
    "id", "key", "name", "description",
    "triggerEvent", "conditionsJson", "actionsJson",
    "scope", "tenantId", "isActive", "runOncePerTenant",
    "createdAt", "updatedAt"
)
VALUES (
    gen_random_uuid(),
    'trial_ending_soon',
    'Trial Ending Soon',
    'Warns owner when their trial expires in 3-4 days',
    'cron.daily',
    '{"subscription.trialEndsAt": {"between": {"daysFromNow": [3, 4]}}}',
    '[
        {
            "type": "send_email",
            "template": "trial_ending_soon",
            "delaySeconds": 0,
            "to": "owner",
            "fromName": "DriveCommand"
        }
    ]'::jsonb,
    'SYSTEM', NULL, TRUE, FALSE,
    NOW(), NOW()
)
ON CONFLICT ("key") DO NOTHING;

-- Rule 6: activation_celebration
-- Fires when tenant reaches activation (first load in-transit with real driver + real truck)
INSERT INTO "AutomationRule" (
    "id", "key", "name", "description",
    "triggerEvent", "conditionsJson", "actionsJson",
    "scope", "tenantId", "isActive", "runOncePerTenant",
    "createdAt", "updatedAt"
)
VALUES (
    gen_random_uuid(),
    'activation_celebration',
    'Activation Celebration',
    'Congratulates owner when they dispatch their first real load — the activation milestone',
    'tenant.activated',
    '{}',
    '[
        {
            "type": "in_app_message",
            "key": "activation_celebration",
            "delaySeconds": 0
        },
        {
            "type": "send_email",
            "template": "activation_celebration",
            "delaySeconds": 0,
            "to": "owner",
            "fromName": "Tom from DriveCommand"
        },
        {
            "type": "send_email",
            "template": "driver_onboarding_checklist_prompt",
            "delaySeconds": 259200,
            "to": "owner",
            "fromName": "Tom from DriveCommand"
        }
    ]'::jsonb,
    'SYSTEM', NULL, TRUE, TRUE,
    NOW(), NOW()
)
ON CONFLICT ("key") DO NOTHING;
