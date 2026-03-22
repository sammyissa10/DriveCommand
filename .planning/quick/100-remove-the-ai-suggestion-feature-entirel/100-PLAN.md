---
phase: quick-100
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/actions/support-tickets.ts
  - src/app/(admin)/admin-support/ticket-list.tsx
autonomous: true
must_haves:
  truths:
    - "generateAiResolution function is removed from support-tickets.ts"
    - "Anthropic SDK import is removed from support-tickets.ts"
    - "AI Suggest UI section is removed from ticket-list.tsx"
    - "All related state (aiDiagnosis, aiDraftReply, aiLoading) is removed"
    - "handleAiSuggest and handleUseReply handlers are removed"
    - "Sparkles and generateAiResolution imports are removed from ticket-list.tsx"
---

<objective>
Remove the AI suggestion feature entirely from the admin support ticket view.

Tasks:
1. Remove generateAiResolution function and Anthropic import from support-tickets.ts
2. Remove AI Suggest UI, state, handlers, and imports from ticket-list.tsx
</objective>
