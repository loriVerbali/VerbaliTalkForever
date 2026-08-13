import {stableMergeSuggestions} from '../src/features/verbi/state/verbiReducer';
import type {VerbiSuggestion} from '../src/features/verbi/state/verbiTypes';

function sug(id: string, rank: number, memoryScore?: number): VerbiSuggestion {
  return {
    id,
    type: 'word',
    label: id,
    spokenText: id,
    category: 'noun',
    rank,
    source: 'ai',
    ...(memoryScore !== undefined ? {memoryScore} : {}),
  } as VerbiSuggestion;
}

describe('stableMergeSuggestions', () => {
  it('keeps surviving suggestions in their previous order', () => {
    const old = [sug('a', 1), sug('b', 2), sug('c', 3)];
    const fresh = [sug('c', 1), sug('a', 2), sug('d', 3)];
    const merged = stableMergeSuggestions(old, fresh);
    expect(merged.map(s => s.id)).toEqual(['a', 'c', 'd']);
  });

  it('orders newcomers by memory score, then server order', () => {
    const old = [sug('a', 1)];
    const fresh = [
      sug('a', 1),
      sug('b', 2),
      sug('c', 3, 5),
      sug('d', 4, 9),
    ];
    const merged = stableMergeSuggestions(old, fresh);
    expect(merged.map(s => s.id)).toEqual(['a', 'd', 'c', 'b']);
  });

  it('applies memory ordering on a fresh board too', () => {
    const fresh = [sug('a', 1), sug('b', 2, 4), sug('c', 3, 8)];
    const merged = stableMergeSuggestions([], fresh);
    expect(merged.map(s => s.id)).toEqual(['c', 'b', 'a']);
  });
});
