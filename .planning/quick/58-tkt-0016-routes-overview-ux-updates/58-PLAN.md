---
id: quick-58
title: "TKT-0016: Routes Overview page UX updates — add Route Name column to routes list"
type: quick
status: in_progress
created: 2026-03-13
---

## Problem

The routes list page (/routes) does not show the Route Name. The ticket asks for Route Name, Status, and Main Driver to be visible — Status and Driver columns already exist; Route Name is missing.

## Root Cause

`listRoutes()` returns all route fields including `name`, but the `Route` interface in `route-list.tsx` and `route-list-wrapper.tsx` omits `name`, and no column is defined for it in the TanStack table.

## Fix

1. Add `name: string | null` to the `Route` interface in `route-list.tsx` and `route-list-wrapper.tsx`
2. Add a "Route Name" column as the first data column in the TanStack table (display "—" when null)

## Files Changed

- `src/components/routes/route-list.tsx` — add `name` to interface, add Route Name column
- `src/app/(owner)/routes/route-list-wrapper.tsx` — add `name` to interface
