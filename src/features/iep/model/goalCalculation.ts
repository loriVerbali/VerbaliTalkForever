/**
 * The single place a planner reply becomes a stored goal plan.
 *
 * Identifiers are rewritten to catalogue ones once, at the boundary. Targets are AI- or
 * clinician-owned and are never inferred from goal prose. The word threshold is a
 * condition on one sentence and is read from the goal's own wording when the planner
 * did not state it structurally.
 */

import { MetricCatalogue, ComparisonDirection } from '../core';
import {
  GoalAchievementRule,
  GoalCalculation,
  GoalMetric,
  GoalMetricRole,
  GoalPlan,
  PART_OF_SPEECH_KEYS,
} from './types';

export const DEFAULT_MINIMUM_WORDS_PER_SENTENCE = 3;
export const PLANNER_CALCULATION_VERSION = 3;

/** Canonical unit for a metric, from the one catalogue. */
export function unitForMetric(id: string): string | null {
  const resolution = MetricCatalogue.resolve(id);
  if (!resolution) {
    return null;
  }
  return MetricCatalogue.definitionFor(resolution.id)?.unit ?? null;
}

/** Whether the app can calculate this measure at all (implemented, whether or not approved). */
export function isSupportedMetric(id: string): boolean {
  const resolution = MetricCatalogue.resolve(id);
  if (!resolution) {
    return false;
  }
  const definition = MetricCatalogue.definitionFor(resolution.id);
  return !!definition && definition.requirement !== 'notImplemented';
}

/** Marks whether the app can calculate each metric. Never infers a target from prose. */
export function annotateMetrics(metrics: readonly GoalMetric[]): GoalMetric[] {
  return metrics.map(metric => ({ ...metric, isSupported: isSupportedMetric(metric.id) }));
}

/**
 * Rewrites planner-supplied identifiers to catalogue ones. An alias may carry a
 * threshold: `qualifying_sentences_2plus` becomes qualifying_sentences with a bar of two.
 * Two planner ids that collapse onto one metric keep the first. Unknown ids are kept as
 * written so they remain visible as unsupported.
 */
export function normaliseMetrics(metrics: readonly GoalMetric[]): {
  metrics: GoalMetric[];
  threshold: number | null;
} {
  let threshold: number | null = null;
  const seen = new Set<string>();
  const result: GoalMetric[] = [];
  for (const metric of metrics) {
    const resolution = MetricCatalogue.resolve(metric.id);
    if (!resolution) {
      if (!seen.has(metric.id)) {
        seen.add(metric.id);
        result.push({ ...metric });
      }
      continue;
    }
    if (resolution.minimumWordsPerSentence !== null && threshold === null) {
      threshold = resolution.minimumWordsPerSentence;
    }
    if (seen.has(resolution.id)) {
      continue;
    }
    seen.add(resolution.id);
    const definition = MetricCatalogue.definitionFor(resolution.id);
    result.push({
      ...metric,
      id: resolution.id,
      name: definition?.displayName ?? metric.name,
    });
  }
  return { metrics: result, threshold };
}

const SPELLED_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/** Words that narrow what a measure counts. */
const RESTRICTIVE_STEMS = new Set(['avera', 'diffe', 'prefe', 'novel', 'indep', 'uniqu', 'conse']);

/** Words that appear in nearly every IEP goal and so distinguish nothing. */
const IGNORED_GOAL_WORDS = new Set([
  'child', 'student', 'learner', 'will', 'can', 'the', 'a', 'an', 'and', 'or',
  'of', 'in', 'on', 'at', 'to', 'with', 'within', 'during', 'across', 'per',
  'given', 'least', 'most', 'more', 'than', 'up', 'each', 'every', 'session',
  'sessions', 'week', 'weeks', 'time', 'times', 'goal', 'target', 'independent',
  'independently', 'consecutive', 'opportunity', 'opportunities', 'using', 'use',
  'is', 'be', 'by', 'as', 'if', 'it', 'do', 'so', 'no', 'we', 'he',
]);

const SUFFIXES = ['ations', 'ation', 'ings', 'ing', 'ed', 'es', 's'];

/** Folds words to comparable roots so "turns" matches "turn" and "responses" matches "respond". */
export function stemsOf(text: string): Set<string> {
  const words = text.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 0);
  const out = new Set<string>();
  for (const word of words) {
    if (word.length < 2 || IGNORED_GOAL_WORDS.has(word)) {
      continue;
    }
    let root = word;
    for (const suffix of SUFFIXES) {
      if (word.endsWith(suffix)) {
        const stripped = word.slice(0, word.length - suffix.length);
        if (stripped.length > 2) {
          root = stripped;
          break;
        }
      }
    }
    out.add(root.slice(0, 5));
  }
  return out;
}

/** The goal as written, excluding the AI-generated title. */
export function goalWording(plan: Pick<GoalPlan, 'goalSummary' | 'condition'>): string {
  return `${plan.goalSummary} ${plan.condition}`;
}

/**
 * Chooses which of a plan's candidate measures the goal is actually about, by how much
 * of each candidate's own name the goal's wording contains. Ties are broken by list
 * position so the same plan always resolves the same way. Returns null when nothing
 * matches so the caller can fall back rather than this guessing.
 */
export function matchingMetricId(metrics: readonly GoalMetric[], goalText: string): string | null {
  const goalStems = stemsOf(goalText);
  if (goalStems.size === 0) {
    return null;
  }
  let best: { id: string; coverage: number; matched: number } | null = null;
  for (const metric of metrics) {
    const nameStems = stemsOf(metric.name);
    if (nameStems.size === 0) {
      continue;
    }
    let restrictionsHonoured = true;
    for (const stem of nameStems) {
      if (RESTRICTIVE_STEMS.has(stem) && !goalStems.has(stem)) {
        restrictionsHonoured = false;
        break;
      }
    }
    if (!restrictionsHonoured) {
      continue;
    }
    let matched = 0;
    for (const stem of nameStems) {
      if (goalStems.has(stem)) {
        matched += 1;
      }
    }
    if (matched === 0) {
      continue;
    }
    const coverage = matched / nameStems.size;
    const isBetter =
      best === null ||
      coverage > best.coverage ||
      (coverage === best.coverage && matched > best.matched);
    if (isBetter) {
      best = { id: metric.id, coverage, matched };
    }
  }
  return best?.id ?? null;
}

/**
 * The word threshold is the number the goal attaches to *words*, not the smallest
 * number it contains. Ranges resolve to their lower bound. Returns null when the text
 * says nothing about words.
 */
export function inferredWordThreshold(rawText: string): number | null {
  const text = rawText.toLowerCase();
  if (!text.includes('word')) {
    return null;
  }
  const tokens = text.split(/[^a-z0-9]+/).filter(t => t.length > 0);
  const numberOf = (token: string): number | null => {
    if (/^\d+$/.test(token)) {
      return parseInt(token, 10);
    }
    return SPELLED_NUMBERS[token] ?? null;
  };
  const candidates: number[] = [];
  tokens.forEach((token, index) => {
    const value = numberOf(token);
    if (value === null || value < 1 || value > 10) {
      return;
    }
    const lookahead = tokens.slice(index + 1, index + 5);
    for (const next of lookahead) {
      if (next.startsWith('word')) {
        candidates.push(value);
        break;
      }
      if (numberOf(next) !== null) {
        continue;
      }
      if (
        next.startsWith('sentence') ||
        next.startsWith('session') ||
        next.startsWith('turn') ||
        next.startsWith('time')
      ) {
        break;
      }
    }
  });
  return candidates.length > 0 ? Math.min(...candidates) : DEFAULT_MINIMUM_WORDS_PER_SENTENCE;
}

export function inferredPartOfSpeechCounts(text: string): Record<string, number> | null {
  const lower = text.toLowerCase();
  const result: Record<string, number> = {};
  for (const part of PART_OF_SPEECH_KEYS) {
    if (!new RegExp(`\\b${part}s?\\b`).test(lower)) {
      continue;
    }
    const match = new RegExp(`(?:at least\\s+)?(\\d+)\\s+${part}s?`).exec(lower);
    if (match) {
      result[part] = Math.max(1, parseInt(match[1], 10));
    } else {
      result[part] = 1;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

export function inferredSupportLevels(text: string): string[] | null {
  const lower = text.toLowerCase();
  if (lower.includes('independent') || lower.includes('without prompt')) {
    return ['independent'];
  }
  return null;
}

function planWording(goalSummary: string, condition: string, metrics: readonly GoalMetric[]): string {
  return [goalSummary, condition, ...metrics.map(m => `${m.name} ${m.definition}`)].join(' ');
}

/** Comparison direction belongs to the metric, never to a string every goal shares. */
export function comparisonForMetric(metricId: string): ComparisonDirection {
  const resolution = MetricCatalogue.resolve(metricId);
  if (!resolution) {
    return 'atLeast';
  }
  return MetricCatalogue.definitionFor(resolution.id)?.comparison ?? 'atLeast';
}

/** Reads a stored comparison operator, accepting the legacy "at least" spelling. */
export function parseComparisonOperator(raw: string | null | undefined): ComparisonDirection {
  switch ((raw ?? '').trim().toLowerCase().replace(/[\s_]+/g, '')) {
    case 'atmost':
      return 'atMost';
    case 'range':
      return 'range';
    case 'descriptive':
      return 'descriptive';
    default:
      return 'atLeast';
  }
}

/** Builds the calculation for a plan returned by the AI planner. */
export function calculationFromPlanner(params: {
  metrics: readonly GoalMetric[];
  goalSummary: string;
  condition: string;
  consecutiveSessions: number | null;
  serverPrimaryMetricId: string | null;
}): GoalCalculation {
  const { goalSummary, condition, consecutiveSessions, serverPrimaryMetricId } = params;
  const wording = `${goalSummary} ${condition}`;
  const { metrics: canonical, threshold: aliasThreshold } = normaliseMetrics(params.metrics);

  const directMetricId = canonical.find(m => m.role === 'direct')?.id ?? null;
  const serverResolved = serverPrimaryMetricId
    ? (MetricCatalogue.resolve(serverPrimaryMetricId)?.id ?? null)
    : null;
  const primaryId =
    directMetricId ??
    serverResolved ??
    matchingMetricId(canonical, wording) ??
    canonical[0]?.id ??
    MetricCatalogue.qualifyingSentences.id;

  const explicitThreshold =
    canonical.map(m => m.constraints?.minimumWordsPerSentence ?? null).find(t => t !== null) ?? null;
  const threshold =
    aliasThreshold ?? explicitThreshold ?? inferredWordThreshold(planWording(goalSummary, condition, canonical));

  return {
    primaryMetricId: primaryId,
    comparisonOperator: comparisonForMetric(primaryId),
    requiredConditions: condition.length === 0 ? [] : [condition],
    requiredSessionCount: consecutiveSessions,
    eligibleEvidenceTypes: canonical.map(m => m.id),
    calculationVersion: PLANNER_CALCULATION_VERSION,
    minimumWordsPerSentence: threshold,
    // Only the goal's own wording may impose a part-of-speech filter; a metric's
    // explanatory prose ("e.g. a noun plus a verb") must not.
    requiredPartOfSpeechCounts: inferredPartOfSpeechCounts(wording),
    allowedSupportLevels: inferredSupportLevels(wording),
  };
}

/** A compatibility calculation for a plan saved without one. */
export function inferredCalculation(plan: GoalPlan): GoalCalculation {
  const directMetric = plan.metrics.find(m => m.role === 'direct');
  const primaryId =
    directMetric?.id ??
    matchingMetricId(plan.metrics, goalWording(plan)) ??
    plan.metrics[0]?.id ??
    'qualifying_sentences';
  const wording = planWording(plan.goalSummary, plan.condition, plan.metrics);
  return {
    primaryMetricId: primaryId,
    comparisonOperator: comparisonForMetric(primaryId),
    requiredConditions: plan.condition.length === 0 ? [] : [plan.condition],
    requiredSessionCount: plan.consecutiveSessions ?? null,
    eligibleEvidenceTypes: plan.metrics.map(m => m.id),
    calculationVersion: 1,
    minimumWordsPerSentence:
      plan.metrics.map(m => m.constraints?.minimumWordsPerSentence ?? null).find(t => t !== null) ??
      inferredWordThreshold(wording),
    requiredPartOfSpeechCounts: inferredPartOfSpeechCounts(goalWording(plan)),
    allowedSupportLevels: inferredSupportLevels(goalWording(plan)),
  };
}

// Planner response decoding

type Json = Record<string, unknown>;

function pick<T = unknown>(obj: Json, ...keys: string[]): T | undefined {
  for (const key of keys) {
    if (obj[key] !== undefined) {
      return obj[key] as T;
    }
  }
  return undefined;
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asOptionalString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asOptionalNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asOptionalInt(v: unknown): number | null {
  const n = asOptionalNumber(v);
  return n === null ? null : Math.trunc(n);
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function asRole(v: unknown): GoalMetricRole | null {
  return v === 'direct' || v === 'supporting' || v === 'context' ? v : null;
}

export function goalMetricFromJson(raw: unknown): GoalMetric | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Json;
  const id = asOptionalString(pick(o, 'id', 'metric_id', 'metricId'));
  if (!id) {
    return null;
  }
  const constraintsRaw = pick<Json>(o, 'constraints');
  const constraints =
    constraintsRaw && typeof constraintsRaw === 'object'
      ? {
          minimumWordsPerSentence: asOptionalInt(
            pick(constraintsRaw, 'minimum_words_per_sentence', 'minimumWordsPerSentence'),
          ),
        }
      : null;
  return {
    id,
    name: asString(pick(o, 'name', 'label'), id),
    category: asString(pick(o, 'category')),
    definition: asString(pick(o, 'definition', 'rationale')),
    measurementMethod: asString(pick(o, 'measurement_method', 'measurementMethod')),
    role: asRole(pick(o, 'role')),
    constraints,
    targetValue: asOptionalNumber(pick(o, 'target_value', 'targetValue')),
    targetUnit: asOptionalString(pick(o, 'target_unit', 'targetUnit')),
    targetTimeframe: asOptionalString(pick(o, 'target_timeframe', 'targetTimeframe')),
    isSupported: typeof o.is_supported === 'boolean' ? o.is_supported : typeof o.isSupported === 'boolean' ? o.isSupported : null,
  };
}

export function achievementRuleFromJson(raw: unknown): GoalAchievementRule | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Json;
  const type = asOptionalString(o.type);
  if (!type) {
    return null;
  }
  return {
    type,
    requiredMetricIds: asStringArray(pick(o, 'required_metric_ids', 'requiredMetricIds', 'requiredMetricIDs')),
    explanation: asString(o.explanation),
  };
}

export interface QualifyingSentenceRule {
  minimumWords: number | null;
  requiredPartOfSpeechCounts: Record<string, number>;
  allowedSupportLevels: string[];
}

export function qualifyingRuleFromJson(raw: unknown): QualifyingSentenceRule | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Json;
  const posRaw = pick<Json>(o, 'required_part_of_speech_counts', 'requiredPartOfSpeechCounts');
  const pos: Record<string, number> = {};
  if (posRaw && typeof posRaw === 'object') {
    for (const [k, v] of Object.entries(posRaw)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        pos[k.toLowerCase()] = Math.trunc(v);
      }
    }
  }
  return {
    minimumWords: asOptionalInt(pick(o, 'minimum_words', 'minimumWords')),
    requiredPartOfSpeechCounts: pos,
    allowedSupportLevels: asStringArray(pick(o, 'allowed_support_levels', 'allowedSupportLevels')),
  };
}

/**
 * Turns a planner reply (snake_case or camelCase keys) into a stored plan whose metric
 * ids are catalogue ids, whose calculation carries the goal's own conditions, and whose
 * targets are exactly what the planner or clinician stated.
 */
export function goalPlanFromPlannerResponse(raw: unknown): GoalPlan | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Json;
  const goalTitle = asOptionalString(pick(o, 'goal_title', 'goalTitle'));
  const goalSummary = asOptionalString(pick(o, 'goal_summary', 'goalSummary'));
  const metricsRaw = pick<unknown[]>(o, 'metrics');
  if (goalTitle === null || goalSummary === null || !Array.isArray(metricsRaw)) {
    return null;
  }
  const metrics = metricsRaw.map(goalMetricFromJson).filter((m): m is GoalMetric => m !== null);
  const condition = asString(pick(o, 'condition'));
  const targetValue = asOptionalNumber(pick(o, 'target_value', 'targetValue'));
  const targetUnit = asOptionalString(pick(o, 'target_unit', 'targetUnit'));
  const timeframe = asOptionalString(pick(o, 'timeframe'));
  const consecutiveSessions = asOptionalInt(pick(o, 'consecutive_sessions', 'consecutiveSessions'));
  const serverPrimary = asOptionalString(pick(o, 'primary_metric_id', 'primaryMetricID', 'primaryMetricId'));

  const annotated = annotateMetrics(normaliseMetrics(metrics).metrics);
  const calculation = calculationFromPlanner({
    metrics: annotated,
    goalSummary,
    condition,
    consecutiveSessions,
    serverPrimaryMetricId: serverPrimary,
  });
  const rule = qualifyingRuleFromJson(pick(o, 'qualifying_sentence_rule', 'qualifyingSentenceRule'));
  if (rule) {
    if (rule.minimumWords !== null) {
      calculation.minimumWordsPerSentence = rule.minimumWords;
    }
    if (Object.keys(rule.requiredPartOfSpeechCounts).length > 0) {
      calculation.requiredPartOfSpeechCounts = rule.requiredPartOfSpeechCounts;
    }
    if (rule.allowedSupportLevels.length > 0) {
      calculation.allowedSupportLevels = rule.allowedSupportLevels;
    }
  }

  // Older responses carried one top-level target. Preserve it for the primary metric
  // when that metric has none of its own; never copy it over a metric's own target.
  const finalMetrics = annotated.map(m => ({ ...m }));
  if (targetValue !== null) {
    const index = finalMetrics.findIndex(
      m => m.id === calculation.primaryMetricId && (m.targetValue === null || m.targetValue === undefined),
    );
    if (index >= 0) {
      finalMetrics[index].targetValue = targetValue;
      finalMetrics[index].targetUnit = targetUnit ?? finalMetrics[index].targetUnit ?? null;
      finalMetrics[index].targetTimeframe = timeframe ?? finalMetrics[index].targetTimeframe ?? null;
    }
  }
  const hasTarget = (m: GoalMetric) => m.targetValue !== null && m.targetValue !== undefined;
  const directTargetMetric =
    finalMetrics.find(m => (m.role === 'direct' || m.role === null || m.role === undefined) && hasTarget(m)) ??
    finalMetrics.find(hasTarget) ??
    null;

  return {
    goalTitle,
    goalSummary,
    metrics: finalMetrics,
    condition,
    targetValue: targetValue ?? directTargetMetric?.targetValue ?? 0,
    targetUnit: targetUnit ?? directTargetMetric?.targetUnit ?? '',
    timeframe: timeframe ?? directTargetMetric?.targetTimeframe ?? '',
    consecutiveSessions,
    dashboardTitle: asString(pick(o, 'dashboard_title', 'dashboardTitle'), goalTitle),
    dashboardTiles: asStringArray(pick(o, 'dashboard_tiles', 'dashboardTiles')),
    confidenceNote: asString(pick(o, 'confidence_note', 'confidenceNote')),
    provider: asOptionalString(pick(o, 'provider')),
    achievementRule: achievementRuleFromJson(pick(o, 'achievement_rule', 'achievementRule')),
    calculation,
  };
}
