/**
 * Local, event-level IEP goal and measurement store.
 *
 * Records only what the AAC app observes and leaves fields that require a partner, an
 * SLP, or a content-understanding service explicitly unavailable rather than guessing.
 * Operations are synchronous on in-memory state; persistence runs behind a serialised
 * queue, one file per session plus one goals file. A file that could not be read blocks
 * every write for the rest of the launch and is surfaced as a storage failure.
 */

import { MeasurementResult, MetricId } from '../core';
import { analyzeContent } from '../model/contentAnalysis';
import { inferredCalculation } from '../model/goalCalculation';
import { IdGenerator, randomIds } from '../model/ids';
import { classifyPartOfSpeech } from '../model/partOfSpeech';
import {
  ActionKind,
  CommunicationFunction,
  CommunicationMeasurement,
  CommunicationSource,
  ConversationMeasurement,
  GoalOutcomeSnapshot,
  GoalPlan,
  IepGoal,
  IepSession,
  InProgressSentence,
  MEASUREMENT_SCHEMA_VERSION,
  QaMeasurement,
  RepairMeasurement,
  RetellingMeasurement,
  SentenceEndingReason,
  SentenceMeasurement,
  SentenceReview,
  StorageFailure,
  SupportLevel,
  SupportMeasurement,
  TurnMeasurement,
  WordMeasurement,
  communicationFunctionFromNetwork,
} from '../model/types';
import { LiveMeasurementOptions, liveMeasurement } from './liveMeasurement';
import { MeasurementState, emptyMeasurementState, sliceSession } from './measurementState';
import { IepPersistence, SessionArchive } from './persistence';

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

/** Taps arrive in bursts; one archive write per session per window, not one per tap. */
const SESSION_WRITE_DELAY_MS = 400;

export interface EventAnalysisResult {
  eventId: string;
  status: string;
  communicationFunction: string;
  communicationFunctionConfidence?: number | null;
  isQuestion?: boolean | null;
  whQuestionType?: string | null;
  expressesPreference?: boolean | null;
  setsBoundary?: boolean | null;
  relatesToRegulation?: boolean | null;
  isNovelContribution?: boolean | null;
  isPartOfRetelling?: boolean | null;
  retellingDetails?: string[] | null;
  requiredSentenceFeatures?: Record<string, boolean | null> | null;
}

export interface SessionMetricSnapshot {
  sentenceCount: number;
  averageWordsPerSentence: number;
  totalWordCountPerSentence: number;
  qualifyingSentenceCount: number;
  navigationCount: number;
  uniquePagesVisited: number;
  uniqueWordsActivated: number;
  totalWordActivations: number;
  deviceInteractionCount: number;
  questionCount: number;
  whQuestionCount: number;
  communicationFunctionCounts: Partial<Record<CommunicationFunction, number>>;
}

export interface StoreOptions {
  clock?: Clock;
  ids?: IdGenerator;
}

type Listener = () => void;

export class IepMeasurementStore {
  private state: MeasurementState = emptyMeasurementState();
  private goalList: IepGoal[] = [];
  private navigationPaths = new Map<string, string[]>();
  private failure: StorageFailure | null = null;
  private listeners = new Set<Listener>();
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly pendingSessionWrites = new Map<string, ReturnType<typeof setTimeout>>();
  private loaded = false;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;

  constructor(
    private readonly persistence: IepPersistence,
    options: StoreOptions = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.ids = options.ids ?? randomIds;
  }

  // Loading

  async load(): Promise<void> {
    try {
      await this.loadUnguarded();
    } catch (error) {
      // A read that threw (not merely unreadable) must not leave the store looking
      // empty and healthy: the next save would replace every record with nothing.
      this.failure = this.failure ?? {
        what: 'goals',
        message: `Saved IEP records could not be read and have not been changed. ${String(error)}`,
        quarantinedCopy: null,
      };
      this.loaded = true;
      this.notify();
    }
  }

  private async loadUnguarded(): Promise<void> {
    const goals = await this.persistence.loadGoals();
    if (goals.kind === 'unreadable') {
      this.failure = {
        what: 'goals',
        message: 'Saved goals could not be read and have not been changed. A copy of the file is kept alongside it.',
        quarantinedCopy: goals.failure.quarantinedCopy,
      };
      this.goalList = [];
    } else if (goals.kind === 'ok') {
      this.goalList = this.migrateGoals(goals.value);
    } else {
      this.goalList = [];
    }

    const sessions = await this.persistence.loadSessions();
    if (sessions.failures.length > 0 && !this.failure) {
      this.failure = {
        what: 'measurements',
        message: 'Saved measurements could not be read and have not been changed. A copy of the file is kept alongside it.',
        quarantinedCopy: sessions.failures[0].quarantinedCopy,
      };
    }
    const next = emptyMeasurementState();
    for (const archive of sessions.archives) {
      next.sessions.push(archive.session);
      next.activities.push(...archive.activities);
      next.sentences.push(...archive.sentences);
      next.communications.push(...archive.communications);
      next.navigations.push(...archive.navigations);
      next.qaMeasurements.push(...archive.qaMeasurements);
      next.conversations.push(...archive.conversations);
      next.turns.push(...archive.turns);
      next.supports.push(...archive.supports);
      next.repairs.push(...archive.repairs);
      next.retellings.push(...archive.retellings);
      next.sentenceReviews.push(...archive.sentenceReviews);
      next.inProgressSentences.push(...archive.inProgressSentences);
    }
    next.sessions.sort((a, b) => a.startedAtMs - b.startedAtMs);
    this.state = next;
    for (const navigation of next.navigations) {
      this.navigationPaths.set(navigation.sessionId, navigation.fullPath);
    }
    this.loaded = true;
    this.notify();
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  /** Writes every pending session and waits for the queue. Tests use it before reloading. */
  async flush(): Promise<void> {
    for (const sessionId of [...this.pendingSessionWrites.keys()]) {
      this.writePendingSession(sessionId);
    }
    await this.writeQueue;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  // Read access

  get storageFailure(): StorageFailure | null {
    return this.failure;
  }

  get goals(): readonly IepGoal[] {
    return this.goalList;
  }

  get activeGoals(): IepGoal[] {
    return this.goalList.filter(g => g.isActive);
  }

  get sessions(): readonly IepSession[] {
    return this.state.sessions;
  }

  get sentences(): readonly SentenceMeasurement[] {
    return this.state.sentences;
  }

  get communications(): readonly CommunicationMeasurement[] {
    return this.state.communications;
  }

  get sentenceReviews(): readonly SentenceReview[] {
    return this.state.sentenceReviews;
  }

  /** The full in-memory state, for measurement sources and evidence builders. */
  snapshot(): MeasurementState {
    return this.state;
  }

  get activeSession(): IepSession | null {
    for (let i = this.state.sessions.length - 1; i >= 0; i -= 1) {
      const s = this.state.sessions[i];
      if (s.endedAtMs === null || s.endedAtMs === undefined) {
        return s;
      }
    }
    return null;
  }

  get sessionsAwaitingReview(): IepSession[] {
    return this.state.sessions
      .filter(s => s.reviewState === 'awaitingReview')
      .sort((a, b) => b.startedAtMs - a.startedAtMs);
  }

  session(sessionId: string): IepSession | null {
    return this.state.sessions.find(s => s.id === sessionId) ?? null;
  }

  // Goals

  addGoal(params: {
    title: string;
    description: string;
    targetValue: number;
    targetUnit: string;
    timeframe: string;
    plan?: GoalPlan | null;
    targetDateMs?: number | null;
  }): IepGoal | null {
    const title = params.title.trim();
    if (title.length === 0) {
      return null;
    }
    let plan = params.plan ?? null;
    if (plan && !plan.calculation) {
      plan = { ...plan, calculation: inferredCalculation(plan) };
    }
    const goal: IepGoal = {
      id: this.ids.next(),
      title,
      description: params.description.trim(),
      targetValue: Math.max(0, params.targetValue),
      targetUnit: params.targetUnit,
      timeframe: params.timeframe,
      isActive: true,
      createdAtMs: this.clock.now(),
      plan,
      displayNumber: Math.max(0, ...this.goalList.map(g => g.displayNumber ?? 0)) + 1,
      mockDataSourceId: null,
      targetDateMs: params.targetDateMs ?? null,
    };
    this.goalList = [...this.goalList, goal];
    this.persistGoals();
    return goal;
  }

  updateGoal(goalId: string, update: (goal: IepGoal) => IepGoal): void {
    const index = this.goalList.findIndex(g => g.id === goalId);
    if (index < 0) {
      return;
    }
    const next = [...this.goalList];
    next[index] = update(next[index]);
    this.goalList = next;
    this.persistGoals();
  }

  deleteGoal(goalId: string): void {
    this.goalList = this.goalList.filter(g => g.id !== goalId);
    this.persistGoals();
  }

  setMockDataSource(goalId: string, sourceId: string | null): void {
    this.updateGoal(goalId, g => ({ ...g, mockDataSourceId: sourceId }));
  }

  setGoalTargetDate(goalId: string, targetDateMs: number | null): void {
    this.updateGoal(goalId, g => ({ ...g, targetDateMs }));
  }

  // Sessions

  startSession(params: { partnerType?: string; treatmentContext?: string; trackedGoalIds?: string[] } = {}): string {
    const active = this.activeSession;
    if (active) {
      return active.id;
    }
    const session: IepSession = {
      id: this.ids.next(),
      startedAtMs: this.clock.now(),
      endedAtMs: null,
      partnerType: params.partnerType ?? 'unknown',
      treatmentContext: params.treatmentContext ?? 'unspecified',
      trackedGoalIds: params.trackedGoalIds ?? [],
      goalOutcomes: [],
      reviewState: null,
    };
    this.state.sessions.push(session);
    this.navigationPaths.set(session.id, []);
    this.persistSession(session.id, true);
    return session.id;
  }

  endActiveSession(): void {
    const active = this.activeSession;
    if (!active) {
      return;
    }
    active.endedAtMs = this.clock.now();
    active.reviewState = 'finalized';
    this.persistSession(active.id, true);
  }

  /** Stops capture, flushes drafts as abandoned sentences, and opens one review row per sentence. */
  stopActiveSessionForReview(): string | null {
    const active = this.activeSession;
    if (!active) {
      return null;
    }
    const sessionId = active.id;
    const drafts = this.state.inProgressSentences.filter(d => d.sessionId === sessionId);
    for (const draft of drafts) {
      const remaining = draft.wordsAdded.map(w => w.word);
      for (const removed of draft.wordsRemoved) {
        const index = remaining.lastIndexOf(removed.word);
        if (index >= 0) {
          remaining.splice(index, 1);
        }
      }
      this.completeSentence(draft.id, remaining, 'inactivity', false);
    }
    active.endedAtMs = this.clock.now();
    active.reviewState = 'awaitingReview';
    this.ensureSentenceReviews(sessionId);
    this.persistSession(sessionId, true);
    return sessionId;
  }

  sentenceReview(sentenceId: string): SentenceReview | null {
    return this.state.sentenceReviews.find(r => r.sentenceId === sentenceId) ?? null;
  }

  setSupportLevel(sentenceId: string, level: SupportLevel): void {
    const sentence = this.state.sentences.find(s => s.id === sentenceId);
    if (!sentence) {
      return;
    }
    this.ensureSentenceReviews(sentence.sessionId);
    const review = this.state.sentenceReviews.find(r => r.sentenceId === sentenceId);
    if (!review) {
      return;
    }
    review.supportLevel = level;
    review.reviewedAtMs = level === 'unrated' ? null : this.clock.now();
    this.persistSession(sentence.sessionId);
  }

  setCommunicationFunction(sentenceId: string, fn: CommunicationFunction): void {
    const communication = this.state.communications.find(c => c.sentenceId === sentenceId);
    if (!communication) {
      return;
    }
    communication.analysis = {
      ...communication.analysis,
      communicationFunction: fn,
      functionSource: 'manual',
      functionConfidence: null,
    };
    this.persistSession(communication.sessionId);
  }

  canFinalizeReview(sessionId: string): boolean {
    return this.state.sentences
      .filter(s => s.sessionId === sessionId)
      .every(s => (this.sentenceReview(s.id)?.supportLevel ?? 'unrated') !== 'unrated');
  }

  finalizeSessionReview(sessionId: string): boolean {
    const session = this.session(sessionId);
    if (!session || !this.canFinalizeReview(sessionId)) {
      return false;
    }
    session.reviewState = 'finalized';
    this.persistSession(sessionId, true);
    return true;
  }

  private ensureSentenceReviews(sessionId: string): void {
    const reviewed = new Set(this.state.sentenceReviews.map(r => r.sentenceId));
    for (const sentence of this.state.sentences) {
      if (sentence.sessionId === sessionId && !reviewed.has(sentence.id)) {
        this.state.sentenceReviews.push({
          id: this.ids.next(),
          sessionId,
          sentenceId: sentence.id,
          supportLevel: 'unrated',
          reviewedAtMs: null,
        });
      }
    }
  }

  // Capture

  private ensureSession(): string {
    return this.activeSession?.id ?? this.startSession();
  }

  private draft(sentenceId: string): InProgressSentence | undefined {
    return this.state.inProgressSentences.find(d => d.id === sentenceId);
  }

  recordWordSelection(params: {
    word: string;
    pageId: string;
    sentenceId?: string | null;
    partOfSpeech?: string | null;
  }): string {
    const sessionId = this.ensureSession();
    const id = params.sentenceId ?? this.ids.next();
    let draft = this.draft(id);
    if (!draft) {
      draft = { id, sessionId, startedAtMs: this.clock.now(), wordsAdded: [], wordsRemoved: [] };
      this.state.inProgressSentences.push(draft);
    }
    const previouslySelected = this.state.activities.some(
      a => a.sessionId === sessionId && a.action === 'wordSelected' && a.word === params.word,
    );
    const measurement: WordMeasurement = {
      id: this.ids.next(),
      word: params.word,
      selectedAtMs: this.clock.now(),
      pageId: params.pageId,
      sentenceId: id,
      partOfSpeech: params.partOfSpeech ?? classifyPartOfSpeech(params.word),
      wasRemoved: false,
      wasPreviouslySelectedInSession: previouslySelected,
    };
    draft.wordsAdded.push(measurement);
    this.appendActivity({
      sessionId,
      action: 'wordSelected',
      pageId: params.pageId,
      word: params.word,
      sentenceId: id,
      contributesToSentence: true,
    });
    this.attachWordToLatestNavigation(sessionId, params.word);
    this.persistSession(sessionId);
    return id;
  }

  recordStandaloneWord(word: string, pageId: string, action: ActionKind = 'quickPhrasePlayed'): void {
    const sessionId = this.ensureSession();
    const wasRepeated = this.state.activities.some(
      a => a.sessionId === sessionId && a.action === 'wordSelected' && a.word === word,
    );
    this.appendActivity({
      sessionId,
      action: 'wordSelected',
      pageId,
      word,
      sentenceId: null,
      contributesToSentence: false,
      isRepeat: wasRepeated,
    });
    if (action !== 'wordSelected') {
      this.appendActivity({ sessionId, action, pageId, word, sentenceId: null, contributesToSentence: false });
    }
    this.persistSession(sessionId);
  }

  recordWordRemoval(params: { word: string; pageId: string; sentenceId: string }): void {
    const draft = this.draft(params.sentenceId);
    if (!draft) {
      return;
    }
    draft.wordsRemoved.push({
      id: this.ids.next(),
      word: params.word,
      selectedAtMs: this.clock.now(),
      pageId: params.pageId,
      sentenceId: params.sentenceId,
      partOfSpeech: classifyPartOfSpeech(params.word),
      wasRemoved: true,
      wasPreviouslySelectedInSession: false,
    });
    this.appendActivity({
      sessionId: draft.sessionId,
      action: 'wordRemoved',
      pageId: params.pageId,
      word: params.word,
      sentenceId: params.sentenceId,
      contributesToSentence: true,
    });
    this.persistSession(draft.sessionId);
  }

  completeSentence(
    sentenceId: string | null | undefined,
    finalWords: readonly string[],
    reason: SentenceEndingReason,
    persist = true,
  ): void {
    if (!sentenceId) {
      return;
    }
    const index = this.state.inProgressSentences.findIndex(d => d.id === sentenceId);
    if (index < 0 || finalWords.length === 0) {
      return;
    }
    const draft = this.state.inProgressSentences[index];
    this.state.inProgressSentences.splice(index, 1);
    const sentence: SentenceMeasurement = {
      id: sentenceId,
      sessionId: draft.sessionId,
      conversationId: null,
      startedAtMs: draft.startedAtMs,
      endedAtMs: this.clock.now(),
      endingReason: reason,
      wordsAdded: draft.wordsAdded,
      wordsRemoved: draft.wordsRemoved,
      finalWords: [...finalWords],
      playPressed: reason === 'play',
      wasCleared: reason === 'clear',
      wasAbandoned: reason === 'inactivity',
    };
    this.state.sentences.push(sentence);
    const action: ActionKind =
      reason === 'play' ? 'sentencePlayed' : reason === 'clear' ? 'sentenceCleared' : 'sentenceAbandoned';
    this.appendActivity({
      sessionId: draft.sessionId,
      action,
      pageId: draft.wordsAdded[draft.wordsAdded.length - 1]?.pageId ?? null,
      word: null,
      sentenceId,
      contributesToSentence: true,
    });
    this.recordCommunication({
      sessionId: draft.sessionId,
      source: 'boardSentence',
      content: finalWords.join(' '),
      sentenceId,
    });
    if (persist) {
      this.persistSession(draft.sessionId);
    }
  }

  recordNavigation(startingPage: string, destinationPage: string): void {
    const sessionId = this.ensureSession();
    const path = [...(this.navigationPaths.get(sessionId) ?? [])];
    if (path.length === 0) {
      path.push(startingPage);
    }
    const alreadyVisited = path.includes(destinationPage);
    path.push(destinationPage);
    this.navigationPaths.set(sessionId, path);
    this.state.navigations.push({
      id: this.ids.next(),
      sessionId,
      timestampMs: this.clock.now(),
      startingPage,
      destinationPage,
      fullPath: path,
      numberOfSteps: Math.max(0, path.length - 1),
      targetPageReached: null,
      wordSelectedAfterNavigation: null,
      destinationWasAlreadyVisited: alreadyVisited,
    });
    this.appendActivity({
      sessionId,
      action: 'pageOpened',
      pageId: startingPage,
      destinationPageId: destinationPage,
      word: null,
      sentenceId: null,
      contributesToSentence: false,
    });
    this.persistSession(sessionId);
  }

  recordTypedCommunication(text: string): void {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return;
    }
    const sessionId = this.ensureSession();
    this.appendActivity({
      sessionId,
      action: 'typedMessagePlayed',
      pageId: 'Type Here',
      word: null,
      sentenceId: null,
      contributesToSentence: true,
    });
    this.recordCommunication({ sessionId, source: 'typedMessage', content: trimmed });
    this.persistSession(sessionId);
  }

  recordQaGetMoreAnswers(): void {
    const sessionId = this.ensureSession();
    this.appendActivity({
      sessionId,
      action: 'moreAnswersRequested',
      pageId: 'Q&A',
      word: null,
      sentenceId: null,
      contributesToSentence: false,
    });
    this.persistSession(sessionId);
  }

  recordQaAnswer(params: {
    question: string;
    answer: string;
    options: string[];
    answerRoundCount: number;
    askedForMoreAnswers: boolean;
    responseTimeMs: number | null;
  }): void {
    const sessionId = this.ensureSession();
    const qa: QaMeasurement = {
      id: this.ids.next(),
      sessionId,
      timestampMs: this.clock.now(),
      question: params.question,
      options: [...params.options],
      selectedAnswer: params.answer,
      answerRoundCount: params.answerRoundCount,
      askedForMoreAnswers: params.askedForMoreAnswers,
      responseTimeMs: params.responseTimeMs,
    };
    this.state.qaMeasurements.push(qa);
    this.appendActivity({
      sessionId,
      action: 'qaAnswerSelected',
      pageId: 'Q&A',
      word: null,
      sentenceId: null,
      answer: params.answer,
      contributesToSentence: true,
    });
    this.recordCommunication({
      sessionId,
      source: 'qaAnswer',
      content: params.answer,
      question: params.question,
      previousPartnerTurn: params.question,
      responseTimeMs: params.responseTimeMs,
    });
    this.persistSession(sessionId);
  }

  recordGoalOutcome(outcome: GoalOutcomeSnapshot, sessionId?: string | null): void {
    const id = sessionId ?? this.ensureSession();
    const session = this.session(id);
    if (!session) {
      return;
    }
    session.goalOutcomes = session.goalOutcomes.filter(
      o => !(o.goalId === outcome.goalId && o.metricName === outcome.metricName),
    );
    session.goalOutcomes.push(outcome);
    this.persistSession(id);
  }

  // Pass-through recorders for partner-audio, SLP and structured-activity integrations.
  // They never fabricate conversation, support, repair, or retelling values from taps.

  recordConversation(conversation: ConversationMeasurement): void {
    if (this.state.conversations.some(c => c.id === conversation.id)) {
      return;
    }
    this.state.conversations.push(conversation);
    this.persistSession(conversation.sessionId);
  }

  /** Records a turn; the first turn seen for a conversation decides who initiated it. */
  recordTurn(turn: TurnMeasurement): void {
    const conversation = this.state.conversations.find(c => c.id === turn.conversationId);
    if (!conversation) {
      this.state.conversations.push({
        id: turn.conversationId,
        sessionId: turn.sessionId,
        startedAtMs: turn.startedAtMs,
        endedAtMs: null,
        firstSpeaker: turn.speaker,
        partnerType: 'partner',
        turnIds: [turn.id],
      });
    } else if (!conversation.turnIds.includes(turn.id)) {
      conversation.turnIds.push(turn.id);
    }
    this.state.turns.push(turn);
    this.persistSession(turn.sessionId);
  }

  recordSupport(support: SupportMeasurement): void {
    this.state.supports.push(support);
    this.persistSession(support.sessionId);
  }

  recordRepair(repair: RepairMeasurement): void {
    this.state.repairs.push(repair);
    this.persistSession(repair.sessionId);
  }

  recordRetelling(retelling: RetellingMeasurement): void {
    this.state.retellings.push(retelling);
    this.persistSession(retelling.sessionId);
  }

  /**
   * Applies validated event classifications from the AI gateway to the communications
   * they describe. Counts still happen locally; the server only supplies labels.
   */
  applyAiEventAnalysis(results: readonly EventAnalysisResult[]): void {
    const byEventId = new Map<string, EventAnalysisResult>();
    for (const result of results) {
      byEventId.set(result.eventId, result);
    }
    const touched = new Set<string>();
    for (const communication of this.state.communications) {
      const result = byEventId.get(communication.id);
      if (!result || result.status !== 'ok') {
        continue;
      }
      const analysis = { ...communication.analysis };
      const fn = communicationFunctionFromNetwork(result.communicationFunction);
      if (fn && result.communicationFunction.toLowerCase() !== 'unknown' && analysis.functionSource !== 'manual') {
        analysis.communicationFunction = fn;
        analysis.functionSource = 'ai';
        analysis.functionConfidence = result.communicationFunctionConfidence ?? null;
      }
      if (typeof result.isQuestion === 'boolean') {
        analysis.isQuestion = result.isQuestion;
      }
      if (result.whQuestionType) {
        analysis.whQuestionType = result.whQuestionType;
      }
      if (typeof result.expressesPreference === 'boolean') {
        analysis.expressesPreference = result.expressesPreference;
      }
      if (typeof result.setsBoundary === 'boolean') {
        analysis.setsBoundary = result.setsBoundary;
      }
      if (typeof result.relatesToRegulation === 'boolean') {
        analysis.relatesToRegulation = result.relatesToRegulation;
      }
      if (typeof result.isNovelContribution === 'boolean') {
        analysis.introducesNewInformation = result.isNovelContribution;
      }
      if (typeof result.isPartOfRetelling === 'boolean') {
        analysis.isPartOfRetelling = result.isPartOfRetelling;
      }
      if (result.retellingDetails && result.retellingDetails.length > 0) {
        analysis.retellingDetails = [...result.retellingDetails];
      }
      if (result.requiredSentenceFeatures) {
        const features: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(result.requiredSentenceFeatures)) {
          if (typeof v === 'boolean') {
            features[k] = v;
          }
        }
        if (Object.keys(features).length > 0) {
          analysis.requiredSentenceFeatures = features;
        }
      }
      communication.analysis = analysis;
      touched.add(communication.sessionId);
    }
    for (const sessionId of touched) {
      this.persistSession(sessionId);
    }
  }

  // Measurement

  measurement(metric: MetricId, sessionId: string, options: LiveMeasurementOptions = {}): MeasurementResult {
    return liveMeasurement(this.state, metric, sessionId, options);
  }

  metricsSnapshot(sessionId: string, qualifyingMinimumWordCount = 2): SessionMetricSnapshot {
    const slice = sliceSession(this.state, sessionId);
    const sentences = slice?.sentences ?? [];
    const activities = slice?.activities ?? [];
    const communications = slice?.communications ?? [];
    const navigations = slice?.navigations ?? [];
    const wordEvents = activities.filter(a => a.action === 'wordSelected' && a.word).map(a => a.word as string);
    const functionCounts: Partial<Record<CommunicationFunction, number>> = {};
    for (const c of communications) {
      const fn = c.analysis.communicationFunction;
      if (fn) {
        functionCounts[fn] = (functionCounts[fn] ?? 0) + 1;
      }
    }
    const questions = communications.filter(c => c.analysis.isQuestion === true);
    const totalWords = sentences.reduce((sum, s) => sum + s.finalWords.length, 0);
    return {
      sentenceCount: sentences.length,
      averageWordsPerSentence: sentences.length === 0 ? 0 : totalWords / sentences.length,
      totalWordCountPerSentence: totalWords,
      qualifyingSentenceCount: sentences.filter(s => s.finalWords.length >= qualifyingMinimumWordCount).length,
      navigationCount: navigations.length,
      uniquePagesVisited: new Set(navigations.map(n => n.destinationPage)).size,
      uniqueWordsActivated: new Set(wordEvents).size,
      totalWordActivations: wordEvents.length,
      deviceInteractionCount: activities.length,
      questionCount: questions.length,
      whQuestionCount: questions.filter(q => !!q.analysis.whQuestionType).length,
      communicationFunctionCounts: functionCounts,
    };
  }

  // Internals

  private appendActivity(params: {
    sessionId: string;
    action: ActionKind;
    pageId: string | null;
    destinationPageId?: string | null;
    word: string | null;
    sentenceId: string | null;
    answer?: string | null;
    contributesToSentence: boolean;
    isRepeat?: boolean;
  }): void {
    const repeat =
      params.isRepeat ??
      this.state.activities.some(
        a =>
          a.sessionId === params.sessionId &&
          a.action === params.action &&
          (a.word ?? null) === params.word &&
          (a.pageId ?? null) === params.pageId,
      );
    this.state.activities.push({
      id: this.ids.next(),
      sessionId: params.sessionId,
      timestampMs: this.clock.now(),
      action: params.action,
      pageId: params.pageId,
      destinationPageId: params.destinationPageId ?? null,
      word: params.word,
      sentenceId: params.sentenceId,
      answer: params.answer ?? null,
      isRepeatInSession: repeat,
      contributesToSentence: params.contributesToSentence,
    });
  }

  private attachWordToLatestNavigation(sessionId: string, word: string): void {
    for (let i = this.state.navigations.length - 1; i >= 0; i -= 1) {
      const n = this.state.navigations[i];
      if (n.sessionId === sessionId && !n.wordSelectedAfterNavigation) {
        n.wordSelectedAfterNavigation = word;
        return;
      }
    }
  }

  private recordCommunication(params: {
    sessionId: string;
    source: CommunicationSource;
    content: string;
    sentenceId?: string | null;
    question?: string | null;
    previousPartnerTurn?: string | null;
    responseTimeMs?: number | null;
  }): void {
    this.state.communications.push({
      id: this.ids.next(),
      sessionId: params.sessionId,
      timestampMs: this.clock.now(),
      source: params.source,
      content: params.content,
      sentenceId: params.sentenceId ?? null,
      question: params.question ?? null,
      previousPartnerTurn: params.previousPartnerTurn ?? null,
      responseTimeMs: params.responseTimeMs ?? null,
      analysis: analyzeContent(params.content, params.source),
    });
  }

  private migrateGoals(saved: IepGoal[]): IepGoal[] {
    let nextNumber = 1;
    return saved.map(savedGoal => {
      const goal: IepGoal = { ...savedGoal };
      if (goal.displayNumber === null || goal.displayNumber === undefined) {
        goal.displayNumber = nextNumber;
      }
      nextNumber = Math.max(nextNumber, (goal.displayNumber ?? 0) + 1);
      if (goal.plan && !goal.plan.calculation) {
        goal.plan = { ...goal.plan, calculation: inferredCalculation(goal.plan) };
      }
      return goal;
    });
  }

  private enqueue(write: () => Promise<void>): void {
    this.writeQueue = this.writeQueue.then(write).catch(() => undefined);
  }

  private persistGoals(): void {
    this.notify();
    // Refuse to overwrite a record this launch could not read.
    if (this.failure) {
      return;
    }
    const goals = this.goalList.map(g => ({ ...g }));
    this.enqueue(() => this.persistence.saveGoals(goals));
  }

  /**
   * Schedules a write of the session's archive. Taps arrive in bursts, so writes are
   * coalesced per session: the archive is sliced when the timer fires, not per event.
   * `flush()` forces every pending write; session start and end write immediately.
   */
  private persistSession(sessionId: string, immediate = false): void {
    this.notify();
    if (this.failure) {
      return;
    }
    if (immediate) {
      this.writePendingSession(sessionId);
      return;
    }
    if (this.pendingSessionWrites.has(sessionId)) {
      return;
    }
    this.pendingSessionWrites.set(
      sessionId,
      setTimeout(() => this.writePendingSession(sessionId), SESSION_WRITE_DELAY_MS),
    );
  }

  private writePendingSession(sessionId: string): void {
    const timer = this.pendingSessionWrites.get(sessionId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.pendingSessionWrites.delete(sessionId);
    }
    const slice = sliceSession(this.state, sessionId);
    if (!slice) {
      return;
    }
    const archive: SessionArchive = { schemaVersion: MEASUREMENT_SCHEMA_VERSION, ...slice };
    // Serialise now so later mutations cannot leak into a queued write.
    const snapshot = JSON.stringify(archive);
    this.enqueue(() => this.persistence.saveSession(JSON.parse(snapshot) as SessionArchive));
  }
}
