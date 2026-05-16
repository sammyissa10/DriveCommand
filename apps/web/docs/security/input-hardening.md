# Input & Upload Abuse Hardening (Section 4A)

Implemented per `docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md` Section 4A.
Shipped in quick-349.

## Attack Class Mapping

| Attack Class | Layer | Implementation |
|---|---|---|
| Oversized body (DoS) | Platform + App | Vercel 4.5 MB serverless limit + `withRequestLimits` (1 MB JSON / 100 MB upload) |
| Deeply nested JSON | App | `withRequestLimits` depth check (max 32 levels) |
| Too many object keys | App | `withRequestLimits` key check (max 1000 keys) |
| Oversized arrays | App | `withRequestLimits` array check (max 10 000 elements) |
| Path traversal (filename) | App | `sanitizeFilename` strips `/`, `\`, null bytes, control chars; allows `[A-Za-z0-9._-]` only |
| MIME spoofing | App | `validateFileType` magic-byte check (file-type library) |
| Macro-enabled Office | App | `validateNoMacroFormats` extension check (`.docm/.xlsm/.pptm/.dotm/.xltm/.potm`) |
| SVG/HTML upload | App | `validateNoSvgHtml` extension reject |
| Decompression bomb (image) | App | `validateImageDimensions` via sharp — reads IHDR/SOF header only, not pixel data (max 20 000 px / 100 M px area) |
| Decompression bomb (PDF) | App | `validatePdfPageCount` via pdfjs-dist legacy build (max 1000 pages) |
| SSRF | App | `safeFetch` — DNS resolve + private-IP block + `redirect: 'manual'` + 10 s timeout + 10 MB cap |
| CRLF in headers | App | `sanitizeHeader` throws `SanitizationError` on `\r` or `\n` |
| Log injection | App | `structuredLog` strips control chars from all string values recursively |
| Rate-limit abuse | Infra (Upstash) | `rateLimit()` + per-endpoint-class limiters + `RATE_LIMIT_HIT` audit log |
| Tenant enumeration (403) | App | 403 → 404 conversion at `/api/documents/download-url/[id]` for tenant mismatch |
| Mass assignment | App | Zod schemas (existing, `@drivecommand/validation`) strip unknown fields by default |
| Open redirect | App | Auth callback validates same-origin before redirect (existing Supabase callback) |

## Quarantine Upload Flow

For non-restricted document uploads via presigned URL:

1. Client requests presigned URL → server returns URL with key `tenant-{tid}/_quarantine/{fileId}-{filename}`
2. Client uploads directly to R2 at the quarantine key
3. Client notifies server upload complete (or server receives multipart form data)
4. Server validates using in-memory buffer or fetches from R2:
   - Magic-byte check (`validateFileType`)
   - SVG/HTML extension reject (`validateNoSvgHtml`)
   - Macro format reject (`validateNoMacroFormats`)
   - PDF page count (`validatePdfPageCount` — if PDF)
   - Image dimension check (`validateImageDimensions` — if image)
5. On validation pass: server copies to final key `tenant-{tid}/{category}/{id}-{filename}` and deletes quarantine
6. On validation fail: server deletes quarantine object, returns 422 error
7. Hourly cron `/api/cron/cleanup-quarantine` deletes stale quarantine objects (> 1 hour old)

## Platform vs App Limits

| Limit | Platform (Vercel) | App (`withRequestLimits`) |
|---|---|---|
| Serverless body | 4.5 MB hard | — |
| JSON body | — | 1 MB (default) |
| Upload body (Server Actions global) | — | 1 MB (next.config.ts `bodySizeLimit`) |
| Upload body (upload routes explicit) | — | 100 MB (`uploadRoute: true`) |
| URL length | — | 8 192 bytes |
| Query params | — | 100 |
| JSON depth | — | 32 |
| Object keys | — | 1 000 |
| Array length | — | 10 000 |

`next.config.ts` sets `serverActions.bodySizeLimit = '1mb'` globally. Upload routes that need 100 MB explicitly opt in via `withRequestLimits({ uploadRoute: true })`.

## Rate Limit Classes (new in quick-349)

Defined in `apps/web/src/lib/security/rate-limit.ts`:

| Limiter export | Limit | Window | Key |
|---|---|---|---|
| `downloadLimiter` | 100 | 1 day | `rl:download` |
| `searchLimiter` | 300 | 1 min | `rl:search` |
| `piiViewLimiter` | 50 | 1 hour | `rl:pii` |
| `exportLimiter` | 5 | 1 hour | `rl:export` |
| `webhookLimiter` | 1 000 | 1 min | `rl:webhook` |

All use sliding window algorithm via Upstash Redis. Gracefully disabled (allow-all) when Redis is not configured (local dev).

Existing limiters in `apps/web/src/lib/rate-limit.ts` (auth, gps, geocoding, mobile, public, upload) are **not modified**.

## Files Added (quick-349)

- `apps/web/src/lib/security/sanitize.ts` — `sanitizeFilename`, `sanitizeHeader`, `stripControlChars`, `SanitizationError`
- `apps/web/src/lib/security/errors.ts` — `apiError()` with nanoid correlation ID
- `apps/web/src/lib/security/logger.ts` — `structuredLog()` with recursive control-char sanitization
- `apps/web/src/lib/security/request-limits.ts` — `withRequestLimits()`, `getParsedBody()`
- `apps/web/src/lib/security/safe-fetch.ts` — `safeFetch()`, `SsrfError`
- `apps/web/src/lib/security/rate-limit.ts` — new limiters + `auditRateLimitHit()`
- `apps/web/src/app/api/cron/cleanup-quarantine/route.ts` — hourly quarantine cleanup cron
- `vercel.json` — cron entry `0 * * * *` for cleanup-quarantine

## Files Modified (quick-349)

- `apps/web/src/lib/storage/validate.ts` — added `ValidationError`, four new validators
- `apps/web/src/app/api/documents/request-upload-url/route.ts` — quarantine prefix + `sanitizeFilename`
- `apps/web/src/app/api/documents/upload/route.ts` — quarantine → validate → promote pipeline
- `apps/web/src/app/api/documents/download-url/[id]/route.ts` — 403 → 404 for tenant mismatch
- `apps/web/next.config.ts` — `bodySizeLimit` 10 mb → 1 mb

## Deferred Items

- **Content scanning (ClamAV/VirusTotal)** — requires external service integration; out of scope
- **WAF rules at edge (Cloudflare custom rules)** — operational configuration, not code
- **Automatic EXIF GPS stripping** — could be added via `sharp` at promotion time in a future task
- **Mass-assignment Zod hardening per-route** — only representative routes verified; remaining routes inherit existing Zod schemas
- **Presigned-URL quarantine promotion endpoint** — current flow validates at server upload time (multipart); presigned URL flows rely on quarantine key being visible to server for GetObject validation. A dedicated `/api/documents/complete-upload` endpoint should be added for the presigned URL flow in a follow-up task.

## Files NOT Modified (scope boundary)

Per scope: `audit-log.ts`, `field-crypto.ts`, `key-registry.ts`, `restricted-document-access.ts`, `csrf.ts`, `cron-auth.ts`, existing `lib/rate-limit.ts`, notification system, Driver Pay code, Prisma schema.
