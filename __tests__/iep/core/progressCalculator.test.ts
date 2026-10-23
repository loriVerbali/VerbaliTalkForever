import {
  ComparisonDirection,
  GoalOutcome,
  Result,
  SessionMeasurement,
  evaluateGoal,
  goalSpecification,
} from '../../../src/features/iep/core';

const DAY = 86_400_000;

function sessions(values: Array<number | null>, fromDay = 1): SessionMeasurement[] {
  return values.map((value, index) => ({
    sessionId: `S${index + fromDay}`,
    dateMs: (index + fromDay) * DAY,
    result: value === null ? Result.noData('nothing recorded') : Result.value(value),
  }));
}

function spec(target: number, comparison: ComparisonDirection = 'atLeast', consecutive = 3) {
  return goalSpecification(target, comparison, consecutive);
}

/** Golden results for the numbers a therapist copies into a progress report. */
describe('evaluateGoal', () => {
  it('consistently exceeding the target is achieved', () => {
    const outcome = evaluateGoal(sessions([5, 5, 5, 5]), spec(3));
    expect(outcome.status).toEqual({ kind: 'achieved' });
    expect(outcome.percentOfTarget).toBe(100);
    expect(outcome.sessionsMeetingTarget).toBe(4);
    expect(outcome.currentStreak).toBe(4);
  });

  it('short of target throughout is progressing, not failing', () => {
    const outcome = evaluateGoal(sessions([3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4]), spec(5));
    expect(outcome.status).toEqual({ kind: 'progressing' });
    expect(outcome.percentOfTarget).toBe(80);
    expect(outcome.sessionsMeetingTarget).toBe(0);
    expect(outcome.trend).toBe('improving');
  });

  it('rising values read as improving', () => {
    const outcome = evaluateGoal(sessions([1, 2, 3, 4]), spec(3));
    expect(outcome.sessionsMeetingTarget).toBe(2);
    expect(outcome.trend).toBe('improving');
    expect(outcome.status).toEqual({ kind: 'progressing' });
  });

  it('falling values need attention', () => {
    const outcome = evaluateGoal(sessions([4, 3, 2, 1]), spec(3));
    expect(outcome.sessionsMeetingTarget).toBe(2);
    expect(outcome.trend).toBe('declining');
    expect(outcome.status).toEqual({ kind: 'needsAttention' });
  });

  it('no sessions is no data and not zero percent', () => {
    const outcome = evaluateGoal([], spec(3));
    expect(outcome.status).toEqual({ kind: 'noData' });
    expect(outcome.percentOfTarget).toBeNull();
  });

  it('achievement arrives on the session that completes the run', () => {
    expect(evaluateGoal(sessions([3, 3, 3]), spec(3, 'atLeast', 3)).status).toEqual({
      kind: 'achieved',
    });
    expect(evaluateGoal(sessions([3, 3]), spec(3, 'atLeast', 3)).status).not.toEqual({
      kind: 'achieved',
    });
  });

  it('a broken run resets the streak', () => {
    const outcome = evaluateGoal(sessions([3, 3, 2, 3, 3]), spec(3, 'atLeast', 3));
    expect(outcome.currentStreak).toBe(2);
    expect(outcome.longestStreak).toBe(2);
    expect(outcome.status).not.toEqual({ kind: 'achieved' });
  });

  it('a ceiling goal counts the low values', () => {
    const outcome = evaluateGoal(sessions([4, 3, 2]), spec(3, 'atMost'));
    expect(outcome.sessionsMeetingTarget).toBe(2);
    expect(outcome.percentOfTarget).toBe(100);
  });

  it('a ceiling goal with a slow latest session reads below 100', () => {
    const outcome = evaluateGoal(sessions([2, 6]), spec(3, 'atMost'));
    expect(outcome.percentOfTarget).toBe(50);
    expect(outcome.sessionsMeetingTarget).toBe(1);
  });

  it('fractional targets are not rounded', () => {
    const outcome = evaluateGoal(sessions([2.4, 2.5, 2.6]), spec(2.5));
    expect(outcome.sessionsMeetingTarget).toBe(2);
    expect(outcome.latestValue).toBe(2.6);
  });

  it('one strong session is not mastery', () => {
    const outcome = evaluateGoal(sessions([11]), spec(3, 'atLeast', 3));
    expect(outcome.percentOfTarget).toBe(100);
    expect(outcome.status).not.toEqual({ kind: 'achieved' });
  });

  describe('invariants', () => {
    it('percentage never leaves its range', () => {
      for (const values of [[0], [1000], [0.001], [3]]) {
        const percent = evaluateGoal(sessions(values), spec(3)).percentOfTarget;
        expect(percent).not.toBeNull();
        expect(percent!).toBeGreaterThanOrEqual(0);
        expect(percent!).toBeLessThanOrEqual(100);
      }
    });

    it('session order does not change the result', () => {
      const forwards = sessions([1, 2, 3, 4]);
      const shuffled = [forwards[2], forwards[0], forwards[3], forwards[1]];
      expect(evaluateGoal(forwards, spec(3))).toEqual(evaluateGoal(shuffled, spec(3)));
    });

    it('duplicate sessions are counted once', () => {
      const one = sessions([3]);
      const outcome = evaluateGoal([...one, ...one, ...one], spec(3, 'atLeast', 3));
      expect(outcome.sessionsMeasured).toBe(1);
      expect(outcome.status).not.toEqual({ kind: 'achieved' });
    });

    it('streak cannot exceed the number of sessions', () => {
      for (const values of [[3], [3, 3], [3, 3, 3, 3]]) {
        const outcome = evaluateGoal(sessions(values), spec(3));
        expect(outcome.currentStreak).toBeLessThanOrEqual(outcome.sessionsMeasured);
        expect(outcome.longestStreak).toBeLessThanOrEqual(outcome.sessionsMeasured);
      }
    });

    it('sessions without a measurement are not counted as misses', () => {
      const outcome = evaluateGoal(sessions([5, null, 5]), spec(3));
      expect(outcome.sessionsMeasured).toBe(2);
      expect(outcome.sessionsMeetingTarget).toBe(2);
      expect(outcome.currentStreak).toBe(2);
    });

    it('pending analysis is never a failure', () => {
      const pending: SessionMeasurement = {
        sessionId: 'S2',
        dateMs: 2 * DAY,
        result: Result.pending('awaiting AI analysis'),
      };
      const outcome = evaluateGoal([sessions([5])[0], pending], spec(3));
      expect(outcome.sessionsMeasured).toBe(1);
      expect(outcome.sessionsMeetingTarget).toBe(1);
      expect(outcome.status).not.toEqual({ kind: 'needsAttention' });
    });

    it('an unsupported metric is not scored as a failure', () => {
      const unsupported: SessionMeasurement[] = [1, 2, 3].map(i => ({
        sessionId: `S${i}`,
        dateMs: i * DAY,
        result: Result.unsupported('not in the metrics library'),
      }));
      const outcome: GoalOutcome = evaluateGoal(unsupported, spec(3));
      expect(outcome.status).toEqual({
        kind: 'notScorable',
        reason: 'not in the metrics library',
      });
      expect(outcome.percentOfTarget).toBeNull();
      expect(outcome.sessionsMeetingTarget).toBe(0);
    });

    it('too few sessions to judge a direction', () => {
      expect(evaluateGoal(sessions([3, 4]), spec(3)).trend).toBe('insufficientData');
    });

    it('flat values are stable, not improving', () => {
      expect(evaluateGoal(sessions([4, 4, 4, 4, 4, 4]), spec(3)).trend).toBe('stable');
    });

    it('one odd session does not decide the trend', () => {
      expect(evaluateGoal(sessions([4, 4, 4, 4, 4, 1]), spec(3)).trend).not.toBe('declining');
    });
  });
});

describe('trend direction', () => {
  it('a falling value is improvement for an at-most goal such as build time', () => {
    const faster = evaluateGoal(sessions([60, 55, 50, 40, 35, 32]), spec(30, 'atMost'));
    expect(faster.trend).toBe('improving');
    expect(faster.status.kind).toBe('progressing');
    const slower = evaluateGoal(sessions([15, 16, 18, 31, 33, 35]), spec(30, 'atMost'));
    expect(slower.trend).toBe('declining');
    expect(slower.status.kind).toBe('needsAttention');
  });
});
