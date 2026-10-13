import {
  allLibraryGoals,
  datasetGoals,
  edgeCaseGoals,
  publishedGoals,
} from '../../../src/features/iep/core';

describe('GoalLibrary', () => {
  it('covers both sources', () => {
    expect(publishedGoals).toHaveLength(19);
    expect(datasetGoals).toHaveLength(19);
    expect(edgeCaseGoals.length).toBeGreaterThan(0);
    expect(allLibraryGoals).toHaveLength(
      publishedGoals.length + datasetGoals.length + edgeCaseGoals.length,
    );
  });

  it('every goal is usable as a starting point', () => {
    for (const goal of allLibraryGoals) {
      expect(goal.id).not.toBe('');
      expect(goal.title).not.toBe('');
      expect(goal.statement.length).toBeGreaterThan(40);
    }
  });

  it('identifiers are unique', () => {
    const ids = allLibraryGoals.map(g => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the two wordings are distinguishable', () => {
    expect(publishedGoals.every(g => g.statement.includes('(date)'))).toBe(true);
    expect(datasetGoals.every(g => !g.statement.includes('(date)'))).toBe(true);
  });

  it('published and dataset goals line up', () => {
    publishedGoals.forEach((published, i) => {
      expect(published.title).toBe(datasetGoals[i].title);
    });
  });
});
