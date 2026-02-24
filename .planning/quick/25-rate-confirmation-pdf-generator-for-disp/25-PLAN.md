---
phase: quick-25
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/pdf/rate-confirmation.tsx
  - src/app/(owner)/actions/rate-confirmation.ts
  - src/components/loads/download-rate-confirmation-button.tsx
  - src/app/(owner)/loads/[id]/page.tsx
autonomous: true
must_haves:
  truths:
    - "User sees Download Rate Confirmation button on dispatched/picked_up/in_transit/delivered loads"
    - "Button does NOT appear on PENDING, INVOICED, or CANCELLED loads"
    - "Clicking the button generates and downloads a professional PDF"
    - "PDF contains all required fields: header, load details, rate, carrier info, customer info, terms, signature lines"
  artifacts:
    - path: "src/lib/pdf/rate-confirmation.tsx"
      provides: "React-PDF document component for rate confirmation"
    - path: "src/app/(owner)/actions/rate-confirmation.ts"
      provides: "Server action to generate PDF from load data"
      exports: ["generateRateConfirmationPDF"]
    - path: "src/components/loads/download-rate-confirmation-button.tsx"
      provides: "Client component with loading state that triggers download"
  key_links:
    - from: "src/components/loads/download-rate-confirmation-button.tsx"
      to: "src/app/(owner)/actions/rate-confirmation.ts"
      via: "server action call"
      pattern: "generateRateConfirmationPDF"
    - from: "src/app/(owner)/actions/rate-confirmation.ts"
      to: "prisma.load"
      via: "database query with includes"
      pattern: "prisma\\.load\\.findUnique"
---

<objective>
Add a "Download Rate Confirmation" button to the load detail page that generates and downloads a professional PDF document. Rate confirmations are standard carrier-to-broker documents confirming load acceptance at quoted rate.

Purpose: Carriers need to send rate confirmations to brokers/shippers — currently must create these manually outside the app.
Output: Server action + PDF template + download button on load detail page.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/app/(owner)/loads/[id]/page.tsx
@src/app/(owner)/actions/loads.ts
@prisma/schema.prisma (Load model)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install react-pdf and create PDF template + server action</name>
  <files>
    src/lib/pdf/rate-confirmation.tsx
    src/app/(owner)/actions/rate-confirmation.ts
  </files>
  <action>
    1. Install @react-pdf/renderer: `npm install @react-pdf/renderer`

    2. Create `src/lib/pdf/rate-confirmation.tsx` — a React-PDF document component:
       - Use @react-pdf/renderer's Document, Page, View, Text, StyleSheet
       - Blue/white color scheme (primary blue #1e40af for headers, #f0f4ff light blue for section backgrounds)
       - Layout sections:
         a. Header: "DriveCommand" in bold blue + "Rate Confirmation" title + document date + reference number (load number)
         b. Load Details section: Load #, Origin, Destination, Pickup Date, Delivery Date (if set), Commodity (if set)
         c. Rate section: Total rate formatted as USD with 2 decimals, bold and prominent
         d. Carrier Info section: Truck (year make model, license plate), Driver name
         e. Customer/Shipper Info section: Company name, contact email
         f. Terms section: Boilerplate text — "Carrier agrees to transport the above-described freight... Payment terms: Net 30 days from delivery date... Carrier is responsible for loading, securing, and delivering freight in good condition..."
         g. Signature lines at bottom: "Carrier Signature: ____________  Date: ______" and "Shipper Signature: ____________  Date: ______"
       - Accept a typed props interface: `RateConfirmationData` with loadNumber, origin, destination, pickupDate, deliveryDate (optional), commodity (optional), rate (string), driverName, truckInfo (string like "2024 Peterbilt 579 - ABC1234"), customerName, customerEmail (optional), documentDate (string)
       - Use StyleSheet.create for all styles — professional font sizes (header 20pt, section headers 12pt, body 10pt), adequate padding/margins

    3. Create `src/app/(owner)/actions/rate-confirmation.ts`:
       - 'use server' directive
       - Export async function `generateRateConfirmationPDF(loadId: string): Promise<{ pdf: string; filename: string }>`
       - Import getTenantPrisma, fetch load with include: { customer: true, driver: true, truck: true }
       - Validate load exists, throw if not found
       - Validate status is in ['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'] — throw if not
       - Build RateConfirmationData from the load record:
         - driverName: `${firstName} ${lastName}`.trim() or 'Unassigned'
         - truckInfo: `${year} ${make} ${model} - ${licensePlate}` or 'Unassigned'
         - rate: Number(load.rate).toFixed(2)
         - documentDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
       - Use renderToBuffer from @react-pdf/renderer to render the PDF document to a Buffer
       - Convert buffer to base64 string and return { pdf: base64String, filename: `RateConfirmation-${load.loadNumber}.pdf` }
  </action>
  <verify>
    - `npx tsc --noEmit` passes with no errors in the new files
    - Server action file exports generateRateConfirmationPDF
  </verify>
  <done>PDF template renders a professional rate confirmation document; server action fetches load data and returns base64 PDF</done>
</task>

<task type="auto">
  <name>Task 2: Create download button component and add to load detail page</name>
  <files>
    src/components/loads/download-rate-confirmation-button.tsx
    src/app/(owner)/loads/[id]/page.tsx
  </files>
  <action>
    1. Create `src/components/loads/download-rate-confirmation-button.tsx`:
       - 'use client' component
       - Props: { loadId: string }
       - State: isGenerating (boolean, default false)
       - On click:
         a. Set isGenerating = true
         b. Call generateRateConfirmationPDF(loadId) server action
         c. Decode the base64 string to a Uint8Array, create a Blob with type 'application/pdf'
         d. Create an object URL, create a temporary anchor element, set href + download attribute to filename, click it, revoke URL
         e. Set isGenerating = false in finally block
         f. Wrap in try/catch — on error, console.error and optionally show alert('Failed to generate PDF')
       - Render: Button with FileDown icon from lucide-react
         - Normal state: "Rate Confirmation" text with FileDown icon
         - Loading state: "Generating..." with a spinning Loader2 icon, button disabled
         - Style: Match existing button patterns on the page — use the same classes as the Edit link button (rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium shadow-sm hover:bg-accent transition-colors) but as a button element

    2. Update `src/app/(owner)/loads/[id]/page.tsx`:
       - Import DownloadRateConfirmationButton from '@/components/loads/download-rate-confirmation-button'
       - Import FileDown from lucide-react (for consistency, though the component handles its own icon)
       - In the action buttons area (the flex div around line 100), add the download button:
         - Show it when status is in ['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED']
         - Place it after the CopyTrackingLinkButton and before the Edit link
         - Wrap in the same conditional: `{['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'].includes(load.status) && (<DownloadRateConfirmationButton loadId={id} />)}`
  </action>
  <verify>
    - `npx tsc --noEmit` passes
    - Load detail page at /loads/[id] shows "Rate Confirmation" button for DISPATCHED loads
    - Clicking the button triggers PDF download with correct filename
  </verify>
  <done>Download Rate Confirmation button visible on dispatched/picked_up/in_transit/delivered loads; clicking generates and downloads a professional PDF with all required fields; button shows loading state during generation; button hidden on PENDING/INVOICED/CANCELLED loads</done>
</task>

</tasks>

<verification>
- Visit a DISPATCHED load detail page — "Rate Confirmation" button is visible alongside other action buttons
- Click the button — PDF downloads with filename "RateConfirmation-LD-XXXX.pdf"
- Open the PDF — contains DriveCommand header, load details, rate, carrier info, customer info, terms, signature lines
- Visit a PENDING load — no Rate Confirmation button visible
- Visit a CANCELLED load — no Rate Confirmation button visible
- TypeScript compiles with no errors
</verification>

<success_criteria>
- Rate Confirmation PDF generates correctly for all eligible load statuses
- PDF contains all required sections with properly formatted data
- Button has loading state feedback during generation
- Button only appears on appropriate load statuses
- No TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/25-rate-confirmation-pdf-generator-for-disp/25-SUMMARY.md`
</output>
