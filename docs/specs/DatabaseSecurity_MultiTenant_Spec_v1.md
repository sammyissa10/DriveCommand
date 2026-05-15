# Database Security & Multi-Tenant Standardization Spec v1

**Version:** 1.1
**Status:** Implementation-ready
**Stack:** Next.js 16 + Prisma 7 + PostgreSQL 17 + Clerk + AWS S3/Cloudflare R2
**Owner:** Engineering
**Purpose:** Codify the database and security standards every table, query, and document upload in the SaaS application must follow.

---

## Section 0 — How To Use This Spec (Read First)

### What this build is

A one-time hardening pass on the database and file storage layers that fixes two real problems and prevents a third:

1. **Cross-tenant leakage** — drivers, loads, and clients from another company occasionally show up in dropdowns and lists. This will stop.
2. **No documented encryption standard** for sensitive uploads (SSN, passport, CDL, medical card). After this build, every restricted document is encrypted with a per-tenant key, downloads are logged, and presigned URLs expire in 15 minutes.
3. **Input and upload abuse** — attackers can send malicious payloads (zip bombs, oversized JSON, SQL injection, prompt injection, path traversal, SSRF). After this build, every input goes through the validator pipeline in Section 4A.

### How to use this as a developer

1. **Save this file** in the repository at `docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md`. Commit it alongside the existing specs.
2. **Open the repository in VS Code** with the Claude Code extension installed.
3. **Run the six prompts in Section 10, in order.** Copy each prompt verbatim into Claude Code. Do not skip ahead. Each one builds on the previous.
4. **Wait for each prompt to finish and report back** before starting the next. If a prompt fails verification, fix what it reports before continuing.
5. **Review the diff** between prompts. Do not auto-merge. Each PR is small enough to read.

### Order of operations (at a glance)

| # | Prompt | What it does | Output | Safe to run on prod? |
|---|---|---|---|---|
| 1 | Audit | Read-only inventory of every table | `docs/audits/db-tenant-audit.md` | Yes — read-only |
| 2 | Standardize tables | Adds tenant_id, audit columns, RLS, indexes | Migration files + Prisma schema | No — test on clone first |
| 3 | Plug the dropdown leak | Replaces raw Prisma calls with tenant-scoped client | Refactored API routes + new tests | Yes — additive |
| 4 | Field encryption | AES-256-GCM on SSN, license, DOB | New `field-crypto.ts`, `audit_log` table | No — test on clone first |
| 5 | Restricted documents | Separate prefix, SSE-KMS, 15-min URLs | Updated upload + download routes | Yes — additive |
| 6 | Input & upload hardening | Zip-bomb guard, request limits, sanitizers | New `src/lib/security/` files + middleware | Yes — additive |

### How to know it worked

After all six prompts complete, you should be able to confirm each of these with a one-line check:

| Check | How to confirm | Pass = |
|---|---|---|
| Audit ran | `docs/audits/db-tenant-audit.md` exists and lists every table | File present, no UNKNOWN rows |
| Every tenant-scoped table has RLS | Run `scripts/audit/db-tenant-audit.ts` again | Zero rows with `has_rls_enabled = N` |
| Dropdown leak is fixed | Log in as Tenant A, open Drivers, Loads, Clients dropdowns | No Tenant B data appears anywhere |
| Isolation tests pass | `npm test -- isolation` | All green |
| No raw Prisma in feature code | `npm run audit:raw-prisma` (added by Prompt 3) | Zero LEAK_RISK results |
| PII is encrypted at rest | `psql -c "SELECT ssn_ciphertext FROM \"Driver\" LIMIT 1"` | Binary blob, not a number |
| Audit log writes on PII view | View a driver's SSN in the UI, then `SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 1` | New row with `action = VIEW_PII` |
| Restricted documents are tenant-prefixed | Inspect any restricted document S3 key | Starts with `tenant-<uuid>/restricted/` |
| Upload abuse is blocked | Try uploading a 50KB zip that expands to 5GB (zip bomb test fixture) | Server returns 413 or 422 before extraction |
| Request size limits enforced | Send a 50MB JSON body to any API route | 413 Payload Too Large |
| All tests green | `npm test` | Zero failures |
| Build clean | `npm run build` | No errors |

If any check fails, stop and report. Do not deploy.

### Rollback

Each prompt produces a single PR. Revert the PR if needed. Schema migrations include explicit rollback steps in the runbook produced by Prompt 2. Field-encryption migration (Prompt 4) keeps plaintext columns during a dual-write window — they are only dropped in a second PR after verification.

### Who runs this

One developer with Claude Code in VS Code, working through the prompts in order, with another engineer reviewing each PR. Estimated total: 1-2 weeks elapsed time for a single developer including verification and clone testing. No marathon required — Prompt 1 alone is 30 minutes.

---

## Section 1 — Why This Spec Exists

Two production problems triggered this document:

1. **Cross-tenant data leakage in UI** — dropdowns and lists occasionally show data from another tenant. Root cause is missing or inconsistent tenant filtering at the query layer; sometimes RLS is bypassed by raw queries, sometimes a table was added without the tenant policy.
2. **Sensitive PII uploads (SSN, passport, CDL, medical) without a documented encryption standard.** The app already encrypts at rest at the storage layer, but field-level encryption for the most sensitive PII, key rotation policy, and an explicit standard for "what gets encrypted vs hashed vs plaintext" do not exist in writing.

This spec is the single source of truth. Anything not in this spec is not the standard. Every new table and every new upload path must conform.

---

## Section 2 — Non-Negotiable Standards

### 2.1 Every tenant-scoped table must have

| Column | Type | Rule |
|---|---|---|
| `id` | UUID | Primary key. Generated by `gen_random_uuid()`. Never sequential integers. |
| `tenant_id` | UUID NOT NULL | Foreign key to `Tenant.id`. `onDelete: Restrict`. Indexed. |
| `created_at` | `TIMESTAMPTZ(6)` NOT NULL | UTC, with timezone. Default `NOW()`. Never localized. |
| `created_by` | UUID NOT NULL | FK to `User.id`. The user who created the row. |
| `updated_at` | `TIMESTAMPTZ(6)` NOT NULL | UTC. Auto-updated by trigger or Prisma `@updatedAt`. |
| `updated_by` | UUID NOT NULL | FK to `User.id`. Updated on every write. |
| `deleted_at` | `TIMESTAMPTZ(6)` NULL | Soft delete. Null = active. |
| `deleted_by` | UUID NULL | Who soft-deleted. |

**Entity-specific IDs (e.g. `driver_id`, `load_id`, `client_id`) are columns on related tables, not separate concepts.** Every table gets a UUID `id` — the relation name carries the entity meaning. A foreign key from `load_driver_assignment.driver_id` to `driver.id` is how the link is expressed.

### 2.2 All timestamps are stored as UTC, non-localized

- Database column: `TIMESTAMPTZ(6)` (microsecond precision, timezone-aware).
- Prisma field: `DateTime @db.Timestamptz(6)`.
- Application: store and pass UTC ISO-8601 strings. Convert to the user's local time **only** at the UI rendering layer.
- Never store local time. Never store "naive" timestamps without a timezone.

### 2.3 Row-Level Security (RLS) is mandatory, not optional

Every tenant-scoped table must have:

1. `ENABLE ROW LEVEL SECURITY`
2. `FORCE ROW LEVEL SECURITY` (so even table owners obey)
3. A `tenant_isolation_policy` using `current_tenant_id()`
4. A `bypass_rls_policy` gated on `app.bypass_rls = 'on'` (only used by system admin / provisioning paths)
5. Granted DML to the `app_user` role only — never connect from the app as superuser.

### 2.4 Application connects as a limited role

Production and staging connect as `app_user`. This role has `SELECT, INSERT, UPDATE, DELETE` on tenant tables and **never has `BYPASSRLS`**. Migrations and admin scripts use a separate role.

### 2.5 Tenant context is set per transaction, never per connection

Use `set_config('app.current_tenant_id', $1, TRUE)` inside a transaction. The `TRUE` (third arg) makes it transaction-local so it cannot leak to the next query on a pooled connection. **Connection pool contamination is the #1 cause of cross-tenant leakage.**

### 2.6 Raw SQL is banned in feature code

If you write `prisma.$queryRaw` you bypass the tenant-injection extension. RLS still applies at the DB, but the app-layer guarantee is lost. Allowed only in:

- Migrations.
- Reporting/analytics service files that explicitly call `requireTenantContext()` first.
- Two-tenant isolation tests.

### 2.7 Money is `Decimal`, IDs are UUID, never `Float`, never sequential

---

## Section 3 — Existing Project Patterns (Source of Truth)

The repository already implements the patterns below. They are the canonical reference — any new code copies these, does not reinvent them.

| Concern | Canonical file | What it provides |
|---|---|---|
| Tenant context resolver | `src/lib/context/tenant-context.ts` | `getTenantId()`, `requireTenantId()`, `getTenantPrisma()` |
| RLS Prisma extension | `src/lib/db/extensions/tenant-rls.ts` | `withTenantRLS(tenantId)` — wraps every query in a tx and sets `app.current_tenant_id` |
| Prisma singleton | `src/lib/db/prisma.ts` | One client, reused across the app |
| Base repository | `src/lib/db/repositories/base.repository.ts` | All tenant-scoped repos extend this |
| Middleware | `src/middleware.ts` | Reads `tenantId` from Clerk session, injects `x-tenant-id` header |
| Webhook | `src/app/api/webhooks/clerk/route.ts` | Provisions Tenant + User on `user.created` |
| Storage validation | `src/lib/storage/validate.ts` | Magic-bytes file-type validation, size limits |
| Presigned URLs | `src/lib/storage/presigned.ts` | Tenant-prefixed S3 keys: `tenant-${tenantId}/${category}/${fileId}-${fileName}` |
| Multipart upload | `src/lib/storage/multipart.ts` | Large-file flow with abort-on-failure |

---

## Section 4 — Document & Sensitive Data Security Standard

### 4.1 Data sensitivity classification

Every column and every uploaded document falls into exactly one class. The class determines the controls.

| Class | Examples | At rest | In transit | Access |
|---|---|---|---|---|
| **PUBLIC** | Marketing pages, public driver name on a public load board (if enabled) | TLS only | TLS 1.3 | Anyone |
| **INTERNAL** | Load notes, dispatch comments, non-identifying operational data | DB encryption at rest (provider-level, AES-256) | TLS 1.3 | Tenant users via RLS |
| **CONFIDENTIAL** | Driver name, phone, email, address, employment dates, pay rates | DB encryption at rest + RLS | TLS 1.3 | Tenant users via RLS + RBAC (MANAGER/ADMIN/OWNER only for pay) |
| **RESTRICTED (PII / SPII)** | SSN, EIN, driver license number, passport number, DOB, medical card data, bank account numbers | **Field-level AES-256-GCM encryption inside the DB** + RLS. Last-4 stored separately for display. | TLS 1.3 | Explicit role permission + audit-logged access |
| **RESTRICTED documents** | Scans/photos of SSN card, passport, CDL, medical card, voided check, W-9, W-4, I-9 | **Object-level SSE-KMS encryption with per-tenant KMS key**. Presigned URLs expire ≤15 min. Never publicly readable. | TLS 1.3 | Audit-logged download. RBAC enforced. |

### 4.2 Encryption requirements

**At rest (mandatory):**
- Database: AES-256 at the volume level (managed Postgres provider default — enable explicitly, do not assume).
- S3/R2 buckets: `BucketEncryption: AES256` (SSE-S3) minimum; SSE-KMS with customer-managed key (CMK) for restricted-class documents.
- Backups: encrypted with the same standard as the source. Encrypted snapshots only.

**Field-level (mandatory for RESTRICTED PII columns):**
- Algorithm: AES-256-GCM.
- Library: `node:crypto` with a wrapper in `src/lib/security/field-crypto.ts` (to be created if not present).
- Key: stored in AWS KMS / GCP KMS / Vault — never in `.env` for production. Local dev uses a dev-only key in `.env.local` that is gitignored.
- Key rotation: annual, or immediate on suspected compromise. Old ciphertext decrypts with old key (versioned key id stored alongside ciphertext).
- Storage shape per encrypted field:
  ```
  ssn_ciphertext  BYTEA       -- AES-256-GCM ciphertext
  ssn_iv          BYTEA       -- 12-byte IV per row
  ssn_tag         BYTEA       -- 16-byte auth tag
  ssn_key_id      TEXT        -- KMS key version that encrypted this row
  ssn_last4       VARCHAR(4)  -- for display only, never the full value
  ```
- Application never logs decrypted values. Never returns full PII in API responses unless the caller is explicitly entitled and the access is audit-logged.

**In transit (mandatory):**
- TLS 1.3 minimum on all public endpoints. TLS 1.2 only if a downstream service literally cannot do 1.3.
- HSTS header with `max-age=31536000; includeSubDomains; preload`.
- Internal service-to-service: mTLS or VPC-private with TLS.

### 4.3 Document upload rules (extends existing storage layer)

1. **Tenant prefix is non-negotiable.** S3 key: `tenant-${tenantId}/${category}/${fileId}-${sanitizedFileName}`. The category folder for restricted documents is `restricted/` (separate from `trucks/`, `routes/`, `drivers/`).
2. **Defense-in-depth s3Key validation** at every API entry point: initiate, part-url, complete, download, delete. Reject any key that does not start with the caller's tenant prefix. Already implemented in 4 places per Phase 18 — extend to every new route.
3. **MIME spoofing prevention:** magic-bytes check via `file-type` package on the server, never trust the `Content-Type` header alone.
4. **Allowed types for restricted documents:** `application/pdf`, `image/jpeg`, `image/png`, `image/heic`. Reject everything else.
5. **Size limit:** 100MB max (current setting). 5MB for ID-card-style documents. Configured in `src/lib/storage/validate.ts`.
6. **Presigned URL expiry:** upload 5 min; download 15 min for restricted, 1 hour for normal documents.
7. **Never store the file in the database.** Always object storage. The DB stores the metadata row only.
8. **Soft-delete only.** Deleting a document marks `deleted_at`; a background job purges the S3 object after 30 days retention (regulatory / dispute window).
9. **Virus scanning (Phase 2):** restricted-class uploads should pass ClamAV scan before the metadata row is created. Deferrable but tracked.

### 4.4 Access control on restricted documents

- All download requests go through a server action that:
  1. Verifies authenticated user via Clerk.
  2. Verifies user belongs to the tenant the document belongs to.
  3. Verifies user role allows access to this document type (see RBAC matrix per existing spec).
  4. Writes an `audit_log` entry: `{userId, tenantId, action: "DOWNLOAD", resourceType, resourceId, ip, userAgent, timestamp}`.
  5. Returns a short-lived presigned URL.
- Drivers can download their own documents. Managers/Owners can download any document in their tenant. Dispatchers cannot download restricted-class documents at all.

### 4.5 Audit logging

Required for every action on RESTRICTED data:
- View / decrypt of a PII field.
- Download of a restricted document.
- Update or delete of a restricted resource.
- Export of any data containing restricted fields.

Table: `audit_log` (also tenant-scoped, RLS-enabled, append-only, never updated).

---

## Section 4A — Input & Upload Abuse Hardening

The threat model: anyone with a valid login (driver, dispatcher, manager, or compromised account) and anyone hitting a public endpoint (signup, webhook) can send a crafted payload designed to crash, exhaust, or break the system. This section is the standard for everything that crosses an API boundary into our code.

### 4A.1 Request-level limits (apply at the edge)

Set on the Next.js server, the proxy/CDN, and Vercel/host config — three layers, all must agree.

| Limit | Value | Why |
|---|---|---|
| JSON body size | 1 MB on all routes except explicit large-payload routes | Prevents memory exhaustion via huge JSON. |
| Form / multipart body size | 100 MB max (matches existing upload limit), 1 MB default everywhere else | Most routes never need form bodies. |
| Single file size | 100 MB (current default) | Spec Section 4.3. |
| Per-request file count | 10 files max in a single multipart submission | Stops drive-by mass-upload attempts. |
| URL length | 8 KB | Anything longer is an attack or a bug. |
| Header size | 16 KB total | Default; do not raise. |
| Query string parameters | 100 max | Prevents parameter pollution and parsing slowdowns. |
| JSON nesting depth | 32 levels max | Prevents stack-overflow style JSON. |
| JSON keys per object | 1000 max | Prevents memory exhaustion via huge flat objects. |
| Array length in JSON | 10,000 max | Same. |
| Request timeout | 30 seconds for API; 5 minutes for upload routes | Stops slowloris-style holding of connections. |
| Connections per IP (unauthenticated) | 60/min | Edge rate limit. |
| Requests per user (authenticated) | 600/min | Per-user rate limit. |

Enforce via:
1. Next.js `serverActions.bodySizeLimit` and route segment config.
2. A `withRequestLimits()` middleware wrapper at `src/lib/security/request-limits.ts`.
3. CDN/proxy config (Cloudflare or Vercel) as a backstop — the app is never the only line of defense.

### 4A.2 Input validation pipeline

Every API route, server action, and webhook handler does its inputs through this order:

1. **Schema validation with Zod** — strict mode (`.strict()`), no extra keys allowed. Reject with 422 on failure. Already standard in the project; enforce universally.
2. **Type coercion only where the schema says so** (`z.coerce.date()`, `z.coerce.number()`). Never trust client-provided types.
3. **Length & range bounds on every string and number.** No unbounded `z.string()` — always `z.string().min(1).max(N)`.
4. **Enum-or-reject** for any field with a known set of values.
5. **Allowlist before denylist.** If you find yourself writing a blocklist of bad characters, switch to an allowlist of permitted ones.
6. **UUIDs validated as UUIDs** with `z.string().uuid()`. Never accept arbitrary strings as IDs.
7. **Email validated with `z.string().email()`.** Maximum length 254 (RFC).
8. **Phone validated against a strict regex** for the supported regions, not free text.

Sanitization is **not** a substitute for validation. Validation rejects bad input; sanitization is a last resort for rendering, not storage.

### 4A.3 Specific attack classes and their controls

| Attack | Control | Where |
|---|---|---|
| **SQL injection** | Prisma parameterized queries only. Raw SQL banned in feature code (Section 2.6). The two exceptions (reporting, isolation tests) must use `Prisma.sql` tagged templates, never string concatenation. | Repository layer |
| **Prompt injection** (any LLM feature) | Treat all user input as untrusted in prompts. Wrap with explicit boundaries. Never let user content set system instructions. Strip control tokens before sending to the model. | LLM service layer if/when added |
| **NoSQL / ORM operator injection** | Zod strict mode rejects unknown keys. Never spread `req.body` directly into a Prisma `where` clause. | Validation layer |
| **Cross-site scripting (XSS)** | React escapes by default. Never use `dangerouslySetInnerHTML` on user content. If rich text is needed, sanitize server-side with `sanitize-html` allowlist. CSP header set on all responses. | UI + middleware |
| **CSRF** | Server actions use Next.js's built-in CSRF protection. Same-site cookies (`SameSite=Lax`). Webhooks verify a signature instead. | Middleware |
| **Path traversal** | Reject any filename containing `..`, `/`, `\`, null bytes, or absolute paths. Filename allowlist regex: `^[A-Za-z0-9._-]+$` after stripping the extension. S3 key is constructed server-side from `tenant-${tenantId}/${category}/${nanoid()}-${sanitized}` — user never controls the key directly. | Storage layer |
| **SSRF (server-side request forgery)** | Outbound HTTP from the server uses an allowlist of domains. Internal IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x, ::1, fc00::/7) blocked. URL parameters that become outbound requests (e.g. webhook target URLs entered by user) validated and resolved before connecting. | `src/lib/security/safe-fetch.ts` |
| **Open redirect** | Redirect URLs validated against an allowlist of host patterns. Never redirect to a user-supplied absolute URL. | Auth callback routes |
| **Mass assignment** | Zod schemas list permitted fields explicitly. Never `prisma.user.update({ data: req.body })`. Always destructure validated fields. | Repository / service layer |
| **Header injection** | Reject any user input containing `\r` or `\n` before using it in a response header. | Helper in `src/lib/security/sanitize.ts` |
| **Log injection** | Strip control characters (`\r`, `\n`, ANSI escapes) from any user-provided string before logging. Better: use structured logging (`logger.info({ event, userId })`) so user data is a field, not part of the message. | Logging layer |
| **ReDoS (regex DoS)** | No user-controlled regex patterns. All regexes in the codebase reviewed for catastrophic backtracking. Long inputs against complex regexes rejected up-front by length limit. | Validation layer |
| **Timing attacks on auth** | Use `crypto.timingSafeEqual` for token comparisons. Constant-time password verification handled by Clerk. | Auth layer |
| **Webhook spoofing** | Every webhook endpoint verifies a signature (Clerk via `svix`, S3 via SNS signature, third parties via HMAC). Reject any request without a valid signature, regardless of IP. | Webhook handlers |

### 4A.4 Upload abuse specifically (the zip-bomb class)

Uploads are the single highest-risk surface. The rules below are absolute.

1. **No automatic archive expansion.** The app does not `unzip`, `untar`, `unrar`, or process any archive format automatically. Documents are stored as the user uploaded them. If a feature ever needs to expand archives, it must use the controls in 4A.4.2 and be added to this spec.

2. **If archive extraction is ever added** (out of scope for v1, but documented so future devs do not invent their own rules):
   - **Streaming extraction only.** Never extract to memory.
   - **Per-file size limit:** 10 MB uncompressed.
   - **Total uncompressed size limit:** 100 MB.
   - **Compression ratio limit:** reject if uncompressed/compressed > 100. (Zip bombs typically have ratios of 1000:1 or higher.)
   - **File count limit:** 1000 entries max.
   - **Path safety:** reject any entry path containing `..`, absolute paths, symlinks, or null bytes.
   - **Nested archive limit:** depth ≤ 2; nested zip bombs (zip-in-zip-in-zip) are the classic exploit.
   - **Timeout:** 30 seconds total extraction time. Kill the process if exceeded.
   - **Run in an isolated process** with restricted filesystem access.

3. **Magic-bytes content-type check** — already implemented via the `file-type` package (Section 4.3). Enforce on every upload, no exceptions.

4. **Reject these types unconditionally:**
   - Executable formats: `.exe`, `.dll`, `.so`, `.dylib`, `.bat`, `.cmd`, `.ps1`, `.sh`, `.app`, `.msi`, `.scr`, `.com`, `.vbs`, `.js`, `.jar`, `.apk`, `.ipa`.
   - Server-side script formats: `.php`, `.asp`, `.aspx`, `.jsp`, `.py`, `.rb`.
   - Office formats with macros: `.docm`, `.xlsm`, `.pptm`. Plain `.docx`, `.xlsx`, `.pptx` allowed; macro-enabled rejected.
   - HTML and SVG (XSS via uploaded image): block `.html`, `.htm`, `.svg`. If SVG is required for a future feature, sanitize through `DOMPurify` server-side before storage.
   - Symlinks and special files — never accept; magic-bytes check catches these.

5. **Filename sanitization on every upload:**
   - Strip the path, keep only the basename.
   - Allowlist regex on the stem: `^[A-Za-z0-9._-]{1,200}$`.
   - Lowercase the extension.
   - Replace anything outside the allowlist with `_`.
   - If the resulting filename is empty or only dots, replace with `file`.

6. **Decompression bombs for image formats** (the lesser-known version):
   - **Image dimension limits:** reject any image with width or height > 20,000 pixels. A 64,000 × 64,000 PNG is a few KB on disk but expands to 16 GB in memory when decoded.
   - **Pixel count limit:** width × height ≤ 100 million pixels.
   - **Image decoding done in a worker with a memory cap** if any server-side processing (thumbnailing, OCR) is performed. Reject if the worker is killed by the OOM guard.
   - Use `sharp` for image processing — it has built-in pixel-limit protection. Set `sharp.concurrency(1)` for predictable resource use.

7. **PDF-specific:**
   - **Page count limit:** 1000 pages.
   - **No automatic JavaScript execution** when rendering. If rendering server-side, use a PDF library that disables JS by default (`pdfjs-dist` with `isEvalSupported: false`).
   - PDFs with embedded files: strip the embedded files before storage, or reject.

8. **Antivirus scanning** (Phase 2, but tracked here):
   - Restricted-class uploads pass ClamAV in a separate scanning service before the metadata row is committed.
   - If the scanner is unavailable, restricted uploads are queued in a quarantine state, not rejected, and visible only to admins until scanned.

9. **Quarantine bucket pattern:**
   - Uploads land in a quarantine prefix (`tenant-${tenantId}/_quarantine/${fileId}`).
   - Validation runs (magic bytes, size, dimensions, AV when present).
   - On pass, the object is moved to its final prefix and the metadata row is created.
   - On fail, the object is deleted and the user gets a clear error.
   - This pattern means even if validation has a bug, files never live alongside trusted documents.

### 4A.5 Identifier safety

User-controlled identifiers in URLs (`/drivers/:id`, `/loads/:id`) are a leak surface even with RLS, because a leaked ID hints that the resource exists.

- **All public IDs are UUIDs.** No sequential integers in URLs ever. (Section 2.7 already covers this; restated here for completeness.)
- **404 vs 403:** when a user requests a resource they cannot access, return 404, not 403. 403 confirms existence; 404 does not. Exception: when the user is in the right tenant but lacks the role, 403 is fine because they already know the resource exists.
- **Never log full IDs in user-facing error messages.** "Driver not found" not "Driver 7e3b... not found in tenant 4a8c..."

### 4A.6 Rate limits per endpoint class

In addition to the global limits in 4A.1, apply per-endpoint:

| Endpoint class | Limit | Notes |
|---|---|---|
| Login / signup / password reset | 10/min/IP, 5/hour/user | Brute-force protection. Clerk handles most of this; verify settings. |
| Webhooks (inbound) | 1000/min/source | Set per source's signature, not per IP. |
| File uploads | 60/hour/user, 20/min/user | Stops mass exfiltration attempts via uploads. |
| File downloads (restricted class) | 100/day/user | Anything more is exfiltration. Alert admin. |
| Search / list endpoints | 300/min/user | Higher to allow normal browsing. |
| PII view (decrypt) | 50/hour/user | Anything more is exfiltration. Alert admin. |
| Export endpoints | 5/hour/user | Exports are big; protect both us and the user from runaway requests. |

Rate-limit hits write to `audit_log` with `action = RATE_LIMIT_HIT`.

### 4A.7 Error responses

- Error responses are generic to users (no stack traces, no SQL fragments, no internal IDs).
- Full error detail goes to the structured log with a correlation ID.
- The user sees the correlation ID: "Something went wrong. Reference: 9c4f2-3a1e. Contact support if this keeps happening."
- Never echo user input back in an error message unless it has been HTML-escaped.

### 4A.8 Required tests for this section

- Zip bomb fixture (50KB compressed → 5GB nominal) → server rejects without extraction. (Once archive extraction is added.)
- Decompression-bomb image (64000×64000 PNG, ~1 MB) → server rejects on dimension check before decode.
- Oversized JSON (50 MB body) → 413 response.
- Deeply nested JSON (50 levels) → 422 response.
- Filename traversal (`../../etc/passwd`) → rejected.
- MIME spoof (PNG-named file with `.exe` magic bytes) → rejected.
- Macro-enabled docx (`.docm`) → rejected.
- SVG upload → rejected.
- Symlink in tarball (if archives ever supported) → rejected.
- SSRF: webhook target `http://169.254.169.254/` (cloud metadata endpoint) → outbound request blocked.
- SSRF: webhook target `http://localhost:5432/` → blocked.
- Rate limit: 11 logins in 60 seconds from one IP → 429 on the 11th.
- Rate limit: 51 PII views in 1 hour → 429 and `audit_log` row.
- Header injection (CRLF in a user-supplied display name in an email send) → rejected at the validator.
- Log injection (newlines in a free-text field) → control characters stripped in the structured log.
- Mass assignment (POST to update profile with `{ "role": "OWNER" }`) → ignored; `role` is not in the schema.
- Open redirect (auth callback with `?next=https://evil.com`) → rejected; redirected to default.

---

## Section 5 — Required Schema Conventions

### 5.1 Naming

- Tables: PascalCase in Prisma, `snake_case` in PostgreSQL (use `@@map` and `@map`).
- Columns: camelCase in Prisma, `snake_case` in DB.
- Foreign keys: `<entity>_id` (e.g. `driver_id`, `load_id`).
- Booleans: `is_*` or `has_*`.
- Timestamps: `*_at`.
- Enums: PostgreSQL native enums via Prisma `enum`.

### 5.2 Indexes

Required on every tenant-scoped table:
- `(tenant_id)` — single-column.
- `(tenant_id, <foreign_key>)` for every FK on the table.
- `(tenant_id, deleted_at)` for soft-delete filtering.
- `(tenant_id, created_at DESC)` for default list ordering.
- Add `(tenant_id, <search_column>)` for any column the UI filters by.

### 5.3 Foreign keys

- All financial / pay tables: `onDelete: Restrict`. Never cascade. Cascading deletes destroy audit history.
- Reference tables (status enums, lookup data): `onDelete: Restrict`.
- Junction tables: `onDelete: Cascade` only on the junction itself, never on the entities it joins.

---

## Section 6 — Testing Standard (Non-Negotiable)

The build is not done until all of these pass.

### 6.1 Two-tenant isolation test (per table)

For every tenant-scoped table, a Vitest test that:
1. Creates two tenants `A` and `B`.
2. Inserts a row as tenant `A`.
3. Sets tenant context to `B`.
4. Queries the table.
5. Asserts zero rows returned.
6. Repeats for `findUnique` by the known-A id (must return null, not the row).
7. Attempts an UPDATE on the known-A id as tenant B (must affect 0 rows).
8. Attempts a DELETE on the known-A id as tenant B (must affect 0 rows).

### 6.2 No-context test

Querying without any tenant context set must return zero rows or throw — never return all rows. RLS with `FORCE ROW LEVEL SECURITY` and no policy match achieves this.

### 6.3 Dropdown / list endpoint test

For every API endpoint that feeds a UI dropdown (drivers list, clients list, loads list, trucks list, etc.):
1. Seed 3 rows in tenant A, 3 rows in tenant B.
2. Authenticate as a user in tenant A.
3. Call the endpoint.
4. Assert exactly 3 rows returned, all with `tenant_id = A`.

This is the test that specifically prevents the bug currently in production.

### 6.4 RBAC negative test

For every restricted action, a test that authenticates as an under-privileged role and asserts 403.

### 6.5 Encryption round-trip test

For every field-encrypted column: encrypt, store, retrieve, decrypt, assert equal. Plus: verify the ciphertext column does not contain the plaintext as a substring.

### 6.6 Document tenant-prefix test

For each upload route:
1. As tenant A, request an upload URL.
2. Manually craft a request with an s3Key that starts with `tenant-B/`.
3. Submit to `/api/documents/multipart/part-url` and `/complete` — assert both reject with 403.

### 6.7 Audit log test

Every restricted action under test must produce an `audit_log` row with the correct shape. Asserted via DB query inside the test.

---

## Section 7 — Migration Plan for Existing Tables

Apply in this order. Each step is its own PR.

1. **Inventory.** Generate a list of every existing table and mark: tenant-scoped (Y/N), has `tenant_id` (Y/N), has RLS enabled (Y/N), has `FORCE` (Y/N), has standard timestamp columns (Y/N), has `created_by`/`updated_by` (Y/N). Output to `docs/audits/db-tenant-audit.md`.
2. **Add missing `tenant_id` columns.** Backfill via the parent relation. Add NOT NULL constraint after backfill.
3. **Add missing audit columns** (`created_by`, `updated_by`, `deleted_at`, `deleted_by`). Backfill `created_by` from any existing creator field or system user.
4. **Enable RLS + FORCE on every tenant-scoped table** with the standard `tenant_isolation_policy` and `bypass_rls_policy`.
5. **Add missing indexes** per Section 5.2.
6. **Audit every API route** that returns a list and confirm it uses the tenant-scoped Prisma client (`getTenantPrisma()` or a repository that extends `BaseRepository`). Any route using a raw client is the dropdown leak — fix it.
7. **Run the test suite from Section 6 against every table.** Failures block deployment.
8. **Move restricted PII columns to field-encrypted equivalents.** Most invasive step — schedule a maintenance window. Migration script encrypts existing values, populates `*_last4`, drops the plaintext column.
9. **Verify S3 bucket encryption.** Set `BucketEncryption: AES256` minimum; upgrade restricted-class storage to SSE-KMS with a per-tenant CMK.

---

## Section 8 — Verification Checklist (Definition of Done)

Run through this list before merging. Every item is binary — pass or fail.

- [ ] Every tenant-scoped table has `tenant_id`, `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at`, `deleted_by`.
- [ ] All timestamps are `TIMESTAMPTZ(6)`. No `timestamp without time zone` anywhere.
- [ ] `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` on every tenant-scoped table.
- [ ] `tenant_isolation_policy` and `bypass_rls_policy` exist on every tenant-scoped table.
- [ ] `app_user` role is used by the app; does not have `BYPASSRLS`.
- [ ] `current_tenant_id()` function exists and uses `current_setting('app.current_tenant_id', TRUE)`.
- [ ] Tenant context is set via `set_config(..., TRUE)` (transaction-local).
- [ ] No `$queryRaw` outside the explicitly allowed locations.
- [ ] Required indexes from Section 5.2 exist on every tenant-scoped table.
- [ ] Two-tenant isolation test exists and passes for every tenant-scoped table.
- [ ] No-context test exists and passes.
- [ ] Dropdown-leak test exists for every list endpoint and passes.
- [ ] RBAC negative tests pass.
- [ ] Field-encryption columns store ciphertext only (verified by substring scan).
- [ ] S3 buckets have encryption enabled (`AES256` or `SSE-KMS`).
- [ ] Restricted-document buckets use SSE-KMS with per-tenant CMK.
- [ ] Presigned URLs for restricted documents expire ≤15 min.
- [ ] `audit_log` rows are produced for every restricted access in tests.
- [ ] TLS 1.3 enforced; HSTS header set on responses.
- [ ] Request body size limits enforced at both Next.js and CDN/host layer (Section 4A.1).
- [ ] JSON nesting depth, key count, and array length limits enforced.
- [ ] Per-endpoint rate limits per Section 4A.6 active, with `RATE_LIMIT_HIT` audit entries on breach.
- [ ] All filenames sanitized via `sanitizeFilename` before S3 key construction.
- [ ] Magic-bytes validation in place; macro-enabled office formats and SVG rejected.
- [ ] Image dimension and pixel-count limits enforced before decoding.
- [ ] PDF page-count limit enforced; JS execution disabled in PDF processing.
- [ ] Outbound HTTP from server uses `safeFetch` with internal-IP allowlist.
- [ ] User input never echoed in error responses without escaping.
- [ ] Error responses use correlation IDs; full detail stays in structured logs.
- [ ] Control characters stripped before logging user-provided fields.
- [ ] Section 4A.8 attack-class tests all pass.
- [ ] No malicious fixtures committed to the repo (gitignore in place; bombs generated at test time).
- [ ] `npm run build` succeeds.
- [ ] `npx prisma validate` succeeds.
- [ ] `npm test` succeeds with all isolation tests included.

---

## Section 10 — Claude Code Prompts (Use in VS Code)

This prompt is what you give to Claude Code. It assumes the GSD skill is available in the project, as used for the Driver Pay and Notification specs.

### Prompt 1 — Inventory and audit (run first, always)

```
Use the GSD skill to audit the database against DatabaseSecurity_MultiTenant_Spec_v1.md. Read Sections 2, 3, 5, and 7 first.

Goal: produce a complete, accurate audit of every existing table so we know exactly what is missing before changing anything.

Build:

1. A script at scripts/audit/db-tenant-audit.ts that connects with a read-only role, queries information_schema and pg_catalog, and for every table in the public schema outputs:
   - table_name
   - is_tenant_scoped (Y/N — infer: has a tenant_id column OR is reachable from Tenant via FK chain)
   - has_tenant_id (Y/N)
   - has_rls_enabled (Y/N — pg_class.relrowsecurity)
   - has_rls_forced (Y/N — pg_class.relforcerowsecurity)
   - has_tenant_isolation_policy (Y/N)
   - has_bypass_rls_policy (Y/N)
   - has_created_at, has_created_by, has_updated_at, has_updated_by, has_deleted_at, has_deleted_by (Y/N each)
   - timestamp_column_types (list any non-TIMESTAMPTZ timestamp columns)
   - missing_indexes (compare against Section 5.2)

2. Write the result to docs/audits/db-tenant-audit.md as a clean Markdown table sorted by table name, plus a "Findings Summary" section at the top listing:
   - Total tables
   - Tenant-scoped tables
   - Tables missing tenant_id
   - Tables missing RLS
   - Tables missing FORCE RLS
   - Tables with non-TIMESTAMPTZ timestamps
   - Tables missing audit columns
   - Tables missing required indexes

3. Do NOT modify any tables. This is read-only.

Constraints:
- Connect with a role that has read-only access. If only the app role is configured, use it but explicitly do not run any DML.
- The script must be idempotent — running it twice produces the same output (assuming no schema changes between).
- Output must be deterministic — sort tables alphabetically, sort columns within each table alphabetically.

Verify before stopping:
- The script runs to completion.
- The Markdown file is valid (renders cleanly).
- Spot-check: pick 3 tables you know are tenant-scoped (User, Driver, Load) and confirm they show in the report.

Report: paste the Findings Summary section in your output.
```

### Prompt 2 — Bring all existing tenant-scoped tables to standard

```
Use the GSD skill to bring every tenant-scoped table to the standard defined in DatabaseSecurity_MultiTenant_Spec_v1.md. Read Sections 2, 5, and 7. Use docs/audits/db-tenant-audit.md (produced by Prompt 1) as the input.

Goal: every tenant-scoped table has tenant_id, the standard audit columns, RLS enabled and forced with the standard policies, and all required indexes. No data is lost. No tenant boundary is crossed during migration.

Build:

1. For each table flagged in the audit as missing tenant_id:
   - Add the column as nullable first.
   - Backfill from the parent relation in a single transaction per table.
   - Verify zero NULL rows remain.
   - Set NOT NULL.
   - Add FK to Tenant.id with onDelete: Restrict.

2. For each table missing audit columns (created_at, created_by, updated_at, updated_by, deleted_at, deleted_by):
   - Add them with sensible defaults (created_at = NOW(), created_by = system user UUID for backfilled rows).
   - For updated_at, set Prisma @updatedAt and a Postgres trigger for raw inserts.
   - Convert any existing non-TIMESTAMPTZ timestamp columns to TIMESTAMPTZ(6) preserving the UTC interpretation. If the existing data is ambiguous (no tz info), document the assumption (assume UTC) in the migration comment.

3. For each tenant-scoped table without RLS:
   - ENABLE ROW LEVEL SECURITY
   - FORCE ROW LEVEL SECURITY
   - Create tenant_isolation_policy using current_tenant_id()
   - Create bypass_rls_policy gated on app.bypass_rls = 'on'
   - Grant SELECT, INSERT, UPDATE, DELETE on the table to app_user

4. For each table missing required indexes per Section 5.2:
   - Create the index CONCURRENTLY (so production migrations don't block writes).
   - Name as idx_<table>_<columns>.

5. Update Prisma schema to match: add tenant_id field, audit fields, and any new relations. Use @db.Timestamptz(6) on every DateTime.

6. Generate a Prisma migration for the schema changes. Hand-edit the SQL to:
   - Add the RLS policies and FORCE clauses (Prisma cannot express these).
   - Use CREATE INDEX CONCURRENTLY for the new indexes.
   - Wrap the backfill in explicit transactions per table.

7. Write a migration runbook to docs/runbooks/db-standardization-migration.md including:
   - Order of operations
   - Expected duration per table (estimate)
   - Rollback steps per table
   - Smoke test queries to run after each step

Constraints:
- Do NOT touch tables flagged as system-level / not tenant-scoped (the Tenant table itself, version tables, etc.).
- Do NOT drop any column that has data.
- Do NOT change any column type in a way that requires a table rewrite without an explicit CONCURRENT plan documented in the runbook.
- The app must continue to function during the migration — additive changes only until the column is verified populated.
- Test on a clone of production data first. State in your report whether you tested on a clone.

Verify before stopping:
- npx prisma validate succeeds.
- npx prisma generate succeeds.
- The migration applies cleanly to a fresh local database.
- All Section 6.1 two-tenant isolation tests pass against the migrated schema.
- The Section 6.2 no-context test passes.
- npm run build succeeds.

Report:
- File paths of new/modified files.
- Per-table summary of what changed.
- Test output (full).
- Anything you skipped and why.
```

### Prompt 3 — Plug the dropdown leak (every list endpoint)

```
Use the GSD skill to fix the cross-tenant data leakage currently visible in dropdowns and list views. Read Sections 2.5, 2.6, 3, and 6.3 of DatabaseSecurity_MultiTenant_Spec_v1.md.

Goal: every API route, server action, and tRPC procedure that returns a list of tenant-scoped data uses the tenant-scoped Prisma client. Zero raw-client usage in feature code.

Build:

1. Scan src/ for all usages of:
   - prisma. (raw, non-tenant-scoped)
   - $queryRaw, $executeRaw, $queryRawUnsafe
   - new PrismaClient(

   Output the list to docs/audits/raw-prisma-usage.md grouped by file. For each, classify as:
   - INTENTIONAL_ALLOWED (migrations, isolation tests, explicit admin paths) — leave alone
   - LEAK_RISK — must be replaced

2. For every LEAK_RISK occurrence:
   - Replace prisma.<model>.<op>(...) with the equivalent call via getTenantPrisma() resolved from request context (Clerk session → x-tenant-id header → tenant context).
   - Or refactor to use the appropriate repository (BaseRepository subclass).
   - Do not change the function signature unless required.

3. For every list endpoint that feeds a UI dropdown:
   - Add a Vitest test per Section 6.3 (seed 3 in tenant A, 3 in tenant B, auth as A, assert exactly 3 returned, all tenant A).
   - Use the existing test harness pattern from tests/isolation/.

4. If any endpoint uses raw SQL for a legitimate reason (analytics, reporting), wrap it in a function that:
   - Calls requireTenantContext() first.
   - Asserts tenantId is present.
   - Includes the tenant_id filter explicitly in the WHERE clause.
   - Has an inline comment justifying the raw SQL.

Constraints:
- Do not change any UI component.
- Do not change response shapes — only the data source.
- Do not introduce new abstractions; use existing getTenantPrisma() and repositories.
- Every changed file must have a corresponding test added or updated.

Verify before stopping:
- The audit file lists every raw-client usage, classified.
- Every LEAK_RISK is either fixed or explicitly justified.
- All Section 6.3 dropdown tests pass.
- npm run build succeeds.
- npm test succeeds.
- Manual: log in as a user in tenant A and confirm no tenant B data appears in any dropdown observed during a 10-minute smoke test of the main screens. Note this manual step in your report.

Report:
- Count of LEAK_RISK occurrences found.
- Count fixed.
- Count justified (with justifications).
- New tests added.
- Files modified.
```

### Prompt 4 — Field-level encryption for restricted PII

```
Use the GSD skill to add field-level AES-256-GCM encryption for restricted PII columns per DatabaseSecurity_MultiTenant_Spec_v1.md Section 4. Read Sections 4.1, 4.2, 4.4, 4.5 carefully.

Goal: SSN, driver license number, passport number, EIN, bank account numbers, and date of birth are stored encrypted at rest at the field level with versioned key IDs. Plaintext is never logged. Last-4 is stored separately for UI display.

Build:

1. A crypto wrapper at src/lib/security/field-crypto.ts exposing:
   - encryptField(plaintext: string, keyId: string): { ciphertext: Buffer, iv: Buffer, tag: Buffer, keyId: string }
   - decryptField({ ciphertext, iv, tag, keyId }): string
   - Uses node:crypto, AES-256-GCM, 12-byte random IV per call, 16-byte auth tag.
   - Key resolution: in production, fetches the key from process.env.KMS_KEY_<keyId>; in dev, reads from .env.local with the same naming.
   - Throws on decrypt failure (no silent fallback).
   - Never logs the plaintext or the key.

2. A key registry at src/lib/security/key-registry.ts that holds the current active key id (CURRENT_KMS_KEY_ID env var) and the list of valid key ids (so old rows decrypt after rotation).

3. For each restricted PII column (start with Driver.ssn, Driver.driverLicenseNumber, Driver.dateOfBirth):
   - Add the encrypted-shape columns per spec Section 4.2: <field>_ciphertext, <field>_iv, <field>_tag, <field>_key_id, <field>_last4.
   - Keep the plaintext column temporarily and dual-write during transition.
   - Migrate existing rows: read plaintext, encrypt, write ciphertext + last4, verify, then in a second migration drop the plaintext column.

4. Update the Driver repository:
   - On read: decrypt on demand only if the caller has the permission. Otherwise return only the last-4.
   - On write: encrypt before insert/update.
   - Decryption emits an audit_log entry.

5. Create the audit_log table if it does not exist:
   - id UUID
   - tenant_id UUID NOT NULL (RLS-scoped)
   - user_id UUID NOT NULL
   - action TEXT NOT NULL (VIEW_PII, DOWNLOAD_DOCUMENT, UPDATE_RESTRICTED, DELETE_RESTRICTED, EXPORT)
   - resource_type TEXT NOT NULL
   - resource_id UUID NOT NULL
   - field_name TEXT NULL
   - ip_address INET NULL
   - user_agent TEXT NULL
   - created_at TIMESTAMPTZ(6) NOT NULL
   - RLS enabled, FORCE enabled, append-only (REVOKE UPDATE, DELETE from app_user).

6. Tests per Section 6.5:
   - Encrypt-decrypt round trip.
   - Ciphertext does not contain plaintext as substring.
   - Wrong key id fails to decrypt.
   - Decrypting via repository writes an audit_log row.
   - last4 is correctly populated.

Constraints:
- Never log plaintext PII, the encryption key, or the IV in plaintext (IVs are non-secret but logging them is noisy and unnecessary).
- Never accept the key from a request body or query string.
- Local dev key must be a random 32-byte hex string committed to .env.example with a clear placeholder; .env.local is gitignored.
- Do not change the public API shape until the migration is complete. Plaintext API fields remain during the dual-write window, then are removed in a second PR.

Verify before stopping:
- All Section 6.5 tests pass.
- npm run build succeeds.
- No occurrence of console.log(driver.ssn) or equivalent in the codebase (grep and confirm).
- npx prisma validate succeeds.
- Migration applies cleanly.

Report:
- File paths of new/modified files.
- Columns migrated and rows affected.
- Test output.
- Confirmation of grep result for plaintext PII logging.
```

### Prompt 5 — Document upload hardening for restricted classes

```
Use the GSD skill to extend the existing document upload system to handle the RESTRICTED document class per DatabaseSecurity_MultiTenant_Spec_v1.md Section 4.3 and 4.4.

Goal: when a driver or admin uploads a sensitive document (SSN card scan, passport, CDL, medical card, voided check, W-9, W-4, I-9), it lands in a separate restricted storage prefix with SSE-KMS encryption, shorter presigned URLs, and an audit log entry on every download.

Build:

1. Extend DocumentType enum with restricted classifications:
   - SSN_CARD, PASSPORT, CDL, MEDICAL_CARD, VOIDED_CHECK, W9, W4, I9

2. Add a derived isRestricted boolean column on Document (computed from documentType — store explicitly for query performance and RLS).

3. Update the S3 key pattern for restricted documents:
   - tenant-${tenantId}/restricted/${driverId}/${fileId}-${sanitizedFileName}
   - The driver subfolder is for ownership boundary clarity.

4. Configure the restricted bucket / prefix:
   - SSE-KMS with per-tenant CMK if KMS is available; otherwise SSE-S3 with a documented upgrade path.
   - Block public access (already default; verify and assert in a startup health check).
   - Bucket policy denies any request without `x-amz-server-side-encryption`.

5. Tighten presigned URL expiry for restricted documents:
   - Upload: 5 minutes (unchanged).
   - Download: 15 minutes (was 1 hour).
   - The download server action enforces this via the documentType lookup.

6. Audit logging:
   - Every download of a restricted document writes an audit_log row.
   - Every metadata update on a restricted document writes an audit_log row.
   - Every delete writes an audit_log row.

7. RBAC enforcement:
   - DISPATCHER cannot download restricted documents (403).
   - DRIVER can download only their own restricted documents.
   - MANAGER and OWNER can download any restricted document in their tenant.
   - Enforced in the server action, not just the UI.

8. Tests per Section 6.6 and 6.7:
   - Tenant-prefix injection test (try to download a tenant B document as tenant A — 403).
   - Driver-other-driver test (try to download driver B's SSN as driver A — 403).
   - Dispatcher restricted test (try to download as DISPATCHER — 403).
   - Audit log row created on every successful and failed access attempt.
   - Download URL expires after 15 minutes (mock the clock or check the X-Amz-Expires param).

9. UI updates:
   - When uploading, the documentType picker shows a small lock icon next to restricted options.
   - The document list shows a "Restricted" badge on restricted rows.
   - Downloading a restricted document shows a one-line notice: "This download will be recorded in the access log."

Constraints:
- Do not change the existing public-document flow (trucks/routes folders) — only add the restricted flow alongside.
- Do not remove any existing tests.
- Do not log the file content or the presigned URL anywhere.

Verify before stopping:
- All new tests pass.
- All existing storage tests still pass.
- npm run build succeeds.
- Manual smoke test: upload an SSN card as a driver, view the audit log entry, attempt to download as a different driver and confirm 403.

Report:
- File paths of new/modified files.
- New enum values, new columns, new policies.
- Test output.
- The 5 audit log entries from the manual smoke test (with PII redacted).
```

### Prompt 6 — Input and upload abuse hardening

```
Use the GSD skill to implement the input and upload hardening standard from DatabaseSecurity_MultiTenant_Spec_v1.md Section 4A. Read all of Section 4A carefully before starting.

Goal: protect the system from malicious payloads — zip bombs, oversized JSON, decompression-bomb images, path traversal, SSRF, prompt injection, log injection, mass assignment, and the other attack classes listed in Section 4A.3. Every API route, server action, and webhook gets the same baseline.

Build:

1. Request-level limits per Section 4A.1:
   - A withRequestLimits() wrapper at src/lib/security/request-limits.ts that enforces body size, JSON nesting depth, key count, and array length per the spec table.
   - Applied to every API route via a shared wrapper or middleware.
   - Configured at the Next.js level (serverActions.bodySizeLimit, route segment config) AND at the host/CDN level — both layers must agree.
   - Per-route overrides for upload endpoints (100MB) and exports (longer timeout).

2. A safe-fetch utility at src/lib/security/safe-fetch.ts:
   - Resolves the target URL.
   - Rejects internal IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x, ::1, fc00::/7, 0.0.0.0/8).
   - Rejects non-HTTP(S) schemes.
   - Validates against an allowlist of permitted outbound domains (configurable per use case).
   - Enforces a 10-second timeout and 10MB response size cap.
   - Used everywhere the server makes an HTTP request based on user-influenced input.

3. Filename and path sanitization at src/lib/security/sanitize.ts:
   - sanitizeFilename(name) — strips path, applies the allowlist regex from 4A.4.5, lowercases extension, handles empty/dot-only cases.
   - sanitizeHeader(value) — rejects \r and \n, throws on violation.
   - stripControlChars(value) — for log fields.
   - All exported and unit-tested.

4. Upload validator extensions to src/lib/storage/validate.ts:
   - Image dimension check using sharp.metadata() before any decoding — reject if width>20000, height>20000, or width*height>100M.
   - PDF page count check using pdfjs-dist with isEvalSupported:false — reject if >1000 pages.
   - Reject macro-enabled office formats by magic-bytes: refuse .docm, .xlsm, .pptm, .dotm, .xltm, .potm.
   - Reject .svg, .html, .htm uploads.
   - Reject executable formats by both extension AND magic bytes — defense in depth.
   - Apply sanitizeFilename to every upload before constructing the S3 key.

5. Quarantine bucket pattern per 4A.4.9:
   - All uploads land in tenant-${tenantId}/_quarantine/${fileId}.
   - On validation pass: copy to final location, delete from quarantine, create metadata row.
   - On validation fail: delete from quarantine, return error to user.
   - Cron job (or lifecycle rule) deletes objects in _quarantine older than 1 hour, regardless of state.

6. Rate-limiting at src/lib/security/rate-limit.ts:
   - Per-endpoint-class limits per Section 4A.6 (login, webhooks, uploads, downloads, search, PII view, exports).
   - Backed by Redis if available, fallback to in-memory for dev only.
   - Returns 429 with Retry-After header.
   - Writes audit_log row with action=RATE_LIMIT_HIT, resource_type=endpoint_class, resource_id=route.

7. Error response standardization at src/lib/security/errors.ts:
   - Helper that produces user-facing error responses: generic message + correlation ID.
   - Correlation ID is also attached to the structured log entry with full detail.
   - Never includes stack traces, SQL fragments, or internal IDs in the user-facing payload.
   - User input is never echoed back in errors unless HTML-escaped.

8. Logging hygiene at src/lib/security/logger.ts (or extend existing logger):
   - Structured logging only (JSON).
   - User-provided fields go in the data object, never interpolated into the message string.
   - stripControlChars applied to any user string included in the log payload.

9. Identifier safety:
   - Audit every route that returns 403 for missing-resource cases and switch to 404 per 4A.5.
   - Exception: 403 stays when the user is in the right tenant but the role is wrong.

10. Tests per Section 4A.8 — every test case in that list must exist and pass. Use fixtures in tests/fixtures/security/:
    - oversized.json (50MB)
    - deeply-nested.json (50 levels)
    - decompression-bomb.png (64000x64000, ~1MB on disk)
    - mime-spoof.png (PNG name, EXE magic bytes)
    - macro-enabled.docm
    - traversal-filename.txt with name "../../etc/passwd"
    - svg-payload.svg
    Note: do NOT commit an actual zip bomb fixture. Generate it at test runtime from a small script so the repo never contains a malicious payload at rest. Add tests/fixtures/security/.gitignore with "*.bomb".

11. Documentation: write docs/security/input-hardening.md summarizing what is enforced and where, so future developers find it without reading the full spec.

Constraints:
- Do not commit zip bomb or other malicious fixtures to the repo. Generate at test time.
- Do not change any existing UI component beyond what's required to display new error responses cleanly.
- Do not change the public API shape; this is hardening, not redesign.
- Performance: validation overhead per request must be <5ms p99 on a baseline route. Measure with a quick benchmark.

Verify before stopping:
- All Section 4A.8 tests pass.
- npm run build succeeds.
- npm test succeeds, full suite.
- Manual: send a 50MB JSON body to any route, observe 413. Send a request with name="../etc/passwd", observe rejection. Try uploading a 64000x64000 PNG, observe rejection on dimension check before decode.
- Performance benchmark output (p50, p95, p99 for the validation middleware) included in your report.

Report:
- File paths of new/modified files.
- Test output (full).
- Performance benchmark numbers.
- The manual test results (3 scenarios above).
- Any attack class from 4A.3 you did not address and why.
```

---

## Section 11 — Acceptance Criteria (for the whole effort)

The work is done when:

1. Prompt 1 produces a clean audit report with zero unexpected tenant-scoped tables flagged as missing tenant_id, RLS, or FORCE RLS.
2. Prompt 2 brings every flagged table to standard, migration applies cleanly, all Section 6 tests pass.
3. Prompt 3 reduces LEAK_RISK count to zero. The dropdown bug is reproduced before the change, gone after.
4. Prompt 4 has all restricted PII columns encrypted, audit log is operational, no plaintext PII appears in any log.
5. Prompt 5 has restricted documents on their own prefix, RBAC enforced, every download audit-logged.
6. Prompt 6 has all Section 4A.8 attack-class tests passing, request limits enforced at every layer, no malicious fixtures committed to the repo.
7. The Section 8 verification checklist is 100% checked.
8. A penetration-style internal test confirms two things: (a) a user in tenant A cannot retrieve any row, dropdown option, document, or PII from tenant B through any API surface, and (b) none of the attack-class fixtures in tests/fixtures/security/ produce a server crash, hang, or unintended state change.

---

## Section 12 — Notes for Future Phases (Out of Scope for v1)

- Real-time anomaly detection on the audit log (e.g. unusual download volume).
- Customer-managed encryption keys (BYOK) for enterprise tenants.
- Data residency controls (per-tenant region pinning).
- HIPAA BAA controls (currently neither required nor claimed).
- SOC 2 control mapping document (related but separate work).

Track each as a separate spec when the time comes.
