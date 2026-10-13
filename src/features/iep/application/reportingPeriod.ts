/**
 * The reporting period every screen and export shares. Sessions are included when they
 * started on a calendar day inside the period, inclusive of both ends.
 */

export type ReportingPeriodPreset = '4w' | '12w' | '6m' | 'custom';

export interface ReportingPeriod {
  preset: ReportingPeriodPreset;
  /** Local start of the first day, epoch ms. */
  startMs: number;
  /** Local end of the last day (23:59:59.999), epoch ms. */
  endMs: number;
}

export const REPORTING_PERIOD_LABEL: Record<ReportingPeriodPreset, string> = {
  '4w': '4 weeks',
  '12w': '12 weeks',
  '6m': '6 months',
  custom: 'Custom',
};

export function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}

export function endOfLocalDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

function addDays(ms: number, days: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()).getTime();
}

function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  // Clamp to the last day of the target month: Aug 31 minus six months is Feb 28/29,
  // never a Date overflow into March.
  const lastDay = new Date(d.getFullYear(), d.getMonth() + months + 1, 0).getDate();
  const day = Math.min(d.getDate(), lastDay);
  return new Date(d.getFullYear(), d.getMonth() + months, day, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()).getTime();
}

/** Whole local calendar days between two instants, DST-safe. */
function calendarDaysBetween(startMs: number, endMs: number): number {
  const a = new Date(startMs);
  const b = new Date(endMs);
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 86_400_000);
}

/** Builds a period ending today (local) for a preset, or clamps a custom range. */
export function reportingPeriod(
  preset: ReportingPeriodPreset,
  nowMs: number,
  custom?: { startMs: number; endMs: number },
): ReportingPeriod {
  const end = endOfLocalDay(nowMs);
  switch (preset) {
    case '4w':
      return { preset, startMs: startOfLocalDay(addDays(end, -27)), endMs: end };
    case '12w':
      return { preset, startMs: startOfLocalDay(addDays(end, -83)), endMs: end };
    case '6m':
      return { preset, startMs: startOfLocalDay(addDays(addMonths(end, -6), 1)), endMs: end };
    case 'custom': {
      const s = custom ? startOfLocalDay(Math.min(custom.startMs, custom.endMs)) : startOfLocalDay(addDays(end, -83));
      const e = custom ? endOfLocalDay(Math.max(custom.startMs, custom.endMs)) : end;
      return { preset, startMs: s, endMs: e };
    }
  }
}

/**
 * Every recorded day through today, for figures that read "since the goal started". Not the
 * goal record's creation date: a goal added today has a lifetime of hours, and its sessions
 * may have been recorded before it existed.
 */
export function toDatePeriod(nowMs: number): ReportingPeriod {
  return { preset: 'custom', startMs: 0, endMs: endOfLocalDay(nowMs) };
}

export function isInPeriod(period: ReportingPeriod, ms: number): boolean {
  return ms >= period.startMs && ms <= period.endMs;
}

/**
 * The immediately preceding period covering the same number of calendar days. Counted
 * in days rather than milliseconds so a DST change inside either window cannot move the
 * boundary off midnight.
 */
export function previousPeriod(period: ReportingPeriod): ReportingPeriod {
  const days = calendarDaysBetween(period.startMs, period.endMs) + 1;
  const endMs = period.startMs - 1;
  return { preset: period.preset, startMs: startOfLocalDay(addDays(endMs, -(days - 1))), endMs };
}

export function isoDay(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sep 1" style. */
export function monthDay(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "Sep 1, 2026" style. */
export function humanDay(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "Jun 20 – Sep 12, 2026" or "Dec 20, 2025 – Mar 13, 2026". */
export function periodLabel(period: ReportingPeriod): string {
  const s = new Date(period.startMs);
  const e = new Date(period.endMs);
  if (s.getFullYear() === e.getFullYear()) {
    return `${MONTHS[s.getMonth()]} ${s.getDate()} – ${MONTHS[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  }
  return `${humanDay(period.startMs)} – ${humanDay(period.endMs)}`;
}

/**
 * The days of a month laid out in Sunday-first weeks for a calendar grid. Cells outside
 * the month are null, and every week has seven cells.
 */
export function monthWeeks(year: number, month: number): Array<Array<number | null>> {
  const lead = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = [];
  for (let i = 0; i < lead; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= days; d++) {
    cells.push(d);
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  const weeks: Array<Array<number | null>> = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

/**
 * Week of the year as the Evidence tab and the trend cards label it: week 1 holds
 * 1 January and weeks start on Sunday, so a label matches a wall calendar.
 */
export function weekOfYear(ms: number): number {
  const d = new Date(ms);
  const start = new Date(d.getFullYear(), 0, 1);
  // Whole calendar days, not elapsed milliseconds: a Saturday afternoon is still the same
  // week as that Saturday's midnight, and a DST change cannot shift a day across a week.
  return Math.ceil((calendarDaysBetween(start.getTime(), ms) + start.getDay() + 1) / 7);
}
