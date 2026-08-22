import {
  selectContextFacts,
  capContextSize,
  MAX_FACTS,
} from '../src/services/personalMemory/memoryContextBuilder';
import type {
  KnowledgeItemRow,
  MemoryContext,
} from '../src/types/personalMemory';

let nextId = 1;
function fact(overrides: Partial<KnowledgeItemRow> = {}): KnowledgeItemRow {
  return {
    id: nextId++,
    category: 'like',
    subject: 'banana',
    value: 'favorite',
    statement: 'Bananas are a favorite food',
    confidence: 0.9,
    source: 'ai',
    status: 'active',
    confirmed: 0,
    ai_context_enabled: 1,
    pepes_item_id: null,
    replaced_by: null,
    first_learned: new Date().toISOString(),
    last_reinforced: new Date().toISOString(),
    usage_checked_at: null,
    review_flag: null,
    review_dismissed_until: null,
    ...overrides,
  };
}

describe('selectContextFacts', () => {
  it('caps the fact list at MAX_FACTS', () => {
    const facts = Array.from({length: 15}, (_, i) =>
      fact({statement: `Fact number ${i}`}),
    );
    expect(selectContextFacts(facts)).toHaveLength(MAX_FACTS);
  });

  it('excludes disabled, inactive, rejected, replaced, and suggested facts', () => {
    const facts = [
      fact({ai_context_enabled: 0}),
      fact({status: 'inactive'}),
      fact({status: 'rejected'}),
      fact({status: 'replaced'}),
      fact({status: 'suggested'}),
    ];
    expect(selectContextFacts(facts)).toHaveLength(0);
  });

  it('includes flagged facts only on lexical match with the current text', () => {
    const flagged = fact({
      review_flag: 'possibly_outdated',
      statement: 'Bananas are a favorite food',
    });
    expect(selectContextFacts([flagged])).toHaveLength(0);
    expect(selectContextFacts([flagged], 'do you want a banana snack')).toHaveLength(0);
    expect(selectContextFacts([flagged], 'bananas for lunch?')).toHaveLength(1);
  });

  it('ranks confirmed facts first', () => {
    const facts = [
      fact({statement: 'Unconfirmed thing'}),
      fact({statement: 'Confirmed thing', confirmed: 1}),
    ];
    expect(selectContextFacts(facts)[0]).toBe('Confirmed thing');
  });
});

describe('capContextSize', () => {
  it('passes small contexts through unchanged', () => {
    const context: MemoryContext = {
      communication: {recentWords: ['juice'], timeOfDay: 'morning'},
      personal: {facts: ['Danielle is the sister']},
    };
    expect(capContextSize(context)).toEqual(context);
  });

  it('truncates facts first to fit the hard cap', () => {
    const context: MemoryContext = {
      communication: {recentWords: ['juice'], timeOfDay: 'morning'},
      personal: {
        facts: Array.from({length: 8}, (_, i) => 'x'.repeat(200) + i),
      },
    };
    const capped = capContextSize(context)!;
    expect(JSON.stringify(capped).length).toBeLessThanOrEqual(1000);
    expect(capped.communication?.recentWords).toEqual(['juice']);
  });

  it('returns undefined when nothing survives', () => {
    expect(capContextSize({})).toBeUndefined();
  });
});
