---
phase: quick-435
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/onboarding/welcome/checklist.tsx
autonomous: true

must_haves:
  truths:
    - "Owner sees 'Send your first load in transit' as the 5th activation checklist item (not 'Dispatch your first load')"
    - "The item shows subtext 'Assign a load to a trip and mark it In Transit.'"
    - "Checklist completion logic still keys off firstLoadInTransitAt (unchanged)"
  artifacts:
    - path: "apps/web/src/app/onboarding/welcome/checklist.tsx"
      provides: "Updated activation checklist label + optional description support"
      contains: "Send your first load in transit"
  key_links:
    - from: "apps/web/src/app/onboarding/welcome/checklist.tsx"
      to: "firstLoadInTransitAt prop"
      via: "complete: firstLoadInTransitAt !== null (UNCHANGED)"
      pattern: "firstLoadInTransitAt !== null"
---

<objective>
Rename the 5th onboarding activation checklist item from "Dispatch your first load" to "Send your first load in transit" so the label matches its actual trigger (a load reaching In Transit status). Add a clarifying subtext line: "Assign a load to a trip and mark it In Transit."

Purpose: The current label "Dispatch your first load" is misleading — it implies the step completes when a load is dispatched, but the trigger is `firstLoadInTransitAt` (load marked In Transit). This copy mismatch confuses onboarding users.
Output: Updated `checklist.tsx` with corrected label + subtext. Copy change only — no trigger, schema, field, or step-key changes.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/onboarding/welcome/checklist.tsx

# Grep results (verified during planning):
# The exact string "Dispatch your first load" appears in ONE application file only:
#   apps/web/src/app/onboarding/welcome/checklist.tsx (line 46)
# Other matches are planning/spec docs (.planning/, docs/specs/) — NOT user-facing code, leave untouched.
# The reminder ribbon (OnboardingReminderRibbon.tsx) and owner-shell banner (owner-shell.tsx)
# reference onboarding generically but do NOT contain this label string.
#
# Current ChecklistItem interface (lines 15-19) has: label, complete, href.
# It does NOT have a description/subtext field — add one as OPTIONAL to support the subtext.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update checklist label and add subtext support</name>
  <files>apps/web/src/app/onboarding/welcome/checklist.tsx</files>
  <action>
    Make a copy-only change to the activation checklist:

    1. In the `ChecklistItem` interface (around lines 15-19), add an optional field:
       `description?: string;`
       Keep `label`, `complete`, `href` exactly as-is.

    2. In the `items` array (line 46), change the 5th item:
       FROM: `{ label: 'Dispatch your first load', complete: firstLoadInTransitAt !== null, href: '/carrier/dispatches' },`
       TO:   `{ label: 'Send your first load in transit', description: 'Assign a load to a trip and mark it In Transit.', complete: firstLoadInTransitAt !== null, href: '/carrier/dispatches' },`
       CRITICAL: Do NOT change `complete: firstLoadInTransitAt !== null` or the `href`. Trigger logic stays identical.

    3. In the render `rowContent` block (around lines 65-82), render the optional description below the label span when present.
       Wrap the existing label `<span>` and a new description in a small flex-col so the subtext sits under the label.
       Replace the single label span with:
       ```tsx
       <span className="flex flex-col">
         <span
           className={
             item.complete
               ? 'text-sm line-through text-muted-foreground'
               : 'text-sm text-foreground'
           }
         >
           {item.label}
         </span>
         {item.description && !item.complete && (
           <span className="text-xs text-muted-foreground">{item.description}</span>
         )}
       </span>
       ```
       Preserve all existing Tailwind/shadcn classes elsewhere (icons, hover states, ChevronRight, line-through-on-complete). Only the label markup gains an optional sibling subtext line.

    DO NOT touch: field names, step keys, the `firstLoadInTransitAt` prop, the schema, activation-tracker logic, or any other checklist item labels.
    DO NOT modify any .planning/ or docs/specs/ files — those are documentation only.
  </action>
  <verify>
    Run from repo root:
    `cd apps/web; npx tsc --noEmit` — no NEW type errors in checklist.tsx (baseline has ~35 pre-existing unrelated errors; only flag regressions in the touched file).
    Grep confirms the new string exists and the old label is gone from this file:
    `Send your first load in transit` present, `Dispatch your first load` absent in checklist.tsx.
  </verify>
  <done>
    checklist.tsx 5th item reads "Send your first load in transit" with subtext "Assign a load to a trip and mark it In Transit.", the `complete: firstLoadInTransitAt !== null` trigger and `/carrier/dispatches` href are unchanged, existing styling preserved, and tsc shows no new errors in the file.
  </done>
</task>

</tasks>

<verification>
- `apps/web/src/app/onboarding/welcome/checklist.tsx` no longer contains "Dispatch your first load"
- It now contains "Send your first load in transit" and "Assign a load to a trip and mark it In Transit."
- `complete: firstLoadInTransitAt !== null` and `href: '/carrier/dispatches'` are byte-for-byte unchanged
- `npx tsc --noEmit` in apps/web introduces no new errors in the touched file
- No other application files were modified; planning/spec docs left untouched
</verification>

<success_criteria>
The onboarding activation checklist's 5th step label matches its trigger semantics ("Send your first load in transit"), includes the clarifying subtext, and all trigger/schema/field logic remains identical. Pure copy + minimal optional-subtext markup change.
</success_criteria>

<output>
After completion, create `.planning/quick/435-fix-dispatch-your-first-load-onboarding-/435-SUMMARY.md`
</output>
