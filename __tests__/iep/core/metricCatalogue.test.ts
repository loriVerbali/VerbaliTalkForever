import {
  MetricCatalogue,
  isTargetMet,
  metricCanBeScored,
} from '../../../src/features/iep/core';

/**
 * Integrity of the catalogue itself. Once broken, these produce a confident wrong
 * number rather than a visible failure.
 */
describe('MetricCatalogue', () => {
  it('has 22 public metrics with unique identifiers', () => {
    const ids = MetricCatalogue.all.map(m => m.id);
    expect(ids).toHaveLength(22);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every metric a unit, definition and display name', () => {
    for (const metric of MetricCatalogue.all) {
      expect(metric.unit).not.toBe('');
      expect(metric.clinicalDefinition).not.toBe('');
      expect(metric.displayName).not.toBe('');
    }
  });

  it('keeps total taps and distinct words separate', () => {
    expect(MetricCatalogue.totalWordActivations.displayName).toBe('Total AAC button taps');
    expect(MetricCatalogue.totalWordActivations.unit).toBe('taps');
    expect(MetricCatalogue.differentWordsActivated.unit).toBe('words');
    expect(MetricCatalogue.totalWordActivations.id).not.toBe(
      MetricCatalogue.differentWordsActivated.id,
    );
  });

  it('keeps words per sentence distinct from the session average', () => {
    expect(MetricCatalogue.totalWordCountPerSentence.id).not.toBe(
      MetricCatalogue.averageWordsPerSentence.id,
    );
    expect(MetricCatalogue.totalWordCountPerSentence.displayName).toBe('Words per sentence');
    expect(MetricCatalogue.totalWordCountPerSentence.scope).toBe('sentence');
    expect(MetricCatalogue.averageWordsPerSentence.scope).toBe('session');
  });

  it('unavailable metrics carry a reason and available ones do not', () => {
    for (const metric of MetricCatalogue.all) {
      const blocked =
        metric.requirement === 'notImplemented' || metric.approval === 'awaitingDefinition';
      if (blocked) {
        expect(metric.unavailableReason).not.toBeNull();
        expect(metricCanBeScored(metric)).toBe(false);
      } else {
        expect(metric.unavailableReason).toBeNull();
      }
    }
  });

  it('descriptive metrics cannot be scored', () => {
    for (const metric of MetricCatalogue.all.filter(m => m.comparison === 'descriptive')) {
      expect(metricCanBeScored(metric)).toBe(false);
    }
  });

  it('storage columns are not public metrics but still resolve', () => {
    const publicIds = new Set(MetricCatalogue.all.map(m => m.id));
    for (const storageId of MetricCatalogue.storageOnlyIdentifiers) {
      expect(publicIds.has(storageId)).toBe(false);
      expect(MetricCatalogue.resolve(storageId)).not.toBeNull();
    }
  });

  describe('comparison direction', () => {
    it('lower-is-better metrics compare the other way', () => {
      expect(MetricCatalogue.buildSeconds.comparison).toBe('atMost');
      expect(isTargetMet('atMost', 15, 20)).toBe(true);
      expect(isTargetMet('atMost', 25, 20)).toBe(false);
    });

    it('at-least compares the usual way and meeting exactly is a pass', () => {
      expect(isTargetMet('atLeast', 5, 3)).toBe(true);
      expect(isTargetMet('atLeast', 2, 3)).toBe(false);
      expect(isTargetMet('atLeast', 3, 3)).toBe(true);
    });

    it('range and descriptive refuse to judge', () => {
      expect(isTargetMet('range', 4, 3)).toBeNull();
      expect(isTargetMet('descriptive', 4, 3)).toBeNull();
    });

    it('the only maximum aggregation is longest sentence', () => {
      const maxima = MetricCatalogue.all.filter(m => m.aggregation === 'maximum').map(m => m.id);
      expect(maxima).toEqual(['longest_sentence_words']);
    });
  });

  describe('resolving what the planner sends', () => {
    it('resolves the identifiers the live planner returned', () => {
      for (const raw of ['sentences', 'words_per_sentence', 'qualifying_sentences_2plus']) {
        expect(MetricCatalogue.resolve(raw)).not.toBeNull();
      }
      expect(MetricCatalogue.resolve('sentences')?.id).toBe(MetricCatalogue.totalSentences.id);
      expect(MetricCatalogue.resolve('words_per_sentence')?.id).toBe(
        MetricCatalogue.averageWordsPerSentence.id,
      );
    });

    it('threshold-carrying aliases keep their threshold', () => {
      expect(MetricCatalogue.resolve('qualifying_sentences_2plus')?.minimumWordsPerSentence).toBe(2);
      expect(MetricCatalogue.resolve('qualifying_sentences_3plus')?.minimumWordsPerSentence).toBe(3);
      expect(MetricCatalogue.resolve('qualifying_sentences_4plus')?.minimumWordsPerSentence).toBe(4);
      expect(MetricCatalogue.resolve('qualifying_sentences_2plus')?.id).toBe(
        MetricCatalogue.qualifyingSentences.id,
      );
    });

    it('an unknown identifier resolves to nothing, including near-misses', () => {
      expect(MetricCatalogue.resolve('eye_contact_duration')).toBeNull();
      expect(MetricCatalogue.resolve('sentence')).toBeNull();
      expect(MetricCatalogue.resolve('')).toBeNull();
    });

    it('ignores case and surrounding space', () => {
      expect(MetricCatalogue.resolve('  Conversation_Turns ')?.id).toBe(
        MetricCatalogue.conversationTurns.id,
      );
    });

    it('every alias resolves to a real catalogue entry', () => {
      for (const raw of MetricCatalogue.storageOnlyIdentifiers) {
        const resolution = MetricCatalogue.resolve(raw);
        expect(resolution).not.toBeNull();
        expect(MetricCatalogue.definitionFor(resolution!.id)).toBeDefined();
      }
    });

    it('narrower or different measures are not mapped across', () => {
      for (const raw of MetricCatalogue.deliberatelyUnresolved) {
        expect(MetricCatalogue.resolve(raw)).toBeNull();
      }
    });

    it('resolving aliases are renamings only', () => {
      expect(MetricCatalogue.resolve('requests')?.id).toBe(MetricCatalogue.requestCount.id);
      expect(MetricCatalogue.resolve('communication_repairs')?.id).toBe(
        MetricCatalogue.repairAttempts.id,
      );
      expect(MetricCatalogue.resolve('number_of_sentences')?.id).toBe(
        MetricCatalogue.totalSentences.id,
      );
    });
  });

  it('contested metrics are visible but not scorable', () => {
    for (const metric of [MetricCatalogue.conversationTurns, MetricCatalogue.reciprocalInteractions]) {
      expect(metric.approval).toBe('awaitingDefinition');
      expect(metricCanBeScored(metric)).toBe(false);
      expect(MetricCatalogue.definitionFor(metric.id)).toBeDefined();
    }
  });
});
