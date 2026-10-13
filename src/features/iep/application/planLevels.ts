/**
 * The three plan levels the Details tab, the PDF report and the add-goal review step all
 * show. One rule and one set of headings, so the surfaces cannot drift apart.
 */

import { MetricCatalogue, MetricDefinition } from '../core';
import { GoalProgress, MetricTarget } from './goalProgress';

/** Sentence case; call `.toUpperCase()` where the design uses caps. */
export const LEVEL_1_LABEL = 'Level 1 · Across the period';
export const LEVEL_2_LABEL = 'Level 2 · In each session';
export const LEVEL_3_LABEL = 'Level 3 · What makes an event count';

export interface PlanLevels<T> {
  /** Per-session measures, scored or only tracked. */
  levelTwo: T[];
  /** What one event must satisfy before it counts toward Level 2. */
  levelThree: T[];
}

/**
 * Splits plan metrics into Level 2 and Level 3. A metric's level follows what one
 * measurement of it describes, never whether it has a target yet: a per-session count
 * belongs in Level 2 even while it is only tracked, and a property of one sentence belongs
 * in Level 3. A metric the catalogue does not know is listed in Level 2.
 *
 * Pass `minimumWordsPerSentence` when the caller already shows the words-per-sentence bar
 * as its own Level 3 row: the "Words per sentence" metric is then left out so the bar is
 * not listed twice. Leave it null where the metric row is the only place the bar appears.
 */
export function splitPlanLevels<T>(
  items: T[],
  definitionOf: (item: T) => MetricDefinition | null | undefined,
  minimumWordsPerSentence: number | null = null,
): PlanLevels<T> {
  const levelTwo: T[] = [];
  const levelThree: T[] = [];
  for (const item of items) {
    const definition = definitionOf(item);
    if (definition?.scope !== 'sentence') {
      levelTwo.push(item);
    } else if (minimumWordsPerSentence === null || definition.id !== MetricCatalogue.totalWordCountPerSentence.id) {
      levelThree.push(item);
    }
  }
  return { levelTwo, levelThree };
}

/**
 * The plan rows of a goal's progress beside its primary measure, split by level. The
 * primary measure has its own Level 2 row and the words-per-sentence bar its own Level 3
 * row, so neither is repeated here.
 */
export function progressPlanLevels(
  p: Pick<GoalProgress, 'metricTargets' | 'primaryMetricId' | 'minimumWordsPerSentence'>,
): PlanLevels<MetricTarget> {
  return splitPlanLevels(
    p.metricTargets.filter(m => m.metric.id !== p.primaryMetricId),
    m => m.definition,
    p.minimumWordsPerSentence,
  );
}
