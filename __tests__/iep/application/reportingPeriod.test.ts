import { monthDay, previousPeriod, reportingPeriod, toDatePeriod, weekOfYear } from '../../../src/features/iep/application';

const DAY = 86_400_000;

describe('reportingPeriod', () => {
  it('the 6-month preset clamps to the month end instead of overflowing into the next month', () => {
    const end = new Date(2026, 7, 31, 12).getTime(); // Aug 31
    const period = reportingPeriod('6m', end);
    const start = new Date(period.startMs);
    expect([start.getMonth(), start.getDate()]).toEqual([2, 1]); // Mar 1, never Mar 4
  });

  it('the previous period covers the same number of calendar days and starts at local midnight', () => {
    for (const month of [2, 10]) {
      // March and November windows contain a DST change in most zones with DST.
      const period = reportingPeriod('4w', new Date(2026, month, 20, 12).getTime());
      const previous = previousPeriod(period);
      const start = new Date(previous.startMs);
      expect([start.getHours(), start.getMinutes()]).toEqual([0, 0]);
      expect(previous.endMs).toBe(period.startMs - 1);
      const days = (ms: number) => Math.round((new Date(ms).setHours(12) - new Date(previous.startMs).setHours(12)) / DAY);
      expect(days(previous.endMs) + 1).toBe(28);
    }
  });
});

describe('toDatePeriod', () => {
  it('runs from the beginning of time to the end of today, whatever the goal record says', () => {
    const period = toDatePeriod(new Date(2026, 8, 17, 15, 30).getTime());
    expect(period).toEqual({ preset: 'custom', startMs: 0, endMs: new Date(2026, 8, 17, 23, 59, 59, 999).getTime() });
  });
});

describe('monthDay', () => {
  it('gives the month and day without the year', () => {
    expect(monthDay(new Date(2026, 5, 29).getTime())).toBe('Jun 29');
  });
});

describe('weekOfYear', () => {
  it('starts week 1 on 1 January and each new week on a Sunday', () => {
    // 1 January 2026 is a Thursday; the first Sunday is the 4th.
    expect(weekOfYear(new Date(2026, 0, 1).getTime())).toBe(1);
    expect(weekOfYear(new Date(2026, 0, 3).getTime())).toBe(1);
    expect(weekOfYear(new Date(2026, 0, 4).getTime())).toBe(2);
    expect(weekOfYear(new Date(2026, 5, 28).getTime())).toBe(27);
  });

  it('labels every hour of a Saturday with the same week as that Saturday midnight', () => {
    // Saturday 3 January 2026 is the last day of week 1; Sunday the 4th starts week 2.
    const saturday = weekOfYear(new Date(2026, 0, 3).getTime());
    expect(weekOfYear(new Date(2026, 0, 3, 10).getTime())).toBe(saturday);
    expect(weekOfYear(new Date(2026, 0, 3, 23, 59).getTime())).toBe(saturday);
    expect(saturday).toBe(1);
    expect(weekOfYear(new Date(2026, 0, 4).getTime())).toBe(saturday + 1);
  });

  it('keeps wall-calendar weeks across a DST change', () => {
    // In zones with DST the elapsed time since 1 January is an hour short after the March
    // change and an hour long after the November one; the week must follow the calendar.
    expect(weekOfYear(new Date(2026, 2, 14, 23, 59).getTime())).toBe(11); // Sat 14 Mar
    expect(weekOfYear(new Date(2026, 2, 15).getTime())).toBe(12); // Sun 15 Mar
    expect(weekOfYear(new Date(2026, 9, 31, 23, 59).getTime())).toBe(44); // Sat 31 Oct
    expect(weekOfYear(new Date(2026, 10, 1).getTime())).toBe(45); // Sun 1 Nov
    expect(weekOfYear(new Date(2026, 10, 1, 23, 59).getTime())).toBe(45);
  });
});
