# Documentation Improvement Guide

## Purpose

This guide establishes writing standards for DriveCommand help documentation. The goal is to create clear, accurate, and actionable end-user documentation that helps trucking company owners, dispatchers, and drivers understand and use DriveCommand features effectively.

**Why this exists:**
- Documentation must match actual UI and codebase behavior
- Users need task-oriented guidance, not technical explanations
- Consistency improves user experience and reduces support tickets
- Quality documentation enables user self-service

## Audience

DriveCommand help docs are written for:

**Primary audience:**
- Trucking company owners (fleet managers, logistics managers)
- Dispatchers (office staff who manage routes, loads, drivers)
- Drivers (professional truck drivers using the mobile app)

**Characteristics:**
- Not technical/software experts
- Familiar with trucking industry terminology (BOL, POD, HOS, IFTA, etc.)
- Value practical, step-by-step guidance over conceptual explanations
- Often accessing docs on mobile devices while working
- Need answers quickly (under 5 minutes)

**Secondary audience:**
- System administrators (internal DriveCommand staff)
- Support team members referencing docs during customer interactions

## Core Principles

### 1. User-task oriented
Focus on what users can **DO**, not what the feature **IS**.

**Good:** "Create a checklist to standardize pre-trip inspections"
**Bad:** "The checklist feature provides a workflow management system for standardizing procedures"

### 2. Scannable
Users skim docs looking for relevant information. Use:
- Short paragraphs (3-4 sentences max)
- Bullet points for lists
- Callouts for important tips/warnings
- Clear headings that describe the content below

### 3. Accurate
Every claim must match actual UI and codebase behavior.
- Button labels match exactly ("New Checklist" not "Add Checklist")
- Navigation paths match actual sidebar structure
- Feature capabilities reflect current implementation (no fictional features)
- Screenshots show current UI (if used)

### 4. Actionable
Provide step-by-step instructions users can follow immediately.
- Start with verbs ("Click...", "Navigate to...", "Enter...")
- Number sequential steps
- Include expected outcomes ("The checklist appears in your list")

## Writing Guidelines

### Voice and Tone

**Voice:**
- Second person ("You can create a checklist...")
- Active voice ("Click New Checklist" not "The New Checklist button can be clicked")
- Present tense ("The system creates..." not "The system will create...")

**Tone:**
- Professional but friendly
- Confident and direct
- Supportive (not condescending)

**Examples:**
- Good: "You can assign drivers to loads from the dashboard."
- Bad: "Users are able to leverage the assignment functionality to allocate driver resources to load entities."

### Vocabulary

**Use trucking industry terms users know:**
- BOL (Bill of Lading), POD (Proof of Delivery), PRO number
- HOS (Hours of Service), IFTA (International Fuel Tax Agreement)
- Dispatch, load, lane, dedicated freight, spot rate
- Carrier, shipper, broker, factoring

**Avoid jargon and technical terms:**
- Don't: "Entity relationships", "data models", "API endpoints"
- Don't: "Click the CTA in the hero section"
- Don't: Code variable names or internal terminology

**Use simple, clear words:**
- "Use" not "utilize" or "leverage"
- "Help" not "facilitate"
- "Show" not "surface" or "expose"

### Sentence Structure

**Keep sentences short:**
- Max 20 words per sentence
- One idea per sentence
- Break complex ideas into multiple sentences

**Good:** "Checklists automate dispatch procedures. Each checklist contains phases. Each phase contains steps."

**Bad:** "Checklists, which are used to automate dispatch procedures, contain phases that organize steps into logical groupings for improved workflow execution."

### Headers

**Make headers action-oriented:**
- Good: "Create a dispatch checklist"
- Good: "Assign a driver to a load"
- Bad: "Dispatch checklist creation"
- Bad: "Driver assignment functionality"

**Use sentence case, not title case:**
- Good: "How to use it"
- Bad: "How To Use It"

## Document Structure Template

Every help article should follow this structure:

### Frontmatter (required)

```yaml
---
slug: feature-name
title: Feature Display Name
summary: One-sentence description under 160 characters (appears in search results)
lastReviewed: "2026-05-10T00:00:00Z"
estimatedReadMinutes: 5
---
```

### Title (H1)
Match the title in frontmatter. Use sentence case.

### Callout intro
Start with a Callout component that summarizes the feature in 1-2 sentences.

```mdx
<Callout variant="info">
Checklists help you standardize operational procedures with repeatable workflows.
</Callout>
```

### "What this is" section
Explain the feature in 2-3 short paragraphs:
- What problem it solves
- How it works (high-level)
- Key use cases

### "How to use it" section
Use StepFlow component for multi-step procedures:

```mdx
<StepFlow>
  <StepFlow.Step title="Open Checklists">
    Navigate to **Workflows → Checklists & Workflows** in the sidebar.
  </StepFlow.Step>
  <StepFlow.Step title="Click New Checklist">
    The checklist builder opens.
  </StepFlow.Step>
</StepFlow>
```

### Additional sections (as needed)
- Feature comparisons (use ComparisonTable)
- Configuration details
- Examples and use cases
- Troubleshooting common issues

### "Good to know" section
Use Callout for tips, warnings, or important context:

```mdx
<Callout variant="tip" title="Pro Tip">
Create checklists for your top 5 dispatch procedures. This saves time during busy dispatch hours.
</Callout>
```

Variant types: `info`, `tip`, `warning`, `danger`

### "Related" section
Link to related features using FeatureCard:

```mdx
<FeatureCard slug="workflow-automation" />
<FeatureCard slug="playbook-builder" />
```

## Component Usage

### StepFlow
For multi-step procedures (creating, configuring, using features).

**When to use:**
- 3+ sequential steps
- Order matters
- Each step has an action and outcome

### ComparisonTable
For comparing options, plans, or feature types.

**When to use:**
- Showing differences between similar things
- Feature comparison (step types, plan tiers, etc.)

```mdx
<ComparisonTable
  headers={["Column 1", "Column 2", "Column 3"]}
  rows={[
    ["Row 1 data", "Row 1 data", "Row 1 data"],
    ["Row 2 data", "Row 2 data", "Row 2 data"]
  ]}
/>
```

### FeatureCard
For linking to related features.

**When to use:**
- Related articles section
- Cross-references within content

```mdx
<FeatureCard slug="feature-name" />
```

The slug must exist in the feature registry. Verify in `docs-content/_ia.json`.

### Callout
For important context, tips, warnings.

**When to use:**
- Pro tips and best practices (variant="tip")
- Important notes (variant="info")
- Warnings about destructive actions (variant="warning")
- Critical errors or limitations (variant="danger")

## Quality Checklist

Before publishing or updating a doc, verify:

- [ ] Title matches UI navigation label exactly
- [ ] Summary is under 160 characters
- [ ] All navigation paths match actual sidebar structure
- [ ] All button/menu labels match actual UI text
- [ ] All steps are tested and work as described
- [ ] All FeatureCard slugs exist in `_ia.json`
- [ ] No fictional features or capabilities described
- [ ] Screenshots (if any) show current UI
- [ ] Links work and point to correct destinations
- [ ] Estimated read time is accurate (1 min ≈ 200 words)
- [ ] lastReviewed date is current
- [ ] No typos or grammatical errors
- [ ] Voice is second person, active, present tense
- [ ] Sentences are under 20 words
- [ ] Headers are action-oriented
- [ ] Code examples (if any) are tested and work

## Anti-patterns to Avoid

### 1. Describing fictional features
**Bad:** Writing about "Dispatch Templates" when the feature doesn't exist.

**Fix:** Verify feature exists in codebase before documenting. Check Prisma schema, API routes, UI components.

### 2. Using internal code names
**Bad:** "The ChecklistTemplate entity with entityType DISPATCH"

**Good:** "Dispatch Checklists in the Workflows section"

### 3. Passive voice
**Bad:** "The checklist can be created by navigating to Workflows."

**Good:** "Navigate to Workflows to create a checklist."

### 4. Wall-of-text paragraphs
**Bad:** Single 200-word paragraph explaining a feature.

**Good:** 3-4 short paragraphs with bullet points and callouts.

### 5. Technical implementation details
**Bad:** "The system uses a cron job to query the database for overdue invoices and sends emails via SMTP."

**Good:** "DriveCommand automatically sends email reminders for overdue invoices."

### 6. Vague instructions
**Bad:** "Set up the checklist with appropriate steps."

**Good:** "Click Add Step. Enter a step name like 'Verify driver's license'. Select Photo Required from the type dropdown."

### 7. Outdated screenshots
**Bad:** Screenshot showing old UI with different button labels.

**Fix:** Update screenshot or remove it. Text instructions are better than outdated images.

### 8. Missing context
**Bad:** "Click Save" (doesn't say where the Save button is)

**Good:** "Click Save in the bottom right corner of the checklist builder."

### 9. Assumptions about user knowledge
**Bad:** "Use the usual workflow to configure auto-start rules."

**Good:** "Navigate to Workflows → Automation Rules. Click New Rule. Select 'On Load Dispatch' as the trigger."

### 10. Marketing language in docs
**Bad:** "Our revolutionary AI-powered checklist system transforms your dispatch operations!"

**Good:** "Checklists automate dispatch procedures with step-by-step verification."

## Revision Process

When updating existing docs:

1. **Verify accuracy:** Test all steps in the actual application
2. **Check for drift:** Compare doc claims to current UI/features
3. **Update examples:** Ensure examples reflect current best practices
4. **Refresh metadata:** Update lastReviewed date
5. **Test links:** Verify all FeatureCard slugs and external links work
6. **Review for clarity:** Read aloud to catch awkward phrasing
7. **Update changelog:** Note what changed in commit message

## Examples of Good vs Bad Docs

### Good Example: Task-oriented, scannable, accurate

```mdx
# Dispatch Checklists

<Callout variant="info">
Dispatch Checklists automate dispatch procedures with step-by-step verification.
</Callout>

## What this is

Pre-configured checklist workflows that trigger when loads are dispatched. Ensure drivers complete required steps before departing.

Use cases:
- Pre-departure safety checks
- Load verification (BOL, commodity, weight)
- Document confirmation (insurance, permits)

## How to use it

<StepFlow>
  <StepFlow.Step title="Navigate to Workflows">
    Click **Workflows → Checklists & Workflows** in the sidebar.
  </StepFlow.Step>
  <StepFlow.Step title="Create a new checklist">
    Click **New Checklist**. Select **DISPATCH** as the entity type.
  </StepFlow.Step>
  <StepFlow.Step title="Add steps">
    Click **Add Phase**, then **Add Step** for each verification point.
  </StepFlow.Step>
</StepFlow>
```

### Bad Example: Passive voice, vague, jargon-heavy

```mdx
# Dispatch Template System

The dispatch template system can be utilized to streamline operational workflows through the creation of reusable templates that encapsulate common dispatch configurations.

Templates are created by users who have appropriate permissions and can be leveraged across the organization to ensure consistency in dispatch operations. The template entity stores metadata about routes, rates, and commodity information which can be instantiated when new dispatch records are created.

To create a template, users should navigate to the appropriate section of the application where template management functionality is surfaced.
```

## Maintenance Schedule

- **Monthly:** Review most-visited docs for accuracy
- **Quarterly:** Audit all docs in a feature category (e.g., all Financial docs)
- **After feature updates:** Update affected docs within 1 week of deployment
- **After UI changes:** Update affected navigation paths and button labels immediately

## Getting Help

**Questions about what to document?**
- Check Prisma schema for data models
- Review API routes for available endpoints
- Inspect UI components for actual labels/behavior
- Ask development team to confirm feature scope

**Questions about how to document?**
- Review this guide
- Look at high-quality existing docs (checklists.mdx is a good example)
- Ask for documentation review before publishing

**Found inaccurate docs?**
- Create a quick task to fix it
- Note the inaccuracy in task description
- Update the doc and verify changes in live UI

---

**Version:** 1.0
**Last updated:** 2026-05-10
**Maintained by:** DriveCommand Documentation Team
