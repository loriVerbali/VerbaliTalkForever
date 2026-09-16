/** Goal shell with Overview, Details and Evidence tabs. */

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { requestGoalOverviewNarrative } from '../ai/iepAiClient';
import { sessionRequirementText } from '../application/buildGoalProgress';
import { SentenceSample, averageBuildSeconds, buildTimeChange, calculationExplanation, durationsByLength, longestStreak, measurementNarrative, POS_FILTER_LABEL, PosFilter, sentenceLengthShares, sessionRuleText, supportingMetrics, topWords } from '../application/details';
import { EVIDENCE_FILTER_LABEL, EvidenceFilter, EvidenceRow, EvidenceSessionSummary, evidencePatternText, evidenceUsesAi, filterEvidenceRows, liveEvidenceSession, mockEvidenceSession } from '../application/evidence';
import { GoalProgress, formatValue, pluralUnit } from '../application/goalProgress';
import { INSIGHT_FALLBACK, analyzeLanguage, deterministicInsight } from '../application/insights';
import { isoDay } from '../application/reportingPeriod';
import { MetricCatalogue, MetricId, measuredValue } from '../core';
import { useAppSettings } from '../../../utils/persistance';
import { useIepStore, useIepStoreVersion } from '../hooks/IepStoreProvider';
import { useGoalProgress, useIepSettings, useProgressContext } from '../hooks/useIepDashboard';
import { COMMUNICATION_FUNCTIONS, COMMUNICATION_FUNCTION_LABEL, CommunicationFunction, SUPPORT_LEVEL_LABEL, SupportLevel } from '../model/types';
import { mockDatasetGoalId } from '../application/buildGoalProgress';
import { liveMeasurement } from '../store/liveMeasurement';
import { ProgressChart, Sparkline } from '../ui/ProgressChart';
import { AiTag, Chip, ConfirmDialog, OptionMenu, SectionHeader, Segmented, StatusLabel } from '../ui/primitives';
import { GoalDateSheet } from '../ui/SessionSheets';
import { iepColors, iepStyles, statusColor, TREND_TITLE } from '../ui/theme';
import { isAiProvider } from './IepDashboardScreen';

type Tab = 'overview' | 'details' | 'evidence';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (ms: number) => `${MONTHS[new Date(ms).getMonth()]} ${new Date(ms).getDate()}`;
const shortTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const weekOf = (ms: number) => {
  const d = new Date(ms);
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - start.getTime()) / 86_400_000 + start.getDay() + 1) / 7);
};

const IepGoalScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const goalId: string = route.params?.goalId;
  const { store } = useIepStore();
  useIepStoreVersion();
  const { settings } = useIepSettings();
  const { progress, goal } = useGoalProgress(goalId);
  const [tab, setTab] = useState<Tab>(route.params?.initialTab ?? 'overview');
  const [selectedSession, setSelectedSession] = useState<string | null>(route.params?.sessionId ?? null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  if (!progress || !goal) {
    return (
      <View style={[iepStyles.screen, { padding: 42 }]}>
        <TouchableOpacity accessibilityRole="button" onPress={() => navigation.goBack()}><Text style={{ color: iepColors.blue }}>‹ Done</Text></TouchableOpacity>
        <Text style={[iepStyles.subtle, { marginTop: 20 }]}>This goal is no longer available.</Text>
      </View>
    );
  }
  const usesAi = settings.mockMode || isAiProvider(goal.plan?.provider);
  const openEvidence = (sessionId: string) => {
    setSelectedSession(sessionId);
    setTab('evidence');
  };

  return (
    <View style={iepStyles.screen}>
      <ScrollView contentContainerStyle={iepStyles.content}>
        <View style={[iepStyles.row, { justifyContent: 'space-between' }]}>
          <TouchableOpacity accessibilityRole="button" onPress={() => navigation.goBack()}><Text style={{ color: iepColors.blue, fontWeight: '600', fontSize: 16 }}>‹ Done</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Edit goal" onPress={() => setRemoveOpen(true)}><Text style={{ color: iepColors.blue, fontWeight: '600', fontSize: 16 }}>Edit</Text></TouchableOpacity>
        </View>
        <View style={{ gap: 6 }}>
          <View style={[iepStyles.row, { gap: 10, flexWrap: 'wrap' }]}>
            <Text style={iepStyles.title}>Goal {progress.displayNumber}: {progress.title}</Text>
            {usesAi ? <AiTag /> : null}
          </View>
          <Text style={iepStyles.subtle}>{progress.statement}</Text>
          <View style={[iepStyles.row, { gap: 10, flexWrap: 'wrap' }]}>
            <Text style={iepStyles.caption}>{progress.periodLabel}</Text>
            <Text style={iepStyles.caption}>· {progress.sessions.length} {progress.sessions.length === 1 ? 'session' : 'sessions'}</Text>
            {progress.isMock ? <View style={{ backgroundColor: '#DDF3EF', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ color: iepColors.teal, fontWeight: '700', fontSize: 12 }}>Mock data</Text></View> : null}
          </View>
        </View>
        <Segmented accessibilityLabel="View" options={[{ key: 'overview', label: 'Overview' }, { key: 'details', label: 'Details' }, { key: 'evidence', label: 'Evidence' }]} value={tab} onChange={k => setTab(k as Tab)} />
        {!progress.isMock ? (
          <View style={[iepStyles.card, { gap: 8 }]}>
            <Text style={iepStyles.headline}>Goal schedule</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => setDateOpen(true)}><Text style={{ color: goal.targetDateMs ? iepColors.blue : iepColors.muted, fontWeight: '600' }}>📅 {goal.targetDateMs ? `Target ${shortDate(goal.targetDateMs)}, ${new Date(goal.targetDateMs).getFullYear()}` : 'Set target date'}</Text></TouchableOpacity>
            <Text style={iepStyles.caption}>The target date is a planning reminder and does not change the reporting period above.</Text>
          </View>
        ) : null}
        {tab === 'overview' ? <OverviewTab progress={progress} onSelectSession={openEvidence} /> : null}
        {tab === 'details' ? <DetailsTab progress={progress} /> : null}
        {tab === 'evidence' ? <EvidenceTab progress={progress} selectedSession={selectedSession} onSelectSession={setSelectedSession} childName={settings.heroName} /> : null}
      </ScrollView>
      <ConfirmDialog
        visible={removeOpen}
        title={`Remove Goal ${progress.displayNumber}?`}
        message={`Remove Goal ${progress.displayNumber}, ${progress.title}? This deletes the dashboard goal only. Previously collected session measurements will remain.`}
        confirmLabel="Remove goal"
        onConfirm={() => { store.deleteGoal(goal.id); setRemoveOpen(false); navigation.goBack(); }}
        onCancel={() => setRemoveOpen(false)}
      />
      <GoalDateSheet visible={dateOpen} targetDateMs={goal.targetDateMs ?? null} onSave={ms => store.setGoalTargetDate(goal.id, ms)} onClose={() => setDateOpen(false)} />
    </View>
  );
};

// Overview

const OverviewTab: React.FC<{ progress: GoalProgress; onSelectSession: (id: string) => void }> = ({ progress: p, onSelectSession }) => {
  const [narrative, setNarrative] = useState<{ pattern: string; opportunity: string; source: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const key = `${p.goalId}-${p.sessions.length}-${p.periodLabel}-${p.dataSourceLabel}`;

  useEffect(() => {
    let cancelled = false;
    setNarrative(null);
    setUnavailable(false);
    if (p.sessions.length === 0) {
      return;
    }
    setLoading(true);
    const measured = p.sessions.filter(s => s.result.kind === 'value');
    requestGoalOverviewNarrative(p.goalId, {
      metrics: {
        completed_sessions: measured.length,
        successful_sessions: p.outcome.sessionsMeetingTarget,
        average_result: p.currentPeriodAverage ?? 0,
        ...(p.headline.percent !== null ? { progress_percent: p.headline.percent } : {}),
      },
      sessions: measured.slice(-12).map(s => ({ session_id: s.sessionId, date: isoDay(s.dateMs), result: measuredValue(s.result), target: p.target })),
    })
      .then(reply => {
        if (cancelled) {
          return;
        }
        if (reply.source === 'local_fallback') {
          setUnavailable(true);
        } else {
          setNarrative({ pattern: reply.patternInsight, opportunity: reply.opportunity, source: reply.source });
        }
      })
      .catch(() => { if (!cancelled) { setUnavailable(true); } })
      .finally(() => { if (!cancelled) { setLoading(false); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const latest = p.sessions.length > 0 ? p.sessions[p.sessions.length - 1] : null;
  const latestValue = latest ? measuredValue(latest.result) : null;
  const requirementDetail =
    p.sessions.length === 0
      ? 'Start a session to begin measuring this goal.'
      : !p.hasTarget
        ? 'No target was stated, so sessions are tracked without a pass/fail score.'
        : p.status === 'achieved'
          ? `The requirement is ${sessionRuleText(p)}.`
          : `${sessionRuleText(p)} are required.`;
  const supporting: string[] = [];
  if (!latest) {
    supporting.push('No tracked sessions in this reporting period.');
  } else if (!p.hasTarget) {
    supporting.push(`Measured in ${p.outcome.sessionsMeasured} ${p.outcome.sessionsMeasured === 1 ? 'session' : 'sessions'}; no target was stated, so the result is not scored.`);
  } else {
    supporting.push(`Met in ${p.outcome.sessionsMeetingTarget} of ${p.sessions.length} sessions in this period.`);
    if (latestValue !== null && (p.target as number) > 0) {
      const raw = Math.round((latestValue / (p.target as number)) * 100);
      supporting.push(`Latest session: ${formatValue(latestValue)} of ${formatValue(p.target as number)} ${p.primaryUnit} — ${raw}% of target${raw > 100 ? ', shown as 100%' : ''}.`);
    } else if (latest.result.kind === 'pending') {
      supporting.push('Latest session: pending support review.');
    }
    if (p.sessions.length > 1) {
      supporting.push(`Direction across the period: ${TREND_TITLE[p.trend].toLowerCase()}.`);
    }
  }
  const insight = deterministicInsight(p);
  const measuredCount = p.sessions.filter(s => s.result.kind === 'value').length;
  const streak = p.sessionRule === 'consecutive' ? p.outcome.currentStreak : p.outcome.sessionsMeetingTarget;

  return (
    <>
      <View style={[iepStyles.card, iepStyles.row, { gap: 20, alignItems: 'stretch', flexWrap: 'wrap' }]}>
        <View style={{ width: 190, gap: 4 }}>
          <Text style={iepStyles.captionStrong}>Goal attainment</Text>
          <Text style={{ fontSize: 40, fontWeight: '900', color: statusColor(p.status) }}>{p.hasTarget && p.status !== 'notScorable' && p.headline.percent !== null ? `${p.headline.percent}%` : '—'}</Text>
          <StatusLabel status={p.status} />
          <Text style={iepStyles.caption}>{p.headline.caption}</Text>
        </View>
        <View style={[iepStyles.divider, { width: 1, height: 74, alignSelf: 'center' }]} />
        <View style={{ flex: 1, minWidth: 240, gap: 6 }}>
          <View style={[iepStyles.row, { gap: 10 }]}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: p.status === 'achieved' ? '#DDF0E4' : '#E3ECFB', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 18 }}>{p.status === 'achieved' ? '🎉' : '📈'}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={iepStyles.headline}>{sessionRequirementText(p)}</Text>
              <Text style={iepStyles.caption}>{requirementDetail}</Text>
            </View>
          </View>
          {supporting.map(line => <Text key={line} style={iepStyles.caption}>{line}</Text>)}
        </View>
      </View>

      {p.status === 'notScorable' ? (
        <View style={[iepStyles.card, { gap: 6 }]}>
          <Text style={iepStyles.headline}>Measurement unavailable</Text>
          <Text style={{ color: iepColors.amber, fontWeight: '600' }}>⚠ This goal does not yet have a supported local measurement rule.</Text>
          <Text style={iepStyles.caption}>{p.unavailableReason}</Text>
          <Text style={iepStyles.caption}>The exact goal wording is preserved. Update its measurement plan before using this result for reporting.</Text>
        </View>
      ) : null}

      {p.hasTarget && p.sessionsRequired > 1 ? (
        <View style={[iepStyles.card, { gap: 10 }]}>
          <Text style={iepStyles.headline}>Required conditions</Text>
          <ConditionRow title={p.primaryLabel} current={latestValue ?? 0} target={p.target as number} unit={p.primaryUnit} />
          <ConditionRow title={p.sessionRule === 'consecutive' ? 'Consecutive successful sessions' : 'Successful sessions'} current={streak} target={p.sessionsRequired} unit="sessions" />
        </View>
      ) : null}

      <View style={[iepStyles.card, { gap: 12 }]}>
        <Text style={iepStyles.headline}>Progress over time</Text>
        <ProgressChart progress={p} onSelectSession={onSelectSession} showHeader />
        {measuredCount < 2 ? <Text style={iepStyles.caption}>{measuredCount} {measuredCount === 1 ? 'session' : 'sessions'} recorded. More sessions are needed to show a reliable trend.</Text> : null}
      </View>

      {p.hasTarget && p.sessions.length > 1 ? (
        <View style={[iepStyles.card, { gap: 10 }]}>
          <Text style={iepStyles.headline}>Session requirement</Text>
          <Text style={iepStyles.caption}>Meet the goal threshold in {sessionRuleText(p)}.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={[iepStyles.row, { gap: 14 }]}>
              {p.sessions.map((s, i) => (
                <View key={s.sessionId} style={{ alignItems: 'center', gap: 2 }} accessible accessibilityLabel={`Session ${i + 1}, ${shortDate(s.dateMs)}, ${s.metTarget ? 'passed' : s.metTarget === false ? 'not passed' : 'not measured'}`}>
                  <Text style={{ fontSize: 20, color: s.metTarget ? iepColors.green : iepColors.muted }}>{s.metTarget ? '✔' : s.metTarget === false ? '✖' : '○'}</Text>
                  <Text style={iepStyles.caption}>S{i + 1}</Text>
                  <Text style={iepStyles.caption}>{shortDate(s.dateMs)}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
          <Text style={{ color: streak >= p.sessionsRequired ? iepColors.green : iepColors.muted, fontWeight: '600' }}>
            {streak >= p.sessionsRequired ? `✔ Requirement met · last ${streak} sessions passed` : `○ ${streak} of ${p.sessionsRequired}${p.sessionRule === 'consecutive' ? ' consecutive' : ''} sessions passed`}
          </Text>
        </View>
      ) : null}

      <View style={[iepStyles.card, { gap: 12 }]}>
        <SectionHeader title="What this suggests" usesAi />
        {narrative ? (
          <>
            <InsightCard kind="pattern" message={narrative.pattern} footnote={`Generated from ${p.sessions.length} sessions · ${p.periodLabel}`} />
            <InsightCard kind="opportunity" message={narrative.opportunity} />
          </>
        ) : insight.patternInsight ? (
          <>
            <InsightCard kind="pattern" message={insight.patternInsight} footnote={`Across ${p.sessions.length} sessions · ${p.periodLabel}`} />
            {insight.opportunityInsight ? <InsightCard kind="opportunity" message={insight.opportunityInsight} /> : null}
          </>
        ) : loading ? (
          <View style={[iepStyles.row, { gap: 8 }]}><ActivityIndicator color={iepColors.blue} /><Text style={iepStyles.subtle}>Looking for a pattern in this reporting period…</Text></View>
        ) : unavailable ? (
          <Text style={iepStyles.subtle}>Insights are unavailable right now. Every measured number on this page is still accurate.</Text>
        ) : (
          <Text style={iepStyles.subtle}>{INSIGHT_FALLBACK}</Text>
        )}
      </View>

      <View style={[iepStyles.card, { gap: 4 }]}>
        <Text style={iepStyles.headline}>Key metrics</Text>
        <KeyRow label="Average result" value={p.currentPeriodAverage !== null ? `${p.currentPeriodAverage.toFixed(1)} ${p.primaryUnit}` : 'No result'} />
        <KeyRow label="Sessions meeting target" value={`${p.outcome.sessionsMeetingTarget} of ${p.sessions.length}`} />
        <KeyRow label="Current successful streak" value={String(p.outcome.currentStreak)} />
        {p.previousPeriodAverage !== null ? <KeyRow label="Previous period average" value={p.previousPeriodAverage.toFixed(1)} /> : null}
      </View>
    </>
  );
};

const ConditionRow: React.FC<{ title: string; current: number; target: number; unit: string }> = ({ title, current, target, unit }) => {
  const percent = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  return (
    <View style={{ gap: 4 }}>
      <View style={[iepStyles.row, { justifyContent: 'space-between' }]}>
        <Text style={iepStyles.body}>{title}</Text>
        <Text style={{ color: iepColors.blue, fontWeight: '700' }}>{percent}%</Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: '#E6EDF5' }}><View style={{ width: `${percent}%`, height: 8, borderRadius: 4, backgroundColor: iepColors.blue }} /></View>
      <Text style={iepStyles.caption}>{formatValue(current)} of {formatValue(target)} {pluralUnit(unit, target)}</Text>
    </View>
  );
};

const KeyRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={[iepStyles.row, { justifyContent: 'space-between', paddingVertical: 6 }]}>
    <Text style={iepStyles.body}>{label}</Text>
    <Text style={[iepStyles.body, { fontWeight: '700' }]}>{value}</Text>
  </View>
);

const InsightCard: React.FC<{ kind: 'pattern' | 'opportunity'; message: string; footnote?: string }> = ({ kind, message, footnote }) => {
  const tint = kind === 'pattern' ? iepColors.blue : iepColors.amber;
  return (
    <View style={{ backgroundColor: `${tint}12`, borderRadius: 14, padding: 14, gap: 6 }}>
      <View style={[iepStyles.row, { gap: 8 }]}>
        <Text style={{ color: tint, fontWeight: '800' }}>{kind === 'pattern' ? '📈 Pattern' : '💡 Opportunity'}</Text>
        <AiTag />
      </View>
      <Text style={iepStyles.body}>{message}</Text>
      {footnote ? <Text style={iepStyles.caption}>{footnote}</Text> : null}
    </View>
  );
};

// Details

function sentenceSamplesFor(p: GoalProgress, ctx: ReturnType<typeof useProgressContext>['context']): SentenceSample[] {
  if (ctx.kind === 'live') {
    const ids = new Set(p.sessions.map(s => s.sessionId));
    return ctx.state.sentences
      .filter(s => ids.has(s.sessionId) && s.finalWords.length > 0 && s.endedAtMs > s.startedAtMs)
      .map(s => ({ dateMs: s.startedAtMs, words: s.finalWords.length, seconds: (s.endedAtMs - s.startedAtMs) / 1000 }));
  }
  const out: SentenceSample[] = [];
  for (const s of p.sessions) {
    const bySentence = new Map<string, { min: number; max: number; words: number }>();
    for (const e of ctx.dataset.eventsBySession.get(s.sessionId) ?? []) {
      if (!e.sentenceId) {
        continue;
      }
      const span = bySentence.get(e.sentenceId) ?? { min: e.elapsedSeconds, max: e.elapsedSeconds, words: 0 };
      span.min = Math.min(span.min, e.elapsedSeconds);
      span.max = Math.max(span.max, e.elapsedSeconds);
      if (e.wordCount !== null) {
        span.words = e.wordCount;
      }
      bySentence.set(e.sentenceId, span);
    }
    for (const span of bySentence.values()) {
      if (span.max > span.min && span.words > 0) {
        out.push({ dateMs: s.dateMs, words: span.words, seconds: span.max - span.min });
      }
    }
  }
  return out;
}

const DetailsTab: React.FC<{ progress: GoalProgress }> = ({ progress: p }) => {
  const { context } = useProgressContext();
  const [pos, setPos] = useState<PosFilter>('all');
  const samples = useMemo(() => sentenceSamplesFor(p, context), [p, context]);
  const streak = longestStreak(p);
  const shares = sentenceLengthShares(samples, p.sessions.map(s => s.dateMs));
  const avgBuild = averageBuildSeconds(samples);
  const change = buildTimeChange(samples, p.minimumWordsPerSentence ?? 1);
  const durations = durationsByLength(samples);
  const explanation = calculationExplanation(p);
  const language = useMemo(() => {
    if (context.kind === 'live') {
      const ids = new Set(p.sessions.map(s => s.sessionId));
      return analyzeLanguage(context.state.sentences.filter(s => ids.has(s.sessionId)).map(s => s.finalWords.join(' ')), p.sessions.map(s => s.treatmentContext));
    }
    const texts: string[] = [];
    for (const s of p.sessions) {
      for (const e of context.dataset.eventsBySession.get(s.sessionId) ?? []) {
        if (e.eventType === 'sentence_completed' && e.content) {
          texts.push(e.content);
        }
      }
    }
    return analyzeLanguage(texts, p.sessions.map(s => s.treatmentContext));
  }, [p, context]);
  const words = topWords(language, pos);

  const supportingValues = useMemo(() => {
    const map = new Map<MetricId, number[]>();
    const ids: MetricId[] = ['total_sentences', 'average_words_per_sentence', 'longest_sentence_words', 'different_communication_functions', 'different_pages_visited', 'different_words_activated', 'total_word_activations', 'page_navigations', 'questions_asked', 'wh_questions', 'request_count'];
    for (const s of p.sessions) {
      for (const id of ids) {
        let v: number | null = null;
        if (context.kind === 'live') {
          v = measuredValue(liveMeasurement(context.state, id, s.sessionId));
        } else {
          const gid = mockDatasetGoalId(p.goal, context.dataset);
          const row = gid ? context.dataset.sessionsByGoal.get(gid)?.find(r => r.sessionId === s.sessionId) : null;
          v = row?.columns[id] ?? null;
        }
        if (v !== null) {
          map.set(id, [...(map.get(id) ?? []), v]);
        }
      }
    }
    return map;
  }, [p, context]);
  const panel = supportingMetrics(supportingValues);
  const latest = p.sessions.length > 0 ? p.sessions[p.sessions.length - 1] : null;
  const latestValue = latest ? measuredValue(latest.result) : null;

  return (
    <>
      <View style={[iepStyles.card, { gap: 12 }]}>
        <SectionHeader title="How we calculate this goal" usesAi={p.dependsOnAi} />
        <Level label="LEVEL 1 · ACROSS THE PERIOD" name="Sessions at target" target={p.hasTarget ? `${p.sessionsRequired} ${p.sessionsRequired === 1 ? 'session' : 'sessions'}` : 'No target'} note={p.hasTarget ? (p.sessionRule === 'consecutive' ? 'They must be consecutive' : 'In any order') : null} />
        <Level label="LEVEL 2 · IN EACH SESSION" name={p.primaryLabel} target={p.hasTarget ? `${formatValue(p.target as number)} ${pluralUnit(p.primaryUnit, p.target as number)}` : 'No target'} note={p.comparison === 'atMost' ? 'Lower is better' : null} />
        {p.minimumWordsPerSentence !== null || p.metricTargets.some(m => m.metric.id !== p.primaryMetricId) ? (
          <View style={{ gap: 6 }}>
            <Text style={iepStyles.captionStrong}>LEVEL 3 · WHAT MAKES ONE COUNT</Text>
            {p.minimumWordsPerSentence !== null ? <PlanRow name="Words per sentence" target={`${p.minimumWordsPerSentence} ${pluralUnit('words', p.minimumWordsPerSentence)}`} note="Every sentence is measured against this" /> : null}
            {p.metricTargets.filter(m => m.metric.id !== p.primaryMetricId).map(m => (
              <PlanRow key={m.metric.id} name={m.isSupported ? m.definition?.displayName ?? m.metric.name : `${m.metric.name} (not measured by the app)`} target={m.targetValue !== null ? `${formatValue(m.targetValue)} ${m.definition?.unit ?? m.metric.targetUnit ?? ''}` : 'No target'} note={null} />
            ))}
          </View>
        ) : null}
        <Text style={iepStyles.body}>{measurementNarrative(p)}</Text>
        {p.requiredConditions.length > 0 ? <Text style={iepStyles.caption}>Conditions: {p.requiredConditions.join(' · ')}</Text> : null}
        {explanation ? <Text style={[iepStyles.caption, { color: iepColors.ink }]}>Latest session: {explanation}</Text> : latest && latestValue === null ? <Text style={iepStyles.caption}>Latest session: {latest.result.kind === 'pending' ? 'pending support review' : 'no data'}.</Text> : null}
        {p.measurementCaveat ? <Text style={[iepStyles.caption, { color: iepColors.amber }]}>⚠ {p.measurementCaveat}</Text> : null}
      </View>

      <View style={[iepStyles.card, { gap: 12 }]}>
        <SectionHeader title="Metrics behind the goal" usesAi={p.metricTargets.some(m => m.definition?.requirement === 'aiAssisted')} />
        {p.metricTargets.length === 0 ? <Text style={iepStyles.subtle}>No metrics are attached to this goal.</Text> : null}
        {p.metricTargets.map(m => (
          <View key={m.metric.id} style={[iepStyles.innerCard, iepStyles.row, { justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }]}>
            <View style={{ flex: 1, minWidth: 200, gap: 2 }}>
              <Text style={iepStyles.headline}>{m.definition?.displayName ?? m.metric.name}</Text>
              <Text style={iepStyles.caption}>{m.presentation.rule}</Text>
              <Text style={iepStyles.caption}>{m.presentation.style === 'goalProgress' ? 'Measures the goal' : m.presentation.style === 'conditionProgress' ? 'Required condition' : m.presentation.style === 'unsupported' ? m.presentation.unavailableReason : m.presentation.style === 'pending' ? 'Pending review' : 'Context only · no target line'}</Text>
            </View>
            <Sparkline values={supportingValues.get(m.definition?.id ?? '') ?? []} />
            <Text style={{ color: m.presentation.targetLine !== null ? iepColors.amber : iepColors.muted, fontWeight: '700' }}>{m.presentation.targetLine !== null ? `Target ${formatValue(m.presentation.targetLine)}` : 'No target'}</Text>
          </View>
        ))}
      </View>

      <View style={[iepStyles.card, { gap: 12 }]}>
        <Text style={iepStyles.headline}>Progress over time</Text>
        <ProgressChart progress={p} showHeader />
      </View>

      <View style={[iepStyles.row, { gap: 16, flexWrap: 'wrap', alignItems: 'stretch' }]}>
        <Tile title="Longest streak" value={streak ? `${streak.length} ${streak.length === 1 ? 'session' : 'sessions'}` : '—'} caption={streak ? `${shortDate(streak.startMs)} – ${shortDate(streak.endMs)}` : 'No session at target yet'} />
        <Tile title="Metric trend" value={TREND_TITLE[p.trend]} caption={p.outcome.sessionsMeasured < 4 ? 'Needs four measured sessions' : `Median of recent vs earlier sessions`} />
        <Tile title="Sentence length shares" value={shares ? `${Math.round((shares.threePlus / shares.total) * 100)}% 3+ words` : '—'} caption={shares ? `${shares.one} one-word · ${shares.two} two-word · ${shares.threePlus} three-plus of ${shares.total} (last 8 sessions)` : 'No sentence samples yet'} />
        <Tile title="Average build time" value={avgBuild !== null ? `${avgBuild.toFixed(1)} s` : '—'} caption={avgBuild !== null ? `${samples.filter(s => s.seconds > 0).length} timed sentences` : 'No timed sentences yet'} />
        <Tile title="Build time change" value={change ? `${change.percentChange > 0 ? '+' : ''}${change.percentChange}%` : '—'} caption={change ? `${change.earlierSeconds.toFixed(1)} s → ${change.recentSeconds.toFixed(1)} s for ${change.minimumWords}+ word sentences` : 'Needs at least 8 timed sentences'} />
        <Tile title="Build time by length" value={durations.length > 0 ? `${durations.length} buckets` : '—'} caption={durations.length > 0 ? durations.map(d => `${d.label}: ${d.averageSeconds.toFixed(1)} s`).join(' · ') : 'Needs 3 sentences per length'} />
      </View>

      <View style={[iepStyles.card, { gap: 10 }]}>
        <Text style={iepStyles.headline}>Words used most often</Text>
        <View style={iepStyles.rowWrap}>
          {(['all', 'pronoun', 'verb', 'descriptor', 'noun'] as PosFilter[]).map(f => <Chip key={f} label={POS_FILTER_LABEL[f]} selected={pos === f} onPress={() => setPos(f)} />)}
        </View>
        {words.length === 0 ? <Text style={iepStyles.subtle}>No words recorded for this filter yet.</Text> : words.map(w => (
          <View key={w.label} style={[iepStyles.row, { justifyContent: 'space-between' }]}>
            <Text style={iepStyles.body}>{w.label}</Text>
            <Text style={[iepStyles.body, { fontWeight: '700' }]}>{w.count}</Text>
          </View>
        ))}
      </View>

      {panel.length > 0 ? (
        <View style={[iepStyles.card, { gap: 10 }]}>
          <SectionHeader title="Supporting metrics — why did the child achieve this goal?" usesAi={panel.some(m => MetricCatalogue.definitionFor(m.id)?.requirement === 'aiAssisted')} />
          <View style={[iepStyles.row, { flexWrap: 'wrap', gap: 12 }]}>
            {panel.map(m => (
              <View key={m.id} style={[iepStyles.tile, { minWidth: 150, flexGrow: 1 }]} accessible accessibilityLabel={`${m.name}: ${m.value} ${m.unit}`}>
                <Text style={iepStyles.caption}>{m.name}</Text>
                <Text style={{ fontSize: 22, fontWeight: '800', color: iepColors.ink }}>{m.value}</Text>
                <Text style={iepStyles.caption}>{m.unit} · {m.aggregation}</Text>
              </View>
            ))}
          </View>
          <Text style={iepStyles.caption}>In this reporting period</Text>
        </View>
      ) : null}

      <View style={[iepStyles.card, { gap: 8 }]}>
        <SectionHeader title="Assistant insights" usesAi />
        {deterministicInsight(p).patternInsight ? <Text style={iepStyles.body}>{deterministicInsight(p).patternInsight}</Text> : <Text style={iepStyles.subtle}>The assistant has nothing reliable to report for this period yet. A comparison needs at least 3 sessions in each group being compared.</Text>}
        <Text style={iepStyles.caption}>Observations are written from the measured session data. Every figure shown is calculated by the app, never generated.</Text>
      </View>

      {p.goal.plan?.calculation ? (
        <View style={[iepStyles.card, { gap: 4 }]}>
          <Text style={iepStyles.headline}>Measurement plan</Text>
          <KeyRow label="Comparison" value={p.comparison === 'atMost' ? 'at most' : p.comparison === 'atLeast' ? 'at least' : p.comparison} />
          {p.requiredConditions.length > 0 ? <KeyRow label="Required conditions" value={p.requiredConditions.join(' · ')} /> : null}
          <KeyRow label="Timeframe" value={p.goal.timeframe || '—'} />
          <KeyRow label="Session rule" value={sessionRuleText(p)} />
          <Text style={iepStyles.caption}>Calculation version {p.calculationVersion}</Text>
        </View>
      ) : null}
    </>
  );
};

const Level: React.FC<{ label: string; name: string; target: string; note: string | null }> = ({ label, name, target, note }) => (
  <View style={{ gap: 6 }}>
    <Text style={iepStyles.captionStrong}>{label}</Text>
    <PlanRow name={name} target={target} note={note} />
  </View>
);

const PlanRow: React.FC<{ name: string; target: string; note: string | null }> = ({ name, target, note }) => (
  <View style={{ gap: 2 }}>
    <View style={[iepStyles.row, { justifyContent: 'space-between', gap: 12 }]}>
      <Text style={[iepStyles.body, { flexShrink: 1 }]}>{name}</Text>
      <Text style={{ color: target === 'No target' ? iepColors.muted : iepColors.blue, fontWeight: '700' }}>{target === 'No target' ? target : `Target: ${target}`}</Text>
    </View>
    {note ? <Text style={iepStyles.caption}>{note}</Text> : null}
  </View>
);

const Tile: React.FC<{ title: string; value: string; caption: string }> = ({ title, value, caption }) => (
  <View style={[iepStyles.card, { flexGrow: 1, minWidth: 220, gap: 4 }]} accessible accessibilityLabel={`${title}: ${value}. ${caption}`}>
    <Text style={iepStyles.captionStrong}>{title}</Text>
    <Text style={{ fontSize: 24, fontWeight: '800', color: iepColors.ink }}>{value}</Text>
    <Text style={iepStyles.caption}>{caption}</Text>
  </View>
);

// Evidence

const EvidenceTab: React.FC<{ progress: GoalProgress; selectedSession: string | null; onSelectSession: (id: string) => void; childName: string }> = ({ progress: p, selectedSession, onSelectSession, childName }) => {
  const { context } = useProgressContext();
  const { store } = useIepStore();
  const { setItem } = useAppSettings();
  const [filters, setFilters] = useState<Set<EvidenceFilter>>(new Set());
  const [editRow, setEditRow] = useState<{ row: EvidenceRow; field: 'support' | 'function' } | null>(null);

  const sessions = p.sessions;
  const currentId = selectedSession && sessions.some(s => s.sessionId === selectedSession) ? selectedSession : sessions[sessions.length - 1]?.sessionId ?? null;
  const selectedIndex = Math.max(0, sessions.findIndex(s => s.sessionId === currentId));
  const end = sessions.length <= 3 ? sessions.length : Math.min(sessions.length, Math.max(3, selectedIndex + 1));
  const windowed = sessions.length <= 3 ? sessions : sessions.slice(end - 3, end);

  const { preferences } = useAppSettings();
  const overlay = useMemo(() => {
    const parse = (s: string) => { try { return JSON.parse(s || '{}') as Record<string, string>; } catch { return {}; } };
    return { support: parse(preferences.iepMockSupportReviews), functions: parse(preferences.iepMockFunctionReviews) };
  }, [preferences.iepMockSupportReviews, preferences.iepMockFunctionReviews]);

  const summary: EvidenceSessionSummary | null = useMemo(() => {
    if (!currentId) {
      return null;
    }
    if (context.kind === 'live') {
      return liveEvidenceSession(context.state, currentId, childName);
    }
    return mockEvidenceSession(context.dataset, currentId, mockDatasetGoalId(p.goal, context.dataset), p.primaryMetricId, childName, overlay);
  }, [context, currentId, childName, p, overlay]);

  const rows = summary ? filterEvidenceRows(summary.rows, filters) : [];
  const current = sessions.find(s => s.sessionId === currentId) ?? null;
  const value = current ? measuredValue(current.result) : null;
  const pattern = summary ? evidencePatternText(summary.rows) : null;

  const toggle = (f: EvidenceFilter) => setFilters(prev => { const next = new Set(prev); if (next.has(f)) { next.delete(f); } else { next.add(f); } return next; });

  const applyEdit = (key: string) => {
    if (!editRow || !editRow.row.sentenceId) {
      return;
    }
    if (context.kind === 'live') {
      if (editRow.field === 'support') {
        store.setSupportLevel(editRow.row.sentenceId, key as SupportLevel);
      } else {
        store.setCommunicationFunction(editRow.row.sentenceId, key as CommunicationFunction);
      }
    } else if (currentId) {
      const overlayKey = `${context.dataset.id}/${currentId}/${editRow.row.sentenceId}`;
      if (editRow.field === 'support') {
        setItem('iepMockSupportReviews', JSON.stringify({ ...overlay.support, [overlayKey]: key }));
      } else {
        setItem('iepMockFunctionReviews', JSON.stringify({ ...overlay.functions, [overlayKey]: key }));
      }
    }
    setEditRow(null);
  };

  return (
    <>
      <View style={[iepStyles.card, { gap: 12 }]}>
        <View style={[iepStyles.row, { justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }]}>
          <View>
            <Text style={iepStyles.headline}>Session evidence</Text>
            <Text style={iepStyles.caption}>Exactly what happened, session by session.</Text>
          </View>
          {sessions.length > 0 ? (
            <View style={[iepStyles.row, { gap: 6 }]}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous session" disabled={selectedIndex <= 0} onPress={() => onSelectSession(sessions[selectedIndex - 1].sessionId)}><Text style={{ fontSize: 22, color: selectedIndex <= 0 ? iepColors.border : iepColors.blue }}>‹</Text></TouchableOpacity>
              {windowed.map(s => (
                <Chip key={s.sessionId} label={`Week ${weekOf(s.dateMs)} · ${shortDate(s.dateMs)}`} selected={s.sessionId === currentId} onPress={() => onSelectSession(s.sessionId)} />
              ))}
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next session" disabled={selectedIndex >= sessions.length - 1} onPress={() => onSelectSession(sessions[selectedIndex + 1].sessionId)}><Text style={{ fontSize: 22, color: selectedIndex >= sessions.length - 1 ? iepColors.border : iepColors.blue }}>›</Text></TouchableOpacity>
            </View>
          ) : null}
        </View>
        {!summary || !current ? (
          <Text style={iepStyles.subtle}>No session evidence is available for this goal.</Text>
        ) : (
          <View style={[iepStyles.row, { gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }]}>
            <View style={{ width: 232, gap: 12 }}>
              <View style={[iepStyles.innerCard, { gap: 6 }]}>
                <Text style={{ color: iepColors.teal, fontWeight: '700' }}>Week {weekOf(current.dateMs)} · {shortDate(current.dateMs)}</Text>
                <View style={[iepStyles.row, { gap: 6, alignItems: 'baseline' }]}>
                  <Text style={{ fontSize: 34, fontWeight: '900', color: iepColors.ink }}>{value !== null ? formatValue(value) : current.result.kind === 'pending' ? 'Pending' : '—'}</Text>
                  {p.hasTarget ? <Text style={{ fontSize: 18, color: iepColors.muted }}>/ {formatValue(p.target as number)}</Text> : null}
                </View>
                <Text style={iepStyles.caption}>{p.primaryUnit} / target</Text>
                <Text style={{ color: current.metTarget ? iepColors.green : iepColors.muted, fontWeight: '600' }}>{current.metTarget ? '✔ Session target met' : current.metTarget === false ? '✖ Session target not met' : '○ Not scored'}</Text>
                <View style={iepStyles.divider} />
                <Text style={iepStyles.caption}>🕒 {summary.startedAtMs ? shortTime(summary.startedAtMs) : '—'}–{summary.endedAtMs ? shortTime(summary.endedAtMs) : '—'}{current.durationSeconds ? ` · ${Math.max(1, Math.round(current.durationSeconds / 60))} min` : ''}</Text>
                <View style={[iepStyles.row, { gap: 6 }]}><Text style={iepStyles.captionStrong}>Support detection</Text><AiTag /></View>
                <Text style={iepStyles.caption}>Independent: {summary.independentCount}</Text>
                <Text style={iepStyles.caption}>Prompted: {summary.promptedCount}</Text>
                <Text style={iepStyles.caption}>Assisted: {summary.assistedCount}</Text>
              </View>
              <View style={[iepStyles.innerCard, { gap: 6 }]}>
                <Text style={iepStyles.headline}>Filter events</Text>
                {(Object.keys(EVIDENCE_FILTER_LABEL) as EvidenceFilter[]).map(f => (
                  <TouchableOpacity key={f} accessibilityRole="checkbox" accessibilityState={{ checked: filters.has(f) }} onPress={() => toggle(f)} style={[iepStyles.row, { gap: 8 }]}>
                    <Text style={{ color: filters.has(f) ? iepColors.blue : iepColors.muted, fontSize: 18 }}>{filters.has(f) ? '☑' : '☐'}</Text>
                    <Text style={iepStyles.body}>{EVIDENCE_FILTER_LABEL[f]}</Text>
                    {f === 'questions' || f === 'requests' ? <AiTag /> : null}
                  </TouchableOpacity>
                ))}
                <TouchableOpacity accessibilityRole="button" onPress={() => setFilters(new Set())} style={[iepStyles.buttonSecondary, { marginTop: 6 }]}><Text style={iepStyles.buttonSecondaryText}>Reset filters</Text></TouchableOpacity>
              </View>
            </View>
            <View style={{ flex: 1, minWidth: 320, gap: 10 }}>
              <View style={[iepStyles.row, { gap: 8, flexWrap: 'wrap' }]}>
                <Text style={iepStyles.headline}>Events</Text>
                {evidenceUsesAi(summary.rows) ? <AiTag /> : null}
                <Text style={iepStyles.caption}>{value !== null ? `${formatValue(value)} ${pluralUnit(p.primaryUnit, value)}` : 'not measured'}</Text>
              </View>
              {rows.length === 0 ? <Text style={iepStyles.subtle}>No events match the selected filters.</Text> : (
                <View accessible accessibilityLabel="Evidence table columns: time, speaker, function, evidence, words, support level">
                  <View style={[iepStyles.row, { gap: 8, paddingVertical: 6 }]}>
                    <Text style={[iepStyles.captionStrong, { width: 68 }]}>Time</Text>
                    <Text style={[iepStyles.captionStrong, { width: 52 }]}>Speaker</Text>
                    <Text style={[iepStyles.captionStrong, { width: 110 }]}>Function</Text>
                    <Text style={[iepStyles.captionStrong, { flex: 1 }]}>Evidence</Text>
                    <Text style={[iepStyles.captionStrong, { width: 62 }]}>Words</Text>
                    <Text style={[iepStyles.captionStrong, { width: 125 }]}>Support level</Text>
                  </View>
                  {rows.map(row => (
                    <View key={row.id} style={[iepStyles.row, { gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: iepColors.border }]}>
                      <Text style={[iepStyles.caption, { width: 68 }]}>{shortTime(row.timestampMs)}</Text>
                      <Text style={[iepStyles.caption, { width: 52, color: iepColors.blue, fontWeight: '700' }]} numberOfLines={1}>{row.speaker}</Text>
                      {row.isCompletion && row.sentenceId ? (
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Communication function for ${row.content}`} onPress={() => setEditRow({ row, field: 'function' })} style={{ width: 110 }}><Text style={{ color: iepColors.green, fontWeight: '600' }} numberOfLines={1}>{row.badge} ▾</Text></TouchableOpacity>
                      ) : (
                        <Text style={{ width: 110, color: row.badge === 'Sentence' ? iepColors.blue : row.category === 'questions' ? iepColors.teal : row.category === 'support' ? iepColors.amber : iepColors.muted, fontWeight: '600' }} numberOfLines={1}>{row.badge}</Text>
                      )}
                      <Text style={[iepStyles.body, { flex: 1, fontWeight: row.isCompletion ? '700' : '500' }]}>{row.content || '—'}</Text>
                      <Text style={[iepStyles.caption, { width: 62 }]}>{row.detail?.split(' · ')[0] ?? ''}</Text>
                      {row.isCompletion && row.sentenceId ? (
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Support level for ${row.content}`} onPress={() => setEditRow({ row, field: 'support' })} style={{ width: 125 }}><Text style={{ color: row.supportLevel === 'independent' ? iepColors.green : row.supportLevel === 'prompted' ? iepColors.amber : row.supportLevel === 'assisted' ? iepColors.red : iepColors.muted, fontWeight: '600' }}>{SUPPORT_LEVEL_LABEL[row.supportLevel ?? 'unrated']} ▾</Text></TouchableOpacity>
                      ) : (
                        <View style={{ width: 125 }} />
                      )}
                    </View>
                  ))}
                </View>
              )}
              {pattern ? (
                <View style={{ backgroundColor: '#E3F3F0', borderRadius: 14, padding: 12 }}>
                  <View style={[iepStyles.row, { gap: 8, flexWrap: 'wrap' }]}><Text style={{ color: iepColors.teal, fontWeight: '800' }}>✦ Pattern:</Text><AiTag /><Text style={iepStyles.body}>{pattern}</Text></View>
                </View>
              ) : null}
              {p.measurementCaveat ? <Text style={[iepStyles.caption, { color: iepColors.amber }]}>⚠ {p.measurementCaveat}</Text> : null}
            </View>
          </View>
        )}
      </View>
      <OptionMenu
        visible={editRow !== null}
        title={editRow?.field === 'support' ? 'Support level' : 'Communication function'}
        options={
          editRow?.field === 'support'
            ? (['unrated', 'independent', 'prompted', 'assisted'] as SupportLevel[]).filter(l => l !== 'unrated' || (editRow.row.supportLevel ?? 'unrated') === 'unrated').map(l => ({ key: l, label: SUPPORT_LEVEL_LABEL[l], selected: editRow?.row.supportLevel === l }))
            : COMMUNICATION_FUNCTIONS.map(f => ({ key: f, label: COMMUNICATION_FUNCTION_LABEL[f], selected: editRow?.row.communicationFunction === f }))
        }
        onSelect={applyEdit}
        onClose={() => setEditRow(null)}
      />
    </>
  );
};

export default IepGoalScreen;
