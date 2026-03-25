---
phase: quick-99
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
    - "Admin can click AI Suggest on any expanded ticket and receive a diagnosis + draft reply"
    - "Admin can click Use this reply to populate the reply textarea with the AI draft"
    - "AI suggestion shows loading state while processing"
  artifacts:
    - path: "src/actions/support-tickets.ts"
      provides: "generateAiResolution server action"
      contains: "generateAiResolution"
    - path: "src/app/(admin)/admin-support/ticket-list.tsx"
      provides: "AI Suggest UI section in expanded ticket"
      contains: "AI Suggest"
  key_links:
    - from: "src/app/(admin)/admin-support/ticket-list.tsx"
      to: "src/actions/support-tickets.ts"
      via: "generateAiResolution import and call"
      pattern: "generateAiResolution"
---

<objective>
Add AI-powered ticket resolution suggestions to the admin support ticket view.

Purpose: Help sysadmins quickly diagnose and respond to support tickets by having Claude analyze the full ticket context (title, description, category, priority, platform, fromPage, thread messages) and return a suggested diagnosis plus a draft reply ready to send.

Output: Working "AI Suggest" button in the expanded ticket view that calls Claude Haiku and displays results inline, with a "Use this reply" button to populate the reply textarea.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/actions/support-tickets.ts
@src/app/(admin)/admin-support/ticket-list.tsx
@src/app/(owner)/actions/ai-documents.ts (existing Claude API usage pattern)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create generateAiResolution server action</name>
  <files>src/actions/support-tickets.ts</files>
  <action>
Add a new server action `generateAiResolution(ticketId: string)` to the bottom of `src/actions/support-tickets.ts`.

The action should:
1. Call `requireAdminAccess()` for auth.
2. Fetch the ticket by ID using a bypass_rls transaction (same pattern as other actions in this file): `prisma.supportTicket.findFirst({ where: { id: ticketId } })`. Get all fields: title, description, category, priority, fromPage, platform, status.
3. Fetch ticket messages using `prisma.ticketMessage.findMany({ where: { ticketId }, orderBy: { createdAt: 'asc' } })` in the same transaction.
4. If ticket not found, return `{ success: false as const, error: 'Ticket not found' }`.
5. Check `process.env.ANTHROPIC_API_KEY` exists, return error if not.
6. Initialize `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })` — import Anthropic from `@anthropic-ai/sdk` at top of file.
7. Build a system prompt that instructs Claude to act as a DriveCommand support specialist. The system prompt should say:
   ```
   You are a DriveCommand support specialist AI. DriveCommand is a fleet management / trucking SaaS platform. Analyze the support ticket below and provide:
   1. A diagnosis of the issue (what's likely wrong, what area of the system is affected, potential root causes)
   2. A professional draft reply to send to the ticket submitter with actionable next steps

   Return your response as JSON with exactly two fields:
   {"diagnosis": "...", "draftReply": "..."}

   For the draftReply: be professional, empathetic, address the user by saying "Hi there", reference their specific issue, provide clear next steps or a resolution explanation. Keep it concise (2-4 paragraphs max). Do NOT use markdown in the draftReply — plain text only.
   For the diagnosis: be technical and specific for the admin's benefit. Reference the category, page, platform if relevant.

   Return ONLY the JSON object. No markdown fences, no explanation outside the JSON.
   ```
8. Build the user message containing all ticket context:
   ```
   Ticket: ${ticket.ticketNumber}
   Category: ${ticket.category}
   Priority: ${ticket.priority}
   Status: ${ticket.status}
   Platform: ${ticket.platform || 'Not specified'}
   Submitted from page: ${ticket.fromPage}

   Title: ${ticket.title}

   Description:
   ${ticket.description}

   ${messages.length > 0 ? `Thread (${messages.length} messages):\n${messages.map(m => `[${m.senderType}] ${m.senderLabel} (${m.createdAt.toISOString()}):\n${m.body}`).join('\n\n')}` : 'No thread messages yet.'}
   ```
9. Call `anthropic.messages.create` with model `claude-haiku-4-5-20251001`, max_tokens 1024, the system prompt, and user message.
10. Parse the response text content. Extract JSON from the response (handle potential markdown fences by stripping them). Parse into `{ diagnosis: string, draftReply: string }`.
11. Return type: `Promise<{ success: true; diagnosis: string; draftReply: string } | { success: false; error: string }>`.
12. Wrap entire API call in try/catch, return `{ success: false, error: 'AI suggestion failed. Please try again.' }` on error.

Follow the exact same Anthropic client instantiation pattern used in `src/app/(owner)/actions/ai-documents.ts` — inline client creation, no singleton.
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors. Grep for `generateAiResolution` in support-tickets.ts to confirm it exists.</verify>
  <done>Server action generateAiResolution exists, accepts ticketId, returns { success, diagnosis, draftReply } or { success, error }. TypeScript compiles cleanly.</done>
</task>

<task type="auto">
  <name>Task 2: Add AI Suggest UI to expanded ticket view</name>
  <files>src/app/(admin)/admin-support/ticket-list.tsx</files>
  <action>
Modify the `TicketRow` component in `ticket-list.tsx` to add an AI suggestion section.

1. Add import: `import { generateAiResolution } from '@/actions/support-tickets';` (add to existing import line from that module). Add `Sparkles` icon from `lucide-react` (for the AI Suggest button).

2. Add state variables to TicketRow:
   - `const [aiDiagnosis, setAiDiagnosis] = useState<string | null>(null);`
   - `const [aiDraftReply, setAiDraftReply] = useState<string | null>(null);`
   - `const [aiLoading, setAiLoading] = useState(false);`

3. Add handler function `handleAiSuggest`:
   ```typescript
   async function handleAiSuggest() {
     setAiLoading(true);
     try {
       const result = await generateAiResolution(ticket.id);
       if (result.success) {
         setAiDiagnosis(result.diagnosis);
         setAiDraftReply(result.draftReply);
       } else {
         toast.error(result.error ?? 'AI suggestion failed');
       }
     } catch {
       toast.error('AI suggestion failed');
     } finally {
       setAiLoading(false);
     }
   }
   ```

4. Add handler `handleUseReply`:
   ```typescript
   function handleUseReply() {
     if (aiDraftReply) {
       setReplyText(aiDraftReply);
       toast.success('Draft reply loaded into reply box');
     }
   }
   ```

5. In the expanded detail section, insert a new AI Suggest section AFTER the "Thread" section and BEFORE the "Admin reply form" section (i.e., between the thread `</div>` around line 374 and the `{/* Admin reply form */}` comment around line 377). The section should be:

   ```tsx
   {/* AI Suggest */}
   <div className="space-y-2">
     <div className="flex items-center gap-2">
       <p className="text-xs font-medium text-gray-500">AI Suggestion</p>
       <Button
         size="sm"
         variant="outline"
         onClick={handleAiSuggest}
         disabled={aiLoading}
         className="h-7 text-xs gap-1"
       >
         {aiLoading ? (
           <Loader2 className="h-3 w-3 animate-spin" />
         ) : (
           <Sparkles className="h-3 w-3" />
         )}
         {aiLoading ? 'Analyzing...' : aiDiagnosis ? 'Re-analyze' : 'AI Suggest'}
       </Button>
     </div>

     {aiDiagnosis && (
       <div className="space-y-3">
         <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
           <p className="text-xs font-semibold text-amber-800 mb-1">Diagnosis</p>
           <p className="text-sm text-amber-900 whitespace-pre-wrap">{aiDiagnosis}</p>
         </div>
         <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
           <div className="flex items-center justify-between mb-1">
             <p className="text-xs font-semibold text-blue-800">Draft Reply</p>
             <Button
               size="sm"
               variant="outline"
               onClick={handleUseReply}
               className="h-6 text-xs border-blue-300 text-blue-700 hover:bg-blue-100"
             >
               Use this reply
             </Button>
           </div>
           <p className="text-sm text-blue-900 whitespace-pre-wrap">{aiDraftReply}</p>
         </div>
       </div>
     )}
   </div>
   ```

Styling notes:
- Diagnosis box: amber theme (amber-50 bg, amber-200 border, amber-800/900 text) to visually distinguish as AI-generated analysis.
- Draft reply box: blue theme (blue-50 bg, blue-200 border, blue-800/900 text) matching the admin reply style.
- "Use this reply" button sits in the header of the draft reply box, right-aligned.
- Button changes text to "Re-analyze" after first result, and shows spinner during loading.
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors. Visually inspect in browser: expand a ticket, click AI Suggest, verify loading state appears, results display in amber/blue boxes, and "Use this reply" populates the textarea.</verify>
  <done>AI Suggest button appears in expanded ticket view. Clicking it shows loading spinner, then displays diagnosis (amber box) and draft reply (blue box). "Use this reply" button populates the reply textarea. "Re-analyze" button text appears after first use.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors
2. Expand any ticket in admin support view → "AI Suggestion" section visible with "AI Suggest" button
3. Click "AI Suggest" → spinner shows → after a few seconds, diagnosis + draft reply appear
4. Click "Use this reply" → reply textarea populated with the draft
5. Click "Re-analyze" → new suggestion generated
</verification>

<success_criteria>
- generateAiResolution server action in support-tickets.ts calls Claude Haiku with full ticket context
- AI Suggest button in expanded ticket UI triggers the action and displays results
- "Use this reply" button populates the admin reply textarea
- Loading states work correctly (spinner, disabled button)
- TypeScript compiles without errors
</success_criteria>

<output>
After completion, create `.planning/quick/99-tkt-0045-ai-auto-resolution-field-on-sup/99-SUMMARY.md`
</output>
