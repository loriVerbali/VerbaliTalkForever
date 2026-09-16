import { previousPeriod, reportingPeriod, sentenceLengthShares } from '../../../src/features/iep/application';

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

describe('sentenceLengthShares', () => {
  it('matches samples to sessions by calendar day even when sessions start mid-day', () => {
    const day = new Date(2026, 8, 1).getTime();
    const sessionStarts = [day + 10 * 3_600_000, day + DAY + 14 * 3_600_000];
    const samples = [
      { dateMs: sessionStarts[0], words: 1, seconds: 3 },
      { dateMs: sessionStarts[0], words: 3, seconds: 8 },
      { dateMs: sessionStarts[1], words: 2, seconds: 5 },
    ];
    const shares = sentenceLengthShares(samples as never, sessionStarts);
    expect(shares).toEqual({ one: 1, two: 1, threePlus: 1, total: 3 });
  });
});
