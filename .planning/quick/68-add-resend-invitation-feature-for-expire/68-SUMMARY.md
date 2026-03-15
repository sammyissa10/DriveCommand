---
phase: quick-68
plan: "01"
subsystem: admin-portal
tags: [invitation, resend, tenant-management, sysadmin]
dependency_graph:
  requires: []
  provides: [resend-owner-invitation-action, expired-invitation-display]
  affects: [tenant-detail-page, owner-invitation-flow]
tech_stack:
  added: []
  patterns: [server-action, client-component, useTransition, optimistic-ui]
key_files:
  created:
    - src/app/(admin)/tenants/[id]/resend-invitation-button.tsx
  modified:
    - src/app/(admin)/actions/tenants.ts
    - src/app/(admin)/tenants/[id]/page.tsx
decisions:
  - "Reuse existing invitation record (update in-place) rather than creating a new one, preserving the accept URL"
  - "Show resend button on pending invitations too, not just expired"
  - "Email failure is non-blocking — invitation is reset to PENDING and emailWarning returned"
metrics:
  duration: 116s
  completed: "2026-03-15"
  tasks: 2
  files_affected: 3
---

# Quick Task 68: Add Resend Invitation Feature for Expired Owner Invitations — Summary

**One-liner:** Expired owner invitation visibility with red badge and one-click resend on sysadmin tenant detail page, updating invitation to PENDING with new 7-day expiry and re-sending invitation email.

## What Was Built

The sysadmin tenant detail page now handles expired owner invitations as a distinct state. Previously, expired invitations were invisible — the page showed "No owner configured" even when an expired invitation existed. Now:

- `getTenantById` fetches both PENDING and EXPIRED owner invitations and returns them as separate fields (`pendingOwnerInvitation`, `expiredOwnerInvitation`).
- A new `resendOwnerInvitation` server action resets any PENDING or EXPIRED invitation to PENDING with a fresh 7-day expiry and re-sends the owner invitation email.
- A new `ResendInvitationButton` client component shows idle/sending/success/error states with auto-reset after success.
- The tenant detail page owner section now has four branches: active owner, pending invitation (+ resend button), expired invitation (red badge + resend button), or no owner configured.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update getTenantById and add resendOwnerInvitation action | 292eacb | src/app/(admin)/actions/tenants.ts |
| 2 | Create ResendInvitationButton and update tenant detail page | 63037b6 | resend-invitation-button.tsx, page.tsx |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: src/app/(admin)/tenants/[id]/resend-invitation-button.tsx
- FOUND: src/app/(admin)/actions/tenants.ts
- FOUND: src/app/(admin)/tenants/[id]/page.tsx
- FOUND commit: 292eacb (Task 1)
- FOUND commit: 63037b6 (Task 2)
