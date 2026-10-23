/** Goal shell with Overview, Details and Evidence tabs. */

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {requestGoalOverviewNarrative} from '../ai/iepAiClient';
import {
  IEP_EVENTS,
  daysBetween,
  goalEventProps,
  trackIep,
} from '../analytics/iepAnalytics';
import {
  buildGoalProgress,
  measureSessionMetric,
  sessionRequirementText,
} from '../application/buildGoalProgress';
import {
  SentenceSample,
  buildTimeChanges,
  durationsByLength,
  longestStreak,
  measurementNarrative,
  metricTrends,
  POS_FILTER_LABEL,
  PosFilter,
  sentenceLengthShares,
  sessionRuleText,
  SUPPORTING_PANEL_ORDER,
  supportingMetrics,
  topWords,
  trendShift,
  TrendSeriesId,
  WORDS_PER_SESSION_SERIES,
} from '../application/details';
import {
  EVIDENCE_FILTER_LABEL,
  EvidenceFilter,
  EvidenceRow,
  EvidenceSessionSummary,
  evidencePatternText,
  filterEvidenceRows,
  liveEvidenceSession,
  mockEvidenceSession,
} from '../application/evidence';
import {
  GOAL_STATUS_LABEL,
  GoalProgress,
  formatValue,
  pluralUnit,
} from '../application/goalProgress';
import {
  INSIGHT_FALLBACK,
  analyzeLanguage,
  deterministicInsight,
} from '../application/insights';
import {
  LEVEL_1_LABEL,
  LEVEL_2_LABEL,
  LEVEL_3_LABEL,
  progressPlanLevels,
} from '../application/planLevels';
import {
  isoDay,
  monthDay,
  toDatePeriod,
  weekOfYear,
} from '../application/reportingPeriod';
import {
  MetricCatalogue,
  MetricId,
  measuredValue,
  mockWordsPerSession,
} from '../core';
import {useAppSettings} from '../../../utils/persistance';
import {useIepStore, useIepStoreVersion} from '../hooks/IepStoreProvider';
import {
  useGoalProgress,
  useIepSettings,
  useProgressContext,
} from '../hooks/useIepDashboard';
import {
  COMMUNICATION_FUNCTIONS,
  COMMUNICATION_FUNCTION_LABEL,
  CommunicationFunction,
  SUPPORT_LEVEL_LABEL,
  SupportLevel,
} from '../model/types';
import {mockDatasetGoalId} from '../application/buildGoalProgress';
import {
  BarListTile,
  BuildTimeChangeTile,
  DURATIONS_TITLE,
  LongestRunTile,
  SHARES_TITLE,
  ShiftTile,
  WordBars,
  durationRows,
  shareRows,
} from '../ui/ExplainTiles';
import {MetricTrendCard, ProgressChart} from '../ui/ProgressChart';
import {
  AiTag,
  CheckMark,
  Chip,
  ConfirmDialog,
  OptionMenu,
  SectionHeader,
  Segmented,
  StatusLabel,
} from '../ui/primitives';
import {SessionPager} from '../ui/SessionPager';
import {GoalDateSheet} from '../ui/SessionSheets';
import {iepColors, iepStyles, statusColor, TREND_TITLE} from '../ui/theme';
import {isAiProvider} from './IepDashboardScreen';

type Tab = 'overview' | 'details' | 'evidence';

const shortTime = (ms: number) =>
  new Date(ms).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
type ProgressContext = ReturnType<typeof useProgressContext>['context'];

/** One session's value for a catalogue metric, measured under the goal's own plan options. */
function sessionMetricValue(
  p: GoalProgress,
  ctx: ProgressContext,
  id: MetricId,
  sessionId: string,
): number | null {
  return measuredValue(measureSessionMetric(p.goal, ctx, id, sessionId));
}

/** Every word in a session's completed sentences: the series behind "Average words per session". */
function sessionWordsPerSession(
  p: GoalProgress,
  ctx: ProgressContext,
  sessionId: string,
): number | null {
  if (ctx.kind === 'live') {
    const sentences = ctx.state.sentences.filter(
      s => s.sessionId === sessionId,
    );
    return sentences.length === 0
      ? null
      : sentences.reduce((sum, s) => sum + s.finalWords.length, 0);
  }
  const gid = mockDatasetGoalId(p.goal, ctx.dataset);
  const row = gid
    ? ctx.dataset.sessionsByGoal.get(gid)?.find(r => r.sessionId === sessionId)
    : null;
  return mockWordsPerSession(row?.columns);
}

const IepGoalScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const goalId: string = route.params?.goalId;
  const {store} = useIepStore();
  useIepStoreVersion();
  const {settings} = useIepSettings();
  const {progress, goal} = useGoalProgress(goalId);
  const [tab, setTab] = useState<Tab>(route.params?.initialTab ?? 'overview');
  const [selectedSession, setSelectedSession] = useState<string | null>(
    route.params?.sessionId ?? null,
  );
  const [removeOpen, setRemoveOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const tabSource = useRef<'initial' | 'tab_bar' | 'session_link'>('initial');
  const viewedReported = useRef(false);
  const hasProgress = progress !== null;

  useEffect(() => {
    if (!progress || viewedReported.current) {
      return;
    }
    viewedReported.current = true;
    trackIep(IEP_EVENTS.GOAL_VIEWED, {
      ...goalEventProps(progress),
      initial_tab: tab,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasProgress]);

  useEffect(() => {
    if (!progress) {
      return;
    }
    trackIep(IEP_EVENTS.GOAL_TAB_VIEWED, {
      tab,
      source: tabSource.current,
      status: progress.status,
      session_count: progress.sessions.length,
      is_mock: progress.isMock,
    });
    tabSource.current = 'tab_bar';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, hasProgress]);

  if (!progress || !goal) {
    return (
      <View style={[iepStyles.screen, {padding: 42}]}>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => navigation.goBack()}>
          <Text style={{color: iepColors.blue}}>‹ Done</Text>
        </TouchableOpacity>
        <Text style={[iepStyles.subtle, {marginTop: 20}]}>
          This goal is no longer available.
        </Text>
      </View>
    );
  }
  const usesAi = settings.mockMode || isAiProvider(goal.plan?.provider);
  const openEvidence = (sessionId: string) => {
    setSelectedSession(sessionId);
    if (tab !== 'evidence') {
      tabSource.current = 'session_link';
    }
    setTab('evidence');
  };

  return (
    <View style={iepStyles.screen}>
      <ScrollView contentContainerStyle={iepStyles.content}>
        <View style={[iepStyles.row, {justifyContent: 'space-between'}]}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => navigation.goBack()}>
            <Text
              style={{color: iepColors.blue, fontWeight: '600', fontSize: 16}}>
              ‹ Done
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Edit goal"
            onPress={() => setRemoveOpen(true)}>
            <Text
              style={{color: iepColors.blue, fontWeight: '600', fontSize: 16}}>
              Edit
            </Text>
          </TouchableOpacity>
        </View>
        <View style={{gap: 6}}>
          <View style={[iepStyles.row, {gap: 10, flexWrap: 'wrap'}]}>
            <Text style={iepStyles.title}>
              Goal {progress.displayNumber}: {progress.title}
            </Text>
            {usesAi && tab !== 'evidence' ? <AiTag /> : null}
          </View>
          <Text style={iepStyles.subtle}>{progress.statement}</Text>
          <View style={[iepStyles.row, {gap: 10, flexWrap: 'wrap'}]}>
            <Text style={iepStyles.caption}>{progress.periodLabel}</Text>
            <Text style={iepStyles.caption}>
              · {progress.sessions.length}{' '}
              {progress.sessions.length === 1 ? 'session' : 'sessions'}
            </Text>
            {progress.isMock ? (
              <View
                style={{
                  backgroundColor: '#DDF3EF',
                  borderRadius: 999,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                }}>
                <Text
                  style={{
                    color: iepColors.teal,
                    fontWeight: '700',
                    fontSize: 12,
                  }}>
                  Mock data
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <Segmented
          accessibilityLabel="View"
          options={[
            {key: 'overview', label: 'Overview'},
            {key: 'details', label: 'Details'},
            {key: 'evidence', label: 'Evidence'},
          ]}
          value={tab}
          onChange={k => setTab(k as Tab)}
        />
        {!progress.isMock ? (
          <View style={[iepStyles.card, {gap: 8}]}>
            <Text style={iepStyles.headline}>Goal schedule</Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setDateOpen(true)}>
              <Text
                style={{
                  color: goal.targetDateMs ? iepColors.blue : iepColors.muted,
                  fontWeight: '600',
                }}>
                📅{' '}
                {goal.targetDateMs
                  ? `Target ${monthDay(goal.targetDateMs)}, ${new Date(
                      goal.targetDateMs,
                    ).getFullYear()}`
                  : 'Set target date'}
              </Text>
            </TouchableOpacity>
            <Text style={iepStyles.caption}>
              The target date is a planning reminder and does not change the
              reporting period above.
            </Text>
          </View>
        ) : null}
        {tab === 'overview' ? (
          <OverviewTab progress={progress} onSelectSession={openEvidence} />
        ) : null}
        {tab === 'details' ? <DetailsTab progress={progress} /> : null}
        {tab === 'evidence' ? (
          <EvidenceTab
            progress={progress}
            selectedSession={selectedSession}
            onSelectSession={setSelectedSession}
            childName={settings.heroName}
          />
        ) : null}
      </ScrollView>
      <ConfirmDialog
        visible={removeOpen}
        title={`Remove Goal ${progress.displayNumber}?`}
        message={`Remove Goal ${progress.displayNumber}, ${progress.title}? This deletes the dashboard goal only. Previously collected session measurements will remain.`}
        confirmLabel="Remove goal"
        onConfirm={() => {
          trackIep(IEP_EVENTS.GOAL_REMOVED, {
            ...goalEventProps(progress),
            source: 'goal_screen',
          });
          store.deleteGoal(goal.id);
          setRemoveOpen(false);
          navigation.goBack();
        }}
        onCancel={() => setRemoveOpen(false)}
      />
      <GoalDateSheet
        visible={dateOpen}
        targetDateMs={goal.targetDateMs ?? null}
        onSave={ms => {
          store.setGoalTargetDate(goal.id, ms);
          trackIep(IEP_EVENTS.GOAL_TARGET_DATE_CHANGED, {
            ...goalEventProps(progress),
            has_date: ms !== null,
            days_from_now: ms !== null ? daysBetween(Date.now(), ms) : null,
            source: 'goal_screen',
          });
        }}
        onClose={() => setDateOpen(false)}
      />
    </View>
  );
};

// Overview

const OverviewTab: React.FC<{
  progress: GoalProgress;
  onSelectSession: (id: string) => void;
}> = ({progress: p, onSelectSession}) => {
  const [narrative, setNarrative] = useState<{
    pattern: string;
    opportunity: string;
    source: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const {context} = useProgressContext();
  const averageWords = useMemo(() => {
    const values = p.sessions
      .map(s =>
        sessionMetricValue(
          p,
          context,
          MetricCatalogue.averageWordsPerSentence.id,
          s.sessionId,
        ),
      )
      .filter((v): v is number => v !== null);
    return values.length > 0
      ? values.reduce((a, b) => a + b, 0) / values.length
      : null;
  }, [p, context]);
  const key = `${p.goalId}-${p.sessions.length}-${p.periodLabel}-${p.dataSourceLabel}`;

  useEffect(() => {
    let cancelled = false;
    setNarrative(null);
    setUnavailable(false);
    if (p.sessions.length === 0) {
      return;
    }
    setLoading(true);
    const startedAtMs = Date.now();
    const measured = p.sessions.filter(s => s.result.kind === 'value');
    requestGoalOverviewNarrative(p.goalId, {
      metrics: {
        completed_sessions: measured.length,
        successful_sessions: p.outcome.sessionsMeetingTarget,
        average_result: p.currentPeriodAverage ?? 0,
        ...(p.headline.percent !== null
          ? {progress_percent: p.headline.percent}
          : {}),
      },
      sessions: measured.slice(-12).map(s => ({
        session_id: s.sessionId,
        date: isoDay(s.dateMs),
        result: measuredValue(s.result),
        target: p.target,
      })),
    })
      .then(reply => {
        if (cancelled) {
          return;
        }
        const outcome = {
          session_count: measured.length,
          is_mock: p.isMock,
          duration_ms: Date.now() - startedAtMs,
        };
        if (reply.source === 'local_fallback') {
          setUnavailable(true);
          trackIep(IEP_EVENTS.GOAL_NARRATIVE_UNAVAILABLE, {
            ...outcome,
            reason: 'fallback',
          });
        } else {
          setNarrative({
            pattern: reply.patternInsight,
            opportunity: reply.opportunity,
            source: reply.source,
          });
          trackIep(IEP_EVENTS.GOAL_NARRATIVE_LOADED, {
            ...outcome,
            ai_source: reply.source,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUnavailable(true);
          trackIep(IEP_EVENTS.GOAL_NARRATIVE_UNAVAILABLE, {
            session_count: measured.length,
            is_mock: p.isMock,
            duration_ms: Date.now() - startedAtMs,
            reason: 'error',
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const latest =
    p.sessions.length > 0 ? p.sessions[p.sessions.length - 1] : null;
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
    supporting.push(
      `Measured in ${p.outcome.sessionsMeasured} ${
        p.outcome.sessionsMeasured === 1 ? 'session' : 'sessions'
      }; no target was stated, so the result is not scored.`,
    );
  } else {
    supporting.push(
      `Met in ${p.outcome.sessionsMeetingTarget} of ${p.sessions.length} sessions in this period.`,
    );
    if (latestValue !== null && (p.target as number) > 0) {
      const raw = Math.round((latestValue / (p.target as number)) * 100);
      supporting.push(
        `Latest session: ${formatValue(latestValue)} of ${formatValue(
          p.target as number,
        )} ${p.primaryUnit} — ${raw}% of target${
          raw > 100 ? ', shown as 100%' : ''
        }.`,
      );
    } else if (latest.result.kind === 'pending') {
      supporting.push('Latest session: pending support review.');
    }
    if (p.sessions.length > 1) {
      supporting.push(
        `Direction across the period: ${TREND_TITLE[p.trend].toLowerCase()}.`,
      );
    }
  }
  const insight = deterministicInsight(p);
  const measuredCount = p.sessions.filter(
    s => s.result.kind === 'value',
  ).length;
  const streak =
    p.sessionRule === 'consecutive'
      ? p.outcome.currentStreak
      : p.outcome.sessionsMeetingTarget;

  return (
    <>
      <View
        style={[
          iepStyles.card,
          iepStyles.row,
          {gap: 20, alignItems: 'stretch', flexWrap: 'wrap'},
        ]}>
        <View style={{width: 190, gap: 4}}>
          <Text style={iepStyles.captionStrong}>Goal attainment</Text>
          <Text
            style={{
              fontSize: 40,
              fontWeight: '900',
              color: statusColor(p.status),
            }}>
            {p.hasTarget &&
            p.status !== 'notScorable' &&
            p.headline.percent !== null
              ? `${p.headline.percent}%`
              : '—'}
          </Text>
          <StatusLabel status={p.status} />
          <Text style={iepStyles.caption}>{p.headline.caption}</Text>
        </View>
        <View
          style={[
            iepStyles.divider,
            {width: 1, height: 74, alignSelf: 'center'},
          ]}
        />
        <View style={{flex: 1, minWidth: 240, gap: 6}}>
          <View style={[iepStyles.row, {gap: 10}]}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor:
                  p.status === 'achieved' ? '#DDF0E4' : '#E3ECFB',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Text style={{fontSize: 18}}>
                {p.status === 'achieved' ? '🎉' : '📈'}
              </Text>
            </View>
            <View style={{flex: 1}}>
              <Text style={iepStyles.headline}>
                {sessionRequirementText(p)}
              </Text>
              <Text style={iepStyles.caption}>{requirementDetail}</Text>
            </View>
          </View>
          {supporting.map(line => (
            <Text key={line} style={iepStyles.caption}>
              {line}
            </Text>
          ))}
        </View>
      </View>

      {p.status === 'notScorable' ? (
        <View style={[iepStyles.card, {gap: 6}]}>
          <Text style={iepStyles.headline}>Measurement unavailable</Text>
          <Text style={{color: iepColors.amber, fontWeight: '600'}}>
            ⚠ This goal does not yet have a supported local measurement rule.
          </Text>
          <Text style={iepStyles.caption}>{p.unavailableReason}</Text>
          <Text style={iepStyles.caption}>
            The exact goal wording is preserved. Update its measurement plan
            before using this result for reporting.
          </Text>
        </View>
      ) : null}

      {p.hasTarget && p.sessionsRequired > 1 ? (
        <View style={[iepStyles.card, {gap: 10}]}>
          <Text style={iepStyles.headline}>Required conditions</Text>
          <ConditionRow
            title={p.primaryLabel}
            current={latestValue ?? 0}
            target={p.target as number}
            unit={p.primaryUnit}
          />
          <ConditionRow
            title={
              p.sessionRule === 'consecutive'
                ? 'Consecutive successful sessions'
                : 'Successful sessions'
            }
            current={streak}
            target={p.sessionsRequired}
            unit="sessions"
          />
        </View>
      ) : null}

      <View style={[iepStyles.card, {gap: 12}]}>
        <Text style={iepStyles.headline}>Progress over time</Text>
        <ProgressChart
          progress={p}
          onSelectSession={onSelectSession}
          showHeader
        />
        {measuredCount < 2 ? (
          <Text style={iepStyles.caption}>
            {measuredCount} {measuredCount === 1 ? 'session' : 'sessions'}{' '}
            recorded. More sessions are needed to show a reliable trend.
          </Text>
        ) : null}
      </View>

      {p.hasTarget && p.sessions.length > 1 ? (
        <View style={[iepStyles.card, {gap: 10}]}>
          <Text style={iepStyles.headline}>Session requirement</Text>
          <Text style={iepStyles.caption}>
            Meet the goal threshold in {sessionRuleText(p)}.
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={[iepStyles.row, {gap: 14}]}>
              {p.sessions.map((s, i) => (
                <View
                  key={s.sessionId}
                  style={{alignItems: 'center', gap: 2}}
                  accessible
                  accessibilityLabel={`Session ${i + 1}, ${monthDay(
                    s.dateMs,
                  )}, ${
                    s.metTarget
                      ? 'passed'
                      : s.metTarget === false
                      ? 'not passed'
                      : 'not measured'
                  }`}>
                  <View style={{height: 26, justifyContent: 'center'}}>
                    {s.metTarget ? (
                      <CheckMark size={22} />
                    ) : (
                      <Text style={{fontSize: 20, color: iepColors.muted}}>
                        {s.metTarget === false ? '✖' : '○'}
                      </Text>
                    )}
                  </View>
                  <Text style={iepStyles.caption}>S{i + 1}</Text>
                  <Text style={iepStyles.caption}>{monthDay(s.dateMs)}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
          <View style={[iepStyles.row, {gap: 6}]}>
            {streak >= p.sessionsRequired ? <CheckMark size={16} /> : null}
            <Text
              style={{
                color:
                  streak >= p.sessionsRequired
                    ? iepColors.green
                    : iepColors.muted,
                fontWeight: '600',
              }}>
              {streak >= p.sessionsRequired
                ? `Requirement met · last ${streak} sessions passed`
                : `○ ${streak} of ${p.sessionsRequired}${
                    p.sessionRule === 'consecutive' ? ' consecutive' : ''
                  } sessions passed`}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={[iepStyles.card, {gap: 12}]}>
        <SectionHeader title="What this suggests" usesAi />
        {narrative ? (
          <>
            <InsightCard
              kind="pattern"
              message={narrative.pattern}
              footnote={`Generated from ${p.sessions.length} sessions · ${p.periodLabel}`}
            />
            <InsightCard kind="opportunity" message={narrative.opportunity} />
          </>
        ) : insight.patternInsight ? (
          <>
            <InsightCard
              kind="pattern"
              message={insight.patternInsight}
              footnote={`Across ${p.sessions.length} sessions · ${p.periodLabel}`}
            />
            {insight.opportunityInsight ? (
              <InsightCard
                kind="opportunity"
                message={insight.opportunityInsight}
              />
            ) : null}
          </>
        ) : loading ? (
          <View style={[iepStyles.row, {gap: 8}]}>
            <ActivityIndicator color={iepColors.blue} />
            <Text style={iepStyles.subtle}>
              Looking for a pattern in this reporting period…
            </Text>
          </View>
        ) : unavailable ? (
          <Text style={iepStyles.subtle}>
            Insights are unavailable right now. Every measured number on this
            page is still accurate.
          </Text>
        ) : (
          <Text style={iepStyles.subtle}>{INSIGHT_FALLBACK}</Text>
        )}
        <Text style={iepStyles.caption}>
          This is a non-clinical tool; AI insights may contain errors.
        </Text>
      </View>

      <View style={{gap: 8}}>
        <Text
          style={[
            iepStyles.headline,
            {color: iepColors.muted, marginLeft: 20},
          ]}>
          Key metrics
        </Text>
        <View
          style={[
            iepStyles.card,
            iepStyles.row,
            {padding: 10, gap: 10, flexWrap: 'wrap', alignItems: 'stretch'},
          ]}>
          <KeyTile
            label="Average result"
            value={
              p.currentPeriodAverage !== null
                ? `${p.currentPeriodAverage.toFixed(1)} ${p.primaryUnit}`
                : '—'
            }
          />
          <KeyTile
            label="Sessions meeting target"
            value={`${p.outcome.sessionsMeetingTarget} of ${p.sessions.length}`}
          />
          <KeyTile
            label="Avg words per sentence"
            value={averageWords !== null ? averageWords.toFixed(1) : '—'}
          />
          <KeyTile
            label="Successful streak"
            value={String(p.outcome.currentStreak)}
          />
        </View>
      </View>
    </>
  );
};

const ConditionRow: React.FC<{
  title: string;
  current: number;
  target: number;
  unit: string;
}> = ({title, current, target, unit}) => {
  const percent =
    target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  return (
    <View style={{gap: 4}}>
      <View style={[iepStyles.row, {justifyContent: 'space-between'}]}>
        <Text style={iepStyles.body}>{title}</Text>
        <Text style={{color: iepColors.blue, fontWeight: '700'}}>
          {percent}%
        </Text>
      </View>
      <View style={{height: 8, borderRadius: 4, backgroundColor: '#E6EDF5'}}>
        <View
          style={{
            width: `${percent}%`,
            height: 8,
            borderRadius: 4,
            backgroundColor: iepColors.blue,
          }}
        />
      </View>
      <Text style={iepStyles.caption}>
        {formatValue(current)} of {formatValue(target)}{' '}
        {pluralUnit(unit, target)}
      </Text>
    </View>
  );
};

const KeyTile: React.FC<{label: string; value: string}> = ({label, value}) => (
  <View
    style={[iepStyles.tile, {flex: 1, minWidth: 150, gap: 2}]}
    accessible
    accessibilityLabel={`${label}: ${value}`}>
    <Text style={{fontSize: 22, fontWeight: '800', color: iepColors.ink}}>
      {value}
    </Text>
    <Text style={iepStyles.caption}>{label}</Text>
  </View>
);

const InsightCard: React.FC<{
  kind: 'pattern' | 'opportunity';
  message: string;
  footnote?: string;
}> = ({kind, message, footnote}) => {
  const tint = kind === 'pattern' ? iepColors.blue : iepColors.amber;
  return (
    <View
      style={{
        backgroundColor: `${tint}12`,
        borderRadius: 14,
        padding: 14,
        gap: 6,
      }}>
      <View style={[iepStyles.row, {gap: 8}]}>
        <Text style={{color: tint, fontWeight: '800'}}>
          {kind === 'pattern' ? '📈 Pattern' : '💡 Opportunity'}
        </Text>
        <AiTag />
      </View>
      <Text style={iepStyles.body}>{message}</Text>
      {footnote ? <Text style={iepStyles.caption}>{footnote}</Text> : null}
    </View>
  );
};

// Details

function sentenceSamplesFor(
  p: GoalProgress,
  ctx: ReturnType<typeof useProgressContext>['context'],
): SentenceSample[] {
  if (ctx.kind === 'live') {
    const ids = new Set(p.sessions.map(s => s.sessionId));
    return ctx.state.sentences
      .filter(
        s =>
          ids.has(s.sessionId) &&
          s.finalWords.length > 0 &&
          s.endedAtMs > s.startedAtMs,
      )
      .map(s => ({
        dateMs: s.startedAtMs,
        words: s.finalWords.length,
        seconds: (s.endedAtMs - s.startedAtMs) / 1000,
      }));
  }
  const out: SentenceSample[] = [];
  for (const s of p.sessions) {
    const bySentence = new Map<
      string,
      {min: number; max: number; words: number}
    >();
    for (const e of ctx.dataset.eventsBySession.get(s.sessionId) ?? []) {
      if (!e.sentenceId) {
        continue;
      }
      const span = bySentence.get(e.sentenceId) ?? {
        min: e.elapsedSeconds,
        max: e.elapsedSeconds,
        words: 0,
      };
      span.min = Math.min(span.min, e.elapsedSeconds);
      span.max = Math.max(span.max, e.elapsedSeconds);
      if (e.wordCount !== null) {
        span.words = e.wordCount;
      }
      bySentence.set(e.sentenceId, span);
    }
    for (const span of bySentence.values()) {
      if (span.max > span.min && span.words > 0) {
        out.push({
          dateMs: s.dateMs,
          words: span.words,
          seconds: span.max - span.min,
        });
      }
    }
  }
  return out;
}

const DetailsTab: React.FC<{progress: GoalProgress}> = ({progress: p}) => {
  const {context} = useProgressContext();
  const [pos, setPos] = useState<PosFilter>('all');
  const samples = useMemo(() => sentenceSamplesFor(p, context), [p, context]);
  const streak = longestStreak(p);
  // A run is still going when it reaches the latest session with a measured result;
  // unmeasured sessions neither extend nor break it.
  const latestMeasuredMs =
    [...p.sessions].reverse().find(s => s.result.kind === 'value')?.dateMs ??
    null;
  const changes = useMemo(() => buildTimeChanges(samples), [samples]);
  // The "to date" figures cover every session recorded for the goal, not only the
  // reporting period: sentence lengths, build times by length and the words used.
  const toDate = useMemo(
    () => buildGoalProgress(p.goal, toDatePeriod(Date.now()), context),
    [p.goal, context],
  );
  const toDateSamples = useMemo(
    () => sentenceSamplesFor(toDate, context),
    [toDate, context],
  );
  const shares = sentenceLengthShares(toDateSamples);
  const durations = durationsByLength(toDateSamples);
  const language = useMemo(() => {
    if (context.kind === 'live') {
      const ids = new Set(toDate.sessions.map(s => s.sessionId));
      return analyzeLanguage(
        context.state.sentences
          .filter(s => ids.has(s.sessionId))
          .map(s => s.finalWords.join(' ')),
        toDate.sessions.map(s => s.treatmentContext),
      );
    }
    const texts: string[] = [];
    for (const s of toDate.sessions) {
      for (const e of context.dataset.eventsBySession.get(s.sessionId) ?? []) {
        if (e.eventType === 'sentence_completed' && e.content) {
          texts.push(e.content);
        }
      }
    }
    return analyzeLanguage(
      texts,
      toDate.sessions.map(s => s.treatmentContext),
    );
  }, [toDate, context]);
  const words = topWords(language, pos);

  const readSeries = useMemo(
    () => (series: TrendSeriesId, sessionId: string) =>
      series === WORDS_PER_SESSION_SERIES
        ? sessionWordsPerSession(p, context, sessionId)
        : sessionMetricValue(p, context, series, sessionId),
    [p, context],
  );
  const panel = useMemo(() => {
    const map = new Map<TrendSeriesId, number[]>();
    for (const s of p.sessions) {
      for (const id of SUPPORTING_PANEL_ORDER) {
        const v = readSeries(id, s.sessionId);
        if (v !== null) {
          map.set(id, [...(map.get(id) ?? []), v]);
        }
      }
    }
    return supportingMetrics(map);
  }, [p, readSeries]);
  const trends = useMemo(() => metricTrends(p, readSeries), [p, readSeries]);
  const shiftFor = (series: TrendSeriesId) => {
    const t = trends.find(x => x.key === series);
    return t ? trendShift(t.points) : null;
  };
  const latest =
    p.sessions.length > 0 ? p.sessions[p.sessions.length - 1] : null;
  const {levelTwo: sessionRows, levelThree: sentenceRows} =
    progressPlanLevels(p);

  const sessionOutcome = !latest
    ? 'No tracked sessions yet'
    : !p.hasTarget
    ? 'Measurement recorded; no target set'
    : latest.metTarget === true
    ? 'Target met in this session'
    : latest.metTarget === false
    ? 'Target not met in this session'
    : 'Latest session not scored yet';
  const percentText =
    p.hasTarget && p.status !== 'notScorable' && p.headline.percent !== null
      ? `${p.headline.percent}%`
      : '—';

  return (
    <>
      <View
        style={[
          iepStyles.card,
          iepStyles.row,
          {gap: 20, alignItems: 'stretch', flexWrap: 'wrap'},
        ]}>
        <View style={{flex: 1, minWidth: 240, gap: 6}}>
          <View style={[iepStyles.row, {gap: 8, flexWrap: 'wrap'}]}>
            <Text style={iepStyles.headline}>What counts toward this goal</Text>
            <AiTag />
          </View>
          <Text style={iepStyles.body}>{measurementNarrative(p)}</Text>
        </View>
        <View
          style={[
            iepStyles.divider,
            {width: 1, height: 74, alignSelf: 'center'},
          ]}
        />
        <View
          style={{width: 180, gap: 2, alignItems: 'flex-end'}}
          accessible
          accessibilityLabel={`${
            percentText === '—' ? 'No score' : percentText
          }, ${GOAL_STATUS_LABEL[p.status]}. ${sessionOutcome}`}>
          <Text
            style={{
              fontSize: 40,
              fontWeight: '900',
              color: statusColor(p.status),
            }}>
            {percentText}
          </Text>
          <Text
            style={{
              color: statusColor(p.status),
              fontWeight: '700',
              fontSize: 14,
            }}>
            {GOAL_STATUS_LABEL[p.status]}
          </Text>
          <Text style={[iepStyles.caption, {textAlign: 'right'}]}>
            {sessionOutcome}
          </Text>
        </View>
      </View>

      <View style={{gap: 8}}>
        <View style={[iepStyles.card, {gap: 18}]}>
          <View style={{gap: 4}}>
            <SectionHeader
              title="How this goal is measured"
              usesAi={p.dependsOnAi}
            />
            <Text style={iepStyles.subtle}>
              The same three levels the goal was set up with. The numbers
              themselves are below.
            </Text>
          </View>
          <Level label={LEVEL_1_LABEL.toUpperCase()}>
            <PlanRow
              name="Sessions at target"
              target={
                p.hasTarget
                  ? `${p.sessionsRequired} ${
                      p.sessionsRequired === 1 ? 'session' : 'sessions'
                    }`
                  : 'No target'
              }
              note={
                p.hasTarget
                  ? p.sessionRule === 'consecutive'
                    ? 'They must be consecutive'
                    : 'In any order'
                  : null
              }
            />
          </Level>
          <View style={iepStyles.divider} />
          <Level label={LEVEL_2_LABEL.toUpperCase()}>
            <PlanRow
              name={p.primaryLabel}
              target={
                p.hasTarget
                  ? `${formatValue(p.target as number)} ${pluralUnit(
                      p.primaryUnit,
                      p.target as number,
                    )}`
                  : 'No target'
              }
              note={p.comparison === 'atMost' ? 'Lower is better' : null}
            />
            {sessionRows.map(m => (
              <PlanRow
                key={m.metric.id}
                name={planRowName(m)}
                target={planRowTarget(m)}
                note={null}
              />
            ))}
          </Level>
          {p.minimumWordsPerSentence !== null || sentenceRows.length > 0 ? (
            <>
              <View style={iepStyles.divider} />
              <Level label={LEVEL_3_LABEL.toUpperCase()}>
                {p.minimumWordsPerSentence !== null ? (
                  <PlanRow
                    name="Words per sentence"
                    target={`${p.minimumWordsPerSentence} ${pluralUnit(
                      'words',
                      p.minimumWordsPerSentence,
                    )}`}
                    note="Every sentence is measured against this"
                  />
                ) : null}
                {sentenceRows.map(m => (
                  <PlanRow
                    key={m.metric.id}
                    name={planRowName(m)}
                    target={planRowTarget(m)}
                    note={null}
                  />
                ))}
              </Level>
            </>
          ) : null}
          {p.requiredConditions.length > 0 ? (
            <Text style={iepStyles.caption}>
              Conditions: {p.requiredConditions.join(' · ')}
            </Text>
          ) : null}
          {p.measurementCaveat ? (
            <Text style={[iepStyles.caption, {color: iepColors.amber}]}>
              ⚠ {p.measurementCaveat}
            </Text>
          ) : null}
        </View>
        {p.hasTarget ? (
          <Text style={[iepStyles.caption, {marginLeft: 20}]}>
            The goal is met once {sessionRuleText(p)}{' '}
            {p.sessionsRequired === 1 ? 'reaches' : 'reach'} the target.
          </Text>
        ) : null}
      </View>

      <View
        style={{
          backgroundColor: '#E6EDF5',
          borderRadius: 18,
          padding: 16,
          gap: 12,
        }}>
        <View style={[iepStyles.row, {gap: 10, flexWrap: 'wrap'}]}>
          <Text style={[iepStyles.headline, {color: iepColors.muted}]}>
            Metrics behind the goal
          </Text>
          {trends.some(t => t.usesAi) ? <AiTag /> : null}
        </View>
        {trends.length === 0 ? (
          <Text style={iepStyles.subtle}>
            No supporting metrics to chart for this goal yet.
          </Text>
        ) : (
          <View
            style={[
              iepStyles.row,
              {gap: 12, flexWrap: 'wrap', alignItems: 'stretch'},
            ]}>
            {trends.map(t => (
              <MetricTrendCard key={t.key} trend={t} />
            ))}
          </View>
        )}
      </View>

      <View style={[iepStyles.card, {gap: 12}]}>
        <Text style={iepStyles.headline}>Progress over time</Text>
        <ProgressChart progress={p} showHeader />
      </View>

      <View style={{gap: 12}}>
        <Text style={[iepStyles.headline, {color: iepColors.muted}]}>
          What explains this goal
        </Text>
        <View style={tileRow}>
          <LongestRunTile
            streak={streak}
            currentStreak={p.outcome.currentStreak}
            latestSessionMs={latestMeasuredMs}
          />
          <ShiftTile
            title="Average words per sentence"
            shift={shiftFor(MetricCatalogue.averageWordsPerSentence.id)}
            unit="words"
          />
          <ShiftTile
            title="Average words per session"
            shift={shiftFor(WORDS_PER_SESSION_SERIES)}
            unit="words"
          />
        </View>
        <View style={tileRow}>
          <BuildTimeChangeTile changes={changes} />
          <BarListTile
            title={SHARES_TITLE}
            rows={shareRows(shares)}
            color={iepColors.blue}
            emptyText="No sentences recorded yet."
          />
        </View>
        <View style={tileRow}>
          <BarListTile
            title={DURATIONS_TITLE}
            rows={durationRows(durations)}
            color={iepColors.teal}
            emptyText="Needs three timed sentences of one length."
          />
          <View style={{flexGrow: 1, flexBasis: 0, minWidth: 300}} />
        </View>
      </View>

      <View style={[iepStyles.card, {gap: 12}]}>
        <View style={{gap: 3}}>
          <Text style={iepStyles.headline}>Words used most often</Text>
          <Text style={iepStyles.subtle}>
            Most frequently used words since the goal started
          </Text>
        </View>
        <View style={iepStyles.rowWrap}>
          {(
            ['all', 'pronoun', 'verb', 'descriptor', 'noun'] as PosFilter[]
          ).map(f => (
            <Chip
              key={f}
              label={POS_FILTER_LABEL[f]}
              selected={pos === f}
              onPress={() => {
                setPos(f);
                trackIep(IEP_EVENTS.GOAL_WORDS_FILTER_CHANGED, {
                  filter: f,
                  is_mock: p.isMock,
                });
              }}
            />
          ))}
        </View>
        {words.length === 0 ? (
          <Text style={iepStyles.subtle}>
            No words recorded for this filter yet.
          </Text>
        ) : (
          <WordBars words={words} />
        )}
      </View>

      {panel.length > 0 ? (
        <View style={[iepStyles.card, {gap: 10}]}>
          <SectionHeader
            title="Supporting metrics — why did the child achieve this goal?"
            usesAi={panel.some(
              m =>
                MetricCatalogue.definitionFor(m.id)?.requirement ===
                'aiAssisted',
            )}
          />
          <View style={[iepStyles.row, {flexWrap: 'wrap', gap: 12}]}>
            {panel.map(m => (
              <View
                key={m.id}
                style={[iepStyles.tile, {minWidth: 150, flexGrow: 1}]}
                accessible
                accessibilityLabel={`${m.name}: ${m.value} ${m.unit}`}>
                <Text style={iepStyles.caption}>{m.name}</Text>
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: '800',
                    color: iepColors.ink,
                  }}>
                  {m.value}
                </Text>
                <Text style={iepStyles.caption}>
                  {m.unit} · {m.aggregation}
                </Text>
              </View>
            ))}
          </View>
          <Text style={iepStyles.caption}>In this reporting period</Text>
        </View>
      ) : null}

      <View style={[iepStyles.card, {gap: 8}]}>
        <SectionHeader title="Assistant insights" usesAi />
        {deterministicInsight(p).patternInsight ? (
          <Text style={iepStyles.body}>
            {deterministicInsight(p).patternInsight}
          </Text>
        ) : (
          <Text style={iepStyles.subtle}>
            The assistant has nothing reliable to report for this period yet. A
            comparison needs at least 3 sessions in each group being compared.
          </Text>
        )}
        <Text style={iepStyles.caption}>
          Observations are written from the measured session data. Every figure
          shown is calculated by the app, never generated.
        </Text>
        <Text style={[iepStyles.caption, {fontWeight: '600'}]}>
          This is a non-clinical tool; AI insights may contain errors.
        </Text>
      </View>
    </>
  );
};

const Level: React.FC<{label: string; children: React.ReactNode}> = ({
  label,
  children,
}) => (
  <View style={{gap: 12}}>
    <Text style={iepStyles.captionStrong}>{label}</Text>
    {children}
  </View>
);

type PlanMetric = GoalProgress['metricTargets'][number];
const planRowName = (m: PlanMetric): string =>
  m.isSupported
    ? m.definition?.displayName ?? m.metric.name
    : `${m.metric.name} (not measured by the app)`;
const planRowTarget = (m: PlanMetric): string =>
  m.targetValue !== null
    ? `${formatValue(m.targetValue)} ${pluralUnit(
        m.definition?.unit ?? m.metric.targetUnit ?? '',
        m.targetValue,
      )}`.trim()
    : 'No target';

const PlanRow: React.FC<{
  name: string;
  target: string;
  note: string | null;
}> = ({name, target, note}) => {
  const none = target === 'No target';
  return (
    <View style={[iepStyles.row, {justifyContent: 'space-between', gap: 12}]}>
      <View style={{flexShrink: 1, gap: 3}}>
        <Text style={[iepStyles.body, {fontWeight: '700'}]}>{name}</Text>
        {note ? <Text style={iepStyles.caption}>{note}</Text> : null}
      </View>
      <View
        style={{
          backgroundColor: none ? '#E9EDF2' : '#E8F0FD',
          borderRadius: 999,
          paddingHorizontal: 12,
          paddingVertical: 5,
        }}>
        <Text
          style={{
            color: none ? iepColors.muted : iepColors.blue,
            fontWeight: '600',
            fontSize: 14,
          }}>
          {none ? target : `Target: ${target}`}
        </Text>
      </View>
    </View>
  );
};

/** Tiles sharing a row's width, wrapping when the row is too narrow for them. */
const tileRow: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'stretch',
  flexWrap: 'wrap',
  gap: 12,
};

// Evidence

const EvidenceTab: React.FC<{
  progress: GoalProgress;
  selectedSession: string | null;
  onSelectSession: (id: string) => void;
  childName: string;
}> = ({progress: p, selectedSession, onSelectSession, childName}) => {
  const {context} = useProgressContext();
  const {store} = useIepStore();
  const {setItem} = useAppSettings();
  const [filters, setFilters] = useState<Set<EvidenceFilter>>(new Set());
  const [editRow, setEditRow] = useState<{
    row: EvidenceRow;
    field: 'support' | 'function';
  } | null>(null);

  const sessions = p.sessions;
  const currentId =
    selectedSession && sessions.some(s => s.sessionId === selectedSession)
      ? selectedSession
      : sessions[sessions.length - 1]?.sessionId ?? null;

  const {preferences} = useAppSettings();
  const overlay = useMemo(() => {
    const parse = (s: string) => {
      try {
        return JSON.parse(s || '{}') as Record<string, string>;
      } catch {
        return {};
      }
    };
    return {
      support: parse(preferences.iepMockSupportReviews),
      functions: parse(preferences.iepMockFunctionReviews),
    };
  }, [preferences.iepMockSupportReviews, preferences.iepMockFunctionReviews]);

  const summary: EvidenceSessionSummary | null = useMemo(() => {
    if (!currentId) {
      return null;
    }
    if (context.kind === 'live') {
      return liveEvidenceSession(context.state, currentId, childName);
    }
    return mockEvidenceSession(
      context.dataset,
      currentId,
      mockDatasetGoalId(p.goal, context.dataset),
      p.primaryMetricId,
      childName,
      overlay,
    );
  }, [context, currentId, childName, p, overlay]);

  const rows = summary ? filterEvidenceRows(summary.rows, filters) : [];
  const current = sessions.find(s => s.sessionId === currentId) ?? null;
  const value = current ? measuredValue(current.result) : null;
  const pattern = summary ? evidencePatternText(summary.rows) : null;

  const toggle = (f: EvidenceFilter) => {
    const enabled = !filters.has(f);
    trackIep(IEP_EVENTS.EVIDENCE_FILTER_CHANGED, {
      filter: f,
      enabled,
      active_filter_count: filters.size + (enabled ? 1 : -1),
      is_mock: p.isMock,
    });
    setFilters(prev => {
      const next = new Set(prev);
      if (next.has(f)) {
        next.delete(f);
      } else {
        next.add(f);
      }
      return next;
    });
  };

  const applyEdit = (key: string) => {
    if (!editRow || !editRow.row.sentenceId) {
      return;
    }
    // The field is reported, never the chosen value: that is clinical detail.
    trackIep(IEP_EVENTS.EVIDENCE_EDITED, {
      field: editRow.field,
      is_mock: context.kind !== 'live',
    });
    if (context.kind === 'live') {
      if (editRow.field === 'support') {
        store.setSupportLevel(editRow.row.sentenceId, key as SupportLevel);
      } else {
        store.setCommunicationFunction(
          editRow.row.sentenceId,
          key as CommunicationFunction,
        );
      }
    } else if (currentId) {
      const overlayKey = `${context.dataset.id}/${currentId}/${editRow.row.sentenceId}`;
      if (editRow.field === 'support') {
        setItem(
          'iepMockSupportReviews',
          JSON.stringify({...overlay.support, [overlayKey]: key}),
        );
      } else {
        setItem(
          'iepMockFunctionReviews',
          JSON.stringify({...overlay.functions, [overlayKey]: key}),
        );
      }
    }
    setEditRow(null);
  };

  return (
    <>
      <View style={[iepStyles.card, {gap: 12}]}>
        <View
          style={[
            iepStyles.row,
            {justifyContent: 'space-between', flexWrap: 'wrap', gap: 10},
          ]}>
          <View>
            <Text style={iepStyles.headline}>Session evidence</Text>
            <Text style={iepStyles.caption}>
              Exactly what happened, session by session.
            </Text>
          </View>
          <SessionPager
            sessions={sessions.map(s => ({
              id: s.sessionId,
              label: `Week ${weekOfYear(s.dateMs)} · ${monthDay(s.dateMs)}`,
            }))}
            selectedId={currentId}
            onSelect={id => {
              trackIep(IEP_EVENTS.EVIDENCE_SESSION_CHANGED, {
                session_index: sessions.findIndex(s => s.sessionId === id) + 1,
                session_count: sessions.length,
                is_mock: p.isMock,
              });
              onSelectSession(id);
            }}
          />
        </View>
        {!summary || !current ? (
          <Text style={iepStyles.subtle}>
            No session evidence is available for this goal.
          </Text>
        ) : (
          <View
            style={[
              iepStyles.row,
              {gap: 16, alignItems: 'flex-start', flexWrap: 'wrap'},
            ]}>
            <View style={{width: 232, gap: 12}}>
              <View style={[iepStyles.innerCard, {gap: 6}]}>
                <Text style={{color: iepColors.teal, fontWeight: '700'}}>
                  Week {weekOfYear(current.dateMs)} ·{' '}
                  {monthDay(current.dateMs)}
                </Text>
                <View style={[iepStyles.row, {gap: 6, alignItems: 'baseline'}]}>
                  <Text
                    style={{
                      fontSize: 34,
                      fontWeight: '900',
                      color: iepColors.ink,
                    }}>
                    {value !== null
                      ? formatValue(value)
                      : current.result.kind === 'pending'
                      ? 'Pending'
                      : '—'}
                  </Text>
                  {p.hasTarget ? (
                    <Text style={{fontSize: 18, color: iepColors.muted}}>
                      / {formatValue(p.target as number)}
                    </Text>
                  ) : null}
                </View>
                <Text style={iepStyles.caption}>{p.primaryUnit} / target</Text>
                <Text
                  style={{
                    color: current.metTarget
                      ? iepColors.green
                      : iepColors.muted,
                    fontWeight: '600',
                  }}>
                  {current.metTarget
                    ? '✔ Session target met'
                    : current.metTarget === false
                    ? '✖ Session target not met'
                    : '○ Not scored'}
                </Text>
                <View style={iepStyles.divider} />
                <Text style={iepStyles.caption}>
                  🕒{' '}
                  {summary.startedAtMs ? shortTime(summary.startedAtMs) : '—'}–
                  {summary.endedAtMs ? shortTime(summary.endedAtMs) : '—'}
                  {current.durationSeconds
                    ? ` · ${Math.max(
                        1,
                        Math.round(current.durationSeconds / 60),
                      )} min`
                    : ''}
                </Text>
                {summary.sessionType ? (
                  <Text style={iepStyles.caption}>
                    Session type · {summary.sessionType}
                  </Text>
                ) : null}
                {summary.partner ? (
                  <Text style={iepStyles.caption}>
                    Partner · {summary.partner}
                  </Text>
                ) : null}
                <Text style={iepStyles.captionStrong}>Support detection</Text>
                <Text style={iepStyles.caption}>
                  Independent: {summary.independentCount}
                </Text>
                <Text style={iepStyles.caption}>
                  Prompted: {summary.promptedCount}
                </Text>
                <Text style={iepStyles.caption}>
                  Assisted: {summary.assistedCount}
                </Text>
              </View>
              <View style={[iepStyles.innerCard, {gap: 6}]}>
                <Text style={iepStyles.headline}>Filter events</Text>
                {(Object.keys(EVIDENCE_FILTER_LABEL) as EvidenceFilter[]).map(
                  f => (
                    <TouchableOpacity
                      key={f}
                      accessibilityRole="checkbox"
                      accessibilityState={{checked: filters.has(f)}}
                      onPress={() => toggle(f)}
                      style={[iepStyles.row, {gap: 8}]}>
                      <Text
                        style={{
                          color: filters.has(f)
                            ? iepColors.blue
                            : iepColors.muted,
                          fontSize: 18,
                        }}>
                        {filters.has(f) ? '☑' : '☐'}
                      </Text>
                      <Text style={iepStyles.body}>
                        {EVIDENCE_FILTER_LABEL[f]}
                      </Text>
                    </TouchableOpacity>
                  ),
                )}
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => {
                    trackIep(IEP_EVENTS.EVIDENCE_FILTERS_RESET, {
                      active_filter_count: filters.size,
                      is_mock: p.isMock,
                    });
                    setFilters(new Set());
                  }}
                  style={[iepStyles.buttonSecondary, {marginTop: 6}]}>
                  <Text style={iepStyles.buttonSecondaryText}>
                    Reset filters
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={{flex: 1, minWidth: 320, gap: 10}}>
              <View style={[iepStyles.row, {gap: 8, flexWrap: 'wrap'}]}>
                <Text style={iepStyles.headline}>Events</Text>
                <Text style={iepStyles.caption}>
                  {value !== null
                    ? `${formatValue(value)} ${pluralUnit(
                        p.primaryUnit,
                        value,
                      )}`
                    : 'not measured'}
                </Text>
              </View>
              {rows.length === 0 ? (
                <Text style={iepStyles.subtle}>
                  No events match the selected filters.
                </Text>
              ) : (
                <View
                  accessible
                  accessibilityLabel="Evidence table columns: time, speaker, function, evidence, words, support level">
                  <View style={[iepStyles.row, {gap: 8, paddingVertical: 6}]}>
                    <Text style={[iepStyles.captionStrong, {width: 68}]}>
                      Time
                    </Text>
                    <Text style={[iepStyles.captionStrong, {width: 52}]}>
                      Speaker
                    </Text>
                    <Text style={[iepStyles.captionStrong, {width: 110}]}>
                      Function
                    </Text>
                    <Text style={[iepStyles.captionStrong, {flex: 1}]}>
                      Evidence
                    </Text>
                    <Text style={[iepStyles.captionStrong, {width: 62}]}>
                      Words
                    </Text>
                    <Text style={[iepStyles.captionStrong, {width: 125}]}>
                      Support level
                    </Text>
                  </View>
                  {rows.map(row => (
                    <View
                      key={row.id}
                      style={[
                        iepStyles.row,
                        {
                          gap: 8,
                          paddingVertical: 8,
                          borderTopWidth: 1,
                          borderTopColor: iepColors.border,
                        },
                      ]}>
                      <Text style={[iepStyles.caption, {width: 68}]}>
                        {shortTime(row.timestampMs)}
                      </Text>
                      <Text
                        style={[
                          iepStyles.caption,
                          {width: 52, color: iepColors.blue, fontWeight: '700'},
                        ]}
                        numberOfLines={1}>
                        {row.speaker}
                      </Text>
                      {row.isCompletion && row.sentenceId ? (
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={`Communication function for ${row.content}`}
                          onPress={() => setEditRow({row, field: 'function'})}
                          style={{width: 110}}>
                          <Text
                            style={{color: iepColors.green}}
                            numberOfLines={1}>
                            {row.badge} ▾
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <Text
                          style={{
                            width: 110,
                            color:
                              row.badge === 'Sentence'
                                ? iepColors.blue
                                : row.category === 'questions'
                                ? iepColors.teal
                                : row.category === 'support'
                                ? iepColors.amber
                                : iepColors.muted,
                          }}
                          numberOfLines={1}>
                          {row.badge}
                        </Text>
                      )}
                      <Text
                        style={[
                          iepStyles.body,
                          {
                            flex: 1,
                            fontWeight: row.isCompletion ? '700' : '500',
                          },
                        ]}>
                        {row.content || '—'}
                      </Text>
                      <Text style={[iepStyles.caption, {width: 62}]}>
                        {row.detail?.split(' · ')[0] ?? ''}
                      </Text>
                      {row.isCompletion && row.sentenceId ? (
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={`Support level for ${row.content}`}
                          onPress={() => setEditRow({row, field: 'support'})}
                          style={{width: 125}}>
                          <Text
                            style={{
                              color:
                                row.supportLevel &&
                                row.supportLevel !== 'unrated'
                                  ? iepColors.blue
                                  : iepColors.muted,
                            }}>
                            {SUPPORT_LEVEL_LABEL[row.supportLevel ?? 'unrated']}{' '}
                            ▾
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={{width: 125}} />
                      )}
                    </View>
                  ))}
                </View>
              )}
              {pattern ? (
                <View
                  style={{
                    backgroundColor: '#E3F3F0',
                    borderRadius: 14,
                    padding: 12,
                  }}>
                  <View style={[iepStyles.row, {gap: 8, flexWrap: 'wrap'}]}>
                    <Text style={{color: iepColors.teal, fontWeight: '800'}}>
                      ✦ Pattern:
                    </Text>
                    <Text style={iepStyles.body}>{pattern}</Text>
                  </View>
                </View>
              ) : null}
              {p.measurementCaveat ? (
                <Text style={[iepStyles.caption, {color: iepColors.amber}]}>
                  ⚠ {p.measurementCaveat}
                </Text>
              ) : null}
            </View>
          </View>
        )}
      </View>
      <OptionMenu
        visible={editRow !== null}
        title={
          editRow?.field === 'support'
            ? 'Support level'
            : 'Communication function'
        }
        options={
          editRow?.field === 'support'
            ? (
                [
                  'unrated',
                  'independent',
                  'prompted',
                  'assisted',
                ] as SupportLevel[]
              )
                .filter(
                  l =>
                    l !== 'unrated' ||
                    (editRow.row.supportLevel ?? 'unrated') === 'unrated',
                )
                .map(l => ({
                  key: l,
                  label: SUPPORT_LEVEL_LABEL[l],
                  selected: editRow?.row.supportLevel === l,
                }))
            : COMMUNICATION_FUNCTIONS.map(f => ({
                key: f,
                label: COMMUNICATION_FUNCTION_LABEL[f],
                selected: editRow?.row.communicationFunction === f,
              }))
        }
        onSelect={applyEdit}
        onClose={() => setEditRow(null)}
      />
    </>
  );
};

export default IepGoalScreen;
