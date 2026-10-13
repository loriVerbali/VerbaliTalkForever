/**
 * Persisted IEP records and enums, following contracts/data-model-and-api-contract.md.
 *
 * Field names are camelCase in memory. Network payloads use snake_case and are
 * normalised at the AI boundary. Timestamps are epoch milliseconds in memory and
 * ISO 8601 on the wire.
 */

export type ActionKind =
  | 'wordSelected'
  | 'wordRemoved'
  | 'sentencePlayed'
  | 'sentenceCleared'
  | 'sentenceAbandoned'
  | 'pageOpened'
  | 'qaAnswerSelected'
  | 'moreAnswersRequested'
  | 'quickPhrasePlayed'
  | 'typedMessagePlayed';

export type SentenceEndingReason = 'play' | 'clear' | 'inactivity';

export type CommunicationSource = 'boardSentence' | 'qaAnswer' | 'typedMessage' | 'quickPhrase';

export type CommunicationFunction =
  | 'request'
  | 'comment'
  | 'protest'
  | 'question'
  | 'answer'
  | 'preference'
  | 'help'
  | 'regulationNeed'
  | 'boundary'
  | 'otherOrUnclear';

export const COMMUNICATION_FUNCTIONS: readonly CommunicationFunction[] = [
  'request',
  'comment',
  'protest',
  'question',
  'answer',
  'preference',
  'help',
  'regulationNeed',
  'boundary',
  'otherOrUnclear',
];

export const COMMUNICATION_FUNCTION_LABEL: Record<CommunicationFunction, string> = {
  request: 'Request',
  comment: 'Comment',
  protest: 'Protest',
  question: 'Question',
  answer: 'Answer',
  preference: 'Preference',
  help: 'Help',
  regulationNeed: 'Regulation need',
  boundary: 'Boundary',
  otherOrUnclear: 'Other / unclear',
};

/** Network spellings use snake_case for the two multi-word functions. */
export function communicationFunctionFromNetwork(raw: string): CommunicationFunction | null {
  switch (raw.trim().toLowerCase()) {
    case 'request':
      return 'request';
    case 'comment':
    case 'greeting':
    case 'social':
    case 'retell':
      return 'comment';
    case 'protest':
      return 'protest';
    case 'question':
      return 'question';
    case 'answer':
      return 'answer';
    case 'preference':
      return 'preference';
    case 'help':
    case 'repair':
      return 'help';
    case 'regulation':
    case 'regulation_need':
    case 'regulationneed':
      return 'regulationNeed';
    case 'boundary':
      return 'boundary';
    case 'other':
    case 'unknown':
    case 'other_or_unclear':
    case 'otherorunclear':
      return 'otherOrUnclear';
    default:
      return null;
  }
}

export function communicationFunctionToNetwork(fn: CommunicationFunction): string {
  switch (fn) {
    case 'regulationNeed':
      return 'regulation_need';
    case 'otherOrUnclear':
      return 'other_or_unclear';
    default:
      return fn;
  }
}

export type ClassificationSource = 'ruleBased' | 'ai' | 'manual' | 'unavailable';

export type SupportLevel = 'unrated' | 'independent' | 'prompted' | 'assisted';

export const SUPPORT_LEVELS: readonly SupportLevel[] = ['unrated', 'independent', 'prompted', 'assisted'];

export const SUPPORT_LEVEL_LABEL: Record<SupportLevel, string> = {
  unrated: 'Not reviewed',
  independent: 'Independent',
  prompted: 'Prompted',
  assisted: 'Assisted',
};

export type SessionReviewState = 'awaitingReview' | 'finalized';

export type GoalMetricRole = 'direct' | 'supporting' | 'context';

export const GOAL_METRIC_ROLE_LABEL: Record<GoalMetricRole, string> = {
  direct: 'Measures the goal',
  supporting: 'Supporting measure',
  context: 'Context only',
};

export const PART_OF_SPEECH_KEYS = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'pronoun',
  'interjection',
] as const;
export type PartOfSpeech = (typeof PART_OF_SPEECH_KEYS)[number];

// Goals

export interface MetricConstraints {
  minimumWordsPerSentence?: number | null;
}

export interface GoalAchievementRule {
  type: string;
  requiredMetricIds: string[];
  explanation: string;
}

export interface GoalMetric {
  id: string;
  name: string;
  category: string;
  definition: string;
  measurementMethod: string;
  role?: GoalMetricRole | null;
  /** Conditions on what qualifies as a measurement. Conditions are not targets. */
  constraints?: MetricConstraints | null;
  /** Set only when the goal itself states a target for this measure. */
  targetValue?: number | null;
  targetUnit?: string | null;
  targetTimeframe?: string | null;
  /** Whether the app can calculate this measure from session data. */
  isSupported?: boolean | null;
}

export interface GoalCalculation {
  primaryMetricId: string;
  /** 'atLeast' | 'atMost' | 'range' | 'descriptive', or legacy 'at least'. */
  comparisonOperator: string;
  requiredConditions: string[];
  requiredSessionCount?: number | null;
  eligibleEvidenceTypes: string[];
  calculationVersion: number;
  /** null means the goal is not sentence-length based. */
  minimumWordsPerSentence?: number | null;
  requiredPartOfSpeechCounts?: Record<string, number> | null;
  allowedSupportLevels?: string[] | null;
  /** Absent on older goals, which were all scored as streaks, so null means consecutive. */
  requiresConsecutiveSessions?: boolean | null;
}

export interface GoalPlan {
  goalTitle: string;
  goalSummary: string;
  metrics: GoalMetric[];
  condition: string;
  targetValue: number;
  targetUnit: string;
  timeframe: string;
  consecutiveSessions?: number | null;
  dashboardTitle: string;
  dashboardTiles: string[];
  confidenceNote: string;
  provider?: string | null;
  achievementRule?: GoalAchievementRule | null;
  calculation?: GoalCalculation | null;
}

export interface IepGoal {
  id: string;
  title: string;
  description: string;
  targetValue: number;
  targetUnit: string;
  timeframe: string;
  isActive: boolean;
  createdAtMs: number;
  plan?: GoalPlan | null;
  /** Assigned once at creation and never derived from the current list order. */
  displayNumber?: number | null;
  /** Synthetic source selected for this goal in mock mode only. */
  mockDataSourceId?: string | null;
  /** Clinician-selected review date. Scheduling metadata, not the reporting period. */
  targetDateMs?: number | null;
}

// Sessions and events

export interface GoalOutcomeSnapshot {
  id: string;
  goalId: string;
  metricName: string;
  metricResult: number;
  target: number;
  didMeetTarget: boolean;
  reason?: string | null;
}

export interface IepSession {
  id: string;
  startedAtMs: number;
  endedAtMs?: number | null;
  partnerType: string;
  treatmentContext: string;
  trackedGoalIds: string[];
  goalOutcomes: GoalOutcomeSnapshot[];
  reviewState?: SessionReviewState | null;
}

export interface ActivityEvent {
  id: string;
  sessionId: string;
  timestampMs: number;
  action: ActionKind;
  pageId?: string | null;
  destinationPageId?: string | null;
  word?: string | null;
  sentenceId?: string | null;
  answer?: string | null;
  isRepeatInSession: boolean;
  contributesToSentence: boolean;
}

export interface WordMeasurement {
  id: string;
  word: string;
  selectedAtMs: number;
  pageId?: string | null;
  sentenceId?: string | null;
  partOfSpeech?: string | null;
  wasRemoved: boolean;
  wasPreviouslySelectedInSession: boolean;
}

export interface SentenceMeasurement {
  id: string;
  sessionId: string;
  conversationId?: string | null;
  startedAtMs: number;
  endedAtMs: number;
  endingReason: SentenceEndingReason;
  wordsAdded: WordMeasurement[];
  wordsRemoved: WordMeasurement[];
  finalWords: string[];
  playPressed: boolean;
  wasCleared: boolean;
  wasAbandoned: boolean;
}

export interface SentenceReview {
  id: string;
  sessionId: string;
  sentenceId: string;
  supportLevel: SupportLevel;
  reviewedAtMs?: number | null;
}

export interface ContentAnalysis {
  communicationFunction?: CommunicationFunction | null;
  functionSource: ClassificationSource;
  functionConfidence?: number | null;
  isQuestion?: boolean | null;
  whQuestionType?: string | null;
  expressesPreference?: boolean | null;
  setsBoundary?: boolean | null;
  relatesToRegulation?: boolean | null;
  introducesNewInformation?: boolean | null;
  isPartOfRetelling?: boolean | null;
  retellingDetails: string[];
  requiredSentenceFeatures: Record<string, boolean>;
  grammarResult?: boolean | null;
}

export const UNAVAILABLE_ANALYSIS: ContentAnalysis = {
  communicationFunction: null,
  functionSource: 'unavailable',
  functionConfidence: null,
  isQuestion: null,
  whQuestionType: null,
  expressesPreference: null,
  setsBoundary: null,
  relatesToRegulation: null,
  introducesNewInformation: null,
  isPartOfRetelling: null,
  retellingDetails: [],
  requiredSentenceFeatures: {},
  grammarResult: null,
};

export interface CommunicationMeasurement {
  id: string;
  sessionId: string;
  timestampMs: number;
  source: CommunicationSource;
  content: string;
  sentenceId?: string | null;
  question?: string | null;
  previousPartnerTurn?: string | null;
  responseTimeMs?: number | null;
  analysis: ContentAnalysis;
}

export interface NavigationMeasurement {
  id: string;
  sessionId: string;
  timestampMs: number;
  startingPage: string;
  destinationPage: string;
  fullPath: string[];
  numberOfSteps: number;
  targetPageReached?: boolean | null;
  wordSelectedAfterNavigation?: string | null;
  destinationWasAlreadyVisited: boolean;
}

export interface QaMeasurement {
  id: string;
  sessionId: string;
  timestampMs: number;
  question: string;
  options: string[];
  selectedAnswer: string;
  answerRoundCount: number;
  askedForMoreAnswers: boolean;
  /** Null when the question-to-tap timer was not running. */
  responseTimeMs: number | null;
}

export interface ConversationMeasurement {
  id: string;
  sessionId: string;
  startedAtMs: number;
  endedAtMs?: number | null;
  firstSpeaker?: string | null;
  partnerType: string;
  turnIds: string[];
}

export interface TurnMeasurement {
  id: string;
  sessionId: string;
  conversationId: string;
  speaker: string;
  startedAtMs: number;
  endedAtMs?: number | null;
  content?: string | null;
  childResponded?: boolean | null;
  timeUntilNextTurnMs?: number | null;
}

export interface SupportMeasurement {
  id: string;
  sessionId: string;
  timestampMs: number;
  supportLevel: string;
  confidence?: number | null;
  detectedSpokenPrompt?: string | null;
  detectedPartnerQuestion?: string | null;
  detectedModel?: string | null;
  appGeneratedAssistance?: string | null;
  slpCorrection?: string | null;
}

export interface RepairMeasurement {
  id: string;
  sessionId: string;
  conversationId?: string | null;
  originalSentence: string;
  partnerResponse?: string | null;
  evidenceOfMisunderstanding?: string | null;
  revisedSentence?: string | null;
  wordsAddedOrRemoved: string[];
  wasRepeatedOrRephrased?: boolean | null;
  partnerResponseAfterRepair?: string | null;
  conversationContinued?: boolean | null;
  wasSuccessful?: boolean | null;
}

export interface RetellingMeasurement {
  id: string;
  sessionId: string;
  startedAtMs: number;
  endedAtMs?: number | null;
  sentences: string[];
  people: string[];
  places: string[];
  objects: string[];
  actions: string[];
  feelings: string[];
  timeReferences: string[];
  eventOrderInformation: string[];
}

/** Size of the set union of the seven detail arrays. */
export function retellingDistinctDetailCount(r: RetellingMeasurement): number {
  return new Set([
    ...r.people,
    ...r.places,
    ...r.objects,
    ...r.actions,
    ...r.feelings,
    ...r.timeReferences,
    ...r.eventOrderInformation,
  ]).size;
}

export interface InProgressSentence {
  id: string;
  sessionId: string;
  startedAtMs: number;
  wordsAdded: WordMeasurement[];
  wordsRemoved: WordMeasurement[];
}

/** Everything the measurement archive holds, mirroring the reference archive. */
export interface MeasurementArchive {
  schemaVersion: number;
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

export const MEASUREMENT_SCHEMA_VERSION = 1;

export function emptyArchive(): MeasurementArchive {
  return {
    schemaVersion: MEASUREMENT_SCHEMA_VERSION,
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

/** A saved record that existed and could not be read. */
export interface StorageFailure {
  what: 'goals' | 'measurements';
  message: string;
  quarantinedCopy?: string | null;
}
