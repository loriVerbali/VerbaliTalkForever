/**
 * The one door through which the AAC app reports what the child did.
 *
 * Every call is a no-op unless an SLP has explicitly started an IEP session, so the
 * keyboard, Q&A, free-text keyboard and Verbi hooks can call this unconditionally.
 * Nothing here interprets meaning; it only records events into the store.
 */

import { IepMeasurementStore } from '../store/measurementStore';
import { SentenceEndingReason } from '../model/types';

let store: IepMeasurementStore | null = null;
let currentSentenceId: string | null = null;
/** The session the sentence in progress belongs to; a new session starts with no sentence. */
let currentSessionId: string | null = null;

export function attachIepCaptureStore(next: IepMeasurementStore | null): void {
  store = next;
  currentSentenceId = null;
  currentSessionId = null;
}

function activeStore(): IepMeasurementStore | null {
  const active = store?.activeSession ?? null;
  if (!store || !active) {
    currentSentenceId = null;
    currentSessionId = null;
    return null;
  }
  if (active.id !== currentSessionId) {
    // The store flushed the previous session's drafts itself, so a sentence id from
    // that session must never be reused for the first words of this one.
    currentSessionId = active.id;
    currentSentenceId = null;
  }
  return store;
}

export const iepCapture = {
  isRecording(): boolean {
    return activeStore() !== null;
  },

  /** A word or symbol added to the sentence in progress. Returns the sentence id, when recording. */
  wordSelected(word: string, pageId: string, partOfSpeech?: string | null): string | null {
    const s = activeStore();
    if (!s) {
      return null;
    }
    currentSentenceId = s.recordWordSelection({
      word,
      pageId,
      sentenceId: currentSentenceId,
      partOfSpeech: partOfSpeech ?? null,
    });
    return currentSentenceId;
  },

  wordRemoved(word: string, pageId: string): void {
    const s = activeStore();
    if (!s || !currentSentenceId) {
      return;
    }
    s.recordWordRemoval({ word, pageId, sentenceId: currentSentenceId });
  },

  /** The sentence in progress ended by Play, Clear, or inactivity. */
  sentenceEnded(finalWords: readonly string[], reason: SentenceEndingReason): void {
    const s = activeStore();
    const id = currentSentenceId;
    currentSentenceId = null;
    if (!s || !id) {
      return;
    }
    s.completeSentence(id, finalWords, reason);
  },

  /** A quick phrase or single button spoken outside a sentence. */
  standaloneWord(word: string, pageId: string): void {
    activeStore()?.recordStandaloneWord(word, pageId, 'quickPhrasePlayed');
  },

  pageOpened(fromPage: string, toPage: string): void {
    activeStore()?.recordNavigation(fromPage, toPage);
  },

  typedMessageSpoken(text: string): void {
    activeStore()?.recordTypedCommunication(text);
  },

  qaAnswerSelected(params: {
    question: string;
    answer: string;
    options: string[];
    answerRoundCount: number;
    askedForMoreAnswers: boolean;
    /** Null when the question-to-tap timer was not running. */
    responseTimeMs: number | null;
  }): void {
    activeStore()?.recordQaAnswer(params);
  },

  qaMoreAnswersRequested(): void {
    activeStore()?.recordQaGetMoreAnswers();
  },

  /**
   * A turn in a conversation observed by the partner-turn model. The store records the
   * conversation itself the first time it sees the id, so whoever spoke first is the
   * initiator regardless of which hook reported the turn.
   */
  turnObserved(params: { turnId: string; conversationId: string; speaker: string; startedAtMs: number; content?: string | null }): void {
    const s = activeStore();
    if (!s) {
      return;
    }
    s.recordTurn({
      id: params.turnId,
      sessionId: s.activeSession!.id,
      conversationId: params.conversationId,
      speaker: params.speaker,
      startedAtMs: params.startedAtMs,
      endedAtMs: null,
      content: params.content ?? null,
      childResponded: null,
      timeUntilNextTurnMs: null,
    });
  },
};
