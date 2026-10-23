/**
 * The one Level 2 / Level 3 split behind the Details tab, the PDF and the add-goal review
 * step: per-session measures in Level 2 whether or not they are scored, sentence
 * properties in Level 3, and the words-per-sentence metric left out only where the bar
 * already has a row of its own.
 */

import { MetricTarget } from '../../../src/features/iep/application/goalProgress';
import {
  LEVEL_1_LABEL,
  LEVEL_2_LABEL,
  LEVEL_3_LABEL,
  progressPlanLevels,
  splitPlanLevels,
} from '../../../src/features/iep/application/planLevels';
import { MetricCatalogue, MetricDefinition, Result, presentMetric } from '../../../src/features/iep/core';

type Item = { id: string; targetValue: number | null };

const definitionOf = (m: Item): MetricDefinition | undefined => MetricCatalogue.definitionFor(m.id);

const total: Item = { id: MetricCatalogue.totalSentences.id, targetValue: null };
const qualifying: Item = { id: MetricCatalogue.qualifyingSentences.id, targetValue: 5 };
const wordsPerSentence: Item = { id: MetricCatalogue.totalWordCountPerSentence.id, targetValue: 3 };
const invented: Item = { id: 'eye_contact_seconds', targetValue: 4 };

function target(id: string, targetValue: number | null): MetricTarget {
  const definition = MetricCatalogue.definitionFor(id) ?? null;
  return {
    metric: { id, name: id, category: '', definition: '', measurementMethod: '', targetValue },
    definition,
    targetValue,
    role: 'supporting',
    isSupported: definition !== null,
    result: Result.value(1),
    presentation: presentMetric(definition ?? MetricCatalogue.totalSentences, targetValue, false, Result.value(1)),
  };
}

describe('splitPlanLevels', () => {
  it('puts per-session measures in Level 2 whether or not they have a target', () => {
    const { levelTwo, levelThree } = splitPlanLevels([total, qualifying], definitionOf);
    expect(levelTwo).toEqual([total, qualifying]);
    expect(levelThree).toEqual([]);
  });

  it('puts a property of one sentence in Level 3', () => {
    const { levelTwo, levelThree } = splitPlanLevels([qualifying, wordsPerSentence], definitionOf);
    expect(levelTwo).toEqual([qualifying]);
    expect(levelThree).toEqual([wordsPerSentence]);
  });

  it('leaves the words-per-sentence metric out only when the bar already has its own row', () => {
    expect(splitPlanLevels([qualifying, wordsPerSentence], definitionOf, 3).levelThree).toEqual([]);
    expect(splitPlanLevels([qualifying, wordsPerSentence], definitionOf, null).levelThree).toEqual([wordsPerSentence]);
    expect(splitPlanLevels([qualifying, wordsPerSentence], definitionOf).levelThree).toEqual([wordsPerSentence]);
  });

  it('lists a metric the catalogue does not know in Level 2', () => {
    const { levelTwo, levelThree } = splitPlanLevels([invented], definitionOf, 3);
    expect(levelTwo).toEqual([invented]);
    expect(levelThree).toEqual([]);
  });

  it('keeps the plan order inside each level', () => {
    const { levelTwo } = splitPlanLevels([qualifying, wordsPerSentence, total], definitionOf);
    expect(levelTwo.map(m => m.id)).toEqual([qualifying.id, total.id]);
  });
});

describe('progressPlanLevels', () => {
  const metricTargets = [
    target(MetricCatalogue.qualifyingSentences.id, 5),
    target(MetricCatalogue.totalSentences.id, null),
    target(MetricCatalogue.totalWordCountPerSentence.id, 3),
  ];

  it('skips the primary measure and the metric the bar already stands for', () => {
    const { levelTwo, levelThree } = progressPlanLevels({ metricTargets, primaryMetricId: MetricCatalogue.qualifyingSentences.id, minimumWordsPerSentence: 3 });
    expect(levelTwo.map(m => m.metric.id)).toEqual([MetricCatalogue.totalSentences.id]);
    expect(levelThree).toEqual([]);
  });

  it('lists the words-per-sentence metric when the goal states no bar', () => {
    const { levelThree } = progressPlanLevels({ metricTargets, primaryMetricId: MetricCatalogue.qualifyingSentences.id, minimumWordsPerSentence: null });
    expect(levelThree.map(m => m.metric.id)).toEqual([MetricCatalogue.totalWordCountPerSentence.id]);
  });
});

describe('plan level headings', () => {
  it('say the same thing on every surface, in sentence case or caps', () => {
    expect(LEVEL_1_LABEL).toBe('Level 1 · Across the period');
    expect(LEVEL_2_LABEL).toBe('Level 2 · In each session');
    expect(LEVEL_3_LABEL).toBe('Level 3 · What makes an event count');
    expect(LEVEL_3_LABEL.toUpperCase()).toBe('LEVEL 3 · WHAT MAKES AN EVENT COUNT');
  });
});
