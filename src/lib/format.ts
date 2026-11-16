/** How dates and counts are written on the site. Dates are stored as "2025-04-03" and read as UTC days. */
export const DAY = 86_400_000;

export const fmtDay = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDay = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
// en-GB abbreviates September as "Sept", unlike every other month
export const fmtShort = { format: (date: Date) => shortDay.format(date).replace('Sept', 'Sep') };
export const fmtWeekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
// en-US for the same reason
export const fmtMonth = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "2025-04-03" → that day, at midnight UTC */
export const parseDay = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00Z`);

/** Counting both the first and the last day. */
export const daysBetween = (start: string, end: string) => Math.round((+parseDay(end) - +parseDay(start)) / DAY) + 1;

/** "18 – 27 Sep 2025", or "29 Sep – 3 Oct 2025" */
export function dateRange(startDay: string, endDay: string) {
  const start = parseDay(startDay);
  const end = parseDay(endDay);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
  const from = sameMonth ? String(start.getUTCDate()) : fmtShort.format(start);
  return `${from} – ${fmtShort.format(end)} ${end.getUTCFullYear()}`;
}

export const pad = (n: number) => String(n).padStart(2, '0');
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
