---
phase: quick-51
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - src/lib/validations/driver.schemas.ts
  - src/components/drivers/driver-invite-form.tsx
  - src/app/(owner)/actions/drivers.ts
autonomous: true
must_haves:
  truths:
    - "Driver invite form includes all required fields: First Name, Middle Name, Last Name, Date of Birth, Phone Number, Address, License Number, License Expiration Date"
    - "Full Name is auto-calculated from first+middle+last in the server action and stored on the DriverInvitation record"
    - "Email failure still shows amber warning banner (non-blocking) - existing behavior preserved"
    - "New fields are persisted to DriverInvitation in the database"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "DriverInvitation model with new fields"
      contains: "middleName"
    - path: "src/components/drivers/driver-invite-form.tsx"
      provides: "Expanded invite form with all driver fields"
      contains: "dateOfBirth"
    - path: "src/lib/validations/driver.schemas.ts"
      provides: "Updated Zod schemas with new field validations"
      contains: "phoneNumber"
  key_links:
    - from: "src/components/drivers/driver-invite-form.tsx"
      to: "src/app/(owner)/actions/drivers.ts"
      via: "FormData submission"
      pattern: "formData.get"
    - from: "src/app/(owner)/actions/drivers.ts"
      to: "prisma/schema.prisma"
      via: "prisma.driverInvitation.create"
      pattern: "driverInvitation.create"
---

<objective>
TKT-0009: Expand driver invite/creation form with comprehensive driver fields.

Purpose: The current driver invite form only captures email, first name, last name, and license number. Fleet managers need to capture complete driver information at invitation time including middle name, date of birth, phone, address, and license expiration.

Note on Issue #1 (email failure): The non-blocking email pattern is ALREADY correctly implemented. The `inviteDriver` action uses an inner try/catch around `sendDriverInvitation`, returns `{ success: true, warning: "..." }` when email fails, and the form already renders the amber warning banner. No changes needed for email handling.

Output: Updated schema, validation, form, and server action with all new driver fields.
</objective>

<context>
@prisma/schema.prisma
@src/components/drivers/driver-invite-form.tsx
@src/lib/validations/driver.schemas.ts
@src/app/(owner)/actions/drivers.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add new fields to DriverInvitation schema and Zod validations</name>
  <files>
    prisma/schema.prisma
    src/lib/validations/driver.schemas.ts
  </files>
  <action>
1. In `prisma/schema.prisma`, add these fields to the `DriverInvitation` model (all optional since some may not be known at invite time):
   - `middleName String?` -- middle name
   - `fullName String?` -- auto-computed from first+middle+last in server action
   - `dateOfBirth DateTime? @db.Date` -- date only, no timestamp
   - `phoneNumber String?` -- phone number
   - `address String?` -- full address as single text field
   - `licenseExpirationDate DateTime? @db.Date` -- license expiry date

   Place these after the existing `licenseNumber` field, before `role`.

2. Run `npx prisma db push` to sync the schema to the database.

3. Run `npx prisma generate` to regenerate the Prisma client.

4. In `src/lib/validations/driver.schemas.ts`, update `driverInviteSchema` to add:
   - `middleName`: z.string().max(50).optional().or(z.literal(''))
   - `dateOfBirth`: z.string().optional().or(z.literal('')) -- validated as ISO date string on the form, stored as Date
   - `phoneNumber`: z.string().min(7, 'Phone number too short').max(20, 'Phone number too long').regex(/^[0-9+\-() ]+$/, 'Invalid phone number format').optional().or(z.literal(''))
   - `address`: z.string().max(200, 'Address too long').optional().or(z.literal(''))
   - `licenseExpirationDate`: z.string().optional().or(z.literal('')) -- validated as ISO date string

   Also update `driverUpdateSchema` with the same new fields (excluding email which is not in update).
  </action>
  <verify>
    Run `npx prisma validate` to confirm schema is valid.
    Run `npx tsc --noEmit` to confirm TypeScript compiles with new schema types.
  </verify>
  <done>
    DriverInvitation model has middleName, fullName, dateOfBirth, phoneNumber, address, licenseExpirationDate fields.
    Zod schemas validate all new fields with appropriate constraints.
    Prisma client regenerated with new types.
  </done>
</task>

<task type="auto">
  <name>Task 2: Update invite form UI and server action to handle new fields</name>
  <files>
    src/components/drivers/driver-invite-form.tsx
    src/app/(owner)/actions/drivers.ts
  </files>
  <action>
1. In `src/components/drivers/driver-invite-form.tsx`:
   - Update `initialData` interface to include: `middleName?, dateOfBirth?, phoneNumber?, address?, licenseExpirationDate?`
   - After the existing First Name / Last Name grid row, add a new row with Middle Name (single column, optional, with "(optional)" label hint like licenseNumber has).
   - Below that, add a read-only "Full Name" display that shows the computed name. Since this is an uncontrolled form, use a small helper: add a `useEffect` + `useState` that reads first/middle/last from the form via refs or `onChange` handlers on the name inputs. Display as a subtle read-only field or text: `"Full Name: {first} {middle} {last}"` (trimmed, collapsing double spaces when middle is empty). This is display-only -- fullName is computed server-side.
   - Add a grid row (2 columns on sm+) with:
     - Date of Birth: `<input type="date">` with name="dateOfBirth", optional
     - Phone Number: `<input type="tel">` with name="phoneNumber", optional
   - Add Address field: full-width `<input type="text">` with name="address", optional, placeholder="Street address, city, state, ZIP"
   - Move License Number and add License Expiration Date in a 2-column grid row:
     - License Number (existing, keep as-is with uppercase font-mono styling)
     - License Expiration Date: `<input type="date">` with name="licenseExpirationDate", optional
   - Add field error displays for all new fields following the existing pattern: `{state?.error?.fieldName && <p className="mt-1.5 text-sm text-red-600">...`
   - Keep all existing styling patterns (inputClass, labelClass, optional hints).

2. In `src/app/(owner)/actions/drivers.ts`, update `inviteDriver`:
   - Extract new fields from formData: middleName, dateOfBirth, phoneNumber, address, licenseExpirationDate
   - Add them to the rawData object for Zod validation
   - Compute `fullName` after validation: `[firstName, middleName, lastName].filter(Boolean).join(' ')`
   - Pass all new fields to `prisma.driverInvitation.create` data, converting date strings to Date objects: `dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null`, same for licenseExpirationDate
   - Include fullName in the create data

3. Also update `updateDriver` action to handle the new fields if they are present in formData (for future edit form compatibility). Extract and validate the same new fields, pass to prisma.user.update.
  </action>
  <verify>
    Run `npx tsc --noEmit` to confirm no type errors.
    Run `npm run build` to confirm the project builds successfully.
    Visually: navigate to /drivers/invite and confirm all new fields render in the form.
  </verify>
  <done>
    Driver invite form shows: Email, First Name, Last Name, Middle Name, Full Name (computed display), Date of Birth, Phone Number, Address, License Number, License Expiration Date.
    Submitting the form persists all fields to DriverInvitation.
    Email failure still shows amber warning (existing behavior untouched).
    Form resets on success (existing formKey pattern).
  </done>
</task>

</tasks>

<verification>
- `npx prisma validate` passes
- `npx tsc --noEmit` passes
- `npm run build` succeeds
- Form at /drivers/invite shows all required fields
- Submitting with all fields populated creates DriverInvitation with correct data
- Submitting with only required fields (email, firstName, lastName) still works
- Email warning amber banner still appears when email sending fails
</verification>

<success_criteria>
- All 9 fields present on the invite form: Email, First Name, Middle Name, Last Name, Full Name (display), Date of Birth, Phone Number, Address, License Number, License Expiration Date
- DriverInvitation DB record stores all new field values
- fullName is auto-computed server-side from name parts
- Existing email warning pattern preserved (no regression)
- Project builds without errors
</success_criteria>

<output>
After completion, create `.planning/quick/51-tkt-0009-fix-new-driver-creation-email-e/51-SUMMARY.md`
</output>
