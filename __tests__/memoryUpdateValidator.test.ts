import {
  validateMemoryUpdates,
  duplicateKey,
  orderForApply,
  resolveContradiction,
  AcceptedUpdate,
} from '../src/services/personalMemory/memoryUpdateValidator';
import type {MemoryUpdate} from '../src/types/personalMemory';

function ctx(overrides: Partial<Parameters<typeof validateMemoryUpdates>[1]> = {}) {
  return {
    threshold: 0.85,
    existingIds: new Set<number>([12]),
    activeDuplicates: new Set<string>(),
    rejectedBlocklist: new Set<string>(),
    learningPaused: false,
    ...overrides,
  };
}

function update(overrides: Partial<MemoryUpdate> = {}): MemoryUpdate {
  return {
    eventId: 'mem_1',
    action: 'create',
    category: 'relationship',
    subject: 'Danielle',
    value: 'sister',
    statement: 'Danielle is the user’s sister',
    confidence: 0.93,
    existingFactId: null,
    needsCaregiverReview: false,
    ...overrides,
  };
}

describe('validateMemoryUpdates', () => {
  it('activates high-confidence creates immediately', () => {
    const {accepted} = validateMemoryUpdates([update()], ctx());
    expect(accepted).toHaveLength(1);
    expect(accepted[0].createStatus).toBe('active');
    expect(accepted[0].aiContextEnabled).toBe(true);
  });

  it('routes medium-confidence creates to suggested', () => {
    const {accepted} = validateMemoryUpdates([update({confidence: 0.7})], ctx());
    expect(accepted[0].createStatus).toBe('suggested');
  });

  it('drops creates below the suggestion floor', () => {
    const {accepted, rejectedCount} = validateMemoryUpdates(
      [update({confidence: 0.5})],
      ctx(),
    );
    expect(accepted).toHaveLength(0);
    expect(rejectedCount).toBe(1);
  });

  it('rejects unsupported categories and actions', () => {
    const bad = [
      update({category: 'diagnosis' as any}),
      update({action: 'deactivate' as any}),
    ];
    const {accepted, rejectedCount} = validateMemoryUpdates(bad, ctx());
    expect(accepted).toHaveLength(0);
    expect(rejectedCount).toBe(2);
  });

  it('rejects reinforce with a dangling existingFactId', () => {
    const {rejectedCount} = validateMemoryUpdates(
      [update({action: 'reinforce', existingFactId: 999})],
      ctx(),
    );
    expect(rejectedCount).toBe(1);
  });

  it('accepts reinforce targeting a known fact', () => {
    const {accepted} = validateMemoryUpdates(
      [update({action: 'reinforce', existingFactId: 12})],
      ctx(),
    );
    expect(accepted).toHaveLength(1);
  });

  it('rejects duplicate creates of active facts', () => {
    const {rejectedCount} = validateMemoryUpdates(
      [update()],
      ctx({activeDuplicates: new Set([duplicateKey('relationship', 'Danielle')])}),
    );
    expect(rejectedCount).toBe(1);
  });

  it('honors the caregiver rejected-blocklist', () => {
    const {rejectedCount} = validateMemoryUpdates(
      [update()],
      ctx({rejectedBlocklist: new Set([duplicateKey('relationship', 'danielle')])}),
    );
    expect(rejectedCount).toBe(1);
  });

  it('forces sensitive facts to suggested and excludes them from AI context', () => {
    const {accepted} = validateMemoryUpdates(
      [
        update({
          category: 'fact',
          subject: 'church',
          statement: 'The user goes to church on Sundays',
          confidence: 0.95,
        }),
      ],
      ctx(),
    );
    expect(accepted[0].createStatus).toBe('suggested');
    expect(accepted[0].aiContextEnabled).toBe(false);
  });

  it('rejects everything while learning is paused', () => {
    const {accepted, rejectedCount} = validateMemoryUpdates(
      [update(), update({subject: 'Max'})],
      ctx({learningPaused: true}),
    );
    expect(accepted).toHaveLength(0);
    expect(rejectedCount).toBe(2);
  });
});

function acceptedUpdate(overrides: Partial<MemoryUpdate> = {}): AcceptedUpdate {
  return {
    update: update(overrides),
    createStatus: 'active',
    aiContextEnabled: true,
  };
}

describe('orderForApply', () => {
  it('moves contradicts after creates regardless of arrival order', () => {
    const ordered = orderForApply([
      acceptedUpdate({action: 'contradict', existingFactId: 12}),
      acceptedUpdate({action: 'create', subject: 'Jim'}),
      acceptedUpdate({action: 'reinforce', existingFactId: 12}),
    ]);
    expect(ordered.map(a => a.update.action)).toEqual([
      'create',
      'reinforce',
      'contradict',
    ]);
  });
});

describe('resolveContradiction', () => {
  const unconfirmedAi = {source: 'ai', confirmed: 0};

  it('replaces an unconfirmed AI fact when the same communication created a replacement', () => {
    expect(resolveContradiction(unconfirmedAi, 42)).toEqual({
      kind: 'replaced',
      replacedBy: 42,
    });
  });

  it('marks an unconfirmed AI fact possibly_outdated when no replacement was created', () => {
    expect(resolveContradiction(unconfirmedAi, undefined)).toEqual({
      kind: 'possibly_outdated',
    });
  });

  it('never overrides confirmed facts, even with a paired create', () => {
    expect(resolveContradiction({source: 'ai', confirmed: 1}, 42)).toEqual({
      kind: 'review_flag',
    });
  });

  it('never overrides intake/caregiver facts', () => {
    expect(resolveContradiction({source: 'intake', confirmed: 0}, 42)).toEqual({
      kind: 'review_flag',
    });
    expect(resolveContradiction({source: 'caregiver', confirmed: 0}, undefined)).toEqual({
      kind: 'review_flag',
    });
  });
});
