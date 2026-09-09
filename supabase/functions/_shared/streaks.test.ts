import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeStreak } from './streaks.ts';

Deno.test('weekly habit hits target this week -> streak 1', () => {
  const habit = { cadence: 'weekly' as const, target_per_period: 2 };
  const entries = new Set(['2026-09-08', '2026-09-09']);
  assertEquals(computeStreak(habit, entries, '2026-09-09'), 1);
});

Deno.test('weekly habit under target this week, but hit it last week -> streak 1', () => {
  const habit = { cadence: 'weekly' as const, target_per_period: 2 };
  const entries = new Set(['2026-09-01', '2026-09-02']); // last week only
  assertEquals(computeStreak(habit, entries, '2026-09-09'), 1);
});

Deno.test('weekly habit missed last week -> streak 0', () => {
  const habit = { cadence: 'weekly' as const, target_per_period: 2 };
  const entries = new Set(['2026-08-25']); // two weeks ago, one day only
  assertEquals(computeStreak(habit, entries, '2026-09-09'), 0);
});

Deno.test('daily habit: consecutive days including today', () => {
  const habit = { cadence: 'daily' as const, target_per_period: 1 };
  const entries = new Set(['2026-09-07', '2026-09-08', '2026-09-09']);
  assertEquals(computeStreak(habit, entries, '2026-09-09'), 3);
});

Deno.test("daily habit: today not done yet doesn't break yesterday's streak", () => {
  const habit = { cadence: 'daily' as const, target_per_period: 1 };
  const entries = new Set(['2026-09-07', '2026-09-08']);
  assertEquals(computeStreak(habit, entries, '2026-09-09'), 2);
});

Deno.test('daily habit: gap breaks the streak', () => {
  const habit = { cadence: 'daily' as const, target_per_period: 1 };
  const entries = new Set(['2026-09-06', '2026-09-08', '2026-09-09']);
  assertEquals(computeStreak(habit, entries, '2026-09-09'), 2);
});
