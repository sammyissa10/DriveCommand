---
phase: quick-351
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true
must_haves:
  truths:
    - "Audit report identifies which Resend template is sent for MANAGER invites via /settings/team-permissions"
    - "Audit report identifies which Resend template is sent for DRIVER invites via the Carrier Drivers screen"
    - "Audit report states whether both flows share a template file or use different templates"
    - "Audit report identifies the exact server action / API route the Invite Team Member form submits to, and the role value persisted on the invitation row"
    - "Audit report describes whether accept-invitation differentiates UX by role"
    - "Audit report lists invitation table columns related to role/permissions"
    - "Audit report identifies every driver-hardcoded string in the downstream flow (URL, button text, redirect, etc.) with exact file paths and line numbers"
    - "Audit report recommends fix strategy: (a) branch copy by role in one template, (b) split into two templates and route by role, or (c) something else — with rationale"
  artifacts:
    - path: ".planning/quick/351-audit-team-invitation-email-flow-to-scop/351-SUMMARY.md"
      provides: "Structured audit report with answers to all 7 questions"
      contains: "file paths, line numbers, quoted strings, fix recommendation"
  key_links:
    - from: "Invite Team Member form on /settings/team-permissions"
      to: "Resend email template file"
      via: "server action -> email sender -> template"
      pattern: "team-permissions.*invite|InviteTeamMember"
    - from: "Carrier Drivers invite flow"
      to: "Resend email template file"
      via: "server action -> email sender -> template"
      pattern: "carrier/drivers.*invite|InviteDriver"
---

<objective>
Produce a structured, read-only audit report of the DriveCommand team/driver invitation email pipeline so a subsequent fix can be made surgically without breaking the legitimate driver invite flow.

Purpose: The MANAGER invite from /settings/team-permissions currently sends driver-hardcoded copy ("Driver invitation", "...invited to join {tenant} as a driver..."). Before fixing, we must map every file involved — email templates, server actions, API routes, invitation schema, accept-invitation flow, and downstream copy — and recommend whether to branch copy inside one template or split into two templates.

Output: A SUMMARY.md report at `.planning/quick/351-audit-team-invitation-email-flow-to-scop/351-SUMMARY.md` that answers all 7 questions in the task brief with exact file paths, line numbers, quoted strings, and a fix recommendation.

Constraints: READ ONLY. No file edits, no migrations, no DB writes. If a file is too large to fully read, summarize the relevant section and quote the specific role/copy lines.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Map invitation pipeline endpoints, server actions, and schema</name>
  <files>READ ONLY — no files modified. Read targets:
    - apps/web/src/app/(carrier)/settings/team-permissions/ (page.tsx, components, server actions)
    - apps/web/src/app/(carrier)/carrier/drivers/ (page.tsx, invite components, server actions)
    - apps/web/src/actions/ (any invitation-related action files)
    - apps/web/src/app/api/ (any invitation-related routes — search for "invit")
    - apps/web/src/app/(auth)/accept-invitation/ or wherever the accept route lives
    - apps/web/prisma/schema.prisma (DriverInvitation, TeamInvitation, Invitation models)
  </files>
  <action>
    Trace the two invitation flows end-to-end. Use Grep extensively — do NOT modify any file.

    1. **Locate the Invite Team Member form** on /settings/team-permissions:
       - Grep for `team-permissions` and `InviteTeamMember` to find the page/component
       - Find the form submit handler — does it call a server action (use `'use server'` or `useFormState`) or POST to an /api/ route?
       - Quote the exact action/route path and the payload shape

    2. **Locate the Carrier Drivers invite form**:
       - Grep for `carrier/drivers` invite UI (likely an "Invite Driver" button or form)
       - Find its submit handler — server action or /api/ route?
       - Quote the exact action/route path and the payload shape

    3. **Identify the invitation persistence layer**:
       - Read prisma/schema.prisma — find ALL models matching /invitation/i (DriverInvitation, TeamInvitation, etc.)
       - For each model, list columns related to role: `role`, `isDriver`, `permissions`, `roleType`, JSON metadata, etc.
       - Quote the model definition with line numbers
       - Determine: does the team-permissions form write to the SAME table as the carrier/drivers invite, or a DIFFERENT table?

    4. **Identify the role value persisted** when MANAGER is invited:
       - Find the prisma.X.create() call inside the team-permissions server action
       - Quote the exact field assignment (role: 'MANAGER', isDriver: false, permissions: {...}, etc.)
       - Do the same for the driver invite path

    5. **Locate the accept-invitation route**:
       - Grep for `accept-invitation` to find the page/route
       - Read enough of it to determine: does it branch UX/copy by role, or is it a single shared flow?
       - Quote any role-dependent or driver-hardcoded strings (page title, button text, post-accept redirect target)

    Record findings in scratch notes — Task 2 will consume them.
  </action>
  <verify>
    Findings for items 1–5 are captured with exact file paths and line numbers. No files have been modified (run `git status` to confirm clean working tree).
  </verify>
  <done>
    The invitation pipeline is fully mapped: both submit endpoints identified, schema columns quoted, role-value persistence quoted for both flows, and the accept-invitation route's role-awareness (or lack thereof) is known.
  </done>
</task>

<task type="auto">
  <name>Task 2: Trace email templates and write the structured audit report</name>
  <files>READ ONLY — no files modified. Read targets:
    - apps/web/src/emails/ (all React Email templates)
    - apps/web/src/lib/email/ (Resend sender wrappers, render helpers)
    - apps/web/src/lib/resend* or apps/web/src/lib/mail*
    - The two server actions / API routes identified in Task 1
    WRITE target (this is the audit report, allowed):
    - .planning/quick/351-audit-team-invitation-email-flow-to-scop/351-SUMMARY.md
  </files>
  <action>
    1. **Trace the email send call from each invitation flow**:
       - From the team-permissions server action (Task 1 finding), follow the email send call — what helper does it call (e.g., `sendInvitationEmail`, `resend.emails.send`)?
       - Identify the React Email template component passed in (e.g., `<DriverInvitationEmail />`, `<TeamInvitationEmail />`)
       - Quote the subject line from the send call AND from the template file
       - Quote the relevant body copy lines from the template file (especially the "Driver invitation" / "...as a driver..." strings) with exact file paths and line numbers
       - Repeat for the carrier/drivers invite flow

    2. **Compare the two flows**:
       - Same template file? Same sender helper? Same subject?
       - If same template — note that copy is hardcoded and needs role-awareness
       - If different — note which one team-permissions is incorrectly using

    3. **Audit downstream copy for driver-hardcoding**:
       - Inside the email template(s): button text ("View My Loads", "Accept as Driver", etc.), URL path (does it always link to `/accept-invitation` or `/driver/accept`?)
       - In the accept-invitation page: title, body copy, post-accept redirect (does it always send to `/driver` regardless of role?)
       - Quote every driver-specific string with file path + line number

    4. **Write the report** to `.planning/quick/351-audit-team-invitation-email-flow-to-scop/351-SUMMARY.md` with this structure:

       ```markdown
       # 351 — Audit: Team Invitation Email Flow

       ## Q1. MANAGER invite (team-permissions) — Resend template
       - **Template file:** {path}:{line range}
       - **Subject:** "{exact subject}"
       - **Relevant copy:** "{quoted lines}" ({path}:{line})

       ## Q2. DRIVER invite (carrier/drivers) — Resend template
       - **Template file:** {path}:{line range}
       - **Subject:** "{exact subject}"
       - **Relevant copy:** "{quoted lines}" ({path}:{line})

       ## Q3. Same template or different?
       - {answer with reasoning}

       ## Q4. Submit endpoint + role value persisted (team-permissions)
       - **Action/route:** {path}:{line}
       - **Role field assignment:** `{quoted code}` ({path}:{line})
       - **Invitation table row shape for MANAGER:** {fields with values}

       ## Q5. Accept-invitation flow — role-aware?
       - **Route file:** {path}
       - **Differentiates by role?** {yes/no + quoted evidence}

       ## Q6. Invitation table schema — role-related columns
       - **Model:** {ModelName} ({path}:{line range})
       - **Columns:** role: {type}, isDriver: {type}, permissions: {type}, ... (quote each)

       ## Q7. Downstream driver-hardcoded copy inventory
       Every driver-specific string that may need to become role-aware:
       | File | Line | String | Used for |
       |------|------|--------|----------|
       | ... | ... | "..." | subject / body / button / redirect |

       ## Recommendation
       **Strategy:** (a) branch in one template by role | (b) split into two templates | (c) other
       **Rationale:** {3–5 sentences citing concrete evidence from above}
       **Surgical fix scope:** {bullet list of files that must change for the minimum viable fix}
       **Out-of-scope follow-ups:** {bullet list of nice-to-have role-awareness changes not strictly needed}
       ```

    5. **Self-check before finishing**:
       - All 7 questions answered with file paths AND line numbers (no hand-waving)
       - At least one direct quote of the offending "Driver invitation" / "...as a driver..." copy with its exact location
       - Recommendation cites specific evidence (e.g., "Both flows share `invitation-email.tsx` — branching by role inside the template is lower risk than splitting because…")
       - `git status` shows ONLY the new SUMMARY.md as a change (the PLAN.md was committed at plan time)
  </action>
  <verify>
    `cat .planning/quick/351-audit-team-invitation-email-flow-to-scop/351-SUMMARY.md` shows all 7 sections populated with file paths, line numbers, and quoted strings. `git status` confirms no source files were modified — only the SUMMARY.md is new.
  </verify>
  <done>
    SUMMARY.md exists at the target path. It answers Q1–Q7 with concrete file paths, line numbers, and quoted strings. The recommendation section explicitly chooses (a), (b), or (c) and explains why with evidence. No code files have been modified.
  </done>
</task>

</tasks>

<verification>
- [ ] `git status` shows only `.planning/quick/351-audit-team-invitation-email-flow-to-scop/351-SUMMARY.md` as a change (plus the PLAN.md that was committed at plan time)
- [ ] SUMMARY.md answers all 7 questions from the task brief
- [ ] Every claim in SUMMARY.md cites a file path and line number
- [ ] Fix recommendation is explicit (a/b/c) with rationale
- [ ] No `prisma migrate`, no `prisma db push`, no schema edits, no template edits
</verification>

<success_criteria>
A subsequent quick task can read 351-SUMMARY.md and immediately scope a surgical fix without re-reading the invitation pipeline. The report distinguishes "this string is driver-hardcoded and MUST change for MANAGER/OWNER invites" from "this string is shared and is fine as-is" with line-level precision.
</success_criteria>

<output>
After completion, the report itself IS the deliverable at `.planning/quick/351-audit-team-invitation-email-flow-to-scop/351-SUMMARY.md`. No additional summary file needed for this read-only quick task.
</output>
