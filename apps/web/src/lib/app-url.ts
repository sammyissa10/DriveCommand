/**
 * Returns the canonical base URL for this app.
 *
 * Priority order:
 *   1. NEXT_PUBLIC_APP_URL — explicit config (set in .env.local for dev, Vercel env for prod)
 *   2. VERCEL_URL          — auto-injected by Vercel per-deployment (no custom domain needed)
 *   3. http://localhost:3000 — local dev safety net
 *
 * Do NOT fall back to any hardcoded production domain — dev emails must link to localhost.
 * Use this everywhere you need an absolute URL (emails, redirects, webhooks).
 */
export function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}
