/**
 * Cache merge logic, kept pure and free of React, Supabase, and the clock.
 *
 * This is the only code in Orbit that can silently corrupt a user's data: every
 * other failure mode is loud. Inside a hook closure it could only be exercised
 * with two devices and a flaky network — here it is exercised by sync-merge.test.ts.
 *
 * Hermes runs ES6 plus a specific allowlist. `Array.prototype.with()` is not on
 * it and throws on device while passing in Node, so this file sticks to
 * find/map/filter. See blueprint §5.7.
 */

export type Syncable = {
  id: string;
  updated_at: string;
  deleted_at: string | null;
};

/**
 * Apply one server row to the cache.
 *
 * @param isPending - whether a local mutation for this id is still in flight.
 *   Such a row is never patched: the local edit is newer than anything the
 *   server can be echoing back, and the mutation's own onSuccess will write the
 *   canonical row moments later.
 */
export function applyRealtimeRow<T extends Syncable>(
  current: T[],
  row: T,
  isPending: (id: string) => boolean,
): T[] {
  if (isPending(row.id)) return current;
  if (row.deleted_at) return current.filter((t) => t.id !== row.id);

  const existing = current.find((t) => t.id === row.id);
  if (!existing) return [row, ...current];

  // Last-write-wins on the server-authoritative timestamp. Comparing ISO-8601
  // UTC strings lexicographically is the same as comparing the instants, so
  // this needs no Date parsing — and deliberately never reads the device clock,
  // which a skewed device could otherwise use to win every write forever.
  return row.updated_at > existing.updated_at
    ? current.map((t) => (t.id === row.id ? row : t))
    : current;
}

/**
 * Merge a delta-pull batch into the cache. Idempotent, which is what makes the
 * 5-minute overlap in the pull cursor safe to re-deliver.
 */
export function mergeById<T extends Syncable>(current: T[], incoming: T[]): T[] {
  return incoming.reduce((acc, row) => applyRealtimeRow(acc, row, () => false), current);
}
