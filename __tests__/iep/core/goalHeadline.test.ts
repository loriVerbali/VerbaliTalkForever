import {
  attainment,
  latestSessionPercentOfTarget,
  sessionsRequired,
} from '../../../src/features/iep/core';

/** The headline percentage, pinned to the case that exposed it. */
describe('GoalHeadline', () => {
  it('a goal never met does not read as mostly achieved', () => {
    const figure = attainment({ qualifyingSessions: 0, statedConsecutiveSessions: 1, sessionsMeasured: 12 });
    expect(figure.percent).toBe(0);
    expect(latestSessionPercentOfTarget(4, 5)).toBe(80);
  });

  it('exceeding every session outranks never meeting it', () => {
    const met = attainment({ qualifyingSessions: 12, statedConsecutiveSessions: 1, sessionsMeasured: 12 });
    const never = attainment({ qualifyingSessions: 0, statedConsecutiveSessions: 1, sessionsMeasured: 12 });
    expect(met.percent).toBe(100);
    expect(never.percent).toBe(0);
    expect(latestSessionPercentOfTarget(8, 3)).toBe(267);
  });

  describe('the consistency rule', () => {
    it('a goal asking for one session is scored against one', () => {
      expect(sessionsRequired(1)).toBe(1);
      expect(sessionsRequired(0)).toBe(1);
      expect(
        attainment({ qualifyingSessions: 1, statedConsecutiveSessions: 1, sessionsMeasured: 4 }).percent,
      ).toBe(100);
    });

    it("a goal's own rule wins", () => {
      expect(sessionsRequired(5)).toBe(5);
      const figure = attainment({ qualifyingSessions: 4, statedConsecutiveSessions: 5, sessionsMeasured: 9 });
      expect(figure.percent).toBe(80);
      expect(figure.basis).toEqual({ kind: 'attainment', streak: 4, required: 5 });
    });

    it('a streak beyond the rule is still one hundred', () => {
      expect(
        attainment({ qualifyingSessions: 9, statedConsecutiveSessions: 3, sessionsMeasured: 9 }).percent,
      ).toBe(100);
    });
  });

  describe('absent is not zero', () => {
    it('nothing measured shows no percentage at all', () => {
      const figure = attainment({ qualifyingSessions: 0, statedConsecutiveSessions: 3, sessionsMeasured: 0 });
      expect(figure.percent).toBeNull();
      expect(figure.basis).toEqual({ kind: 'noData' });
    });

    it('no latest value or no target gives no session percentage', () => {
      expect(latestSessionPercentOfTarget(null, 5)).toBeNull();
      expect(latestSessionPercentOfTarget(4, 0)).toBeNull();
    });
  });

  describe('the caption travels with the number', () => {
    it('describes the figure it is shown with', () => {
      const figure = attainment({ qualifyingSessions: 2, statedConsecutiveSessions: 4, sessionsMeasured: 7 });
      expect(figure.caption).toBe('2 of 4 consecutive sessions at target');
      expect(figure.percent).toBe(50);
      expect(
        attainment({ qualifyingSessions: 0, statedConsecutiveSessions: 3, sessionsMeasured: 0 }).caption,
      ).toBe('No tracked sessions yet');
    });

    it('a cumulative rule counts successes rather than a streak', () => {
      const figure = attainment({
        qualifyingSessions: 8,
        statedConsecutiveSessions: 10,
        sessionsMeasured: 12,
        rule: 'cumulative',
      });
      expect(figure.percent).toBe(80);
      expect(figure.caption).toBe('8 of 10 sessions at target');

      const streaked = attainment({ qualifyingSessions: 8, statedConsecutiveSessions: 10, sessionsMeasured: 12 });
      expect(streaked.caption).toBe('8 of 10 consecutive sessions at target');
    });
  });
});
