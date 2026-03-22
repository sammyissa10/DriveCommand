---
phase: quick-99
plan: 1
subsystem: admin-support
tags: [ai, support-tickets, claude-haiku, server-action]
dependency_graph:
  requires: [support-tickets server actions, @anthropic-ai/sdk]
  provides: [generateAiResolution server action, AI Suggest UI in admin ticket view]
  affects: [src/actions/support-tickets.ts, src/app/(admin)/admin-support/ticket-list.tsx]
tech_stack:
  added: []
  patterns: [inline Anthropic client instantiation, bypass_rls transaction for cross-tenant fetch]
key_files:
  modified:
    - src/actions/support-tickets.ts
    - src/app/(admin)/admin-support/ticket-list.tsx
decisions:
  - Claude Haiku (claude-haiku-4-5-20251001) selected for speed and cost efficiency in support ticket analysis
  - AI section inserted between Thread and Admin reply form for natural workflow order
  - Amber/blue color scheme differentiates AI diagnosis (amber) from draft reply (blue, matching admin reply style)
metrics:
  duration: 90s
  completed: 2026-03-22T19:48:44Z
  tasks_completed: 2
  files_modified: 2
---

# Quick-99: TKT-0045 AI Auto-Resolution Field on Support Tickets Summary

## One-liner

AI-powered ticket analysis using Claude Haiku — admins click "AI Suggest" to get a technical diagnosis and a ready-to-send draft reply populated into the reply box.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create generateAiResolution server action | 1cddfd4 | src/actions/support-tickets.ts |
| 2 | Add AI Suggest UI to expanded ticket view | 634d686 | src/app/(admin)/admin-support/ticket-list.tsx |

## What Was Built

**Task 1 — generateAiResolution server action**

Added `generateAiResolution(ticketId: string)` to `/src/actions/support-tickets.ts`:

- Auth-gated to admins via `requireAdminAccess()`
- Fetches full ticket + thread messages via bypass_rls transaction
- Checks `ANTHROPIC_API_KEY` env var before proceeding
- Calls `claude-haiku-4-5-20251001` with 1024 max tokens
- System prompt instructs Claude to act as a DriveCommand support specialist, return JSON with `{ diagnosis, draftReply }`
- Strips markdown fences from response before JSON parsing
- Returns `{ success: true, diagnosis, draftReply }` or `{ success: false, error }`
- Wrapped in try/catch with a user-friendly error fallback

**Task 2 — AI Suggest UI in expanded ticket view**

Modified `TicketRow` in `/src/app/(admin)/admin-support/ticket-list.tsx`:

- Added `Sparkles` icon from lucide-react and imported `generateAiResolution`
- Three new state vars: `aiDiagnosis`, `aiDraftReply`, `aiLoading`
- `handleAiSuggest`: calls server action, sets state or shows toast on error
- `handleUseReply`: copies `aiDraftReply` into `replyText` with success toast
- AI Suggestion section inserted between Thread and Admin reply form:
  - Amber box for diagnosis (technical analysis for the admin)
  - Blue box for draft reply with "Use this reply" button (right-aligned in box header)
  - Button label cycles: "AI Suggest" → spinner "Analyzing..." → "Re-analyze"

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `src/actions/support-tickets.ts` — verified contains `generateAiResolution`
- `src/app/(admin)/admin-support/ticket-list.tsx` — verified contains `AI Suggest`, `Sparkles`, `aiDiagnosis`, `Use this reply`
- Commits `1cddfd4` and `634d686` exist in git log
- `npx tsc --noEmit` passed with no errors
