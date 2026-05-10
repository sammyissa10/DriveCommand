---
phase: quick-296
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/help/layout.tsx
  - apps/web/src/components/help/HelpSidebar.tsx
  - docs-content/_ia.json
  - apps/web/src/app/(owner)/help/page.tsx
autonomous: true

must_haves:
  truths:
    - "Help center displays single navigation (not dual sidebars)"
    - "Help navigation is organized by daily operations, not technical features"
    - "Getting Started section exists with onboarding content"
  artifacts:
    - path: "apps/web/src/app/(owner)/help/layout.tsx"
      provides: "Fixed layout without nested SidebarProvider"
    - path: "docs-content/_ia.json"
      provides: "Restructured hub organization"
  key_links:
    - from: "apps/web/src/app/(owner)/help/layout.tsx"
      to: "components/help/HelpSidebar.tsx"
      via: "HelpSidebar import"
---

<objective>
Fix the client help center navigation cutoff issue and restructure for non-technical users.

Purpose: The help center currently renders dual sidebars (OwnerShell's AppSidebar + Help's own HelpSidebar) causing cramped, confusing navigation. Users see help content but the experience is broken.

Output: Single clean navigation, operation-focused content structure, working onboarding flow.
</objective>

<execution_context>
@/Users/ayazmohammed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ayazmohammed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(owner)/help/layout.tsx
@apps/web/src/components/help/HelpSidebar.tsx
@apps/web/src/components/navigation/owner-shell.tsx
@docs-content/_ia.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix dual sidebar navigation</name>
  <files>
    apps/web/src/app/(owner)/help/layout.tsx
    apps/web/src/components/help/HelpSidebar.tsx
  </files>
  <action>
The root cause: help/layout.tsx wraps children in its own `SidebarProvider` + `HelpSidebar`, but it's ALREADY inside OwnerShell which has `SidebarProvider` + `AppSidebar`. This creates nested sidebar providers and dual sidebars.

**Fix approach - Full-width help layout:**

1. In `apps/web/src/app/(owner)/help/layout.tsx`:
   - REMOVE the outer `SidebarProvider` wrapper entirely
   - REMOVE the `SidebarInset` wrapper
   - Keep the header with search and mobile trigger
   - Render HelpSidebar as a LEFT sidebar within the main content area using standard flex layout (NOT shadcn Sidebar components)
   - Structure: `<div className="flex min-h-screen">` containing sidebar div + content div

2. In `apps/web/src/components/help/HelpSidebar.tsx`:
   - Convert `HelpSidebar` from using shadcn `Sidebar` component to a simple fixed-width `<aside>` with scroll
   - Remove dependency on `useSidebar` hook and `SidebarProvider` context
   - Keep the collapsible hub/feature navigation structure
   - Style: `w-64 border-r bg-card shrink-0 hidden lg:block` for desktop, Sheet for mobile
   - Keep `HelpSidebarMobile` as-is (Sheet-based) but update to not rely on SidebarProvider context

The key insight: The help center should opt OUT of the OwnerShell sidebar system entirely and render its own in-content navigation. This means the AppSidebar will NOT show when viewing help - which is actually desirable UX (full focus on help content).

**Alternative if needed:** If removing from OwnerShell's SidebarInset flow is problematic, consider using a right-side Sheet instead, but the full-width approach is cleaner.
  </action>
  <verify>
    - Visit `/help` in browser - single sidebar (help nav) visible, NOT dual sidebars
    - AppSidebar should be collapsed/hidden when in help section
    - Mobile: hamburger menu opens help navigation sheet, not app navigation
    - Help hub collapsibles still expand/collapse correctly
    - Links navigate to `/help/[slug]` correctly
  </verify>
  <done>Help center renders with single navigation sidebar. No cramped dual-sidebar layout.</done>
</task>

<task type="auto">
  <name>Task 2: Restructure hubs for operations-first organization</name>
  <files>
    docs-content/_ia.json
    apps/web/src/app/(owner)/help/page.tsx
  </files>
  <action>
Restructure `_ia.json` clientHubs to be organized around daily operations, not technical feature groups. Non-technical users think in terms of "What do I need to do?" not "What system is this?"

**New hub structure (replace existing clientHubs):**

```json
"clientHubs": [
  {
    "id": "getting-started",
    "name": "Getting Started",
    "description": "Set up your account and learn the basics",
    "icon": "Rocket",
    "features": ["help-center"]
  },
  {
    "id": "daily-dispatch",
    "name": "Dispatch & Loads",
    "description": "Create routes, assign loads, track deliveries",
    "icon": "Truck",
    "features": [
      "carrier-dashboard",
      "carrier-dispatches",
      "carrier-loads",
      "loads",
      "routes",
      "carrier-stops",
      "carrier-templates"
    ]
  },
  {
    "id": "drivers-trucks",
    "name": "Drivers & Trucks",
    "description": "Manage your fleet and team",
    "icon": "Users",
    "features": [
      "trucks",
      "drivers",
      "carrier-fleet-trucks",
      "carrier-fleet-drivers",
      "carrier-facilities"
    ]
  },
  {
    "id": "money-matters",
    "name": "Billing & Payroll",
    "description": "Invoices, driver pay, and expenses",
    "icon": "DollarSign",
    "features": [
      "invoices",
      "payroll",
      "fuel-dashboard",
      "expense-categories",
      "expense-templates",
      "carrier-reports-revenue",
      "carrier-reports-driver-pay",
      "carrier-reports-aging"
    ]
  },
  {
    "id": "stay-compliant",
    "name": "Compliance & Safety",
    "description": "Documents, HOS, inspections, and IFTA",
    "icon": "Shield",
    "features": [
      "compliance-dashboard",
      "driver-hours",
      "driver-documents",
      "driver-incidents",
      "ifta-reporting",
      "safety-analytics"
    ]
  },
  {
    "id": "automation",
    "name": "Checklists & Automation",
    "description": "Automate routine tasks and inspections",
    "icon": "ListChecks",
    "features": [
      "checklists",
      "playbook-builder",
      "workflow-automation",
      "workflow-analytics",
      "driver-tasks"
    ]
  },
  {
    "id": "smart-tools",
    "name": "Maps & Analytics",
    "description": "Track fleet, analyze profitability, AI tools",
    "icon": "Brain",
    "features": [
      "live-map",
      "lane-analytics",
      "profit-predictor",
      "ai-document-reader",
      "carrier-reports-performance"
    ]
  },
  {
    "id": "communication",
    "name": "Communication",
    "description": "Message drivers and share tracking links",
    "icon": "MessageSquare",
    "features": [
      "carrier-messages",
      "driver-messages",
      "shipment-tracking"
    ]
  },
  {
    "id": "settings",
    "name": "Settings & Setup",
    "description": "Team permissions, integrations, and preferences",
    "icon": "Settings",
    "features": [
      "team-permissions",
      "subscription",
      "integrations",
      "tags",
      "crm",
      "carrier-clients",
      "carrier-contracts"
    ]
  },
  {
    "id": "support",
    "name": "Get Help",
    "description": "Contact support and troubleshoot issues",
    "icon": "LifeBuoy",
    "features": ["support-tickets"]
  }
]
```

Key changes:
- "Getting Started" now first with actual content (currently empty features array - add help-center as placeholder)
- Renamed hubs to action-oriented language ("Dispatch & Loads" not "Dispatch Operations")
- "Money Matters" / "Billing & Payroll" instead of "Finance & Billing"
- "Stay Compliant" instead of just "Compliance & Safety"
- Combined driver portal features with owner features (users want to see full picture)
- Reduced from 10 hubs to 10 hubs but better organized (fewer clicks to find things)

**Update help homepage:**

In `apps/web/src/app/(owner)/help/page.tsx`:
- Add a prominent "Getting Started" section at the top if it doesn't exist
- Consider adding a "Quick Links" section with most common tasks:
  - "Create your first load"
  - "Add a truck"
  - "Invite a driver"
  - "Generate an invoice"
  </action>
  <verify>
    - Hub names in sidebar reflect new operation-focused naming
    - "Getting Started" appears first in navigation
    - Features still resolve correctly (no broken links)
    - Help homepage shows getting started or quick links section
  </verify>
  <done>Hub structure reorganized for non-technical users. Getting Started prominent. Action-oriented naming throughout.</done>
</task>

<task type="auto">
  <name>Task 3: Add Getting Started guide content</name>
  <files>
    docs-content/client/getting-started.mdx
    docs-content/_features.json
  </files>
  <action>
Create a comprehensive Getting Started guide that walks new users through initial setup.

**Create `docs-content/client/getting-started.mdx`:**

```mdx
---
slug: getting-started
title: Getting Started with DriveCommand
summary: Set up your trucking operation in DriveCommand - add trucks, invite drivers, create your first load, and start dispatching.
lastReviewed: "2026-05-09T00:00:00Z"
estimatedReadMinutes: 10
---

# Getting Started with DriveCommand

Welcome to DriveCommand! This guide walks you through setting up your trucking operation from scratch.

<Callout variant="tip" title="First Time Here?">
Complete these steps in order. Each one builds on the previous. You'll be dispatching loads in under 30 minutes.
</Callout>

## Step 1: Add Your Trucks

Before you can dispatch, DriveCommand needs to know about your fleet.

<StepFlow>
  <StepFlow.Step title="Go to Trucks">
    Click **Trucks** in the sidebar (under Drivers & Trucks).
  </StepFlow.Step>
  <StepFlow.Step title="Click New Truck">
    The truck form opens.
  </StepFlow.Step>
  <StepFlow.Step title="Enter truck details">
    - **Unit number** — your internal identifier (e.g., "T-101")
    - **Make and model** — "Freightliner Cascadia", "Kenworth T680", etc.
    - **VIN** — for compliance tracking
    - **License plate** and **state**
  </StepFlow.Step>
  <StepFlow.Step title="Save">
    Your truck appears in the fleet list with "Ready to Use" status.
  </StepFlow.Step>
</StepFlow>

<FeatureCard slug="trucks" />

## Step 2: Invite Your Drivers

Drivers use the DriveCommand mobile app to receive loads, update statuses, and log hours.

<StepFlow>
  <StepFlow.Step title="Go to Drivers">
    Click **Drivers** in the sidebar.
  </StepFlow.Step>
  <StepFlow.Step title="Click Invite Driver">
    Enter the driver's email address.
  </StepFlow.Step>
  <StepFlow.Step title="Set permissions">
    Choose what the driver can access (loads, documents, messages).
  </StepFlow.Step>
  <StepFlow.Step title="Send invitation">
    The driver receives an email with setup instructions.
  </StepFlow.Step>
</StepFlow>

<Callout variant="info">
Drivers download the DriveCommand app from the App Store or Google Play. They sign in with the email you invited.
</Callout>

<FeatureCard slug="drivers" />

## Step 3: Add Your First Customer

Customers are the shippers or brokers who give you loads.

<StepFlow>
  <StepFlow.Step title="Go to CRM">
    Click **CRM** in the sidebar (under Settings & Setup).
  </StepFlow.Step>
  <StepFlow.Step title="Click New Customer">
    Enter customer details: company name, contact person, phone, email.
  </StepFlow.Step>
  <StepFlow.Step title="Save">
    The customer is now available when creating loads.
  </StepFlow.Step>
</StepFlow>

<FeatureCard slug="crm" />

## Step 4: Create Your First Load

Now you're ready to dispatch!

<StepFlow>
  <StepFlow.Step title="Go to Loads">
    Click **Loads** in the sidebar.
  </StepFlow.Step>
  <StepFlow.Step title="Click New Load">
    The load creation form opens.
  </StepFlow.Step>
  <StepFlow.Step title="Select customer">
    Choose the customer you just added.
  </StepFlow.Step>
  <StepFlow.Step title="Enter pickup">
    Address, contact name, phone, date/time.
  </StepFlow.Step>
  <StepFlow.Step title="Enter delivery">
    Destination address, contact, date/time.
  </StepFlow.Step>
  <StepFlow.Step title="Add rate">
    Enter what you're charging for this load.
  </StepFlow.Step>
  <StepFlow.Step title="Assign driver and truck">
    Select who's hauling it and which truck.
  </StepFlow.Step>
  <StepFlow.Step title="Save">
    The driver sees the load in their app immediately.
  </StepFlow.Step>
</StepFlow>

<FeatureCard slug="loads" />

## Step 5: Track and Invoice

Once the driver marks the load delivered:

1. **Generate invoice** — Go to Invoices, select the delivered load, create invoice
2. **Send to customer** — Email or download PDF
3. **Track payment** — Mark as paid when funds arrive

<FeatureCard slug="invoices" />

## What's Next?

You've completed the basics! Explore these features to get more from DriveCommand:

- **[Compliance Dashboard](/help/compliance-dashboard)** — Track document expirations
- **[Live Map](/help/live-map)** — See your fleet in real-time
- **[Checklists](/help/checklists)** — Automate pre-trip inspections
- **[Profit Predictor](/help/profit-predictor)** — Analyze lane profitability before accepting loads

## Need Help?

Click the **?** button in the bottom-right corner of any page to contact support.
```

**Update `docs-content/_features.json`:**

Add entry for getting-started:
```json
{
  "slug": "getting-started",
  "name": "Getting Started",
  "portal": "owner",
  "requiresClientDoc": true,
  "requiresSysadminDoc": false
}
```

**Update `_ia.json` Getting Started hub:**
Change features array from `[]` to `["getting-started"]`
  </action>
  <verify>
    - Visit `/help/getting-started` - page renders with full content
    - StepFlow components render correctly (numbered steps)
    - FeatureCard links work
    - Getting Started appears in sidebar under first hub
    - No MDX parsing errors in console
  </verify>
  <done>Getting Started guide exists with end-to-end onboarding flow. New users have clear path from setup to first invoice.</done>
</task>

</tasks>

<verification>
1. Navigate to `/help` - single sidebar, no cramped dual navigation
2. Hub names are operation-focused and user-friendly
3. Getting Started is the first section with actual content
4. All existing help pages still accessible via `/help/[slug]`
5. Mobile hamburger opens help nav, not app nav
6. No console errors or broken links
</verification>

<success_criteria>
- Dual sidebar issue resolved - clean single navigation
- Hubs reorganized with action-oriented naming
- Getting Started guide provides complete onboarding flow
- Existing content remains accessible
- Mobile navigation works correctly
</success_criteria>

<output>
After completion, create `.planning/quick/296-redesign-client-help-center-fix-nav-cuto/296-SUMMARY.md`
</output>
