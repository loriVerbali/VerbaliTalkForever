/**
 * The IEP AI boundary on the client.
 *
 * Three routes: goal plan, event analysis, goal overview narrative. Every response is
 * validated and bounded here; anything invalid or unreachable falls back to
 * deterministic local output. The client never sends provider keys and never does
 * arithmetic with what comes back: the AI classifies text and writes prose, the app
 * counts.
 */

import fetchHelper from '../../../utils/fetcher';
import { newId } from '../model/ids';
import { GoalPlan, communicationFunctionFromNetwork, communicationFunctionToNetwork } from '../model/types';
import { goalPlanFromPlannerResponse } from '../model/goalCalculation';
import { EventAnalysisResult } from '../store/measurementStore';
import { fallbackGoalPlan, fallbackNarrative } from './fallbacks';

export const IEP_APP_VERSION = '0.1-matalk';

/** The app's fetch layer has no timeout; an unreachable host must not hang a screen. */
const REQUEST_TIMEOUT_MS = 20_000;

async function fetchWithTimeout(methodName: string, body: Record<string, unknown>): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${methodName} timed out after ${REQUEST_TIMEOUT_MS}ms`)), REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([fetchHelper(methodName, {}, body), timeout]);
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

export type AiSource = 'provider' | 'deterministic_fallback' | 'local_fallback';

function envelope(schemaVersion: string): Record<string, unknown> {
  return {
    schema_version: schemaVersion,
    request_id: newId(),
    app_version: IEP_APP_VERSION,
    locale: 'en-US',
    local_profile_id: 'local-device-profile',
    privacy_flags: { raw_logging_allowed: false, contains_child_content: true, allow_provider_storage: false },
  };
}

export interface GoalPlanReply {
  plan: GoalPlan;
  source: AiSource;
  provider: string | null;
  warnings: string[];
}

export async function requestGoalPlan(goalText: string): Promise<GoalPlanReply> {
  const trimmed = goalText.trim();
  let raw: unknown = null;
  try {
    raw = await fetchWithTimeout('iepGoalPlan', { ...envelope('iep-goal-plan.v2'), goal_text: trimmed });
  } catch {
    raw = null;
  }
  const body = unwrap(raw);
  const plan = body ? goalPlanFromPlannerResponse(body) : null;
  if (plan && plan.metrics.length > 0 && plan.metrics.length <= 6) {
    const source = readSource(body);
    return {
      plan: { ...plan, provider: plan.provider ?? (source === 'provider' ? 'gemini' : 'fallback') },
      source,
      provider: plan.provider ?? null,
      warnings: readWarnings(body),
    };
  }
  return {
    plan: fallbackGoalPlan(trimmed),
    source: 'local_fallback',
    provider: null,
    warnings: ['The planning service was unavailable, so this is a starter plan. Review every field.'],
  };
}

export interface EventForAnalysis {
  eventId: string;
  content: string;
  source: string;
}

export interface EventAnalysisReply {
  /** Results the provider actually returned. Local rule-based analysis is never in here. */
  results: EventAnalysisResult[];
  source: AiSource;
  model: string | null;
}

const MAX_EVENTS_PER_REQUEST = 100;

export async function requestEventAnalysis(
  goalId: string,
  metricIds: readonly string[],
  events: readonly EventForAnalysis[],
): Promise<EventAnalysisReply> {
  const results: EventAnalysisResult[] = [];
  let source: AiSource = 'provider';
  let model: string | null = null;
  for (let start = 0; start < events.length; start += MAX_EVENTS_PER_REQUEST) {
    const batch = events.slice(start, start + MAX_EVENTS_PER_REQUEST);
    let raw: unknown = null;
    try {
      raw = await fetchWithTimeout('iepEventAnalysis', {
        ...envelope('aac-event-analysis.v1'),
        goal_id: goalId,
        metric_ids: [...metricIds],
        events: batch.map(e => ({ event_id: e.eventId, content: e.content, source: e.source })),
      });
    } catch {
      raw = null;
    }
    const body = unwrap(raw);
    const parsed = body ? parseEventResults(body) : new Map<string, EventAnalysisResult>();
    if (!body) {
      source = 'local_fallback';
    } else if (readSource(body) !== 'provider' || parsed.size === 0) {
      // An error body or an unknown route resolves with no results; that is not AI.
      source = 'deterministic_fallback';
    }
    model = model ?? readModel(body);
    // Events the provider did not classify keep the local analysis recorded at capture
    // time, which the review sheet already shows as a local suggestion. Filling them
    // here with rule-based guesses would let the store label them as AI.
    for (const event of batch) {
      const found = parsed.get(event.eventId);
      if (found) {
        results.push(found);
      }
    }
  }
  return { results, source, model };
}

export interface NarrativeFacts {
  metrics: Record<string, number>;
  sessions: Array<{ session_id: string; date: string; result: number | null; target: number | null }>;
}

export interface NarrativeReply {
  patternInsight: string;
  opportunity: string;
  summary: string;
  source: AiSource;
}

const MAX_NARRATIVE_CHARS = 600;

export async function requestGoalOverviewNarrative(goalId: string, facts: NarrativeFacts): Promise<NarrativeReply> {
  let raw: unknown = null;
  try {
    raw = await fetchHelper('iepDashboard', {}, {
      ...envelope('iep-goal-overview-insights.v1'),
      goal_id: goalId,
      metrics: facts.metrics,
      sessions: facts.sessions.slice(0, 12),
    });
  } catch {
    raw = null;
  }
  const body = unwrap(raw);
  const pattern = boundedString(body?.pattern_insight);
  const opportunity = boundedString(body?.opportunity);
  const summary = boundedString(body?.summary);
  if (pattern && opportunity && summary) {
    return { patternInsight: pattern, opportunity, summary, source: readSource(body) };
  }
  return { ...fallbackNarrative(facts), source: 'local_fallback' };
}

// Parsing helpers

type Json = Record<string, unknown>;

function unwrap(raw: unknown): Json | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Json;
  // Some routes wrap the payload; accept both {plan: {...}} and flat.
  if (o.plan && typeof o.plan === 'object' && !o.metrics) {
    return { ...(o.plan as Json), source: o.source, provider: (o.plan as Json).provider ?? o.provider, warnings: o.warnings };
  }
  return o;
}

function readSource(body: Json | null): AiSource {
  const s = body?.source;
  if (s === 'provider') {
    return 'provider';
  }
  if (s === 'deterministic_fallback' || s === 'fallback') {
    return 'deterministic_fallback';
  }
  const provider = body?.provider;
  return provider === 'fallback' ? 'deterministic_fallback' : 'provider';
}

function readModel(body: Json | null): string | null {
  const m = body?.model ?? body?.provider;
  return typeof m === 'string' ? m : null;
}

function readWarnings(body: Json | null): string[] {
  const w = body?.warnings ?? body?.limitations;
  return Array.isArray(w) ? w.filter((x): x is string => typeof x === 'string') : [];
}

function boundedString(v: unknown): string | null {
  if (typeof v !== 'string') {
    return null;
  }
  const t = v.trim();
  if (t.length === 0) {
    return null;
  }
  return t.length > MAX_NARRATIVE_CHARS ? `${t.slice(0, MAX_NARRATIVE_CHARS - 1)}…` : t;
}

function optionalBool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

function parseEventResults(body: Json): Map<string, EventAnalysisResult> {
  const out = new Map<string, EventAnalysisResult>();
  const results = body.results;
  if (!Array.isArray(results)) {
    return out;
  }
  for (const item of results) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const r = item as Json;
    const eventId = typeof r.event_id === 'string' ? r.event_id : null;
    const fnRaw = typeof r.communication_function === 'string' ? r.communication_function : null;
    if (!eventId || !fnRaw) {
      continue;
    }
    const fn = communicationFunctionFromNetwork(fnRaw);
    if (!fn) {
      continue;
    }
    const confidence = typeof r.communication_function_confidence === 'number'
      ? Math.min(1, Math.max(0, r.communication_function_confidence))
      : typeof r.confidence === 'number'
        ? Math.min(1, Math.max(0, r.confidence))
        : null;
    const status = r.status === 'ok' || r.status === undefined ? 'ok' : String(r.status);
    const details = Array.isArray(r.retelling_details)
      ? r.retelling_details.filter((d): d is string => typeof d === 'string').slice(0, 20)
      : null;
    const featuresRaw = r.required_sentence_features;
    const features: Record<string, boolean | null> = {};
    if (featuresRaw && typeof featuresRaw === 'object') {
      for (const [k, v] of Object.entries(featuresRaw as Json)) {
        features[k] = optionalBool(v);
      }
    }
    out.set(eventId, {
      eventId,
      status,
      communicationFunction: communicationFunctionToNetwork(fn),
      communicationFunctionConfidence: confidence,
      isQuestion: optionalBool(r.is_question),
      whQuestionType: typeof r.wh_question_type === 'string' ? r.wh_question_type : null,
      expressesPreference: optionalBool(r.expresses_preference),
      setsBoundary: optionalBool(r.sets_boundary),
      relatesToRegulation: optionalBool(r.relates_to_regulation),
      isNovelContribution: optionalBool(r.is_novel_contribution),
      isPartOfRetelling: optionalBool(r.is_part_of_retelling),
      retellingDetails: details,
      requiredSentenceFeatures: Object.keys(features).length > 0 ? features : null,
    });
  }
  return out;
}
