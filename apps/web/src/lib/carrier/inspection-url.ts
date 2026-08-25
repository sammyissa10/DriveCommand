/**
 * Pull the trip id out of a mobile route's URL.
 *
 * `withMobileAuth` hands the handler only `(req, { auth })` — there is no
 * `params` — so every existing mobile route does this by hand:
 *
 *   const urlParts = req.url.split('/')
 *   const failIdx = urlParts.indexOf('fail')
 *   const stepInstanceId = failIdx > 0 ? urlParts[failIdx - 1] : null
 *
 * That is copied verbatim in `tasks/[id]/fail`, `/complete` and `/skip`. This is
 * the same idea written once, with the two things those copies get wrong fixed:
 * a query string on the final segment (`?x=1` would otherwise become part of the
 * id), and `indexOf` matching a segment that appears twice in a path.
 *
 * `after` is the segment that FOLLOWS the id — the id is the segment before the
 * LAST occurrence of it.
 */
export function dispatchIdFromUrl(url: string, after: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url.split('?')[0];
  }

  const parts = pathname.split('/').filter(Boolean);
  const idx = parts.lastIndexOf(after);
  if (idx <= 0) return null;

  const candidate = parts[idx - 1];
  return candidate && candidate !== '' ? decodeURIComponent(candidate) : null;
}
