/**
 * Persistence contract for IEP goals and measurements.
 *
 * Goals and measurements are stored separately. Measurements are stored one file per
 * session so recording an event rewrites only that session, and a damaged file
 * quarantines one session rather than the whole record. Implementations must be atomic
 * per write and must never replace an unreadable input with an empty default.
 */

import {
  ActivityEvent,
  CommunicationMeasurement,
  ConversationMeasurement,
  IepGoal,
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

export interface SessionArchive {
  schemaVersion: number;
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

export interface LoadFailure {
  /** Which file could not be read. */
  name: string;
  message: string;
  quarantinedCopy: string | null;
}

export type LoadResult<T> =
  | { kind: 'missing' }
  | { kind: 'ok'; value: T }
  | { kind: 'unreadable'; failure: LoadFailure };

export interface IepPersistence {
  loadGoals(): Promise<LoadResult<IepGoal[]>>;
  saveGoals(goals: readonly IepGoal[]): Promise<void>;
  loadSessions(): Promise<{ archives: SessionArchive[]; failures: LoadFailure[] }>;
  saveSession(archive: SessionArchive): Promise<void>;
}

/** Stable JSON so the same state always serialises to the same bytes. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) {
        out[key] = sortKeys(v);
      }
    }
    return out;
  }
  return value;
}

/** Parses a goals file. Throws on anything that is not an array of goal-shaped objects. */
export function parseGoalsJson(text: string): IepGoal[] {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error('goals file is not an array');
  }
  for (const goal of parsed) {
    if (!goal || typeof goal !== 'object' || typeof (goal as IepGoal).id !== 'string') {
      throw new Error('goals file contains a record without an id');
    }
  }
  return parsed as IepGoal[];
}

/** Parses a session file. Throws when the required arrays are absent. */
export function parseSessionJson(text: string): SessionArchive {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('session file is not an object');
  }
  const archive = parsed as Partial<SessionArchive>;
  if (!archive.session || typeof archive.session.id !== 'string') {
    throw new Error('session file has no session');
  }
  const arr = <T>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);
  return {
    schemaVersion: typeof archive.schemaVersion === 'number' ? archive.schemaVersion : 1,
    session: archive.session,
    activities: arr(archive.activities),
    sentences: arr(archive.sentences),
    communications: arr(archive.communications),
    navigations: arr(archive.navigations),
    qaMeasurements: arr(archive.qaMeasurements),
    conversations: arr(archive.conversations),
    turns: arr(archive.turns),
    supports: arr(archive.supports),
    repairs: arr(archive.repairs),
    retellings: arr(archive.retellings),
    sentenceReviews: arr(archive.sentenceReviews),
    inProgressSentences: arr(archive.inProgressSentences),
  };
}
