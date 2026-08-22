import {
  decayedScore,
  compositeScore,
  qualitativeLabel,
  rankItems,
  RANK_WEIGHTS,
} from '../src/utils/memoryRanking';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

describe('decayedScore', () => {
  it('returns the raw count at zero elapsed days', () => {
    expect(decayedScore(10, NOW, NOW)).toBe(10);
  });

  it('halves exactly at the 30-day half-life', () => {
    expect(decayedScore(10, NOW - 30 * DAY, NOW)).toBeCloseTo(5, 6);
  });

  it('quarters at 60 days', () => {
    expect(decayedScore(8, NOW - 60 * DAY, NOW)).toBeCloseTo(2, 6);
  });

  it('never goes negative for future timestamps', () => {
    expect(decayedScore(4, NOW + DAY, NOW)).toBe(4);
  });
});

describe('compositeScore', () => {
  it('applies time-of-day and sequence weights', () => {
    const score = compositeScore({
      decayed: 10,
      timeAffinity: 1,
      sequenceBoost: 1,
      pinned: false,
    });
    expect(score).toBeCloseTo(
      10 * (1 + RANK_WEIGHTS.timeOfDay + RANK_WEIGHTS.sequence),
      6,
    );
  });

  it('adds the pin boost additively', () => {
    const unpinned = compositeScore({
      decayed: 1,
      timeAffinity: 0,
      sequenceBoost: 0,
      pinned: false,
    });
    const pinned = compositeScore({
      decayed: 1,
      timeAffinity: 0,
      sequenceBoost: 0,
      pinned: true,
    });
    expect(pinned - unpinned).toBe(RANK_WEIGHTS.pinBoost);
  });
});

describe('qualitativeLabel', () => {
  it('labels high-score items as often', () => {
    expect(qualitativeLabel(10, NOW - 90 * DAY, NOW - DAY, NOW)).toBe('often');
  });

  it('labels long-unused items as stale', () => {
    expect(qualitativeLabel(10, NOW - 200 * DAY, NOW - 50 * DAY, NOW)).toBe(
      'stale',
    );
  });

  it('labels newly learned items as recent', () => {
    expect(qualitativeLabel(1, NOW - 3 * DAY, NOW - DAY, NOW)).toBe('recent');
  });

  it('labels moderate usage as sometimes', () => {
    expect(qualitativeLabel(3, NOW - 60 * DAY, NOW - 5 * DAY, NOW)).toBe(
      'sometimes',
    );
  });
});

describe('rankItems', () => {
  const items = [
    {id: 1, text: 'juice', useCount: 2, lastUsedMs: NOW - DAY, pinned: false},
    {id: 2, text: 'water', useCount: 20, lastUsedMs: NOW - DAY, pinned: false},
    {id: 3, text: 'milk', useCount: 1, lastUsedMs: NOW - DAY, pinned: true},
  ];

  it('orders by score descending and respects limit', () => {
    const ranked = rankItems(items, {limit: 2, nowMs: NOW});
    expect(ranked.map(r => r.text)).toEqual(['water', 'milk']);
  });

  it('boosts sequence continuations', () => {
    const ranked = rankItems(items, {
      limit: 3,
      nowMs: NOW,
      continuations: new Set(['juice']),
    });
    const juice = ranked.find(r => r.text === 'juice')!;
    const base = decayedScore(2, NOW - DAY, NOW);
    expect(juice.score).toBeCloseTo(base * (1 + RANK_WEIGHTS.sequence), 6);
  });

  it('boosts items used in the current time bucket', () => {
    const bucketCounts = new Map([[1, {morning: 2}]]);
    const withBucket = rankItems(items, {
      limit: 3,
      nowMs: NOW,
      bucket: 'morning',
      bucketCounts,
    });
    const without = rankItems(items, {limit: 3, nowMs: NOW});
    const withScore = withBucket.find(r => r.text === 'juice')!.score;
    const withoutScore = without.find(r => r.text === 'juice')!.score;
    expect(withScore).toBeGreaterThan(withoutScore);
  });
});
