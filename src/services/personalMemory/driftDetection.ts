// Pure drift-detection logic (PRD §8.3 — the "bananas problem"). Flags
// preference-type facts whose subject has stopped appearing in communication,
// or which have explicit contradiction evidence. Absence alone is weak
// evidence, so windows are long and remediation is a review card, never an
// automatic change.

import type {KnowledgeItemRow} from '../../types/personalMemory';

export const DRIFT_BASELINE_MIN_USES = 3;
export const DRIFT_SILENCE_DAYS = 45;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface SubjectUsage {
  /** Uses in the last 30 days. */
  last30: number;
  /** Uses in the prior 60 days (days 30..90). */
  prior60: number;
  /** Most recent use timestamp, or null if never observed. */
  lastUsedMs: number | null;
}

export interface DriftFlag {
  factId: number;
  reason: 'nonuse' | 'contradiction';
}

/** Facts eligible for usage-drift evaluation: preference-type only. */
export function isDriftEligible(fact: KnowledgeItemRow): boolean {
  return (
    fact.status === 'active' &&
    (fact.category === 'like' ||
      fact.category === 'dislike' ||
      ((fact.category === 'food' || fact.category === 'activity') &&
        fact.value === 'favorite'))
  );
}

export function computeDriftFlags(
  facts: KnowledgeItemRow[],
  usage: Map<string, SubjectUsage>,
  contradicted: Set<number>,
  nowMs: number,
): DriftFlag[] {
  const flags: DriftFlag[] = [];

  for (const fact of facts) {
    if (!isDriftEligible(fact)) {
      continue;
    }

    // Already flagged, or caregiver dismissed recently — skip.
    if (fact.review_flag === 'possibly_outdated') {
      continue;
    }
    if (fact.review_dismissed_until) {
      const until = Date.parse(fact.review_dismissed_until);
      if (!Number.isNaN(until) && until > nowMs) {
        continue;
      }
    }

    if (contradicted.has(fact.id)) {
      flags.push({factId: fact.id, reason: 'contradiction'});
      continue;
    }

    const subjectUsage = usage.get(fact.subject.trim().toLowerCase());
    if (!subjectUsage || subjectUsage.lastUsedMs === null) {
      // Never observed in communication — absence proves nothing.
      continue;
    }

    const hadBaseline = subjectUsage.prior60 >= DRIFT_BASELINE_MIN_USES;
    const silentDays = (nowMs - subjectUsage.lastUsedMs) / MS_PER_DAY;
    const droppedToZero =
      subjectUsage.last30 === 0 && silentDays >= DRIFT_SILENCE_DAYS;

    if (!hadBaseline || !droppedToZero) {
      continue;
    }

    // Re-confirmed by the caregiver since the drop began? last_reinforced is
    // bumped on caregiver confirm; if that happened within the silence window,
    // the caregiver has already spoken.
    const reinforcedMs = Date.parse(fact.last_reinforced);
    if (
      !Number.isNaN(reinforcedMs) &&
      reinforcedMs > subjectUsage.lastUsedMs
    ) {
      continue;
    }

    flags.push({factId: fact.id, reason: 'nonuse'});
  }

  return flags;
}
