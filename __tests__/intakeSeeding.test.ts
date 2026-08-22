import {
  mapPepesToKnowledge,
  seedKey,
} from '../src/services/personalMemory/intakeSeeding';

describe('mapPepesToKnowledge', () => {
  it('maps people with relationships to relationship facts', () => {
    const facts = mapPepesToKnowledge({
      People: [{id: 'p1', name: 'Danielle', relationship: 'sister'}],
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      pepesItemId: 'p1',
      category: 'relationship',
      subject: 'Danielle',
      value: 'sister',
    });
  });

  it('maps categories per the PRD table', () => {
    const facts = mapPepesToKnowledge({
      Pets: [{id: 'x1', name: 'Rex'}],
      Food: [{id: 'x2', name: 'Banana'}],
      Drinks: [{id: 'x3', name: 'Juice'}],
      Places: [{id: 'x4', name: 'Pinecrest School'}],
      Toys: [{id: 'x5', name: 'Lego'}],
      TVShows: [{id: 'x6', name: 'Bluey'}],
    });
    const byId = Object.fromEntries(facts.map(f => [f.pepesItemId, f.category]));
    expect(byId.x1).toBe('object');
    expect(byId.x2).toBe('food');
    expect(byId.x3).toBe('food');
    expect(byId.x4).toBe('place');
    expect(byId.x5).toBe('object');
    expect(byId.x6).toBe('object');
  });

  it('creates an extra like fact for favorites', () => {
    const facts = mapPepesToKnowledge({
      Food: [{id: 'f1', name: 'Banana', isFavorite: true}],
    });
    expect(facts).toHaveLength(2);
    const like = facts.find(f => f.category === 'like')!;
    expect(like.subject).toBe('Banana');
    expect(like.pepesItemId).toBe('f1#favorite');
  });

  it('falls back to a category:name key when id is missing', () => {
    expect(seedKey('Food', {name: ' Banana '})).toBe('Food:banana');
    const facts = mapPepesToKnowledge({Food: [{name: 'Banana'}]});
    expect(facts[0].pepesItemId).toBe('Food:banana');
  });

  it('skips unnamed tiles', () => {
    expect(mapPepesToKnowledge({Food: [{name: '  '}]})).toHaveLength(0);
  });
});
