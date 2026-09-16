import {
  goalSessionKey,
  loadMockDataset,
  mockColumnsForGoal,
} from '../../../src/features/iep/mock/mockDataset';
import { MetricCatalogue, MockSessionMetricSource, measuredValue } from '../../../src/features/iep/core';

describe('mock datasets', () => {
  it('loads the standard dataset with 19 goals and 988 rows', () => {
    const d = loadMockDataset('standard');
    expect(d.goals).toHaveLength(19);
    let rows = 0;
    for (const list of d.sessionsByGoal.values()) {
      rows += list.length;
    }
    expect(rows).toBe(988);
    expect(d.sessions).toHaveLength(52);
    let events = 0;
    for (const list of d.eventsBySession.values()) {
      events += list.length;
    }
    expect(events).toBe(4751);
  });

  it('loads the edge dataset with 11 goals and 92 rows', () => {
    const d = loadMockDataset('edgeCases');
    expect(d.goals).toHaveLength(11);
    let rows = 0;
    for (const list of d.sessionsByGoal.values()) {
      rows += list.length;
    }
    expect(rows).toBe(92);
    let events = 0;
    for (const list of d.eventsBySession.values()) {
      events += list.length;
    }
    expect(events).toBe(3193);
  });

  it('keeps blank cells absent so missing is not zero', () => {
    const d = loadMockDataset('standard');
    const row = d.rowsByGoalSession.get(goalSessionKey('G01', 'S001'))!;
    expect(row).toBeDefined();
    expect(row.columns.total_sentences).toBeGreaterThanOrEqual(0);
    expect(Object.keys(row.columns)).not.toContain('goal_id');
  });

  it('feeds the core mock source with the same gates as live mode', () => {
    const d = loadMockDataset('standard');
    const source = new MockSessionMetricSource(mockColumnsForGoal(d, 'G04'), 'standard');
    const twoPlus = source.measurement(MetricCatalogue.qualifyingSentences.id, 'S001', 2);
    expect(measuredValue(twoPlus)).toBe(d.rowsByGoalSession.get(goalSessionKey('G04', 'S001'))!.columns.qualifying_sentences_2plus);
    expect(source.measurement(MetricCatalogue.conversationTurns.id, 'S001', null).kind).toBe('unsupported');
    expect(source.measurement(MetricCatalogue.buildSeconds.id, 'S001', null).kind).toBe('unsupported');
  });

  it('events carry pipe-separated goal ids and elapsed order', () => {
    const d = loadMockDataset('standard');
    const events = d.eventsBySession.get('S001')!;
    expect(events[0].eventType).toBe('session_started');
    expect(events[0].goalIdsSupported).toContain('G01');
    for (let i = 1; i < events.length; i += 1) {
      expect(events[i].elapsedSeconds).toBeGreaterThanOrEqual(events[i - 1].elapsedSeconds);
    }
  });
});
