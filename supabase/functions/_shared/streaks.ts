export interface HabitLike {
  cadence: 'daily' | 'weekly';
  target_per_period: number;
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function mondayOf(dateStr: string): string {
  const isoDay = (new Date(`${dateStr}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
  return addDays(dateStr, -isoDay);
}

// Mirrors the streak math in src/components/habit-row.tsx, keep both in
// sync: this is the only other place that needs to agree on what a streak is.
export function computeStreak(habit: HabitLike, entryDates: Set<string>, today: string): number {
  let streak = 0;
  if (habit.cadence === 'weekly') {
    const monday = mondayOf(today);
    for (let w = 0; w < 104; w++) {
      const weekStart = addDays(monday, -w * 7);
      let count = 0;
      for (let i = 0; i < 7; i++) {
        if (entryDates.has(addDays(weekStart, i))) count++;
      }
      if (count >= habit.target_per_period) {
        streak++;
      } else {
        if (w === 0) continue;
        break;
      }
    }
  } else {
    for (let i = 0; i < 365; i++) {
      if (entryDates.has(addDays(today, -i))) {
        streak++;
      } else {
        if (i === 0) continue;
        break;
      }
    }
  }
  return streak;
}
