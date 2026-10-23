import {
  FixtureSessionMetricSource,
  GoalOutcome,
  MeasurementResult,
  MetricCatalogue,
  Provenance,
  Result,
  SessionMetricSource,
  evaluateGoal,
  goalSpecification,
  measuredValue,
} from '../../../src/features/iep/core';
import { goalPlanFromPlannerResponse, parseComparisonOperator } from '../../../src/features/iep/model';
import { LiveSessionMetricSource, MemoryPersistence } from '../../../src/features/iep/store';
import { drivenSession, makeStore, plannerSentenceGoal, plannerUnmeasurableGoal } from './helpers';

const DAY = 86_400_000;

/**
 * planner reply -> normalised plan -> saved goal -> reload -> recorded session
 *   -> measurement -> progress -> the number a therapist reads
 */
describe('end to end', () => {
  it('a sentence goal travels from planner reply to a progress number', async () => {
    const plan = goalPlanFromPlannerResponse(plannerSentenceGoal)!;
    const calculation = plan.calculation!;
    expect(new Set(plan.metrics.map(m => m.id))).toEqual(
      new Set(['total_sentences', 'average_words_per_sentence', 'qualifying_sentences']),
    );
    expect(calculation.minimumWordsPerSentence).toBe(2);
    expect(calculation.requiredSessionCount).toBe(3);

    const persistence = new MemoryPersistence();
    const store = await makeStore(persistence);
    store.addGoal({
      title: plan.goalTitle,
      description: plan.goalSummary,
      targetValue: plan.targetValue,
      targetUnit: plan.targetUnit,
      timeframe: plan.timeframe,
      plan,
    });
    await store.flush();

    const reloaded = await makeStore(persistence);
    const goal = reloaded.goals.find(g => g.description === plan.goalSummary)!;
    const reloadedCalculation = goal.plan!.calculation!;
    expect(reloadedCalculation.minimumWordsPerSentence).toBe(2);
    expect(reloadedCalculation.primaryMetricId).toBe(calculation.primaryMetricId);

    const sessionIds = [0, 1, 2].map(() => drivenSession(reloaded));
    const metric = reloadedCalculation.primaryMetricId;
    const measurements = sessionIds.map((id, i) => ({
      sessionId: id,
      dateMs: (i + 1) * DAY,
      result: reloaded.measurement(metric, id, {
        minimumWordsPerSentence: reloadedCalculation.minimumWordsPerSentence,
      }),
    }));
    const target = goal.plan!.metrics.find(m => m.id === metric)?.targetValue ?? goal.targetValue;
    const outcome = evaluateGoal(
      measurements,
      goalSpecification(target, parseComparisonOperator(reloadedCalculation.comparisonOperator), reloadedCalculation.requiredSessionCount ?? 1),
    );

    expect(outcome.sessionsMeasured).toBe(3);
    expect(outcome.latestValue).toBe(2);
    expect(outcome.sessionsMeetingTarget).toBe(0);
    expect(outcome.percentOfTarget).toBe(40);
    expect(outcome.status).toEqual({ kind: 'progressing' });
    expect(reloadedCalculation.primaryMetricId).toBe('total_sentences');
  });

  it("the goal's word bar reaches the measurement", async () => {
    const plan = goalPlanFromPlannerResponse(plannerSentenceGoal)!;
    const store = await makeStore();
    store.addGoal({ title: plan.goalTitle, description: plan.goalSummary, targetValue: plan.targetValue, targetUnit: plan.targetUnit, timeframe: plan.timeframe, plan });
    const session = drivenSession(store);
    const bar = plan.calculation!.minimumWordsPerSentence!;
    expect(bar).toBe(2);
    expect(measuredValue(store.measurement(MetricCatalogue.qualifyingSentences.id, session, { minimumWordsPerSentence: bar }))).toBe(1);
    expect(measuredValue(store.measurement(MetricCatalogue.qualifyingSentences.id, session, { minimumWordsPerSentence: 3 }))).toBe(1);
  });

  it('an unmeasurable goal survives the chain and says why', async () => {
    const plan = goalPlanFromPlannerResponse(plannerUnmeasurableGoal)!;
    const persistence = new MemoryPersistence();
    const store = await makeStore(persistence);
    store.addGoal({ title: plan.goalTitle, description: plan.goalSummary, targetValue: plan.targetValue, targetUnit: plan.targetUnit, timeframe: plan.timeframe, plan });
    await store.flush();

    const reloaded = await makeStore(persistence);
    const goal = reloaded.goals.find(g => g.description === plan.goalSummary)!;
    expect(goal.plan?.metrics[0].isSupported).toBe(false);

    const session = drivenSession(reloaded);
    const result = reloaded.measurement('eye_contact_duration', session);
    expect(result.kind).toBe('unsupported');
    const reason = (result as { reason: string }).reason;
    expect(reason).toContain('eye_contact_duration');

    const outcome = evaluateGoal([{ sessionId: session, dateMs: DAY, result }], goalSpecification(5, 'atLeast', 3));
    expect(outcome.status).toEqual({ kind: 'notScorable', reason });
    expect(outcome.percentOfTarget).toBeNull();
  });

  it('a session with no activity is not a failure', async () => {
    const store = await makeStore();
    const productive = drivenSession(store);
    const empty = store.startSession();
    store.endActiveSession();
    const metric = MetricCatalogue.totalSentences.id;
    const outcome = evaluateGoal(
      [
        { sessionId: productive, dateMs: DAY, result: store.measurement(metric, productive) },
        { sessionId: empty, dateMs: 2 * DAY, result: store.measurement(metric, empty) },
      ],
      goalSpecification(2, 'atLeast', 1),
    );
    expect(outcome.sessionsMeasured).toBe(1);
    expect(outcome.sessionsMeetingTarget).toBe(1);
    expect(outcome.status).toEqual({ kind: 'achieved' });
  });
});

/** Live and synthetic sources must answer the same question the same way. */
describe('adapter parity', () => {
  it('equivalent inputs give the same outcome', async () => {
    const store = await makeStore();
    const ids = [0, 1, 2, 3].map(() => drivenSession(store));
    const metric = MetricCatalogue.totalSentences.id;
    const specification = goalSpecification(2, 'atLeast', 3);
    const outcome = (source: SessionMetricSource): GoalOutcome =>
      evaluateGoal(
        ids.map((id, i) => ({ sessionId: id, dateMs: (i + 1) * DAY, result: source.measurement(metric, id, null) })),
        specification,
      );
    const mirrored = new FixtureSessionMetricSource(
      Object.fromEntries(ids.map(id => [id, { [metric]: Result.value(2, Provenance.mock('parity')) } as Record<string, MeasurementResult>])),
    );
    expect(outcome(new LiveSessionMetricSource(() => store.snapshot()))).toEqual(outcome(mirrored));
  });

  it('provenance does not change the verdict', () => {
    const specification = goalSpecification(3, 'atLeast', 2);
    const evaluate = (provenance: Parameters<typeof Result.value>[1]) =>
      evaluateGoal(
        [1, 2, 3].map(i => ({ sessionId: `S${i}`, dateMs: i * DAY, result: Result.value(4, provenance) })),
        specification,
      );
    expect(evaluate(Provenance.recorded)).toEqual(evaluate(Provenance.mock('52-weeks')));
    expect(evaluate(Provenance.recorded)).toEqual(evaluate(Provenance.aiAssisted('planner-1')));
  });

  it('both sources refuse the same things', async () => {
    const store = await makeStore();
    const session = drivenSession(store);
    const live = new LiveSessionMetricSource(() => store.snapshot());
    const empty = new FixtureSessionMetricSource({});
    for (const source of [live, empty]) {
      expect(measuredValue(source.measurement(MetricCatalogue.totalSentences.id, 'unknown-session', null))).toBeNull();
    }
    expect(live.measurement(MetricCatalogue.conversationTurns.id, session, null).kind).toBe('unsupported');
  });
});
