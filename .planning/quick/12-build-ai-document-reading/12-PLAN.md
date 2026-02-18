---
phase: quick-12
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(owner)/actions/ai-documents.ts
  - src/app/(owner)/ai-documents/page.tsx
  - src/components/ai-documents/document-analyzer.tsx
  - src/components/navigation/sidebar.tsx
autonomous: true
user_setup:
  - service: anthropic
    why: "Claude API for document analysis"
    env_vars:
      - name: ANTHROPIC_API_KEY
        source: "https://console.anthropic.com -> API Keys -> Create Key"
    dashboard_config: []

must_haves:
  truths:
    - "User can upload a PDF or image (JPEG/PNG) on the AI Documents page"
    - "After upload, Claude extracts structured fields from the document"
    - "Extracted fields display in a readable results panel (shipper, consignee, rate, dates, commodity, weight)"
    - "Error states are shown if the file is invalid or Claude API fails"
    - "Page is accessible from the sidebar under the Business section (OWNER/MANAGER only)"
  artifacts:
    - path: "src/app/(owner)/actions/ai-documents.ts"
      provides: "Server action analyzeDocument() that uploads to R2 then calls Claude"
      exports: ["analyzeDocument"]
    - path: "src/app/(owner)/ai-documents/page.tsx"
      provides: "Page shell with requireRole guard, renders DocumentAnalyzer"
    - path: "src/components/ai-documents/document-analyzer.tsx"
      provides: "Client component with file input, upload trigger, results panel"
  key_links:
    - from: "src/components/ai-documents/document-analyzer.tsx"
      to: "src/app/(owner)/actions/ai-documents.ts"
      via: "useActionState / direct server action call with FormData"
      pattern: "analyzeDocument"
    - from: "src/app/(owner)/actions/ai-documents.ts"
      to: "Anthropic API (claude-haiku-4-5-20251001)"
      via: "@anthropic-ai/sdk messages.create with base64 document"
      pattern: "anthropic\\.messages\\.create"
---

<objective>
Build AI document reading: a standalone page where users upload a rate confirmation, invoice, or load tender (PDF or image), Claude extracts structured freight fields from it, and the results display for review and potential load form pre-filling.

Purpose: Eliminates manual data entry when onboarding loads from rate confirmations and invoices — core TorqueAI gap feature.
Output: /ai-documents page with upload UI, Claude extraction server action, extracted field results panel, sidebar link.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/PROJECT.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install SDK and create analyzeDocument server action</name>
  <files>
    src/app/(owner)/actions/ai-documents.ts
  </files>
  <action>
    **Step 1 — Install @anthropic-ai/sdk:**
    Run `npm install @anthropic-ai/sdk` in the project root.

    **Step 2 — Create server action `src/app/(owner)/actions/ai-documents.ts`:**

    ```
    'use server';
    ```

    Import: `requireRole` from `@/lib/auth/server`, `UserRole` from `@/lib/auth/roles`, `Anthropic` from `@anthropic-ai/sdk`, `validateFileType`, `MAX_FILE_SIZE`, `ALLOWED_TYPES` from `@/lib/storage/validate`.

    Export a single async function `analyzeDocument(formData: FormData)`.

    **Inside analyzeDocument:**

    1. Auth check: `await requireRole([UserRole.OWNER, UserRole.MANAGER])` — FIRST before any data access.

    2. Extract file: `const file = formData.get('file') as File`. If missing, return `{ error: 'No file provided' }`.

    3. Validate size: if `file.size > MAX_FILE_SIZE` return `{ error: 'File too large (max 100MB)' }`.

    4. Read magic bytes and validate type:
       ```ts
       const buffer = await file.slice(0, 4100).arrayBuffer();
       const validation = await validateFileType(buffer, file.type);
       if (!validation.valid) return { error: validation.error };
       ```

    5. Convert full file to base64 for Claude:
       ```ts
       const fullBuffer = await file.arrayBuffer();
       const base64 = Buffer.from(fullBuffer).toString('base64');
       const mediaType = validation.detectedType as 'application/pdf' | 'image/jpeg' | 'image/png';
       ```

    6. Initialize Anthropic client:
       ```ts
       const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
       ```
       If `!process.env.ANTHROPIC_API_KEY` return `{ error: 'ANTHROPIC_API_KEY not configured' }`.

    7. Build message to Claude. Use model `claude-haiku-4-5-20251001`. Pass the file as a base64 document block. For PDFs use `type: 'document'` with `source.type: 'base64'`. For images use `type: 'image'` with `source.type: 'base64'`.

       Prompt text (include in `text` block after the document):
       ```
       You are a freight document parser. Extract structured data from this freight document (rate confirmation, invoice, or load tender).

       Return ONLY a valid JSON object with these fields (use null for missing fields):
       {
         "documentType": "rate_confirmation" | "invoice" | "load_tender" | "other",
         "loadNumber": string | null,
         "shipper": { "name": string | null, "address": string | null, "city": string | null, "state": string | null },
         "consignee": { "name": string | null, "address": string | null, "city": string | null, "state": string | null },
         "pickupDate": string | null,
         "deliveryDate": string | null,
         "commodity": string | null,
         "weight": string | null,
         "rate": string | null,
         "currency": "USD" | null,
         "miles": string | null,
         "referenceNumbers": string[],
         "specialInstructions": string | null
       }

       Return only the JSON. No markdown, no explanation.
       ```

    8. Call Claude:
       ```ts
       const response = await anthropic.messages.create({
         model: 'claude-haiku-4-5-20251001',
         max_tokens: 1024,
         messages: [{ role: 'user', content: [documentBlock, textBlock] }],
       });
       ```

       Where `documentBlock` is:
       - PDF: `{ type: 'document', source: { type: 'base64', media_type: mediaType, data: base64 } }`
       - Image: `{ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }`

    9. Parse response:
       ```ts
       const text = response.content[0].type === 'text' ? response.content[0].text : '';
       const extracted = JSON.parse(text);
       return { success: true, extracted, fileName: file.name };
       ```
       Wrap the JSON.parse in try/catch: if it fails return `{ error: 'Claude returned unexpected format', raw: text }`.

    10. Wrap the entire function body in try/catch: catch returns `{ error: error instanceof Error ? error.message : 'Analysis failed' }`.

    **Note on PDF support:** The Anthropic API supports PDF documents natively with the `document` block type (beta feature). Use `betas: ['pdfs-2024-09-25']` in the messages.create call if needed — check SDK docs. For images, use standard `image` block type.
  </action>
  <verify>
    Run `npm run build` (or `npx tsc --noEmit`) to confirm no TypeScript errors in the new file. If build fails due to missing types, run `npm install @anthropic-ai/sdk` first.
  </verify>
  <done>
    `src/app/(owner)/actions/ai-documents.ts` exists, exports `analyzeDocument`, imports compile without errors, TypeScript types are valid.
  </done>
</task>

<task type="auto">
  <name>Task 2: Build DocumentAnalyzer component, page, and sidebar link</name>
  <files>
    src/components/ai-documents/document-analyzer.tsx
    src/app/(owner)/ai-documents/page.tsx
    src/components/navigation/sidebar.tsx
  </files>
  <action>
    **Step 1 — Create `src/components/ai-documents/document-analyzer.tsx` (client component):**

    `'use client'`

    State:
    - `const [state, setState] = useState<{ loading: boolean; result: any | null; error: string | null }>({ loading: false, result: null, error: null })`
    - `const [fileName, setFileName] = useState<string | null>(null)`
    - `const fileInputRef = useRef<HTMLInputElement>(null)`

    Import `analyzeDocument` from `@/app/(owner)/actions/ai-documents`.

    **UI structure:**

    ```
    <div className="space-y-6">
      {/* Upload card */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2>Upload Document</h2>
        <p className="text-muted-foreground text-sm">
          Upload a rate confirmation, invoice, or load tender. Claude will extract key freight data automatically.
        </p>
        <div className="mt-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFileName(f.name);
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-dashed border-border bg-muted/30 px-8 py-6 w-full text-center hover:bg-muted/50 transition-colors cursor-pointer"
          >
            {fileName ? (
              <span className="font-medium">{fileName}</span>
            ) : (
              <span className="text-muted-foreground">Click to select a PDF or image</span>
            )}
          </button>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={!fileName || state.loading}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {state.loading ? 'Analyzing...' : 'Analyze Document'}
        </button>
      </div>

      {/* Error state */}
      {state.error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
          {state.error}
        </div>
      )}

      {/* Results panel */}
      {state.result && <ExtractedDataPanel data={state.result} />}
    </div>
    ```

    **handleAnalyze function:**
    ```ts
    async function handleAnalyze() {
      const file = fileInputRef.current?.files?.[0];
      if (!file) return;
      setState({ loading: true, result: null, error: null });
      const formData = new FormData();
      formData.append('file', file);
      const res = await analyzeDocument(formData);
      if ('error' in res) {
        setState({ loading: false, result: null, error: res.error as string });
      } else {
        setState({ loading: false, result: res.extracted, error: null });
      }
    }
    ```

    **ExtractedDataPanel sub-component (same file):**

    Renders a grid of field cards. Fields to display:
    - Document Type (badge: blue for rate_confirmation, green for invoice, yellow for load_tender)
    - Load Number
    - Shipper (name + address on separate lines)
    - Consignee (name + address on separate lines)
    - Pickup Date
    - Delivery Date
    - Commodity
    - Weight
    - Rate (with currency)
    - Miles
    - Reference Numbers (comma-joined)
    - Special Instructions

    Use a 2-column grid (`grid grid-cols-1 gap-4 md:grid-cols-2`) of labeled cards. Each card:
    ```tsx
    <div className="rounded-lg border border-border bg-card p-4">
      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value ?? <span className="text-muted-foreground italic">Not found</span>}</dd>
    </div>
    ```

    Include a "Copy JSON" button at the bottom that copies `JSON.stringify(data, null, 2)` to clipboard using `navigator.clipboard.writeText`.

    **Step 2 — Create `src/app/(owner)/ai-documents/page.tsx`:**

    Server component. Import `requireRole` from `@/lib/auth/server` and `UserRole` from `@/lib/auth/roles`. Import `DocumentAnalyzer` from the component.

    ```tsx
    export default async function AiDocumentsPage() {
      await requireRole([UserRole.OWNER, UserRole.MANAGER]);
      return (
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">AI Document Reading</h1>
            <p className="text-muted-foreground mt-1">
              Upload freight documents to automatically extract load data using AI
            </p>
          </div>
          <DocumentAnalyzer />
        </div>
      );
    }
    ```

    **Step 3 — Update `src/components/navigation/sidebar.tsx`:**

    Add `FileSearch` to the lucide-react import list. Add a new sidebar item in the Business section (after Payroll, before the closing `</SidebarMenu>`):

    ```tsx
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={pathname.startsWith("/ai-documents")}
        tooltip="AI Documents"
      >
        <Link href="/ai-documents">
          <FileSearch />
          <span>AI Documents</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
    ```

    Place inside the existing `{canViewFleetIntelligence && (...)}` Business section block, after the Payroll item.
  </action>
  <verify>
    Run `npm run build` to confirm no TypeScript or JSX errors. Then start dev server (`npm run dev`) and navigate to http://localhost:3000/ai-documents. Verify: page loads, file input appears, selecting a file shows the filename, the sidebar shows "AI Documents" under Business section for OWNER/MANAGER users.

    To test extraction: upload a sample PDF. If ANTHROPIC_API_KEY is set in .env.local, the analysis should return extracted fields. If key is missing, the error panel should display "ANTHROPIC_API_KEY not configured".
  </verify>
  <done>
    - /ai-documents page accessible, renders DocumentAnalyzer component
    - File picker accepts .pdf, .jpg, .jpeg, .png
    - Sidebar shows "AI Documents" under Business (OWNER/MANAGER only)
    - Uploading a file and clicking Analyze calls the server action
    - Results show extracted freight fields or clear error message
    - Build succeeds with no TypeScript errors
  </done>
</task>

</tasks>

<verification>
- `npm run build` passes clean (no TypeScript errors)
- /ai-documents route exists and loads for OWNER/MANAGER users
- Sidebar "AI Documents" link under Business section is visible and active-highlights correctly
- analyzeDocument server action handles: missing file, oversized file, invalid type, missing API key, Claude parse failure
- Extracted data panel shows all 12 freight fields with null-safe rendering
</verification>

<success_criteria>
User can navigate to /ai-documents, upload a rate confirmation PDF or image, click Analyze, and see extracted freight fields (shipper, consignee, rate, dates, commodity, weight, etc.) displayed in a readable panel. Build succeeds. Sidebar link present for OWNER/MANAGER.
</success_criteria>

<output>
After completion, create `.planning/quick/12-build-ai-document-reading/12-SUMMARY.md` following the summary template.
</output>
