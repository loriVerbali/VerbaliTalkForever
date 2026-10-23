/**
 * The in-memory shape of everything recorded, plus per-session slicing helpers shared by
 * live measurement, evidence, and persistence.
 */

import {
  ActivityEvent,
  CommunicationMeasurement,
  ConversationMeasurement,
  IepSession,
  InProgressSentence,
  NavigationMeasurement,
  QaMeasurement,
  RepairMeasurement,
  RetellingMeasurement,
  SentenceMeasurement,
  SentenceReview,
  SupportMeasurement,
  TurnMeasurement,
} from '../model/types';

export interface MeasurementState {
  sessions: IepSession[];
  activities: ActivityEvent[];
  sentences: SentenceMeasurement[];
  communications: CommunicationMeasurement[];
  navigations: NavigationMeasurement[];
  qaMeasurements: QaMeasurement[];
  conversations: ConversationMeasurement[];
  turns: TurnMeasurement[];
  supports: SupportMeasurement[];
  repairs: RepairMeasurement[];
  retellings: RetellingMeasurement[];
  sentenceReviews: SentenceReview[];
  inProgressSentences: InProgressSentence[];
}

export function emptyMeasurementState(): MeasurementState {
  return {
    sessions: [],
    activities: [],
    sentences: [],
    communications: [],
    navigations: [],
    qaMeasurements: [],
    conversations: [],
    turns: [],
    supports: [],
    repairs: [],
    retellings: [],
    sentenceReviews: [],
    inProgressSentences: [],
  };
}

export interface SessionSlice {
  session: IepSession;
  activities: ActivityEvent[];
  sentences: SentenceMeasurement[];
  communications: CommunicationMeasurement[];
  navigations: NavigationMeasurement[];
  qaMeasurements: QaMeasurement[];
  conversations: ConversationMeasurement[];
  turns: TurnMeasurement[];
  supports: SupportMeasurement[];
  repairs: RepairMeasurement[];
  retellings: RetellingMeasurement[];
  sentenceReviews: SentenceReview[];
  inProgressSentences: InProgressSentence[];
}

export function sliceSession(state: MeasurementState, sessionId: string): SessionSlice | null {
  const session = state.sessions.find(s => s.id === sessionId);
  if (!session) {
    return null;
  }
  const by = <T extends { sessionId: string }>(items: T[]) => items.filter(i => i.sessionId === sessionId);
  return {
    session,
    activities: by(state.activities),
    sentences: by(state.sentences),
    communications: by(state.communications),
    navigations: by(state.navigations),
    qaMeasurements: by(state.qaMeasurements),
    conversations: by(state.conversations),
    turns: by(state.turns),
    supports: by(state.supports),
    repairs: by(state.repairs),
    retellings: by(state.retellings),
    sentenceReviews: by(state.sentenceReviews),
    inProgressSentences: by(state.inProgressSentences),
  };
}
