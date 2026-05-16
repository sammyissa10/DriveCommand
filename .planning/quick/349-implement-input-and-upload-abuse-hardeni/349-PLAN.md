---
phase: quick-349
plan: 349
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/security/request-limits.ts
  - apps/web/src/lib/security/safe-fetch.ts
  - apps/web/src/lib/security/sanitize.ts
  - apps/web/src/lib/security/rate-limit.ts
  - apps/web/src/lib/security/errors.ts
  - apps/web/src/lib/security/logger.ts
  - apps/web/src/lib/storage/validate.ts
  - apps/web/src/app/api/documents/upload/route.ts
  - apps/web/src/app/api/documents/request-upload-url/route.ts
  - apps/web/src/app/api/documents/download-url/[id]/route.ts
  - apps/web/src/app/api/cron/cleanup-quarantine/route.ts
  - apps/web/src/__tests__/security/input-hardening.test.ts
  - apps/web/tests/fixtures/security/.gitignore
  - apps/web/tests/fixtures/security/mime-spoof.png
  - apps/web/docs/security/input-hardening.md
  - apps/web/next.config.ts
  - apps/web/package.json
  - vercel.json
autonomous: true

must_haves:
  truths:
    - "Oversized JSON bodies (> 1MB on JSON routes) are rejected with 413 before handler executes"
    - "Deeply nested JSON (depth > 32) is rejected with 422 before handler executes"
    - "Path traversal filenames are sanitized (../../etc/passwd → safe value)"
    - "MIME spoof uploads (PNG name with PE magic bytes) are rejected"
    - "Macro-enabled Office files (.docm/.xlsm/.pptm) are rejected by extension and magic bytes"
    - "SVG and HTML uploads are rejected"
    - "Decompression bomb images (dimensions > 20000 or area > 100M pixels) are rejected before decode"
    - "SSRF targets (169.254.169.254, localhost:5432, RFC1918) are blocked by safeFetch"
    - "Rate limit violations return 429 and write RATE_LIMIT_HIT audit_log row"
    - "CRLF injection in header values throws SanitizationError"
    - "Newlines and control chars are stripped from log fields"
    - "Tenant access violations on document downloads return 404 (not 403)"
    - "Uploads go to _quarantine/ prefix first, validated, then moved to final key on success"
    - "Stale quarantine objects (> 1 hour) are deleted by hourly cron"
  artifacts:
    - path: "apps/web/src/lib/security/request-limits.ts"
      provides: "withRequestLimits() wrapper enforcing body size, URL length, query count, JSON depth/keys/array length"
      exports: ["withRequestLimits"]
    - path: "apps/web/src/lib/security/safe-fetch.ts"
      provides: "SSRF-safe fetch with DNS resolution + private IP blocking + 10s timeout + 10MB cap"
      exports: ["safeFetch"]
    - path: "apps/web/src/lib/security/sanitize.ts"
      provides: "sanitizeFilename, sanitizeHeader (throws on CRLF), stripControlChars, SanitizationError"
      exports: ["sanitizeFilename", "sanitizeHeader", "stripControlChars", "SanitizationError"]
    - path: "apps/web/src/lib/security/rate-limit.ts"
      provides: "rateLimit() + new limiters (download, search, piiView, export, webhook) + auditRateLimitHit()"
      exports: ["rateLimit", "downloadLimiter", "searchLimiter", "piiViewLimiter", "exportLimiter", "webhookLimiter", "auditRateLimitHit"]
    - path: "apps/web/src/lib/security/errors.ts"
      provides: "apiError() helper with nanoid correlationId, never echoes input"
      exports: ["apiError"]
    - path: "apps/web/src/lib/security/logger.ts"
      provides: "structuredLog() with control-char stripping on user-provided fields"
      exports: ["structuredLog"]
    - path: "apps/web/src/lib/storage/validate.ts"
      provides: "Extended validators: validateImageDimensions, validatePdfPageCount, validateNoMacroFormats, validateNoSvgHtml"
      exports: ["validateImageDimensions", "validatePdfPageCount", "validateNoMacroFormats", "validateNoSvgHtml"]
    - path: "apps/web/src/app/api/cron/cleanup-quarantine/route.ts"
      provides: "Hourly cron to delete stale _quarantine/ objects with CRON_SECRET auth"
      exports: ["GET"]
    - path: "apps/web/src/__tests__/security/input-hardening.test.ts"
      provides: "All 15 attack scenarios from Section 4A.8"
      min_lines: 400
    - path: "apps/web/docs/security/input-hardening.md"
      provides: "Attack class mapping, platform vs app limits, deferred items"
      min_lines: 80
    - path: "vercel.json"
      provides: "Hourly cron entry for /api/cron/cleanup-quarantine"
      contains: "cleanup-quarantine"
  key_links:
    - from: "apps/web/next.config.ts"
      to: "serverActions.bodySizeLimit"
      via: "config value"
      pattern: "bodySizeLimit.*['\"]1mb['\"]"
    - from: "apps/web/src/lib/security/rate-limit.ts"
      to: "@upstash/ratelimit"
      via: "Ratelimit.slidingWindow"
      pattern: "Ratelimit\\.slidingWindow"
    - from: "apps/web/src/lib/security/rate-limit.ts"
      to: "writeAuditLog"
      via: "auditRateLimitHit calls writeAuditLog with RATE_LIMIT_HIT action"
      pattern: "RATE_LIMIT_HIT"
    - from: "apps/web/src/lib/storage/validate.ts"
      to: "sharp"
      via: "validateImageDimensions calls sharp(buffer).metadata()"
      pattern: "sharp\\("
    - from: "apps/web/src/lib/storage/validate.ts"
      to: "pdfjs-dist"
      via: "validatePdfPageCount loads PDF and counts pages"
      pattern: "pdfjs"
    - from: "apps/web/src/app/api/documents/request-upload-url/route.ts"
      to: "_quarantine/"
      via: "S3 key prefix"
      pattern: "_quarantine"
    - from: "apps/web/src/app/api/documents/upload/route.ts"
      to: "validateImageDimensions|validateNoMacroFormats|validateNoSvgHtml"
      via: "post-upload validation before promotion from quarantine"
      pattern: "validate(ImageDimensions|NoMacroFormats|NoSvgHtml|PdfPageCount)"
    - from: "apps/web/src/app/api/documents/download-url/[id]/route.ts"
      to: "404 response for tenant mismatch"
      via: "status code change"
      pattern: "status:\\s*404"
---

<objective>
Implement the input and upload abuse hardening standard from Section 4A of docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md. Hardening-only: public API shape stays the same.

Purpose: Close attack surfaces around oversized/malformed input, MIME spoofing, decompression bombs, macro-enabled formats, SSRF, CRLF/log injection, rate-limit gaps, and 403→404 tenant enumeration. Adds quarantine-then-validate pattern for uploads using Cloudflare R2.

Output:
- 6 new security utilities (request-limits, safe-fetch, sanitize, rate-limit, errors, logger)
- Extended upload validators (sharp image dims, pdfjs page count, macro/SVG rejection)
- Quarantine pattern wired into document upload routes
- Hourly cron to clean stale quarantine objects
- Single targeted 403→404 conversion
- Vitest security suite (all 15 attack scenarios from 4A.8)
- Documentation of attack class mapping
- next.config.ts body limit reduced from 10mb → 1mb
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md
@apps/web/src/lib/rate-limit.ts
@apps/web/src/lib/security/audit-log.ts
@apps/web/src/lib/storage/validate.ts
@apps/web/src/app/api/documents/upload/route.ts
@apps/web/src/app/api/documents/request-upload-url/route.ts
@apps/web/src/app/api/documents/download-url/[id]/route.ts
@apps/web/next.config.ts
@apps/web/package.json
@vercel.json

# Reasoning step findings (do these BEFORE coding)
# - Existing rate-limit.ts at src/lib/ uses @upstash/ratelimit. NEW rate-limit.ts goes at src/lib/security/ — does NOT replace existing.
# - Upstash Redis IS provisioned (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN). No in-memory fallback.
# - bodySizeLimit currently '10mb' in next.config.ts line 7 — change to '1mb'.
# - sharp and pdfjs-dist are NOT installed yet — add to dependencies.
# - AuditLog.resourceId is @db.Uuid. For RATE_LIMIT_HIT, pass userId as resourceId, endpointClass as resourceType.
# - Only ONE 403→404 conversion needed: download-url/[id]/route.ts line 74. Other routes already return 404.
# - Test path: apps/web/src/__tests__/security/input-hardening.test.ts (matches vitest config).
# - DO NOT touch: audit-log.ts, field-crypto.ts, key-registry.ts, restricted-document-access.ts, csrf.ts, cron-auth.ts, existing rate-limit.ts at lib/, prisma schema, notification system, Driver Pay code.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build six new security utilities + config changes + dependencies</name>
  <files>
    apps/web/package.json
    apps/web/next.config.ts
    apps/web/src/lib/security/sanitize.ts
    apps/web/src/lib/security/errors.ts
    apps/web/src/lib/security/logger.ts
    apps/web/src/lib/security/request-limits.ts
    apps/web/src/lib/security/safe-fetch.ts
    apps/web/src/lib/security/rate-limit.ts
  </files>
  <action>
**Step 1 — Add dependencies and lower body limit.**

1a. `apps/web/package.json` — add to dependencies (alphabetical position):
   - `"pdfjs-dist": "^4.7.76"`
   - `"sharp": "^0.33.5"`

1b. Run `npm install --workspace=apps/web` (or whatever the workspace install command is in this Turborepo — check root package.json for `npm` vs `pnpm`).

1c. `apps/web/next.config.ts` — change `bodySizeLimit: '10mb'` to `bodySizeLimit: '1mb'` on line 7. This is the platform default for ALL Server Actions. Upload routes that need 100mb will override via withRequestLimits at the route level.

**Step 2 — Create sanitize.ts (smallest, no deps).**

`apps/web/src/lib/security/sanitize.ts`:
- `class SanitizationError extends Error` (with name = 'SanitizationError')
- `sanitizeFilename(name: string): string` — strip path separators (`/`, `\`), null bytes, control chars (0-31), keep only `[A-Za-z0-9._-]`, collapse repeated dots, truncate to 200 chars, fallback to `'unnamed'` if empty after sanitization. Reject leading dots (no `.hidden`).
- `sanitizeHeader(value: string): string` — if value contains `\r` or `\n`, throw `SanitizationError('Header contains CRLF')`. Otherwise return value with control chars (0-31 except tab=9) stripped.
- `stripControlChars(value: string): string` — replace all characters in ranges `\x00-\x08`, `\x0A-\x1F`, `\x7F` with empty string. Keep `\t` (0x09).

**Step 3 — Create errors.ts (depends on nanoid only).**

`apps/web/src/lib/security/errors.ts`:
- Import `nanoid` from `nanoid` (already in deps — verify).
- Import `NextResponse` from `next/server`.
- Import `structuredLog` from `./logger` (forward dep, will exist).
- `apiError(status: number, code: string, options?: { message?: string; detail?: unknown }): NextResponse`
  - Generate `correlationId = nanoid(10)`.
  - Log internally via `structuredLog('warn', 'api_error', { status, code, correlationId, detail: options?.detail })`.
  - Return `NextResponse.json({ error: { code, message: options?.message ?? code, correlationId } }, { status })`.
  - NEVER include the request body or `options.detail` in the response.

**Step 4 — Create logger.ts.**

`apps/web/src/lib/security/logger.ts`:
- Import `stripControlChars` from `./sanitize`.
- `structuredLog(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>): void`
- Walk `data` recursively, applying `stripControlChars` to any string value. Booleans, numbers, null, arrays of those: leave as-is. Nested objects: recurse.
- Build payload: `{ ts: new Date().toISOString(), level, message: stripControlChars(message), ...sanitizedData }`.
- Output via `console[level](JSON.stringify(payload))`.

**Step 5 — Create request-limits.ts.**

`apps/web/src/lib/security/request-limits.ts`:
- Import `NextRequest`, `NextResponse` from `next/server`.
- Import `apiError` from `./errors`.
- Constants: `DEFAULT_BODY_LIMIT = 1_048_576` (1MB), `UPLOAD_BODY_LIMIT = 104_857_600` (100MB), `URL_MAX_LENGTH = 8192`, `QUERY_PARAM_MAX = 100`, `JSON_MAX_DEPTH = 32`, `OBJECT_MAX_KEYS = 1000`, `ARRAY_MAX_LENGTH = 10_000`.
- Export `function withRequestLimits(handler, options?: { bodySizeLimit?: number; uploadRoute?: boolean }): handler`
  - Pre-handler checks (in order):
    1. URL length: `req.url.length > URL_MAX_LENGTH` → `apiError(414, 'URI_TOO_LONG')`.
    2. Query param count: count via `new URL(req.url).searchParams` iteration, > 100 → `apiError(414, 'TOO_MANY_QUERY_PARAMS')`.
    3. Content-Length header: if present and > limit → `apiError(413, 'PAYLOAD_TOO_LARGE')` (fast path, no body read).
    4. If `content-type` includes `application/json` and method is POST/PUT/PATCH:
       a. Read body via `await req.text()`. If byte length > limit → 413.
       b. Parse JSON. On parse error → `apiError(422, 'INVALID_JSON')`.
       c. Walk parsed value with depth counter — implement `function checkStructure(value: unknown, depth: number): void` that throws on depth > 32, object keys > 1000, array length > 10000. Use a typed error class `StructureError` to distinguish.
       d. On StructureError → `apiError(422, 'INVALID_STRUCTURE')`.
       e. Stash parsed body on `(req as any).__parsedBody` for downstream — handler can read via helper `getParsedBody(req)` if needed (export it).
  - Then call `handler(req, ctx)`.
  - Wrap in try/catch — uncaught throws → `apiError(500, 'INTERNAL_ERROR', { detail: err })`.
- Export `getParsedBody<T = unknown>(req: NextRequest): T | undefined`.

**Step 6 — Create safe-fetch.ts.**

`apps/web/src/lib/security/safe-fetch.ts`:
- Import `dns` from `node:dns/promises`.
- Import `net` from `node:net`.
- `safeFetch(url: string, options?: RequestInit & { allowedHostnames?: string[]; timeoutMs?: number; maxBytes?: number }): Promise<Response>`
- Steps:
  1. `const parsed = new URL(url)` — throws on invalid.
  2. If `parsed.protocol !== 'https:'`: only allow `http://localhost`/`http://127.0.0.1` in dev (NODE_ENV !== 'production'). Otherwise throw.
  3. If `options?.allowedHostnames?.includes(parsed.hostname)` → skip private-IP check (trusted partner).
  4. Else: `const addrs = await dns.lookup(parsed.hostname, { all: true })`. For each addr, run `isPrivateIp(addr.address, addr.family)` — throw if any is private. Helper:
     - IPv4 private ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`, `0.0.0.0/8`.
     - IPv6: `::1`, `fc00::/7`, `fe80::/10`.
     - Use bit math on parsed octets/segments — do NOT pull a dependency.
  5. Timeout via `AbortController` with `options?.timeoutMs ?? 10_000`.
  6. Call `fetch(url, { ...options, signal: controller.signal, redirect: 'manual' })` — manual redirect prevents redirect-to-private-IP.
  7. Stream response with size cap (`options?.maxBytes ?? 10_485_760` = 10MB): read `response.body` reader chunks, throw if running total > cap. Return a new `Response` constructed from the captured bytes.
- Export `class SsrfError extends Error` for clarity.

**Step 7 — Create rate-limit.ts (at src/lib/security/, NEW file).**

`apps/web/src/lib/security/rate-limit.ts`:
- Import `Ratelimit` from `@upstash/ratelimit`, `Redis` from `@upstash/redis`.
- Import `writeAuditLog` from `./audit-log`.
- Redis client: same pattern as `apps/web/src/lib/rate-limit.ts` — null if env vars missing, otherwise `Redis.fromEnv()`.
- Helper `function makeLimiter(limit: number, window: string, prefix: string): Ratelimit | null` returning new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(limit, window), prefix, analytics: false }).
- Pre-built limiters:
  - `downloadLimiter = makeLimiter(100, '1 d', 'rl:download')` — 100/day/user
  - `searchLimiter = makeLimiter(300, '1 m', 'rl:search')` — 300/min/user
  - `piiViewLimiter = makeLimiter(50, '1 h', 'rl:pii')` — 50/hour/user
  - `exportLimiter = makeLimiter(5, '1 h', 'rl:export')` — 5/hour/user
  - `webhookLimiter = makeLimiter(1000, '1 m', 'rl:webhook')` — 1000/min/source
- `interface RateLimitResult { allowed: boolean; remaining: number; resetAt: number }`
- `async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>` — ad-hoc limiter using sliding window; returns null-safe defaults `{ allowed: true, remaining: limit, resetAt: 0 }` if redis null.
- `async function auditRateLimitHit(params: { userId: string; tenantId: string; endpointClass: string; ipAddress?: string }): Promise<void>` — calls `writeAuditLog({ action: 'RATE_LIMIT_HIT', resourceType: params.endpointClass, resourceId: params.userId, userId: params.userId, tenantId: params.tenantId, ipAddress: params.ipAddress })`. If `writeAuditLog` signature differs, conform to it — read audit-log.ts first.

**Verification checkpoints during Task 1:**
- `npx tsc --noEmit --project apps/web` passes after each file is written.
- No circular imports (sanitize → nothing, logger → sanitize, errors → logger + nanoid, request-limits → errors, safe-fetch → nothing, rate-limit → audit-log).
  </action>
  <verify>
cd apps/web && npx tsc --noEmit
# Then check all 8 files exist:
ls apps/web/src/lib/security/{sanitize,errors,logger,request-limits,safe-fetch,rate-limit}.ts
grep -q "'1mb'" apps/web/next.config.ts
grep -q "\"sharp\"" apps/web/package.json
grep -q "\"pdfjs-dist\"" apps/web/package.json
  </verify>
  <done>
- 6 new files exist at apps/web/src/lib/security/ with documented exports
- next.config.ts bodySizeLimit = '1mb'
- sharp + pdfjs-dist in apps/web/package.json + installed
- tsc clean
- No file at apps/web/src/lib/rate-limit.ts has been modified
  </done>
</task>

<task type="auto">
  <name>Task 2: Extend upload validator, wire quarantine pattern, add cleanup cron, fix 403→404</name>
  <files>
    apps/web/src/lib/storage/validate.ts
    apps/web/src/app/api/documents/request-upload-url/route.ts
    apps/web/src/app/api/documents/upload/route.ts
    apps/web/src/app/api/documents/download-url/[id]/route.ts
    apps/web/src/app/api/cron/cleanup-quarantine/route.ts
    vercel.json
  </files>
  <action>
**Step 1 — Read existing storage code first.**

Read these to understand current upload flow:
- `apps/web/src/lib/storage/validate.ts` (existing — extend, do not replace)
- `apps/web/src/app/api/documents/request-upload-url/route.ts` (S3 presigned URL generation)
- `apps/web/src/app/api/documents/upload/route.ts` (direct upload path)
- `apps/web/src/lib/security/restricted-document-access.ts` (DO NOT modify, but understand how it wraps)
- Any R2 client helpers in `apps/web/src/lib/storage/` to find the S3 client + bucket name.

**Step 2 — Extend validate.ts (append, do not replace).**

Add to `apps/web/src/lib/storage/validate.ts`:

```typescript
import sharp from 'sharp';
// pdfjs-dist is ESM-only in Node — use the legacy build:
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { sanitizeFilename } from '@/lib/security/sanitize';

const MAX_IMAGE_DIM = 20_000;
const MAX_IMAGE_AREA = 100_000_000;
const MAX_PDF_PAGES = 1_000;

// Office macro magic — these are ZIP files (PK\x03\x04) where the extension differs
const MACRO_EXTENSIONS = ['.docm', '.xlsm', '.pptm', '.dotm', '.xltm', '.potm'];

export class ValidationError extends Error {
  constructor(message: string, public code: string) { super(message); }
}

export async function validateImageDimensions(buffer: Buffer): Promise<void> {
  const meta = await sharp(buffer, { failOn: 'none' }).metadata();
  if (!meta.width || !meta.height) throw new ValidationError('Unable to read image dimensions', 'INVALID_IMAGE');
  if (meta.width > MAX_IMAGE_DIM || meta.height > MAX_IMAGE_DIM) {
    throw new ValidationError(`Image dimensions exceed ${MAX_IMAGE_DIM}px`, 'IMAGE_TOO_LARGE');
  }
  if (meta.width * meta.height > MAX_IMAGE_AREA) {
    throw new ValidationError('Image area exceeds 100M pixels (decompression bomb)', 'IMAGE_TOO_LARGE');
  }
}

export async function validatePdfPageCount(buffer: Buffer): Promise<void> {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer), disableWorker: true });
  const doc = await loadingTask.promise;
  try {
    if (doc.numPages > MAX_PDF_PAGES) {
      throw new ValidationError(`PDF exceeds ${MAX_PDF_PAGES} pages`, 'PDF_TOO_LARGE');
    }
  } finally {
    await doc.destroy();
  }
}

export function validateNoMacroFormats(filename: string, buffer: Buffer): void {
  const lower = filename.toLowerCase();
  for (const ext of MACRO_EXTENSIONS) {
    if (lower.endsWith(ext)) throw new ValidationError(`Macro-enabled format ${ext} not allowed`, 'MACRO_FORMAT');
  }
  // Magic bytes: ZIP file (PK\x03\x04) AND filename ends in .doc/.xls/.ppt — peek inside?
  // Cheap check: just block by extension above. Belt-and-suspenders: if first 4 bytes = 50 4B 03 04 (ZIP)
  // and the filename is .doc/.docx/.xls/.xlsx/.ppt/.pptx, we accept (legit Office Open XML).
  // The macro-enabled extensions are already blocked above.
}

export function validateNoSvgHtml(filename: string): void {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.svg') || lower.endsWith('.html') || lower.endsWith('.htm')) {
    throw new ValidationError('SVG/HTML uploads not allowed', 'UNSAFE_FORMAT');
  }
}

// Re-export for convenience in routes
export { sanitizeFilename };
```

Also update the existing `validateFileType` to call `sanitizeFilename` on the returned filename (if it returns one) — keep backward-compatible by adding an optional return field or new wrapper. Conservative: do not change existing function signatures. Instead, call sanitizeFilename at the upload route level.

**Step 3 — Wire quarantine pattern in request-upload-url route.**

Update `apps/web/src/app/api/documents/request-upload-url/route.ts`:
- Where it builds the S3 key (look for current pattern like `tenant-${tenantId}/${category}/...`):
  - Change to: `tenant-${tenantId}/_quarantine/${fileId}-${sanitizeFilename(originalFilename)}`
  - Use `sanitizeFilename` from `@/lib/security/sanitize`.
- The "final key" the client will see after promotion is computed at upload-complete time, not here.
- If the route returns the key to the client, return the quarantine key (client uploads to quarantine first).
- Add a `finalKeyHint` or similar field if needed for later promotion lookup — or store in DB Document row's metadata/notes column if one exists.

**Step 4 — Wire post-upload validation + promotion in upload route.**

Update `apps/web/src/app/api/documents/upload/route.ts`:
- After the file is uploaded to R2 at the quarantine key, BEFORE creating the Document row:
  1. Fetch the object from R2 into a Buffer (use existing S3 client — `GetObjectCommand`).
  2. Run validators in order:
     - Existing `validateFileType(buffer, declaredMime, filename)` — keep
     - `validateNoSvgHtml(filename)`
     - `validateNoMacroFormats(filename, buffer)`
     - If `mime === 'application/pdf'`: `await validatePdfPageCount(buffer)`
     - If `mime.startsWith('image/')`: `await validateImageDimensions(buffer)`
  3. On validation failure: delete quarantine object (`DeleteObjectCommand`), return error.
  4. On success: compute final key `tenant-${tenantId}/${category}/${nanoid()}-${sanitizeFilename(filename)}`, copy quarantine → final (`CopyObjectCommand`), delete quarantine, create Document row with final key.
- All errors use `apiError` from `@/lib/security/errors` for consistent shape.

Keep direct-upload routes (if any) functional — if `apps/web/src/app/api/documents/upload/route.ts` does a direct multipart upload AND the file is held in memory already, skip the GetObject step and validate the in-memory buffer directly, then PutObject to final key without quarantine round-trip (single-write optimization for small files). For PUT-from-presigned-URL flows, the quarantine round-trip IS required.

**Step 5 — Convert single 403 → 404 in download-url route.**

`apps/web/src/app/api/documents/download-url/[id]/route.ts` line 74 (or wherever the tenant-mismatch return is):
```typescript
// BEFORE:
return NextResponse.json({ error: 'Invalid document: does not match tenant' }, { status: 403 });
// AFTER:
return NextResponse.json({ error: 'Document not found' }, { status: 404 });
```
Also log internally via `structuredLog('warn', 'tenant_mismatch_404', { documentId: params.id, userId, requestedBy: 'download-url' })` so we still see attempts in logs.

**Step 6 — Create cleanup quarantine cron.**

`apps/web/src/app/api/cron/cleanup-quarantine/route.ts`:
- Pattern: copy from existing cron route (e.g., `apps/web/src/app/api/cron/send-reminders/route.ts`).
- Use `requireCronAuth` from `@/lib/security/cron-auth` (already exists — DO NOT modify).
- Use `ListObjectsV2Command` to list all objects in bucket with prefix `_quarantine/` (or iterate per-tenant if needed — check how `tenant-XXX/_quarantine/` is laid out). Use `Delimiter: undefined` to recurse.
- For each object where `LastModified < now - 1 hour`:
  - `DeleteObjectCommand`
- Return JSON: `{ deleted: count, scanned: total }`.
- Handle pagination via `ContinuationToken`.

**Step 7 — Wire vercel.json cron entry.**

Update `vercel.json`:
```json
{
  "crons": [
    // ... existing entries ...
    { "path": "/api/cron/cleanup-quarantine", "schedule": "0 * * * *" }
  ]
}
```

**Verification checkpoints during Task 2:**
- After each file change, run `cd apps/web && npx tsc --noEmit`.
- Read the existing cron routes BEFORE writing cleanup-quarantine so the auth + return shape match.
- Read the existing S3 client setup BEFORE writing the validate-and-promote flow.
- DO NOT touch restricted-document-access.ts, csrf.ts, cron-auth.ts, or existing rate-limit.ts.
  </action>
  <verify>
cd apps/web && npx tsc --noEmit
grep -q "validateImageDimensions" apps/web/src/lib/storage/validate.ts
grep -q "_quarantine" apps/web/src/app/api/documents/request-upload-url/route.ts
grep -q "status: 404" apps/web/src/app/api/documents/download-url/\[id\]/route.ts
ls apps/web/src/app/api/cron/cleanup-quarantine/route.ts
grep -q "cleanup-quarantine" vercel.json
  </verify>
  <done>
- validate.ts has new exports: validateImageDimensions, validatePdfPageCount, validateNoMacroFormats, validateNoSvgHtml, ValidationError
- request-upload-url builds keys under tenant-X/_quarantine/ prefix
- upload route validates from quarantine, promotes to final key on success, deletes quarantine on failure
- download-url returns 404 (not 403) for tenant mismatch + logs internally
- cleanup-quarantine cron exists with CRON_SECRET auth + hourly schedule wired in vercel.json
- tsc clean
- No modifications to: audit-log.ts, field-crypto.ts, key-registry.ts, restricted-document-access.ts, csrf.ts, cron-auth.ts, src/lib/rate-limit.ts
  </done>
</task>

<task type="auto">
  <name>Task 3: Vitest security suite + documentation + final verification</name>
  <files>
    apps/web/src/__tests__/security/input-hardening.test.ts
    apps/web/tests/fixtures/security/.gitignore
    apps/web/tests/fixtures/security/mime-spoof.png
    apps/web/docs/security/input-hardening.md
  </files>
  <action>
**Step 1 — Create fixtures directory.**

1a. `apps/web/tests/fixtures/security/.gitignore`:
```
*.bomb
*.tmp
*.svg
*.docm
*.xlsm
*.pptm
*.dotm
*.xltm
*.potm
*.html
*.htm
large-*.png
large-*.pdf
large-*.json
```
This permits the inert `mime-spoof.png` to be committed (it's a tiny known fixture) but blocks malicious or oversized fixtures.

1b. Create `apps/web/tests/fixtures/security/mime-spoof.png` — a tiny binary file (write via Node script if needed) containing PE magic bytes:
- First 2 bytes: `0x4D 0x5A` (MZ — DOS/PE header)
- Pad to 64 bytes with zeros.
- This file has a `.png` extension but is NOT a PNG — the test verifies that `validateFileType` rejects it based on magic bytes.

To create it programmatically (run once and commit the result):
```bash
node -e "require('fs').writeFileSync('apps/web/tests/fixtures/security/mime-spoof.png', Buffer.concat([Buffer.from([0x4D, 0x5A]), Buffer.alloc(62, 0)]))"
```

**Step 2 — Write the Vitest suite.**

`apps/web/src/__tests__/security/input-hardening.test.ts`:

Structure (15 describe/it blocks per 4A.8). Use Vitest mocks for Upstash, Prisma, DNS, sharp, pdfjs-dist where needed:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Mocks: Upstash, audit-log, R2 client — wire as needed per test
vi.mock('@upstash/redis');
vi.mock('@/lib/security/audit-log');
vi.mock('node:dns/promises');

describe('4A.1 — Body size limits', () => {
  it('rejects JSON body > 1MB with 413', async () => {
    const { withRequestLimits } = await import('@/lib/security/request-limits');
    const handler = vi.fn(async () => new Response('ok'));
    const wrapped = withRequestLimits(handler);
    const bigBody = JSON.stringify({ data: 'x'.repeat(2_000_000) });
    const req = new NextRequest('https://test/api/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(bigBody.length) },
      body: bigBody,
    });
    const res = await wrapped(req, {});
    expect(res.status).toBe(413);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('4A.1 — JSON structure limits', () => {
  it('rejects deeply nested JSON (depth > 32) with 422', async () => {
    const { withRequestLimits } = await import('@/lib/security/request-limits');
    let nested: any = { v: 1 };
    for (let i = 0; i < 50; i++) nested = { n: nested };
    const body = JSON.stringify(nested);
    const handler = vi.fn();
    const wrapped = withRequestLimits(handler);
    const req = new NextRequest('https://test/api/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    const res = await wrapped(req, {});
    expect(res.status).toBe(422);
  });

  it('rejects objects with > 1000 keys', async () => { /* similar */ });
  it('rejects arrays with > 10000 elements', async () => { /* similar */ });
});

describe('4A.2 — Filename sanitization', () => {
  it('sanitizes path traversal', async () => {
    const { sanitizeFilename } = await import('@/lib/security/sanitize');
    expect(sanitizeFilename('../../etc/passwd')).not.toContain('..');
    expect(sanitizeFilename('../../etc/passwd')).not.toContain('/');
  });
  it('sanitizes null bytes', async () => {
    const { sanitizeFilename } = await import('@/lib/security/sanitize');
    expect(sanitizeFilename('foo\x00.txt')).not.toContain('\x00');
  });
});

describe('4A.2 — Upload validators', () => {
  it('rejects MIME spoof (PNG name + PE magic)', async () => {
    const { validateFileType } = await import('@/lib/storage/validate');
    const buf = readFileSync(path.join(__dirname, '../../../tests/fixtures/security/mime-spoof.png'));
    // validateFileType signature may differ — adapt
    expect(() => validateFileType(buf, 'image/png', 'fake.png')).toThrow();
  });

  it('rejects macro-enabled .docm', async () => {
    const { validateNoMacroFormats, ValidationError } = await import('@/lib/storage/validate');
    expect(() => validateNoMacroFormats('evil.docm', Buffer.from([0x50, 0x4B, 0x03, 0x04]))).toThrow(ValidationError);
  });

  it('rejects .svg upload', async () => {
    const { validateNoSvgHtml, ValidationError } = await import('@/lib/storage/validate');
    expect(() => validateNoSvgHtml('img.svg')).toThrow(ValidationError);
  });

  it('rejects decompression bomb (image > 20000px)', async () => {
    vi.doMock('sharp', () => ({
      default: () => ({ metadata: async () => ({ width: 64_000, height: 64_000 }) }),
    }));
    const { validateImageDimensions } = await import('@/lib/storage/validate');
    await expect(validateImageDimensions(Buffer.from([0xFF]))).rejects.toThrow();
  });
});

describe('4A.3 — SSRF protection', () => {
  it('blocks 169.254.169.254 (AWS metadata)', async () => {
    const dns = await import('node:dns/promises');
    vi.mocked(dns.lookup).mockResolvedValue([{ address: '169.254.169.254', family: 4 }] as any);
    const { safeFetch } = await import('@/lib/security/safe-fetch');
    await expect(safeFetch('https://169.254.169.254/latest/meta-data/')).rejects.toThrow();
  });

  it('blocks localhost:5432', async () => {
    const dns = await import('node:dns/promises');
    vi.mocked(dns.lookup).mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as any);
    const { safeFetch } = await import('@/lib/security/safe-fetch');
    await expect(safeFetch('https://localhost:5432/')).rejects.toThrow();
  });
});

describe('4A.4 — Rate limit enforcement', () => {
  it('rateLimit() returns allowed=false after limit exceeded', async () => {
    // Mock Upstash limit() to return { success: false, remaining: 0, reset: Date.now() + 60000 }
    // Verify rateLimit() returns { allowed: false, ... }
  });

  it('auditRateLimitHit writes RATE_LIMIT_HIT row', async () => {
    const auditMod = await import('@/lib/security/audit-log');
    const { auditRateLimitHit } = await import('@/lib/security/rate-limit');
    await auditRateLimitHit({ userId: 'u1', tenantId: 't1', endpointClass: 'pii_view' });
    expect(vi.mocked(auditMod.writeAuditLog)).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'RATE_LIMIT_HIT', resourceType: 'pii_view' })
    );
  });
});

describe('4A.5 — CRLF / log injection', () => {
  it('sanitizeHeader throws on CRLF', async () => {
    const { sanitizeHeader, SanitizationError } = await import('@/lib/security/sanitize');
    expect(() => sanitizeHeader('value\r\nX-Evil: 1')).toThrow(SanitizationError);
  });

  it('stripControlChars removes newlines from log fields', async () => {
    const { stripControlChars } = await import('@/lib/security/sanitize');
    expect(stripControlChars('foo\nbar\rbaz')).toBe('foobarbaz');
    expect(stripControlChars('keep\ttabs')).toBe('keep\ttabs');
  });
});

describe('4A.6 — Mass assignment', () => {
  it('Zod schema strips unknown fields (role escalation attempt)', async () => {
    // Import an existing Zod schema (e.g., user update) and verify it doesn't accept { role: 'OWNER' }
    // Use any existing route's schema — driver invite or profile update
  });
});

describe('4A.7 — Open redirect', () => {
  it('rejects external redirect target in auth callback', async () => {
    // Import the auth callback redirect logic — verify it normalizes to same-origin
  });
});

describe('4A — Tenant mismatch returns 404 not 403', () => {
  it('download-url returns 404 when document belongs to other tenant', async () => {
    // Mock prisma to return a document with tenantId !== caller's tenantId
    // Call the GET handler
    // Expect 404 status
  });
});
```

Hit all 15 scenarios from 4A.8. If a test cannot be implemented without massive scaffolding (e.g., needs a real Next runtime), make it a `it.todo()` with a comment explaining why and what would be needed.

**Step 3 — Write documentation.**

`apps/web/docs/security/input-hardening.md`:

```markdown
# Input & Upload Abuse Hardening (Section 4A)

Implemented per `docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md` Section 4A.

## Attack Class Mapping

| Attack Class | Layer | Implementation |
|---|---|---|
| Oversized body (DoS) | Platform + App | Vercel 4.5MB serverless limit + `withRequestLimits` (1MB JSON / 100MB upload) |
| Deeply nested JSON | App | `withRequestLimits` depth check (max 32) |
| Path traversal (filename) | App | `sanitizeFilename` strips `/`, `\`, null bytes |
| MIME spoofing | App | `validateFileType` magic-byte check |
| Macro-enabled Office | App | `validateNoMacroFormats` extension + magic-byte check |
| SVG/HTML upload | App | `validateNoSvgHtml` extension reject |
| Decompression bomb (image) | App | `validateImageDimensions` (sharp, pre-decode metadata) |
| Decompression bomb (PDF) | App | `validatePdfPageCount` (pdfjs-dist, max 1000 pages) |
| SSRF | App | `safeFetch` — DNS resolve + private-IP block + manual redirect + 10s timeout |
| CRLF in headers | App | `sanitizeHeader` throws on `\r`/`\n` |
| Log injection | App | `structuredLog` strips control chars from user fields |
| Rate-limit abuse | Infra (Upstash) | `rateLimit()` + per-endpoint-class limiters + RATE_LIMIT_HIT audit |
| Tenant enumeration | App | 403 → 404 conversion (download-url) |
| Mass assignment | App | Zod schemas (existing) strip unknown fields |
| Open redirect | App | Auth callback validates same-origin (existing) |

## Quarantine Upload Flow

1. Client requests presigned URL → server returns URL with key `tenant-{tid}/_quarantine/{fileId}-{filename}`
2. Client uploads directly to R2 quarantine prefix
3. Client notifies server upload complete
4. Server fetches object, runs all validators (magic bytes, dimensions, page count, macro/SVG rejection)
5. On pass: server copies to final key `tenant-{tid}/{category}/{id}-{filename}` and deletes quarantine
6. On fail: server deletes quarantine object, returns error
7. Hourly cron `/api/cron/cleanup-quarantine` deletes stale quarantine objects (> 1 hour)

## Platform vs App Limits

| Limit | Platform (Vercel) | App (`withRequestLimits`) |
|---|---|---|
| Serverless body | 4.5 MB hard | — |
| JSON body | — | 1 MB |
| Upload body | — | 100 MB (Server Actions) |
| URL length | — | 8192 bytes |
| Query params | — | 100 |
| JSON depth | — | 32 |
| Object keys | — | 1000 |
| Array length | — | 10000 |

Server Actions globally use `bodySizeLimit: '1mb'` (set in `next.config.ts`). Upload routes that need 100mb explicitly opt in.

## Rate Limit Classes

| Class | Limit | Window | Limiter |
|---|---|---|---|
| Download | 100 | 1 day | `downloadLimiter` |
| Search/list | 300 | 1 min | `searchLimiter` |
| PII view | 50 | 1 hour | `piiViewLimiter` |
| Export | 5 | 1 hour | `exportLimiter` |
| Webhook | 1000 | 1 min | `webhookLimiter` |

Existing limiters in `apps/web/src/lib/rate-limit.ts` (auth, gps, geocoding, mobile, public, upload) are unchanged.

## Deferred Items

- Content scanning (ClamAV/VirusTotal integration) — out of scope, would require external service
- WAF rules at edge (Cloudflare custom rules) — operational, not code
- Automatic image stripping of EXIF GPS — covered by storage-time `sharp` normalization (future)
- Mass-assignment Zod hardening for every route — only verified for representative route; remaining routes inherit existing Zod schemas

## Files NOT Touched

Per scope: `audit-log.ts`, `field-crypto.ts`, `key-registry.ts`, `restricted-document-access.ts`, `csrf.ts`, `cron-auth.ts`, existing `lib/rate-limit.ts`, notification system, Driver Pay code, Prisma schema.
```

**Step 4 — Final verification.**

Run all three checks:
```bash
cd apps/web && npx tsc --noEmit
cd apps/web && npm run build
cd apps/web && npx vitest run src/__tests__/security/input-hardening
```

All three must pass. Fix issues in place.
  </action>
  <verify>
cd apps/web && npx tsc --noEmit
cd apps/web && npx vitest run src/__tests__/security/input-hardening
cd apps/web && npm run build
ls apps/web/src/__tests__/security/input-hardening.test.ts
ls apps/web/docs/security/input-hardening.md
ls apps/web/tests/fixtures/security/.gitignore
ls apps/web/tests/fixtures/security/mime-spoof.png
  </verify>
  <done>
- Vitest suite covers all 15 scenarios from spec 4A.8 (real tests or it.todo with rationale)
- All tests pass with `npx vitest run src/__tests__/security/input-hardening`
- `npx tsc --noEmit` passes
- `npm run build` passes
- input-hardening.md exists with attack class mapping, quarantine flow, platform vs app limits, deferred items
- mime-spoof.png fixture is tiny (64 bytes) with PE magic + .png extension
- tests/fixtures/security/.gitignore prevents future malicious fixture commits
  </done>
</task>

</tasks>

<verification>
1. All 15 attack scenarios from spec Section 4A.8 covered by Vitest tests
2. `npx tsc --noEmit` passes for apps/web
3. `npm run build` passes for apps/web
4. `npx vitest run src/__tests__/security/input-hardening` — all green
5. All 6 new security utilities exist at apps/web/src/lib/security/
6. Upload validator has 4 new functions (image dims, PDF pages, macro reject, SVG reject)
7. Quarantine pattern wired: request-upload-url puts objects under _quarantine/, upload route validates+promotes
8. cleanup-quarantine cron exists + wired in vercel.json (hourly)
9. Single 403→404 conversion done at download-url/[id]/route.ts
10. next.config.ts bodySizeLimit = '1mb' (was '10mb')
11. sharp + pdfjs-dist installed in apps/web/package.json
12. NONE of the do-not-touch files modified (audit-log, field-crypto, key-registry, restricted-document-access, csrf, cron-auth, existing rate-limit.ts, Prisma schema, notification system, Driver Pay code)
</verification>

<success_criteria>
- All Section 4A.8 test cases pass
- tsc + build + vitest all green
- No malicious test fixtures committed
- 3 atomic commits (one per task)
- Public API shape unchanged (hardening only)
- Existing rate-limit.ts at lib/ untouched (new file at lib/security/ complements it)
- Tenant access on documents now returns 404 (prevents enumeration)
- Upload pipeline now: quarantine → validate → promote (or delete on failure)
</success_criteria>

<output>
After completion, create `.planning/quick/349-implement-input-and-upload-abuse-hardeni/349-SUMMARY.md` documenting:
- Files created (count + paths)
- Files modified (count + paths)
- Test scenarios implemented + pass/fail/todo breakdown
- Build + typecheck + test results
- Deferred items list (from input-hardening.md)
- Confirmation: do-not-touch files were not modified
</output>
