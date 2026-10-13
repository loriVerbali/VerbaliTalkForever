/**
 * Chooses the events that substantiate a metric.
 *
 * Evidence is selected by what a metric counts, under the goal's own rule, so the events
 * a therapist is shown are the events that produced the number.
 */

import { MetricCatalogue } from './metricCatalogue';
import { MetricId } from './metricDefinition';

export type EvidenceKind =
  | 'sentence'
  | 'wordSelection'
  | 'navigation'
  | 'question'
  | 'request'
  | 'repairAttempt'
  | 'retelling'
  | 'conversationTurn'
  | 'other';

export const ALL_EVIDENCE_KINDS: readonly EvidenceKind[] = [
  'sentence',
  'wordSelection',
  'navigation',
  'question',
  'request',
  'repairAttempt',
  'retelling',
  'conversationTurn',
  'other',
];

/** One recorded thing, reduced to what deciding relevance needs. */
export interface EvidenceItem {
  readonly id: string;
  readonly kind: EvidenceKind;
  /** Words in the sentence, when it is one. */
  readonly wordCount?: number | null;
  /** How much support the child had, when it was rated. */
  readonly supportLevel?: string | null;
}

const C = MetricCatalogue;

const kindsByMetric: ReadonlyMap<MetricId, ReadonlySet<EvidenceKind>> = new Map<
  MetricId,
  ReadonlySet<EvidenceKind>
>([
  [C.totalSentences.id, new Set(['sentence'])],
  [C.qualifyingSentences.id, new Set(['sentence'])],
  [C.averageWordsPerSentence.id, new Set(['sentence'])],
  [C.totalWordCountPerSentence.id, new Set(['sentence'])],
  [C.longestSentenceWords.id, new Set(['sentence'])],
  [C.buildSeconds.id, new Set(['sentence'])],
  [C.differentWordsActivated.id, new Set(['wordSelection'])],
  [C.totalWordActivations.id, new Set(['wordSelection'])],
  [C.pageNavigations.id, new Set(['navigation'])],
  [C.differentPagesVisited.id, new Set(['navigation'])],
  [C.preferredPageNavigations.id, new Set(['navigation'])],
  [C.questionsAsked.id, new Set(['question'])],
  [C.whQuestions.id, new Set(['question'])],
  [C.requestCount.id, new Set(['request'])],
  [C.repairAttempts.id, new Set(['repairAttempt'])],
  // Both describe what an utterance was for, so the utterances are the evidence.
  [C.differentCommunicationFunctions.id, new Set(['sentence'])],
  [C.novelContributions.id, new Set(['sentence'])],
  [C.retellingDetails.id, new Set(['retelling'])],
  [C.conversationTurns.id, new Set(['conversationTurn'])],
  [C.conversationInitiations.id, new Set(['conversationTurn'])],
  [C.reciprocalInteractions.id, new Set(['conversationTurn'])],
]);

/** What each metric is evidenced by. An unknown metric shows the whole record. */
export function evidenceKinds(metric: MetricId): ReadonlySet<EvidenceKind> {
  return kindsByMetric.get(metric) ?? new Set(ALL_EVIDENCE_KINDS);
}

/**
 * The events that substantiate a metric for one session, under the goal's own rule.
 * The word bar and support restriction are applied here for the same reason they are
 * applied when counting.
 */
export function selectEvidence(
  metric: MetricId,
  items: readonly EvidenceItem[],
  options: {
    minimumWordsPerSentence?: number | null;
    allowedSupportLevels?: readonly string[] | null;
  } = {},
): EvidenceItem[] {
  const wanted = evidenceKinds(metric);
  const bar = options.minimumWordsPerSentence ?? null;
  const allowed =
    options.allowedSupportLevels && options.allowedSupportLevels.length > 0
      ? options.allowedSupportLevels
      : null;
  return items.filter(item => {
    if (!wanted.has(item.kind)) {
      return false;
    }
    if (item.kind === 'sentence' && bar !== null) {
      const words = item.wordCount ?? null;
      if (words === null || words < bar) {
        return false;
      }
    }
    if (allowed) {
      const level = item.supportLevel ?? null;
      if (level === null || !allowed.includes(level)) {
        return false;
      }
    }
    return true;
  });
}

/** Whether the evidence shown accounts for the number displayed. */
export function evidenceReconciles(displayed: number, evidence: readonly EvidenceItem[]): boolean {
  return evidence.length === displayed;
}
