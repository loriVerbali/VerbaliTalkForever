import {
  ALL_EVIDENCE_KINDS,
  EvidenceItem,
  MetricCatalogue,
  MetricId,
  evidenceKinds,
  evidenceReconciles,
  metricCanBeScored,
  selectEvidence,
} from '../../../src/features/iep/core';

/** A session with a bit of everything. */
const session: EvidenceItem[] = [
  { id: 's1', kind: 'sentence', wordCount: 3, supportLevel: 'independent' },
  { id: 's2', kind: 'sentence', wordCount: 2, supportLevel: 'prompted' },
  { id: 's3', kind: 'sentence', wordCount: 1, supportLevel: 'independent' },
  { id: 'w1', kind: 'wordSelection' },
  { id: 'w2', kind: 'wordSelection' },
  { id: 'n1', kind: 'navigation' },
  { id: 'n2', kind: 'navigation' },
  { id: 'q1', kind: 'question' },
];

function evidence(metric: MetricId, bar: number | null = null, support: string[] | null = null) {
  return selectEvidence(metric, session, {
    minimumWordsPerSentence: bar,
    allowedSupportLevels: support,
  });
}

describe('EvidenceSelector', () => {
  it('a sentence goal shows sentences, not navigation', () => {
    const items = evidence(MetricCatalogue.totalSentences.id);
    expect(items.map(i => i.id)).toEqual(['s1', 's2', 's3']);
    expect(items.some(i => i.kind === 'navigation')).toBe(false);
  });

  it('a navigation goal shows navigation, not sentences', () => {
    expect(evidence(MetricCatalogue.pageNavigations.id).map(i => i.id)).toEqual(['n1', 'n2']);
  });

  it('a word goal shows word selections', () => {
    expect(evidence(MetricCatalogue.differentWordsActivated.id).map(i => i.id)).toEqual(['w1', 'w2']);
  });

  it("the goal's word bar filters the evidence", () => {
    expect(evidence(MetricCatalogue.qualifyingSentences.id, 2).map(i => i.id)).toEqual(['s1', 's2']);
    expect(evidence(MetricCatalogue.qualifyingSentences.id, 3).map(i => i.id)).toEqual(['s1']);
    expect(evidence(MetricCatalogue.qualifyingSentences.id, 4)).toHaveLength(0);
  });

  it('a support restriction filters the evidence', () => {
    const items = evidence(MetricCatalogue.qualifyingSentences.id, 2, ['independent']);
    expect(items.map(i => i.id)).toEqual(['s1']);
  });

  describe('reconciliation', () => {
    it('the displayed count reconciles with what is shown', () => {
      const items = evidence(MetricCatalogue.qualifyingSentences.id, 2);
      expect(evidenceReconciles(2, items)).toBe(true);
      expect(evidenceReconciles(3, items)).toBe(false);
    });

    it('count and evidence use the same rule', () => {
      for (let bar = 1; bar <= 4; bar += 1) {
        const items = evidence(MetricCatalogue.qualifyingSentences.id, bar);
        const counted = session.filter(i => i.kind === 'sentence' && (i.wordCount ?? 0) >= bar).length;
        expect(evidenceReconciles(counted, items)).toBe(true);
      }
    });
  });

  describe('coverage', () => {
    it('every scorable metric names its evidence', () => {
      const everything = new Set(ALL_EVIDENCE_KINDS);
      const unmapped = MetricCatalogue.all
        .filter(metricCanBeScored)
        .filter(m => evidenceKinds(m.id).size === everything.size)
        .map(m => m.id);
      expect(unmapped).toEqual([]);
    });

    it('an unknown metric falls back to the whole record', () => {
      expect(evidenceKinds('eye_contact_duration')).toEqual(new Set(ALL_EVIDENCE_KINDS));
    });
  });
});
