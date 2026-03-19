---
phase: quick-82
plan: "01"
subsystem: invoices
tags: [invoices, line-items, ux, auto-fill]
dependency_graph:
  requires: []
  provides: [predefined-invoice-line-items, unit-price-auto-fill]
  affects: [invoice-form, invoice-items-editor]
tech_stack:
  added: []
  patterns: [combo-input, dropdown-with-free-text, auto-fill-on-select]
key_files:
  modified:
    - src/components/invoices/invoice-items-editor.tsx
decisions:
  - "Used mousedown (not click) on dropdown options to prevent input blur firing before selection"
  - "Auto-fill only triggers when unitPrice is empty or '0' — never overwrites a user-set price"
  - "Dropdown filters live as user types; auto-opens on focus when field is blank"
metrics:
  duration: "~5 minutes"
  completed: "2026-03-19"
---

# Quick-82: TKT-0032 — Invoice Line Items Predefined Dropdown + Unit Price Auto-Fill Summary

**One-liner:** Replaced the plain description input with a combo dropdown offering 10 predefined trucking line items (Detention $75, Layover $250, etc.) that auto-fill unit price when selected and the price field is empty.

## What Was Built

A `DescriptionCombo` component replaces the bare `<input type="text">` in each invoice line item row. It combines free-text entry with a floating dropdown of predefined trucking/freight charges.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add predefined line item descriptions with unit price auto-fill | 38c29ba | src/components/invoices/invoice-items-editor.tsx |

## Predefined Items

| Label | Default Price |
|---|---|
| Freight Charges | (none — varies) |
| Fuel Surcharge | (none — varies) |
| Detention | $75.00 |
| Layover | $250.00 |
| Lumper Fee | (none — varies) |
| TONU (Truck Ordered Not Used) | $250.00 |
| Accessorial Charges | (none — varies) |
| Stop-Off Charge | $50.00 |
| Deadhead Miles | (none — varies) |
| Hazmat Fee | $150.00 |

## Behavior

- Description field shows a ChevronDown toggle button
- Clicking the chevron or focusing an empty field opens the dropdown
- Typing filters predefined options live (case-insensitive)
- Selecting an item: sets description; if item has a defaultPrice AND unitPrice is empty or "0", auto-fills unit price
- Existing non-zero unit prices are never overwritten
- "Custom entry" option in dropdown dismisses it for free typing
- Outside click closes dropdown
- Serialization to `itemsJson` hidden input unchanged — no regressions to form submission

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `src/components/invoices/invoice-items-editor.tsx` modified
- [x] Commit 38c29ba exists
- [x] `npx tsc --noEmit` passes with zero errors
