/**
 * Deterministic observations: context and partner comparisons, the dashboard insight
 * sentence, and the language summary. Nothing here is generated; every figure is counted.
 */

import { GoalProgress } from './goalProgress';
import { measuredValue } from '../core';

export const MINIMUM_SESSIONS_PER_GROUP = 3;
export const MINIMUM_MEANINGFUL_SPREAD = 20;

export interface ComparisonGroup {
  group: string;
  sessionCount: number;
  successfulSessions: number;
  successRate: number;
  averageValue: number;
  coverageText: string;
}

export interface ComparisonSet {
  dimension: string;
  groups: ComparisonGroup[];
}

function comparison(p: GoalProgress, dimension: string, key: (s: GoalProgress['sessions'][number]) => string): ComparisonSet | null {
  const byGroup = new Map<string, GoalProgress['sessions']>();
  for (const s of p.sessions) {
    const k = key(s).trim();
    if (!k) {
      continue;
    }
    const list = byGroup.get(k) ?? [];
    list.push(s);
    byGroup.set(k, list);
  }
  const groups: ComparisonGroup[] = [];
  for (const [group, sessions] of byGroup) {
    const measured = sessions.filter(s => s.result.kind === 'value');
    if (measured.length < MINIMUM_SESSIONS_PER_GROUP) {
      continue;
    }
    const successful = measured.filter(s => s.metTarget === true).length;
    const values = measured.map(s => measuredValue(s.result) as number);
    groups.push({
      group,
      sessionCount: measured.length,
      successfulSessions: successful,
      successRate: Math.round((successful / measured.length) * 100),
      averageValue: values.reduce((a, b) => a + b, 0) / values.length,
      coverageText: `${successful}/${measured.length} sessions`,
    });
  }
  if (groups.length < 2) {
    return null;
  }
  groups.sort((a, b) => b.successRate - a.successRate || b.sessionCount - a.sessionCount || a.group.localeCompare(b.group));
  return { dimension, groups };
}

export function comparisonSets(p: GoalProgress): ComparisonSet[] {
  return [
    comparison(p, 'Activity', s => s.treatmentContext),
    comparison(p, 'Communication partner', s => s.partnerType),
  ].filter((c): c is ComparisonSet => c !== null);
}

export function strongestComparison(p: GoalProgress): ComparisonSet | null {
  let best: { set: ComparisonSet; spread: number } | null = null;
  for (const set of comparisonSets(p)) {
    const spread = set.groups[0].successRate - set.groups[set.groups.length - 1].successRate;
    if (spread >= MINIMUM_MEANINGFUL_SPREAD && (best === null || spread > best.spread)) {
      best = { set, spread };
    }
  }
  return best?.set ?? null;
}

function listNames(names: string[]): string {
  if (names.length <= 1) {
    return names[0] ?? '';
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export interface DeterministicInsight {
  patternInsight: string | null;
  opportunityInsight: string | null;
}

export function deterministicInsight(p: GoalProgress): DeterministicInsight {
  const set = strongestComparison(p);
  if (!set || !p.hasTarget) {
    return { patternInsight: null, opportunityInsight: null };
  }
  const strongest = set.groups[0];
  const weakest = set.groups[set.groups.length - 1];
  const leaders = set.groups.filter(g => g.successRate === strongest.successRate).map(g => g.group.toLowerCase());
  return {
    patternInsight: `Sessions were more often successful during ${listNames(leaders)} (${strongest.successRate}%) than ${weakest.group.toLowerCase()} (${weakest.coverageText}).`,
    opportunityInsight: `${weakest.group} sessions met the target in ${weakest.coverageText}, against ${strongest.successRate}% for ${strongest.group.toLowerCase()}. Reviewing what supported the stronger sessions may suggest where to add opportunities.`,
  };
}

export const INSIGHT_FALLBACK = `Not enough data yet to identify a reliable pattern. A comparison needs at least ${MINIMUM_SESSIONS_PER_GROUP} sessions in each group.`;

export function dashboardInsightMessage(all: readonly GoalProgress[], aiSummary: string | null): string {
  if (aiSummary && aiSummary.trim().length > 0) {
    return aiSummary;
  }
  const measured = all.filter(p => p.status !== 'notScorable' && p.sessions.length > 0);
  if (measured.length === 0) {
    return 'No tracked sessions yet in this reporting period.';
  }
  const attention = measured.filter(p => p.status === 'needsAttention').map(p => p.title);
  if (attention.length > 0) {
    return `${listNames(attention)} fell below target in recent sessions.`;
  }
  const improving = measured.filter(p => p.trend === 'improving' && p.sessions.length > 1).map(p => p.title);
  if (improving.length > 0) {
    return `${listNames(improving)} improved across recent sessions.`;
  }
  const sessionCount = new Set(all.flatMap(p => p.sessions.map(s => s.sessionId))).size;
  if (sessionCount < 2) {
    return 'More sessions are needed before a pattern can be identified.';
  }
  return 'Results are holding steady across recent sessions.';
}

export interface LanguageAnalysis {
  words: Array<{ label: string; count: number }>;
  topics: Array<{ label: string; count: number }>;
  contexts: Array<{ label: string; count: number }>;
  hasEvidence: boolean;
}

const TOPICS: Array<[string, string[]]> = [
  ['People', ['mom', 'dad', 'mama', 'daddy', 'friend', 'teacher', 'sister', 'brother']],
  ['Food', ['eat', 'food', 'snack', 'drink', 'juice', 'cookie', 'apple', 'pizza']],
  ['Play', ['play', 'game', 'toy', 'music', 'ball', 'book']],
  ['Feelings', ['happy', 'sad', 'mad', 'scared', 'love', 'hurt']],
  ['Places', ['home', 'school', 'park', 'outside', 'store']],
];

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/** No stop words and no minimum length: AAC core vocabulary is the signal. */
export function analyzeLanguage(texts: readonly string[], contexts: readonly string[]): LanguageAnalysis {
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const token of text.toLowerCase().split(/[^a-z0-9']+/)) {
      if (token.length > 0) {
        counts.set(token, (counts.get(token) ?? 0) + 1);
      }
    }
  }
  const words = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 200)
    .map(([label, count]) => ({ label: capitalize(label), count }));
  const topics = TOPICS.map(([label, list]) => ({ label, count: list.reduce((sum, w) => sum + (counts.get(w) ?? 0), 0) }))
    .filter(t => t.count > 0)
    .sort((a, b) => b.count - a.count);
  const contextCounts = new Map<string, number>();
  for (const c of contexts) {
    const k = c.trim();
    if (k) {
      contextCounts.set(k, (contextCounts.get(k) ?? 0) + 1);
    }
  }
  const ctx = [...contextCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([label, count]) => ({ label: capitalize(label), count }));
  return { words, topics, contexts: ctx, hasEvidence: words.length > 0 || topics.length > 0 || ctx.length > 0 };
}
