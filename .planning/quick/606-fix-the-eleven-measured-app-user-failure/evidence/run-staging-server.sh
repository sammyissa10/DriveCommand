#!/usr/bin/env bash
# quick-606 — bring `next dev` up against STAGING as `app_user`, with the tripwire armed.
#
# R11 of the plan. Both DATABASE_URL and DATABASE_URL_ADMIN must be exported:
# omitting the second makes six cron routes fail ECONNREFUSED out of getAdminDb
# and reads exactly like an application defect (quick-604 §4 threw a whole run
# away for it).
#
# Ports: .env.staging carries :6543 (Supavisor transaction mode), which is not
# reachable from this machine. Every string is repointed to :5432 and
# ?pgbouncer=true stripped.
#
# NEXT_PUBLIC_SUPABASE_* must also name staging, or /api/auth/login signs in
# against PRODUCTION's GoTrue and the fixture logins simply do not exist there.
# The anon key is a public key by design (same constant as
# scripts/seed-staging-auth.ts:76).
#
# Guard 1: only the project REF is echoed, extracted through new URL(). The
# connection strings are never printed.
#
# usage: bash run-staging-server.sh <path-to-server-log>
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$(cd "$HERE/../../../../apps/web" && pwd)"
LOG="${1:-$HERE/03-server.log}"
# Absolute — `exec` below runs after `cd "$APP_ROOT"`, and a relative redirect
# there resolves against the wrong directory and kills the server at startup.
case "$LOG" in /*|?:*) : ;; *) LOG="$(cd "$(dirname "$LOG")" && pwd)/$(basename "$LOG")";; esac

# --- read .env.staging without exporting it wholesale -----------------------
getkey() { grep -E "^$1=" "$APP_ROOT/.env.staging" | head -1 | sed -E "s/^$1=//" | tr -d '"' | tr -d '\r'; }

repoint() { echo "$1" | sed -e 's/:6543\//:5432\//' -e 's/?pgbouncer=true//'; }

DATABASE_URL="$(repoint "$(getkey STAGING_DATABASE_URL_APP_USER)")"
DATABASE_URL_ADMIN="$(repoint "$(getkey STAGING_DATABASE_URL_ADMIN)")"

if [ -z "$DATABASE_URL" ] || [ -z "$DATABASE_URL_ADMIN" ]; then
  echo "REFUSING: STAGING_DATABASE_URL_APP_USER or STAGING_DATABASE_URL_ADMIN missing" >&2
  exit 1
fi
case "$DATABASE_URL$DATABASE_URL_ADMIN" in
  *oqdhberkghtnszrkdvfm*) echo "REFUSING: a staging string names the PRODUCTION ref" >&2; exit 1;;
esac
case "$DATABASE_URL" in *wyixpgunnjmzguhggocz*) : ;; *) echo "REFUSING: DATABASE_URL does not name staging" >&2; exit 1;; esac

export DATABASE_URL DATABASE_URL_ADMIN
# DIRECT_URL in .env.local is PRODUCTION. Nothing in src/ reads it at runtime
# (grep: zero hits), but it is overridden here so a stray consumer cannot reach
# production from this shell.
export DIRECT_URL="$(repoint "$(getkey STAGING_DIRECT_URL)")"

export TENANT_CONTEXT_TRIPWIRE=on
export NEXT_PUBLIC_SUPABASE_URL="https://wyixpgunnjmzguhggocz.supabase.co"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5aXhwZ3Vubmptemd1aGdnb2N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5OTE1MzQsImV4cCI6MjEwNDU2NzUzNH0.KmTrJZtcJNIXwKlJ65-TZ2X7hVjrRG9EHNADBKCd7Zs"

# Guard 3 — no mail, no rate limiter. Upstash is deliberately left unset so
# authLimiter is null and the fixture logins cannot lock the run out of itself.
export RESEND_API_KEY=''
export GMAIL_USER=''

# A local-only value. Staging's .env.staging carries no CRON_SECRET and nothing
# deployed uses this string; the server and the harness read it from the same
# shell so the cron rows measure RLS rather than auth.
export CRON_SECRET="${CRON_SECRET:-quick606-local-staging-only}"

node -e '
  const u = new URL(process.env.DATABASE_URL);
  const a = new URL(process.env.DATABASE_URL_ADMIN);
  // On a Supavisor string the ref is the SUFFIX of the username, after the role
  // name — `app_user.<ref>`, `app_admin.<ref>`, `postgres.<ref>`. A regex
  // anchored on `postgres\.` (604-survey.ts:refOf) therefore reports UNKNOWN for
  // both of the strings this task actually uses. The role half is echoed too,
  // because "which role" is the other half of what guard 1 claims.
  // (No apostrophes in this block: it sits inside a single-quoted shell string.)
  const ref = (x) =>
    (x.username.match(/^[A-Za-z0-9_]+\.([a-z0-9]{20})$/) || [])[1] ||
    (x.hostname.match(/^db\.([a-z0-9]{20})\./) || [])[1] ||
    "UNKNOWN";
  const role = (x) => x.username.split(".")[0];
  console.log(`GUARD 1: DATABASE_URL role=${role(u)} ref=${ref(u)} port=${u.port} · DATABASE_URL_ADMIN role=${role(a)} ref=${ref(a)} port=${a.port}`);
  if (ref(u) !== "wyixpgunnjmzguhggocz" || ref(a) !== "wyixpgunnjmzguhggocz") { console.error("GUARD 1 FAILED"); process.exit(1); }
  if (role(u) !== "app_user") { console.error("GUARD 1 FAILED: DATABASE_URL is not app_user"); process.exit(1); }
' >>"$LOG" 2>&1 || { echo "GUARD 1 refused — see $LOG" >&2; exit 1; }
tail -1 "$LOG"

cd "$APP_ROOT"
exec npx next dev >>"$LOG" 2>&1
