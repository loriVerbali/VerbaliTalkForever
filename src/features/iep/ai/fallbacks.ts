/**
 * Deterministic output used when the AI gateway is unreachable or returns something
 * invalid. Nothing here is presented as AI output, and nothing here invents a number
 * the goal did not state.
 */

import { MetricCatalogue } from '../core';
import { analyzeContent } from '../model/contentAnalysis';
import { annotateMetrics, calculationFromPlanner, inferredWordThreshold } from '../model/goalCalculation';
import { CommunicationSource, GoalMetric, GoalPlan, communicationFunctionToNetwork } from '../model/types';
import { EventAnalysisResult } from '../store/measurementStore';
import type { EventForAnalysis, NarrativeFacts } from './iepAiClient';

const SPELLED: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

interface UnitNumber {
  value: number;
  unit: string;
}

/** Every number in the text paired with the noun that follows it. */
export function unitNumberPairs(text: string): UnitNumber[] {
  const tokens = text.toLowerCase().split(/[^a-z0-9.]+/).filter(t => t.length > 0);
  const out: UnitNumber[] = [];
  tokens.forEach((token, i) => {
    const n = /^\d+(\.\d+)?$/.test(token) ? Number(token) : SPELLED[token] ?? null;
    if (n === null || !Number.isFinite(n)) {
      return;
    }
    for (const next of tokens.slice(i + 1, i + 4)) {
      if (/^\d/.test(next) || next === 'or' || next === 'to' || next === 'more' || next === 'different' || next === 'consecutive') {
        if (next === 'consecutive') {
          out.push({ value: n, unit: 'consecutive' });
          return;
        }
        continue;
      }
      out.push({ value: n, unit: next });
      return;
    }
  });
  return out;
}

function pickPrimaryMetric(lower: string): { id: string; supporting: string[] } {
  const has = (...words: string[]) => words.some(w => lower.includes(w));
  if (has('request')) {
    return { id: 'request_count', supporting: [] };
  }
  if (has('wh-question', 'wh question', 'who, what', 'wh-')) {
    return { id: 'wh_questions', supporting: ['questions_asked'] };
  }
  if (has('question')) {
    return { id: 'questions_asked', supporting: [] };
  }
  if (has('different word', 'different symbol', 'activate')) {
    return { id: 'different_words_activated', supporting: ['total_word_activations'] };
  }
  if (has('different page', 'different categor')) {
    return { id: 'different_pages_visited', supporting: ['page_navigations'] };
  }
  if (has('navigat', 'page')) {
    return { id: 'page_navigations', supporting: ['different_pages_visited'] };
  }
  if (has('initiat')) {
    return { id: 'conversation_initiations', supporting: [] };
  }
  if (has('function')) {
    return { id: 'different_communication_functions', supporting: [] };
  }
  if (has('repair', 'clarif')) {
    return { id: 'repair_attempts', supporting: [] };
  }
  if (has('retell')) {
    return { id: 'retelling_details', supporting: [] };
  }
  if (has('novel', 'new idea', 'opinion')) {
    return { id: 'novel_contributions', supporting: [] };
  }
  if (has('turn')) {
    return { id: 'conversation_turns', supporting: [] };
  }
  if (has('second', 'faster', 'quick', 'time to build')) {
    return { id: 'build_seconds', supporting: ['total_sentences'] };
  }
  if (has('average words', 'mean length')) {
    return { id: 'average_words_per_sentence', supporting: ['total_sentences'] };
  }
  return { id: 'qualifying_sentences', supporting: ['total_sentences', 'average_words_per_sentence'] };
}

function metricFor(id: string, role: 'direct' | 'supporting'): GoalMetric {
  const def = MetricCatalogue.definitionFor(id);
  return {
    id,
    name: def?.displayName ?? id,
    category: 'Communication production',
    definition: def?.clinicalDefinition ?? 'Named by this goal.',
    measurementMethod: def ? `Count ${def.unit} recorded in the session.` : 'Not measurable by the app.',
    role,
    constraints: null,
    targetValue: null,
    targetUnit: null,
    targetTimeframe: null,
    isSupported: null,
  };
}

/**
 * A starter plan built from the goal text alone. It pairs numbers with the nouns they
 * count so "at least 2 words ... at least 5 times" yields a target of 5 with a two-word
 * condition, rather than the first number in the sentence.
 */
export function fallbackGoalPlan(goalText: string): GoalPlan {
  const lower = goalText.toLowerCase();
  const { id: primaryId, supporting } = pickPrimaryMetric(lower);
  const pairs = unitNumberPairs(goalText);
  const threshold = inferredWordThreshold(goalText);
  const consecutive = pairs.find(p => p.unit === 'consecutive')?.value ?? null;
  const targetPair = pairs.find(
    p => !p.unit.startsWith('word') && p.unit !== 'consecutive' && !p.unit.startsWith('session') && !p.unit.startsWith('week'),
  ) ?? null;

  const metrics: GoalMetric[] = [metricFor(primaryId, 'direct'), ...supporting.map(s => metricFor(s, 'supporting'))];
  if (primaryId === 'qualifying_sentences' && threshold !== null) {
    metrics[0].constraints = { minimumWordsPerSentence: threshold };
  }
  if (targetPair) {
    metrics[0].targetValue = targetPair.value;
    metrics[0].targetUnit = MetricCatalogue.definitionFor(primaryId)?.unit ?? targetPair.unit;
    metrics[0].targetTimeframe = 'per session';
  }
  const annotated = annotateMetrics(metrics);
  const condition =
    primaryId === 'qualifying_sentences' && threshold !== null
      ? `Each counted sentence contains at least ${threshold} words.`
      : '';
  const calculation = calculationFromPlanner({
    metrics: annotated,
    goalSummary: goalText,
    condition,
    consecutiveSessions: consecutive,
    serverPrimaryMetricId: primaryId,
  });
  const title = MetricCatalogue.definitionFor(primaryId)?.displayName ?? 'IEP goal';
  return {
    goalTitle: title,
    goalSummary: goalText,
    metrics: annotated,
    condition,
    targetValue: targetPair?.value ?? 0,
    targetUnit: metrics[0].targetUnit ?? '',
    timeframe: consecutive ? `across ${consecutive} consecutive sessions` : 'per session',
    consecutiveSessions: consecutive,
    dashboardTitle: `${title} progress`,
    dashboardTiles: ['Progress', 'Current session', 'Trend', 'Evidence'],
    confidenceNote:
      'This is a deterministic starter plan created without AI. Review the metric, target, condition and session rule before approving.',
    provider: 'fallback',
    achievementRule: targetPair
      ? { type: 'single_metric', requiredMetricIds: [primaryId], explanation: 'Scored on the stated target.' }
      : { type: 'tracking_only', requiredMetricIds: [], explanation: 'No target was stated in the goal.' },
    calculation,
  };
}

/** Per-event rule-based classification, in the network shape the store consumes. */
export function fallbackEventAnalysis(event: EventForAnalysis): EventAnalysisResult {
  const source: CommunicationSource =
    event.source === 'qaAnswer' || event.source === 'typedMessage' || event.source === 'quickPhrase'
      ? event.source
      : 'boardSentence';
  const analysis = analyzeContent(event.content, source);
  return {
    eventId: event.eventId,
    status: 'ok',
    communicationFunction: communicationFunctionToNetwork(analysis.communicationFunction ?? 'otherOrUnclear'),
    communicationFunctionConfidence: analysis.functionConfidence ?? null,
    isQuestion: analysis.isQuestion ?? null,
    whQuestionType: analysis.whQuestionType ?? null,
    expressesPreference: analysis.expressesPreference ?? null,
    setsBoundary: analysis.setsBoundary ?? null,
    relatesToRegulation: analysis.relatesToRegulation ?? null,
    isNovelContribution: null,
    isPartOfRetelling: null,
    retellingDetails: null,
    requiredSentenceFeatures: null,
  };
}

/** Facts-only prose that restates supplied numbers and adds none. */
export function fallbackNarrative(facts: NarrativeFacts): { patternInsight: string; opportunity: string; summary: string } {
  const sessions = facts.sessions.filter(s => s.result !== null);
  const completed = facts.metrics.completed_sessions ?? sessions.length;
  const met = sessions.filter(s => s.target !== null && s.result !== null && s.result >= s.target).length;
  const summary =
    completed === 0
      ? 'No tracked sessions are included in this view yet.'
      : `${completed} completed ${completed === 1 ? 'session is' : 'sessions are'} included in this view.`;
  const patternInsight =
    sessions.length === 0
      ? 'Patterns will appear once sessions have been recorded.'
      : `The session target was met in ${met} of ${sessions.length} recent ${sessions.length === 1 ? 'session' : 'sessions'}.`;
  const opportunity =
    sessions.length === 0
      ? 'Start a tracked session to begin collecting evidence for this goal.'
      : 'Review the evidence for recent sessions with the communication partner to plan the next session.';
  return { patternInsight, opportunity, summary };
}
