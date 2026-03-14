---
id: quick-58
title: "TKT-0016: Routes Overview page UX updates — add Route Name column"
status: complete
date: 2026-03-13
---

## What Was Done

Added a "Route Name" column as the first column in the routes list table (/routes). Status and Driver columns were already present.

## Change

- `src/components/routes/route-list.tsx` — added `name: string | null` to `Route` interface; added `Route Name` column (first column, displays `—` when null)
- `src/app/(owner)/routes/route-list-wrapper.tsx` — added `name: string | null` to `Route` interface

No backend changes needed — `listRoutes()` already returns the `name` field from the database.
