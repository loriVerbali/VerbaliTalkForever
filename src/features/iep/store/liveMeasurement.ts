/**
 * One session's value for one metric, read from what the device actually recorded.
 *
 * Every case returns a typed result rather than a number: a session with no sentences is
 * not a session with zero-word sentences, and a metric awaiting AI analysis is not a
 * metric the child failed.
 */

import {
  MeasurementResult,
  MetricCatalogue,
  MetricId,
  Result,
  SessionMetricSource,
} from '../core';
import { classifyPartOfSpeech } from '../model/partOfSpeech';
import { CommunicationMeasurement, SentenceMeasurement, SentenceReview, retellingDistinctDetailCount } from '../model/types';
import { MeasurementState, sliceSession } from './measurementState';

export interface LiveMeasurementOptions {
  minimumWordsPerSentence?: number | null;
  requiredPartOfSpeechCounts?: Record<string, number> | null;
  allowedSupportLevels?: readonly string[] | null;
}

export const DEFAULT_LIVE_MINIMUM_WORDS = 3;

/** Counts parts of speech in a sentence's final words, preferring the recorded tag. */
export function partOfSpeechCounts(sentence: SentenceMeasurement): Record<string, number> {
  const unused = [...sentence.wordsAdded].sort((a, b) => a.selectedAtMs - b.selectedAtMs);
  const counts: Record<string, number> = {};
  for (const finalWord of sentence.finalWords) {
    const index = unused.findIndex(w => w.word.toLowerCase() === finalWord.toLowerCase());
    let recorded: string | null = null;
    if (index >= 0) {
      recorded = unused[index].partOfSpeech ?? null;
      unused.splice(index, 1);
    }
    const part = recorded ?? classifyPartOfSpeech(finalWord);
    if (part) {
      const key = part.toLowerCase();
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}

function reviewFor(reviews: readonly SentenceReview[], sentenceId: string): SentenceReview | undefined {
  return reviews.find(r => r.sentenceId === sentenceId);
}

export function liveMeasurement(
  state: MeasurementState,
  metric: MetricId,
  sessionId: string,
  options: LiveMeasurementOptions = {},
): MeasurementResult {
  const definition = MetricCatalogue.definitionFor(metric);
  if (!definition) {
    return Result.unsupported(`${metric} is not in the metrics library`);
  }
  if (definition.requirement === 'notImplemented') {
    return Result.unsupported(definition.unavailableReason ?? `${metric} is not implemented`);
  }
  const slice = sliceSession(state, sessionId);
  if (!slice) {
    return Result.noData(`no session ${sessionId}`);
  }
  const { sentences, navigations, activities, communications } = slice;
  const measured = (value: number) => Result.value(value);

  /** AI-assigned counts are only trustworthy once something has classified them. */
  const aiCounted = (matching: (c: CommunicationMeasurement) => boolean): MeasurementResult => {
    if (communications.length === 0) {
      return Result.noData('no communications recorded in this session');
    }
    if (!communications.some(c => c.analysis.functionSource !== 'unavailable')) {
      return Result.pending("awaiting analysis of this session's communications");
    }
    return measured(communications.filter(matching).length);
  };

  switch (metric) {
    case MetricCatalogue.totalSentences.id:
      return sentences.length === 0 ? Result.noData('no sentences recorded') : measured(sentences.length);

    case MetricCatalogue.qualifyingSentences.id: {
      if (sentences.length === 0) {
        return Result.noData('no sentences recorded');
      }
      const allowed = options.allowedSupportLevels && options.allowedSupportLevels.length > 0
        ? options.allowedSupportLevels
        : null;
      // A goal restricted to independent work cannot be scored from a session nobody has
      // rated yet. Awaiting review is pending, not zero.
      if (allowed) {
        const anyUnrated = sentences.some(
          s => (reviewFor(slice.sentenceReviews, s.id)?.supportLevel ?? 'unrated') === 'unrated',
        );
        if (anyUnrated) {
          return Result.pending('Some sentences in this session have not been rated for support yet.');
        }
      }
      const bar = options.minimumWordsPerSentence ?? DEFAULT_LIVE_MINIMUM_WORDS;
      const required = options.requiredPartOfSpeechCounts ?? null;
      const count = sentences.filter(sentence => {
        if (sentence.finalWords.length < bar) {
          return false;
        }
        if (required && Object.keys(required).length > 0) {
          const observed = partOfSpeechCounts(sentence);
          for (const [part, needed] of Object.entries(required)) {
            if ((observed[part.toLowerCase()] ?? 0) < needed) {
              return false;
            }
          }
        }
        if (allowed) {
          const support = reviewFor(slice.sentenceReviews, sentence.id)?.supportLevel;
          if (!support || !allowed.includes(support)) {
            return false;
          }
        }
        return true;
      }).length;
      return measured(count);
    }

    case MetricCatalogue.averageWordsPerSentence.id: {
      if (sentences.length === 0) {
        return Result.noData('no sentences recorded');
      }
      const words = sentences.reduce((sum, s) => sum + s.finalWords.length, 0);
      return measured(words / sentences.length);
    }

    case MetricCatalogue.totalWordCountPerSentence.id:
      // Words per sentence describes one sentence; there is no honest single number for
      // a session. The session-level figure is the count of qualifying sentences.
      return Result.noData(
        'Words per sentence is measured on each sentence. The session figure is the number of qualifying sentences.',
      );

    case MetricCatalogue.longestSentenceWords.id: {
      if (sentences.length === 0) {
        return Result.noData('no sentences recorded');
      }
      return measured(Math.max(...sentences.map(s => s.finalWords.length)));
    }

    case MetricCatalogue.buildSeconds.id: {
      const durations = sentences
        .map(s => (s.endedAtMs - s.startedAtMs) / 1000)
        .filter(d => d > 0);
      if (durations.length === 0) {
        return Result.noData('no completed sentences to time');
      }
      return measured(durations.reduce((a, b) => a + b, 0) / durations.length);
    }

    case MetricCatalogue.pageNavigations.id:
      return navigations.length === 0 ? Result.noData('no navigation recorded') : measured(navigations.length);

    case MetricCatalogue.differentPagesVisited.id: {
      if (navigations.length === 0) {
        return Result.noData('no navigation recorded');
      }
      return measured(new Set(navigations.map(n => n.destinationPage)).size);
    }

    case MetricCatalogue.differentWordsActivated.id: {
      const words = activities.filter(a => a.action === 'wordSelected' && a.word).map(a => a.word as string);
      return words.length === 0 ? Result.noData('no words selected') : measured(new Set(words).size);
    }

    case MetricCatalogue.totalWordActivations.id: {
      const selections = activities.filter(a => a.action === 'wordSelected');
      return selections.length === 0 ? Result.noData('no words selected') : measured(selections.length);
    }

    case MetricCatalogue.deviceInteractions.id:
      return activities.length === 0 ? Result.noData('no activity recorded') : measured(activities.length);

    case MetricCatalogue.conversationTurns.id:
    case MetricCatalogue.reciprocalInteractions.id:
      return Result.unsupported(definition.unavailableReason ?? 'definition awaiting approval');

    case MetricCatalogue.conversationInitiations.id: {
      if (slice.conversations.length === 0) {
        return Result.noData('no conversations recorded');
      }
      return measured(
        slice.conversations.filter(c => (c.firstSpeaker ?? '').toLowerCase().includes('child')).length,
      );
    }

    case MetricCatalogue.questionsAsked.id:
      return aiCounted(c => c.analysis.isQuestion === true);

    case MetricCatalogue.whQuestions.id:
      return aiCounted(c => c.analysis.isQuestion === true && !!c.analysis.whQuestionType);

    case MetricCatalogue.requestCount.id:
      return aiCounted(c => c.analysis.communicationFunction === 'request');

    case MetricCatalogue.novelContributions.id:
      return aiCounted(c => c.analysis.introducesNewInformation === true);

    case MetricCatalogue.differentCommunicationFunctions.id: {
      if (communications.length === 0) {
        return Result.noData('no communications recorded');
      }
      if (!communications.some(c => c.analysis.functionSource !== 'unavailable')) {
        return Result.pending("awaiting analysis of this session's communications");
      }
      const functions = new Set(
        communications.map(c => c.analysis.communicationFunction).filter((f): f is NonNullable<typeof f> => !!f),
      );
      return measured(functions.size);
    }

    case MetricCatalogue.repairAttempts.id:
      return slice.repairs.length === 0 ? Result.noData('no repairs recorded') : measured(slice.repairs.length);

    case MetricCatalogue.retellingDetails.id: {
      if (slice.retellings.length === 0) {
        return Result.noData('no retellings recorded');
      }
      return measured(slice.retellings.reduce((sum, r) => sum + retellingDistinctDetailCount(r), 0));
    }

    default:
      return Result.unsupported(`${metric} has no live measurement yet`);
  }
}

/** Adapts recorded state to the source contract, so the calculator cannot tell where a number came from. */
export class LiveSessionMetricSource implements SessionMetricSource {
  constructor(
    private readonly state: () => MeasurementState,
    private readonly options: Omit<LiveMeasurementOptions, 'minimumWordsPerSentence'> = {},
  ) {}

  measurement(metric: MetricId, sessionId: string, minimumWordsPerSentence: number | null): MeasurementResult {
    return liveMeasurement(this.state(), metric, sessionId, {
      ...this.options,
      minimumWordsPerSentence,
    });
  }
}
