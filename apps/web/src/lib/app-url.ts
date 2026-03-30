/**
 * Returns the canonical base URL for this app.
 *
 * Priority order:
 *   1. APP_BASE_URL        — explicit server-side env var (set in .env.local + Vercel)
 *   2. NEXT_PUBLIC_APP_URL — legacy, kept for backwards compat
 *   3. VERCEL_URL          — auto-injected by Vercel per-deployment (no custom domain)
 *   4. localhost:3000      — local dev fallback
 *
 * Use this everywhere you need to build an absolute URL (emails, redirects, webhooks).
 * Never hardcode localhost or a domain — always call this function.
 */
export function getAppBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}
