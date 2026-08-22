// Pure ranking math for Personal Memory (PRD §6). No react-native imports —
// unit-testable as plain TypeScript. All weights live here and only here.

import type {TimeBucket} from './timeOfDay';

export const HALF_LIFE_DAYS = 30;

export const RANK_WEIGHTS = {
  timeOfDay: 0.5,
  sequence: 1.0,
  pinBoost: 5,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Exponential decay: use_count * 0.5 ^ (days_since_last_used / 30). */
export function decayedScore(
  useCount: number,
  lastUsedMs: number,
  nowMs: number,
): number {
  const days = Math.max(0, (nowMs - lastUsedMs) / MS_PER_DAY);
  return useCount * Math.pow(0.5, days / HALF_LIFE_DAYS);
}

/**
 * Composite score per PRD §6.3:
 * decayedFrequency * (1 + 0.5*timeOfDayAffinity + 1.0*sequenceBoost) + pinBoost
 */
export function compositeScore(input: {
  decayed: number;
  timeAffinity: number; // 0..1 share of uses in the current bucket
  sequenceBoost: number; // 0 or 1: item continues the preceding word
  pinned: boolean;
}): number {
  const base =
    input.decayed *
    (1 +
      RANK_WEIGHTS.timeOfDay * input.timeAffinity +
      RANK_WEIGHTS.sequence * input.sequenceBoost);
  return base + (input.pinned ? RANK_WEIGHTS.pinBoost : 0);
}

export type QualitativeUsage = 'often' | 'sometimes' | 'recent' | 'stale';

const RECENTLY_LEARNED_DAYS = 14;
const STALE_DAYS = 45;
const OFTEN_SCORE = 8;
const SOMETIMES_SCORE = 2;

/**
 * Caregiver-facing usage label (Learned Communication screen shows these
 * instead of numeric scores).
 */
export function qualitativeLabel(
  decayed: number,
  firstUsedMs: number,
  lastUsedMs: number,
  nowMs: number,
): QualitativeUsage {
  const daysSinceUse = (nowMs - lastUsedMs) / MS_PER_DAY;
  if (daysSinceUse >= STALE_DAYS) {
    return 'stale';
  }
  if (decayed >= OFTEN_SCORE) {
    return 'often';
  }
  if ((nowMs - firstUsedMs) / MS_PER_DAY <= RECENTLY_LEARNED_DAYS) {
    return 'recent';
  }
  return decayed >= SOMETIMES_SCORE ? 'sometimes' : 'stale';
}

export interface RankableItem {
  id: number;
  text: string;
  useCount: number;
  lastUsedMs: number;
  pinned: boolean;
}

export function rankItems(
  items: RankableItem[],
  opts: {
    bucket?: TimeBucket;
    /** item id -> per-bucket use counts */
    bucketCounts?: Map<number, Partial<Record<TimeBucket, number>>>;
    /** normalized texts that continue the preceding word */
    continuations?: Set<string>;
    limit: number;
    nowMs?: number;
  },
): Array<{text: string; score: number}> {
  const nowMs = opts.nowMs ?? Date.now();
  return items
    .map(item => {
      const decayed = decayedScore(item.useCount, item.lastUsedMs, nowMs);
      let timeAffinity = 0;
      if (opts.bucket && opts.bucketCounts) {
        const counts = opts.bucketCounts.get(item.id);
        if (counts) {
          const total = Object.values(counts).reduce(
            (sum, n) => sum + (n || 0),
            0,
          );
          const inBucket = counts[opts.bucket] || 0;
          timeAffinity = total > 0 ? inBucket / total : 0;
        }
      }
      const sequenceBoost = opts.continuations?.has(
        item.text.trim().toLowerCase(),
      )
        ? 1
        : 0;
      return {
        text: item.text,
        score: compositeScore({
          decayed,
          timeAffinity,
          sequenceBoost,
          pinned: item.pinned,
        }),
      };
    })
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit);
}
