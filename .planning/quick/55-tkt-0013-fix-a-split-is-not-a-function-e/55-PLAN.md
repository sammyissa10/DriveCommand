---
id: quick-55
title: "TKT-0013: Fix 'a.split is not a function' error when adding a document with expiration date to a truck"
type: quick
status: complete
created: 2026-03-13
---

## Problem

When a user uploads a document to a truck page and includes an expiration date, the app throws:

> Error: a.split is not a function or its return value is not iterable

## Root Cause

`completeUpload` (server action) was returning `{ success: true, document }` where `document.expiryDate` is a JavaScript `Date` object from Prisma. When Next.js 16 / React 19 serializes the combined Server Action response + `revalidatePath`-triggered RSC re-render, the `Date` in the return value caused the serialization error ("a.split is not a function" — React's RSC parser calling `.split()` on a value expected to be a string).

The client never used `completeResult.document` — it only checked for errors, then called `router.refresh()`.

## Fix

In `src/app/(owner)/actions/documents.ts`, changed `completeUpload` to return `{ success: true }` instead of `{ success: true, document }`. This removes the `Date` object from the Server Action response, eliminating the serialization issue. The page re-renders correctly via `router.refresh()` + `revalidatePath`.

## Files Changed

- `src/app/(owner)/actions/documents.ts` — removed `document` from `completeUpload` return value
