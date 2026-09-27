// Calendar dates as "YYYY-MM-DD" strings. All math happens in UTC so a server's own time zone
// never shifts a date.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isIsoDate(s: string): boolean {
  const match = ISO_DATE.exec(s);
  if (!match) return false;
  const date = toUtc(s);
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 &&
    date.getUTCDate() === Number(match[3])
  );
}

export function addDays(iso: string, days: number): string {
  const date = toUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtc(date);
}

export function mondayOf(iso: string): string {
  const daysSinceMonday = (toUtc(iso).getUTCDay() + 6) % 7;
  return addDays(iso, -daysSinceMonday);
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** Today's calendar date in `timeZone` (an IANA name); UTC when missing or invalid. */
export function todayIn(timeZone: string | undefined, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return fromUtc(now);
  }
}

/** The Monday of `param`'s week, or of today's week when `param` is missing or invalid. */
export function resolveWeek(param: string | undefined, today: string): string {
  return param && isIsoDate(param) ? mondayOf(param) : mondayOf(today);
}

const dayFormat = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const monthDayFormat = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

export function formatDay(iso: string): string {
  return dayFormat.format(toUtc(iso));
}

export function formatWeekRange(weekStart: string): string {
  return `${monthDayFormat.format(toUtc(weekStart))} – ${monthDayFormat.format(toUtc(addDays(weekStart, 6)))}`;
}
