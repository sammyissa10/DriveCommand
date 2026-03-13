---
id: quick-55
title: "TKT-0013: Fix 'a.split is not a function' error when adding a document with expiration date"
status: complete
date: 2026-03-13
---

## What Was Done

Fixed the "a.split is not a function or its return value is not iterable" error that occurred when uploading a truck document with an expiration date.

## Root Cause

`completeUpload` server action returned `{ success: true, document }` where `document.expiryDate` is a JavaScript `Date` object from Prisma. Next.js 16 / React 19's combined Server Action response serialization + `revalidatePath` RSC re-render failed when encountering the Date object, as the RSC parser attempted to call `.split()` on it.

## Change

`src/app/(owner)/actions/documents.ts` — `completeUpload` now returns `{ success: true }` instead of `{ success: true, document }`. The `document` return value was unused by the caller (client only checked for errors, then called `router.refresh()`).
