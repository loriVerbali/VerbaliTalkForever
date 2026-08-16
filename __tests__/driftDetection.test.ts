import {
  computeDriftFlags,
  isDriftEligible,
  SubjectUsage,
} from '../src/services/personalMemory/driftDetection';
import type {KnowledgeItemRow} from '../src/types/personalMemory';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

let nextId = 1;
function fact(overrides: Partial<KnowledgeItemRow> = {}): KnowledgeItemRow {
  return {
    id: nextId++,
    category: 'like',
    subject: 'banana',
    value: 'favorite',
    statement: 'Bananas are a favorite food',
    confidence: 0.95,
    source: 'intake',
    status: 'active',
    confirmed: 1,
    ai_context_enabled: 1,
    pepes_item_id: 'f1',
    replaced_by: null,
    first_learned: new Date(NOW - 200 * DAY).toISOString(),
    last_reinforced: new Date(NOW - 200 * DAY).toISOString(),
    usage_checked_at: null,
    review_flag: null,
    review_dismissed_until: null,
    ...overrides,
  };
}

function usage(map: Record<string, SubjectUsage>): Map<string, SubjectUsage> {
  return new Map(Object.entries(map));
}

describe('isDriftEligible', () => {
  it('covers likes, dislikes, and food/activity favorites', () => {
    expect(isDriftEligible(fact({category: 'like'}))).toBe(true);
    expect(isDriftEligible(fact({category: 'dislike'}))).toBe(true);
    expect(isDriftEligible(fact({category: 'food', value: 'favorite'}))).toBe(true);
    expect(isDriftEligible(fact({category: 'food', value: 'snack'}))).toBe(false);
    expect(isDriftEligible(fact({category: 'relationship'}))).toBe(false);
    expect(isDriftEligible(fact({status: 'suggested'}))).toBe(false);
  });
});

describe('computeDriftFlags', () => {
  it('flags the bananas scenario: baseline then sustained silence', () => {
    const f = fact();
    const flags = computeDriftFlags(
      [f],
      usage({banana: {last30: 0, prior60: 5, lastUsedMs: NOW - 50 * DAY}}),
      new Set(),
      NOW,
    );
    expect(flags).toEqual([{factId: f.id, reason: 'nonuse'}]);
  });

  it('does not flag without a usage baseline', () => {
    const f = fact();
    const flags = computeDriftFlags(
      [f],
      usage({banana: {last30: 0, prior60: 1, lastUsedMs: NOW - 50 * DAY}}),
      new Set(),
      NOW,
    );
    expect(flags).toHaveLength(0);
  });

  it('does not flag subjects never observed in communication', () => {
    const f = fact();
    const flags = computeDriftFlags(
      [f],
      usage({banana: {last30: 0, prior60: 0, lastUsedMs: null}}),
      new Set(),
      NOW,
    );
    expect(flags).toHaveLength(0);
  });

  it('does not flag recent silence shorter than the window', () => {
    const f = fact();
    const flags = computeDriftFlags(
      [f],
      usage({banana: {last30: 0, prior60: 5, lastUsedMs: NOW - 40 * DAY}}),
      new Set(),
      NOW,
    );
    expect(flags).toHaveLength(0);
  });

  it('flags explicit contradictions regardless of usage', () => {
    const f = fact();
    const flags = computeDriftFlags(
      [f],
      usage({banana: {last30: 3, prior60: 5, lastUsedMs: NOW - DAY}}),
      new Set([f.id]),
      NOW,
    );
    expect(flags).toEqual([{factId: f.id, reason: 'contradiction'}]);
  });

  it('suppresses facts dismissed by the caregiver', () => {
    const f = fact({
      review_dismissed_until: new Date(NOW + 10 * DAY).toISOString(),
    });
    const flags = computeDriftFlags(
      [f],
      usage({banana: {last30: 0, prior60: 5, lastUsedMs: NOW - 50 * DAY}}),
      new Set(),
      NOW,
    );
    expect(flags).toHaveLength(0);
  });

  it('skips facts the caregiver re-confirmed after the drop', () => {
    const f = fact({
      last_reinforced: new Date(NOW - 10 * DAY).toISOString(),
    });
    const flags = computeDriftFlags(
      [f],
      usage({banana: {last30: 0, prior60: 5, lastUsedMs: NOW - 50 * DAY}}),
      new Set(),
      NOW,
    );
    expect(flags).toHaveLength(0);
  });
});
