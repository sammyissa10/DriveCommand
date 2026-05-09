---
phase: quick-258
plan: "01"
subsystem: auth-ui
tags: [auth, ux, password, toggle]
dependency_graph:
  requires: []
  provides: [password-visibility-toggle]
  affects: [sign-in, accept-invitation]
tech_stack:
  added: []
  patterns: [Eye/EyeOff lucide-react icons, relative wrapper + absolute button]
key_files:
  created: []
  modified:
    - apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
    - apps/web/src/app/(auth)/accept-invitation/page.tsx
decisions:
  - "tabIndex=-1 on toggle buttons to preserve natural tab order through password fields"
  - "type=button on toggle buttons to prevent accidental form submission"
  - "Independent showPassword / showConfirmPassword states on accept-invitation so toggling one field does not reveal the other"
metrics:
  duration: "5 minutes"
  completed: "2026-04-19"
  tasks_completed: 1
  files_modified: 2
---

# Quick-258: Add Show/Hide Password Toggle to Auth Pages Summary

## One-liner

Eye/EyeOff lucide-react toggle buttons added to all three auth password fields (sign-in + accept-invitation password + confirm-password), with type=button and tabIndex=-1 to avoid form interference.

## Tasks Completed

| # | Task | Commit |
|---|------|--------|
| 1 | Add password toggle to sign-in and accept-invitation pages | 9e653f2 |

## What Was Built

- **Sign-in page** — password field wrapped in `<div className="relative">`, input gets `pr-10`, Eye/EyeOff button positioned `absolute right-3 top-1/2 -translate-y-1/2`
- **Accept-invitation page** — same pattern applied independently to both the `password` and `confirmPassword` fields using separate `showPassword` and `showConfirmPassword` states

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx` — modified, contains `showPassword`
- [x] `apps/web/src/app/(auth)/accept-invitation/page.tsx` — modified, contains `showPassword` and `showConfirmPassword`
- [x] Commit 9e653f2 exists
- [x] TypeScript (web app) passes — only pre-existing e2e test errors unrelated to these files
