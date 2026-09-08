import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyRealtimeRow, mergeById, type Syncable } from './sync-merge.ts';

const row = (id: string, updated_at: string, deleted_at: string | null = null): Syncable => ({
  id,
  updated_at,
  deleted_at,
});

const never = () => false;

test('an older echo does not clobber a newer local row', () => {
  // The device edited at :05 and has not synced; the server echoes the :00 row.
  const local = [row('a', '2026-08-01T10:00:05Z')];
  assert.deepEqual(applyRealtimeRow(local, row('a', '2026-08-01T10:00:00Z'), never), local);
});

test('a newer server row wins', () => {
  const local = [row('a', '2026-08-01T10:00:00Z')];
  const merged = applyRealtimeRow(local, row('a', '2026-08-01T10:00:05Z'), never);
  assert.equal(merged[0]?.updated_at, '2026-08-01T10:00:05Z');
});

test('a row with a pending mutation is never patched, however new the server row', () => {
  const local = [row('a', '2026-08-01T10:00:00Z')];
  const muchNewer = row('a', '2026-09-01T00:00:00Z');
  assert.deepEqual(applyRealtimeRow(local, muchNewer, (id) => id === 'a'), local);
});

test('a tombstone removes the row and leaves siblings alone', () => {
  const local = [row('a', '2026-08-01T10:00:00Z'), row('b', '2026-08-01T10:00:00Z')];
  const dead = row('a', '2026-08-01T10:00:01Z', '2026-08-01T10:00:01Z');
  assert.deepEqual(
    applyRealtimeRow(local, dead, never).map((t) => t.id),
    ['b'],
  );
});

test('an unknown row is inserted', () => {
  assert.equal(applyRealtimeRow([], row('a', '2026-08-01T10:00:00Z'), never).length, 1);
});

test('delta pull is idempotent, which is what makes the 5-minute overlap safe', () => {
  const batch = [row('a', '2026-08-01T10:00:00Z'), row('b', '2026-08-01T10:00:01Z')];
  const once = mergeById([], batch);
  assert.deepEqual(mergeById(once, batch), once);
});

test('a tombstone arriving in a delta batch deletes an existing row', () => {
  const local = [row('a', '2026-08-01T10:00:00Z')];
  const batch = [row('a', '2026-08-01T11:00:00Z', '2026-08-01T11:00:00Z')];
  assert.deepEqual(mergeById(local, batch), []);
});
