---
phase: quick-100
status: complete
commit: f7b1be4
date: 2026-03-22
---

# Quick Task 100 — Remove AI Suggestion Feature

## What was done
Removed the AI suggestion feature from the admin support ticket view.

**src/actions/support-tickets.ts:**
- Removed `import Anthropic from '@anthropic-ai/sdk'`
- Deleted the `generateAiResolution` server action (~85 lines)

**src/app/(admin)/admin-support/ticket-list.tsx:**
- Removed `Sparkles` from lucide-react import
- Removed `generateAiResolution` from actions import
- Removed `aiDiagnosis`, `aiDraftReply`, `aiLoading` state variables
- Deleted `handleAiSuggest` and `handleUseReply` handlers
- Removed the entire "AI Suggest" UI section from the expanded ticket view

## Result
162 lines deleted. The admin support ticket view is now clean — no AI suggest button, no diagnosis/draft reply UI.
