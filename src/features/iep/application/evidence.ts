/**
 * Evidence rows for one session: what a therapist sees beneath a number, built from the
 * same records the number was counted from. Live rows come from the store; mock rows
 * from the events dataset. Filters are applied the same way to both.
 */

import { EvidenceKind, MetricCatalogue, evidenceKinds } from '../core';
import { COMMUNICATION_FUNCTION_LABEL, CommunicationFunction, SupportLevel, communicationFunctionFromNetwork } from '../model/types';
import { MockDataset, MockEvent, mockEventTimestampMs } from '../mock/mockDataset';
import { MeasurementState, sliceSession } from '../store/measurementState';

export type EvidenceCategory = 'sentences' | 'questions' | 'navigation' | 'support' | 'requests';

export type EvidenceRowStatus = 'started' | 'continued' | 'independent' | 'prompted' | 'assisted' | 'unrated' | 'completed';

export interface EvidenceRow {
  id: string;
  timestampMs: number;
  speaker: string;
  badge: string;
  category: EvidenceCategory;
  content: string;
  detail: string | null;
  status: EvidenceRowStatus;
  isCompletion: boolean;
  /** Present on completion rows; editable in live mode and in the mock review overlay. */
  sentenceId: string | null;
  supportLevel: SupportLevel | null;
  communicationFunction: CommunicationFunction | null;
  isQuestion: boolean;
  wordCount: number | null;
}

export interface EvidenceSessionSummary {
  sessionId: string;
  startedAtMs: number | null;
  endedAtMs: number | null;
  independentCount: number;
  promptedCount: number;
  assistedCount: number;
  rows: EvidenceRow[];
}

export type EvidenceFilter = 'questions' | 'requests' | 'independent' | 'prompted' | 'assisted';

export const EVIDENCE_FILTER_LABEL: Record<EvidenceFilter, string> = {
  questions: 'Questions',
  requests: 'Requests',
  independent: 'Independent',
  prompted: 'Prompted',
  assisted: 'Assisted',
};

const words = (n: number) => `${n} ${n === 1 ? 'word' : 'words'}`;

/** Live rows: one per word added showing the sentence as it stood, one completion row per sentence, plus Q&A, navigation and support records. */
export function liveEvidenceSession(state: MeasurementState, sessionId: string, childName: string): EvidenceSessionSummary | null {
  const slice = sliceSession(state, sessionId);
  if (!slice) {
    return null;
  }
  const rows: EvidenceRow[] = [];
  const sentences = [...slice.sentences].sort((a, b) => a.startedAtMs - b.startedAtMs);
  for (const sentence of sentences) {
    const review = slice.sentenceReviews.find(r => r.sentenceId === sentence.id) ?? null;
    const communication = slice.communications.find(c => c.sentenceId === sentence.id) ?? null;
    const fn = communication?.analysis.communicationFunction ?? null;
    const running: string[] = [];
    const added = [...sentence.wordsAdded].filter(w => !w.wasRemoved).sort((a, b) => a.selectedAtMs - b.selectedAtMs);
    added.forEach(word => {
      running.push(word.word);
      const n = running.length;
      rows.push({
        id: `${sentence.id}-w${n}`,
        timestampMs: word.selectedAtMs,
        speaker: childName,
        badge: 'Sentence',
        category: 'sentences',
        content: running.join(' '),
        detail: words(n),
        status: n === 1 ? 'started' : 'continued',
        isCompletion: false,
        sentenceId: sentence.id,
        supportLevel: null,
        communicationFunction: null,
        isQuestion: false,
        wordCount: n,
      });
    });
    const support = review?.supportLevel ?? 'unrated';
    const count = sentence.finalWords.length;
    rows.push({
      id: `${sentence.id}-done`,
      timestampMs: sentence.endedAtMs,
      speaker: childName,
      badge: COMMUNICATION_FUNCTION_LABEL[fn ?? 'otherOrUnclear'],
      category: 'sentences',
      content: sentence.finalWords.join(' '),
      detail: `${words(count)} · ${support === 'unrated' ? 'Not reviewed' : support[0].toUpperCase() + support.slice(1)}${sentence.wasAbandoned ? ' · abandoned' : sentence.wasCleared ? ' · cleared' : ''}`,
      status: support,
      isCompletion: true,
      sentenceId: sentence.id,
      supportLevel: support,
      communicationFunction: fn ?? 'otherOrUnclear',
      isQuestion: communication?.analysis.isQuestion === true,
      wordCount: count,
    });
  }
  for (const qa of slice.qaMeasurements) {
    rows.push({
      id: qa.id, timestampMs: qa.timestampMs, speaker: childName, badge: 'Question', category: 'questions',
      content: qa.selectedAnswer, detail: null, status: 'continued', isCompletion: false, sentenceId: null,
      supportLevel: null, communicationFunction: 'answer', isQuestion: false, wordCount: null,
    });
  }
  for (const c of slice.communications) {
    if (c.source === 'typedMessage') {
      rows.push({
        id: c.id, timestampMs: c.timestampMs, speaker: childName, badge: 'Typed', category: 'sentences',
        content: c.content, detail: words(c.content.split(/\s+/).filter(Boolean).length), status: 'completed', isCompletion: false,
        sentenceId: null, supportLevel: null, communicationFunction: c.analysis.communicationFunction ?? null,
        isQuestion: c.analysis.isQuestion === true, wordCount: null,
      });
    }
  }
  for (const n of slice.navigations) {
    rows.push({
      id: n.id, timestampMs: n.timestampMs, speaker: childName, badge: 'Navigation', category: 'navigation',
      content: `${n.startingPage} → ${n.destinationPage}`, detail: null, status: 'continued', isCompletion: false,
      sentenceId: null, supportLevel: null, communicationFunction: null, isQuestion: false, wordCount: null,
    });
  }
  for (const s of slice.supports) {
    rows.push({
      id: s.id, timestampMs: s.timestampMs, speaker: 'PARTNER', badge: 'Support', category: 'support',
      content: s.detectedSpokenPrompt ?? s.detectedPartnerQuestion ?? s.appGeneratedAssistance ?? 'Support detected',
      detail: null, status: s.supportLevel.toLowerCase().includes('independent') ? 'independent' : 'prompted',
      isCompletion: false, sentenceId: null, supportLevel: null, communicationFunction: null, isQuestion: false, wordCount: null,
    });
  }
  rows.sort((a, b) => a.timestampMs - b.timestampMs);
  const count = (level: SupportLevel) => slice.sentenceReviews.filter(r => r.supportLevel === level).length;
  return {
    sessionId,
    startedAtMs: rows[0]?.timestampMs ?? slice.session.startedAtMs,
    endedAtMs: rows[rows.length - 1]?.timestampMs ?? slice.session.endedAtMs ?? null,
    independentCount: count('independent'),
    promptedCount: count('prompted'),
    assistedCount: count('assisted'),
    rows,
  };
}

function mockKind(event: MockEvent): EvidenceKind {
  switch (event.eventType) {
    case 'word_selected':
      return 'wordSelection';
    case 'sentence_completed':
      return 'sentence';
    case 'page_opened':
      return 'navigation';
    default:
      if (event.communicationFunction === 'question') {
        return 'question';
      }
      if (event.communicationFunction === 'request') {
        return 'request';
      }
      return 'conversationTurn';
  }
}

function mockSupport(raw: string): SupportLevel {
  const t = raw.toLowerCase();
  return t === 'independent' || t === 'prompted' || t === 'assisted' ? t : 'unrated';
}

export interface MockReviewOverlay {
  support: Record<string, string>;
  functions: Record<string, string>;
}

/** Mock rows, restricted to the evidence kinds the goal's metric counts, with the SLP's review overlay applied. */
export function mockEvidenceSession(
  dataset: MockDataset,
  sessionId: string,
  datasetGoalId: string | null,
  primaryMetricId: string | null,
  childName: string,
  overlay: MockReviewOverlay,
): EvidenceSessionSummary | null {
  const all = dataset.eventsBySession.get(sessionId);
  if (!all) {
    return null;
  }
  const isShared = datasetGoalId === null || datasetGoalId === dataset.goals[0]?.goalId;
  const raw = all
    .filter(e => e.eventType !== 'session_started' && e.eventType !== 'session_ended')
    .filter(e => isShared || e.goalIdsSupported.includes(datasetGoalId as string));
  const wanted = primaryMetricId ? evidenceKinds(primaryMetricId) : null;
  const events = wanted ? raw.filter(e => wanted.has(mockKind(e))) : raw;

  const rows: EvidenceRow[] = [];
  const bySentence = new Map<string, MockEvent[]>();
  for (const e of events) {
    if (e.sentenceId) {
      const list = bySentence.get(e.sentenceId) ?? [];
      list.push(e);
      bySentence.set(e.sentenceId, list);
    }
  }
  for (const [sentenceId, list] of bySentence) {
    const ordered = [...list].sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);
    const running: string[] = [];
    for (const e of ordered) {
      if (e.eventType !== 'word_selected') {
        continue;
      }
      running.push(e.wordText);
      const n = running.length;
      const level = mockSupport(e.supportLevel);
      rows.push({
        id: `${sentenceId}-w${n}`, timestampMs: mockEventTimestampMs(e), speaker: childName, badge: 'Sentence', category: 'sentences',
        content: running.join(' '), detail: words(n), status: level !== 'unrated' ? level : n === 1 ? 'started' : 'continued',
        isCompletion: false, sentenceId, supportLevel: null, communicationFunction: null, isQuestion: false, wordCount: n,
      });
    }
    const completion = ordered.find(e => e.eventType === 'sentence_completed');
    if (completion) {
      const key = `${dataset.id}/${sessionId}/${sentenceId}`;
      const support = mockSupport(overlay.support[key] ?? completion.supportLevel);
      const fn = communicationFunctionFromNetwork(overlay.functions[key] ?? completion.communicationFunction) ?? 'otherOrUnclear';
      const count = completion.wordCount ?? running.length;
      rows.push({
        id: `${sentenceId}-done`, timestampMs: mockEventTimestampMs(completion), speaker: childName,
        badge: COMMUNICATION_FUNCTION_LABEL[fn], category: 'sentences', content: completion.content, detail: words(count),
        status: 'completed', isCompletion: true, sentenceId, supportLevel: support, communicationFunction: fn,
        isQuestion: fn === 'question', wordCount: count,
      });
    }
  }
  for (const e of events) {
    if (e.sentenceId) {
      continue;
    }
    const ts = mockEventTimestampMs(e);
    if (e.eventType === 'qna_question_presented' || e.eventType === 'qna_answer_selected') {
      rows.push({
        id: e.eventId, timestampMs: ts, speaker: childName, badge: 'Question', category: 'questions',
        content: e.answerText || e.questionText, detail: null, status: 'continued', isCompletion: false, sentenceId: null,
        supportLevel: null, communicationFunction: null, isQuestion: e.eventType === 'qna_question_presented', wordCount: null,
      });
    } else if (e.eventType === 'page_opened') {
      rows.push({
        id: e.eventId, timestampMs: ts, speaker: childName, badge: 'Navigation', category: 'navigation',
        content: `${e.fromPageId || e.context} → ${e.toPageId || e.pageId}`, detail: null, status: 'continued', isCompletion: false,
        sentenceId: null, supportLevel: null, communicationFunction: null, isQuestion: false, wordCount: null,
      });
    } else if (e.eventType === 'conversation_turn') {
      rows.push({
        id: e.eventId, timestampMs: ts, speaker: e.speaker.toLowerCase().includes('child') ? childName : 'PARTNER',
        badge: 'Support', category: 'support', content: e.content, detail: null, status: 'continued', isCompletion: false,
        sentenceId: null, supportLevel: null, communicationFunction: null, isQuestion: false, wordCount: null,
      });
    }
  }
  rows.sort((a, b) => a.timestampMs - b.timestampMs);
  const timestamps = raw.map(mockEventTimestampMs);
  const completions = rows.filter(r => r.isCompletion);
  return {
    sessionId,
    startedAtMs: timestamps.length > 0 ? Math.min(...timestamps) : null,
    endedAtMs: timestamps.length > 0 ? Math.max(...timestamps) : null,
    independentCount: completions.filter(r => r.supportLevel === 'independent').length,
    promptedCount: completions.filter(r => r.supportLevel === 'prompted').length,
    assistedCount: completions.filter(r => r.supportLevel === 'assisted').length,
    rows,
  };
}

/** Function filters OR within the group, support filters OR within the group, AND across groups. */
export function filterEvidenceRows(rows: readonly EvidenceRow[], selection: ReadonlySet<EvidenceFilter>): EvidenceRow[] {
  const wantsQuestions = selection.has('questions');
  const wantsRequests = selection.has('requests');
  const functions = wantsQuestions || wantsRequests;
  const levels = (['independent', 'prompted', 'assisted'] as const).filter(l => selection.has(l));
  return rows.filter(row => {
    const matchesFunction =
      !functions ||
      (wantsQuestions && (row.isQuestion || row.communicationFunction === 'question')) ||
      (wantsRequests && row.communicationFunction === 'request');
    const matchesSupport = levels.length === 0 || (row.supportLevel !== null && levels.includes(row.supportLevel as (typeof levels)[number]));
    return matchesFunction && matchesSupport;
  });
}

/** "independent sentence length increased from A to B words in this session." or null. */
export function evidencePatternText(rows: readonly EvidenceRow[]): string | null {
  const lengths = rows
    .filter(r => r.category === 'sentences' && r.status === 'independent' && r.wordCount !== null)
    .map(r => r.wordCount as number);
  if (lengths.length === 0) {
    return null;
  }
  const first = lengths[0];
  const peak = Math.max(...lengths);
  if (peak <= first) {
    return null;
  }
  return `independent sentence length increased from ${first} to ${peak} words in this session.`;
}

/** Whether the AI tag belongs on the events table header. */
export function evidenceUsesAi(rows: readonly EvidenceRow[]): boolean {
  return rows.some(r => r.badge !== 'Sentence' || r.status === 'independent' || r.status === 'prompted');
}

export const QUALIFYING_METRIC_ID = MetricCatalogue.qualifyingSentences.id;
