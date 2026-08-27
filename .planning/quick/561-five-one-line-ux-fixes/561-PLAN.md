# quick-561 — Five one-line UX fixes from the quick-560 survey

**Date:** 2026-08-27 · **Branch:** feature/document-import · **Pre-task commit:** `74350e09`

Acts on the "could ship today" half of quick-560. The four structural items are
explicitly out of scope.

## Tasks
1. `/help` — move `<HelpGuides />` above `<HelpCategoryGrid />`.
2. Walkaround "Change to fail" — secondary weight. Report the class.
3. Assign screen — `disabled` on blocked rows. Refusal logic untouched.
4. Driver trip card — show where the day ends from the stops already on the
   client. Report the copy.
5. Notification list — unread first. Do NOT lower the cap.

## Out of scope, restated so it cannot drift
The five copies of `flex min-h-dvh flex-col justify-between px-5 py-8`;
`SearchableSelect` on the assign screen; the FAB; the carousel peek; the duty
block; the notification cap. No DDL, no data changes.

## Method notes
- **Item 3 needs a guard, not a blanket `disabled`.** The pickers re-fetch on
  every change because availability is a function of the planned day, so an
  option can become blocked *after* being selected. Disabling it then would
  strand an unremovable selection. Condition on `blocked && !selected`.
- **Item 5's premise needs checking before it is repeated.** `?unread=true` is a
  filter, not a sort; verify what the API actually supports and report the
  difference rather than inheriting the framing.
- **Item 4 must not shrink the touch target** and must be suppressed where the
  last stop is already the next stop.
- Two items are owner-facing and browser-verifiable; three are driver-facing and
  are source-only in this environment. Say which is which.
