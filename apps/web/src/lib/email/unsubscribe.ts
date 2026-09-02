/**
 * List-Unsubscribe headers.
 *
 * ===========================================================================
 * WHAT IS ACHIEVABLE TODAY, STATED PLAINLY
 * ===========================================================================
 * A PER-RECIPIENT unsubscribe URL is NOT achievable with the data this app has.
 * It needs a signed, unauthenticated token endpoint, and there is none: a repo
 * search finds no `/unsubscribe` route, and `NotificationSubscription` /
 * `UserNotificationPreference` are keyed by an authenticated session, not by a
 * token. Building one is DDL plus a public route, both out of scope here.
 *
 * So the https URL is APP-LEVEL — the notification preferences screen — and ONE
 * limitation still comes with it, reported rather than papered over:
 *
 *   1. `/settings/my-notifications` requires a login, so the recipient must
 *      sign in before they can act on it.
 *
 * quick-575 CLOSED the second limitation this comment used to name. The screen
 * sat behind the bare `'/settings'` prefix in `OWNER_PATHS`, so a DRIVER who
 * followed this link was redirected to `/home` and never reached a preferences
 * screen at all — which broke the link for the app's highest-volume recipient
 * class, and broke the `My Notifications` item in the driver's own account menu
 * along with it. `ANY_AUTHENTICATED_PATHS` in `lib/auth/route-access.ts` now
 * carves that one leaf out of the prefix, and the DRIVER guard consults it
 * first. Every authenticated role reaches the page.
 *
 * The `mailto:` entry is still listed FIRST, for the reason in point 1 and for
 * the RFC 8058 reason below: it is the only method that needs no session at
 * all, and clients prefer the earlier usable method.
 *
 * ===========================================================================
 * WHY List-Unsubscribe-Post IS OFF BY DEFAULT
 * ===========================================================================
 * RFC 8058 one-click means the mailbox provider POSTs to the https URI with NO
 * user session. Ours is a login-gated page: it would answer that POST with a
 * redirect to /sign-in, and Gmail records the unsubscribe as FAILED. That is
 * strictly worse than not advertising one-click — it is the same class of defect
 * as a screen claiming something it has no channel to deliver (quick-548/549).
 *
 * The header is therefore emitted ONLY when `EMAIL_ONE_CLICK_UNSUBSCRIBE_URL`
 * names a real endpoint that accepts an unauthenticated POST. Set that env var
 * and both headers switch to it with no code change.
 */

import { getAppBaseUrl } from '@/lib/app-url';

/** Where a signed-in user manages notification channels. */
const PREFERENCES_PATH = '/settings/my-notifications';

/** Always-usable fallback, and the reason mailto is listed first. */
const UNSUBSCRIBE_MAILTO = 'team@drivecommand.io';

export type UnsubscribeHeaders = {
  'List-Unsubscribe': string;
  'List-Unsubscribe-Post'?: string;
};

/**
 * Build the header pair.
 *
 * `preferencesUrl` may be supplied by a caller that knows better; when absent it
 * falls back to the app-level preferences screen.
 */
export function buildUnsubscribeHeaders(preferencesUrl?: string): UnsubscribeHeaders {
  const oneClick = process.env.EMAIL_ONE_CLICK_UNSUBSCRIBE_URL?.trim();
  const httpsUrl = oneClick || preferencesUrl || `${getAppBaseUrl()}${PREFERENCES_PATH}`;

  const headers: UnsubscribeHeaders = {
    // mailto FIRST: it is the only method that works for every recipient today.
    'List-Unsubscribe': `<mailto:${UNSUBSCRIBE_MAILTO}?subject=Unsubscribe>, <${httpsUrl}>`,
  };

  // Only advertise one-click when a real unauthenticated POST endpoint exists.
  if (oneClick) {
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  return headers;
}

export { PREFERENCES_PATH };

