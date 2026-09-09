// entry_date and daily-summary's "date" param are plain dates (no time), so
// they must match the device's local calendar day (toISOString() converts
// to UTC first and silently shifts to the wrong day for part of the day for
// anyone not at UTC+0).
export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
