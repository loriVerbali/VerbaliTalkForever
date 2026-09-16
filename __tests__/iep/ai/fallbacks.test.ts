import { fallbackEventAnalysis, fallbackGoalPlan, fallbackNarrative, unitNumberPairs } from '../../../src/features/iep/ai/fallbacks';

jest.mock('../../../src/utils/fetcher', () => ({ __esModule: true, default: jest.fn() }));

describe('deterministic goal-plan fallback', () => {
  it('pairs numbers with the nouns they count rather than taking the first number', () => {
    const plan = fallbackGoalPlan(
      'By the target date, the child will combine at least 2 words to express a meaningful sentence at least 5 times within a treatment session.',
    );
    expect(plan.calculation?.primaryMetricId).toBe('qualifying_sentences');
    expect(plan.calculation?.minimumWordsPerSentence).toBe(2);
    expect(plan.metrics[0].targetValue).toBe(5);
    expect(plan.targetValue).toBe(5);
    expect(plan.provider).toBe('fallback');
    expect(plan.confidenceNote).toContain('starter plan');
  });

  it('keeps a consecutive-session rule and does not invent a target when none is stated', () => {
    const plan = fallbackGoalPlan('Child will initiate an interaction with a familiar partner across 3 consecutive sessions.');
    expect(plan.calculation?.primaryMetricId).toBe('conversation_initiations');
    expect(plan.consecutiveSessions).toBe(3);
    expect(plan.metrics[0].targetValue ?? null).toBeNull();
    expect(plan.achievementRule?.type).toBe('tracking_only');
  });

  it('routes a build-time goal to the at-most metric', () => {
    const plan = fallbackGoalPlan('Child will build a sentence in under 20 seconds.');
    expect(plan.calculation?.primaryMetricId).toBe('build_seconds');
    expect(plan.calculation?.comparisonOperator).toBe('atMost');
  });

  it('extracts unit-number pairs', () => {
    expect(unitNumberPairs('at least 2 words at least 5 times across 3 consecutive sessions')).toEqual([
      { value: 2, unit: 'words' },
      { value: 5, unit: 'times' },
      { value: 3, unit: 'consecutive' },
    ]);
  });
});

describe('deterministic event fallback', () => {
  it('classifies each event locally in the network shape', () => {
    const r = fallbackEventAnalysis({ eventId: 'e1', content: 'I want more juice', source: 'boardSentence' });
    expect(r.eventId).toBe('e1');
    expect(r.status).toBe('ok');
    expect(r.communicationFunction).toBe('request');
    expect(r.isQuestion).toBe(false);
    const q = fallbackEventAnalysis({ eventId: 'e2', content: 'where is mom', source: 'boardSentence' });
    expect(q.communicationFunction).toBe('question');
    expect(q.whQuestionType).toBe('where');
  });
});

describe('facts-only narrative fallback', () => {
  it('restates supplied numbers and adds none', () => {
    const n = fallbackNarrative({
      metrics: { completed_sessions: 3 },
      sessions: [
        { session_id: 'S1', date: '2026-09-01', result: 4, target: 5 },
        { session_id: 'S2', date: '2026-09-03', result: 5, target: 5 },
        { session_id: 'S3', date: '2026-09-05', result: 6, target: 5 },
      ],
    });
    expect(n.summary).toBe('3 completed sessions are included in this view.');
    expect(n.patternInsight).toBe('The session target was met in 2 of 3 recent sessions.');
    expect(n.opportunity.length).toBeGreaterThan(0);
  });
});
