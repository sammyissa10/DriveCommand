/**
 * Bounded-concurrency map.
 *
 * Spec Phase 1 item 3: "extracts pages in bounded-concurrency batches".
 *
 * A 16-page manifest fired at the model all at once will rate-limit; fired one
 * at a time it takes far too long for a driver standing at a counter. A small
 * fixed window is the middle ground.
 *
 * Unlike `Promise.all`, one rejection does not abandon the rest — every task
 * settles, because losing fifteen good pages to one bad one is exactly the
 * failure mode spec Section 14 rules out.
 */

/** Chosen to stay inside typical per-minute limits while keeping a 16-page
 *  manifest to roughly four waves. */
export const DEFAULT_CONCURRENCY = 4;

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<Array<{ ok: true; value: R } | { ok: false; error: unknown }>> {
  const results = new Array<{ ok: true; value: R } | { ok: false; error: unknown }>(items.length);
  if (items.length === 0) return results;

  const width = Math.max(1, Math.min(limit || 1, items.length));
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      try {
        results[index] = { ok: true, value: await fn(items[index], index) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  }

  await Promise.all(Array.from({ length: width }, () => worker()));
  return results;
}
