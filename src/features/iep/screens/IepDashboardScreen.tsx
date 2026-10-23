/** The IEP progress dashboard. */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { views } from '../../../utils/constants';
import { IEP_EVENTS, daysBetween, goalEventProps, minutesBetween, trackIep, useIepGoalAchievementTracking } from '../analytics/iepAnalytics';
import { GOAL_STATUS_LABEL, GoalProgress } from '../application/goalProgress';
import { recentOutcomes, sessionRequirementText } from '../application/buildGoalProgress';
import { analyzeLanguage, dashboardInsightMessage } from '../application/insights';
import { monthDay, periodLabel } from '../application/reportingPeriod';
import { useIepStore, useIepStoreVersion } from '../hooks/IepStoreProvider';
import { MIN_AUTO_STOP_MINUTES, useAllGoalProgress, useIepSettings, useProgressContext } from '../hooks/useIepDashboard';
import { MOCK_DATASET_LABEL, MockDatasetId } from '../mock/mockDataset';
import { CheckMark, Chip, ConfirmDialog, OptionMenu, PrimaryButton, SecondaryButton, Segmented, StatusBadge } from '../ui/primitives';
import { DateField } from '../ui/DatePicker';
import { GoalDateSheet, SessionReviewSheet, SessionStartSheet } from '../ui/SessionSheets';
import { iepColors, iepStyles, statusColor } from '../ui/theme';

type Filter = 'all' | 'achieved' | 'inProgress';
const FILTER_OPTIONS: Array<[Filter, string]> = [['all', 'All'], ['achieved', 'Achieved'], ['inProgress', 'In progress']];
const EMPTY_FILTER_TEXT: Record<Exclude<Filter, 'all'>, string> = { achieved: 'No achieved goals yet.', inProgress: 'No goals in progress.' };
const STATUS_ORDER: Record<GoalProgress['status'], number> = {
  needsAttention: 0, progressing: 1, onTrack: 1, stable: 1,
  notEnoughData: 2, noTrackedSessions: 2, trackingOnly: 2, notScorable: 2, achieved: 3,
};

const shortTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const isPresetMinutes = (m: number) => m === 30 || m === 60;
/** Longest delay setTimeout accepts; a longer one overflows and fires at once. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
/** 45 → "45 min", 60 → "1 h", 90 → "1 h 30 min". */
const formatMinutes = (m: number) => (m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60} min`);

const IepDashboardScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { store, ready } = useIepStore();
  useIepStoreVersion();
  const { settings, update } = useIepSettings();
  const { all, period, periodLabelText } = useAllGoalProgress();
  const { context } = useProgressContext();
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [datasetMenu, setDatasetMenu] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [reviewSession, setReviewSession] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<GoalProgress | null>(null);
  const [dateTarget, setDateTarget] = useState<GoalProgress | null>(null);
  const autoStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Custom timer stays open until a preset chip is chosen, even when the value passes through 60.
  const [customTimer, setCustomTimer] = useState(!isPresetMinutes(settings.autoStopMinutes));
  const [customMinutesText, setCustomMinutesText] = useState(String(settings.autoStopMinutes));
  // The typed text is the source of truth until it is committed: the settings write is async,
  // so a value that lands mid-edit must not replace what is being typed.
  const typedMinutesDirty = useRef(false);
  useEffect(() => {
    if (!typedMinutesDirty.current) {
      setCustomMinutesText(String(settings.autoStopMinutes));
    }
  }, [settings.autoStopMinutes]);
  // A custom value that hydrates or is changed elsewhere after mount opens the custom row too.
  useEffect(() => {
    if (!isPresetMinutes(settings.autoStopMinutes)) {
      setCustomTimer(true);
    }
  }, [settings.autoStopMinutes]);
  const setAutoStopMinutes = (minutes: number) => update({ iepAutoStopMinutes: String(Math.max(MIN_AUTO_STOP_MINUTES, Math.round(minutes))) });
  const chooseAutoStopMinutes = (minutes: number, source: 'preset' | 'step') => {
    const clamped = Math.max(MIN_AUTO_STOP_MINUTES, Math.round(minutes));
    setAutoStopMinutes(clamped);
    trackIep(IEP_EVENTS.AUTO_STOP_CHANGED, { enabled: true, minutes: clamped, source });
  };
  // Typed minutes are written and reported once on commit (blur or submit), not per keystroke.
  const onCustomMinutesText = (text: string) => {
    typedMinutesDirty.current = true;
    setCustomMinutesText(text);
  };
  const commitCustomMinutesText = () => {
    if (!typedMinutesDirty.current) {
      return;
    }
    typedMinutesDirty.current = false;
    const n = parseInt(customMinutesText, 10);
    const clamped = Number.isFinite(n) ? Math.max(MIN_AUTO_STOP_MINUTES, n) : settings.autoStopMinutes;
    setCustomMinutesText(String(clamped));
    if (clamped !== settings.autoStopMinutes) {
      setAutoStopMinutes(clamped);
      trackIep(IEP_EVENTS.AUTO_STOP_CHANGED, { enabled: true, minutes: clamped, source: 'typed' });
    }
  };

  const active = store.activeSession;

  const stopForReview = useCallback(
    (reason: 'manual' | 'auto') => {
      const session = store.activeSession;
      const id = store.stopActiveSessionForReview();
      if (!id) {
        return;
      }
      trackIep(IEP_EVENTS.SESSION_STOPPED, {
        reason,
        duration_minutes: session ? minutesBetween(session.startedAtMs, Date.now()) : null,
        session_type: session?.treatmentContext ?? null,
        partner_type: session?.partnerType ?? null,
        tracked_goal_count: session?.trackedGoalIds.length ?? 0,
        sentence_count: store.sentences.filter(s => s.sessionId === id).length,
      });
      setReviewSession(id);
    },
    [store],
  );

  // Auto-stop: stop the active session for review after the configured duration. The minutes
  // have no upper limit, but a delay past MAX_TIMEOUT_MS overflows setTimeout and fires at
  // once, so the wait is armed in slices until the due time has really passed.
  useEffect(() => {
    if (autoStopTimer.current) {
      clearTimeout(autoStopTimer.current);
      autoStopTimer.current = null;
    }
    if (!active || !settings.autoStopEnabled) {
      return;
    }
    const dueMs = active.startedAtMs + settings.autoStopMinutes * 60_000;
    const arm = () => {
      autoStopTimer.current = setTimeout(() => {
        autoStopTimer.current = null;
        if (Date.now() < dueMs) {
          arm();
        } else if (store.activeSession?.id === active.id) {
          stopForReview('auto');
        }
      }, Math.min(MAX_TIMEOUT_MS, Math.max(0, dueMs - Date.now())));
    };
    arm();
    return () => {
      if (autoStopTimer.current) {
        clearTimeout(autoStopTimer.current);
        autoStopTimer.current = null;
      }
    };
  }, [active, settings.autoStopEnabled, settings.autoStopMinutes, store, stopForReview]);

  const visible = useMemo(() => {
    const filtered = all.filter(p => (filter === 'all' ? true : filter === 'achieved' ? p.status === 'achieved' : p.status !== 'achieved'));
    return filtered
      .map((p, i) => ({ p, i }))
      .sort((a, b) => STATUS_ORDER[a.p.status] - STATUS_ORDER[b.p.status] || a.p.displayNumber - b.p.displayNumber || a.i - b.i)
      .map(x => x.p);
  }, [all, filter]);

  const language = useMemo(() => {
    if (context.kind === 'mock') {
      const texts: string[] = [];
      const contexts: string[] = [];
      const sessionIds = new Set(all.flatMap(p => p.sessions.map(s => s.sessionId)));
      for (const id of sessionIds) {
        for (const e of context.dataset.eventsBySession.get(id) ?? []) {
          const text = e.eventType === 'sentence_completed' ? e.content : e.eventType === 'word_selected' ? e.wordText : e.eventType === 'qna_answer_selected' ? e.answerText : '';
          if (text) {
            texts.push(text);
          }
          if (e.context) {
            contexts.push(e.context);
          }
        }
      }
      return analyzeLanguage(texts, contexts);
    }
    const inPeriod = context.state.sessions.filter(s => s.startedAtMs >= period.startMs && s.startedAtMs <= period.endMs);
    const ids = new Set(inPeriod.map(s => s.id));
    return analyzeLanguage(
      [...context.state.communications.filter(c => ids.has(c.sessionId)).map(c => c.content), ...context.state.sentences.filter(s => ids.has(s.sessionId)).map(s => s.finalWords.join(' '))],
      inPeriod.map(s => s.treatmentContext),
    );
  }, [context, all, period]);

  const sessionCount = new Set(all.flatMap(p => p.sessions.map(s => s.sessionId))).size;
  const failure = store.storageFailure;
  const saveFailure = store.saveFailure;

  useIepGoalAchievementTracking(all);

  // One "viewed" event per visit, sent once the store has loaded so the counts are real.
  const viewedReported = useRef(false);
  useEffect(() => {
    if (!ready || viewedReported.current) {
      return;
    }
    viewedReported.current = true;
    trackIep(IEP_EVENTS.DASHBOARD_VIEWED, {
      goal_count: all.length,
      achieved_goal_count: all.filter(p => p.status === 'achieved').length,
      session_count: sessionCount,
      period_preset: settings.periodPreset,
      mock_mode: settings.mockMode,
      auto_stop_enabled: settings.autoStopEnabled,
      auto_stop_minutes: settings.autoStopMinutes,
      has_active_session: active !== null,
      storage_failure: failure !== null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const setCustomRange = (startMs: number, endMs: number, edge: 'from' | 'to') => {
    update({ iepReportingPeriod: 'custom', iepReportingStartMs: String(startMs), iepReportingEndMs: String(endMs) });
    trackIep(IEP_EVENTS.REPORTING_PERIOD_CHANGED, { period_preset: 'custom', edge, range_days: daysBetween(startMs, endMs) });
  };

  return (
    <View style={iepStyles.screen}>
      <ScrollView contentContainerStyle={iepStyles.content}>
        {/* Header */}
        <View style={[iepStyles.row, { justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }]}>
          <View style={{ flex: 1, minWidth: 260, gap: 4 }}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Settings" onPress={() => navigation.goBack()}>
              <Text style={{ color: iepColors.blue, fontWeight: '600' }}>‹ Settings</Text>
            </TouchableOpacity>
            <Text style={iepStyles.eyebrow}>IEP PROGRESS</Text>
            <Text style={iepStyles.title}>{settings.heroName}’s AAC Progress</Text>
            <Text style={iepStyles.subtle}>{periodLabelText}</Text>
          </View>
          <View style={[iepStyles.row, { gap: 12 }]}>
            <SecondaryButton label="⇪ Export report" onPress={() => navigation.navigate(views.IEP_EXPORT)} accessibilityLabel="Export report" />
            <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: iepColors.blue, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: iepColors.white, fontSize: 24 }}>▤</Text></View>
          </View>
        </View>

        {failure ? (
          <View style={iepStyles.amberNote} accessibilityRole="alert">
            <Text style={[iepStyles.headline, { color: iepColors.amber }]}>⚠ Saved {failure.what} could not be opened</Text>
            <Text style={iepStyles.body}>{failure.message}</Text>
            <Text style={iepStyles.subtle}>Nothing has been saved over them. What you see below is incomplete.</Text>
          </View>
        ) : null}

        {saveFailure ? (
          <View style={iepStyles.amberNote} accessibilityRole="alert">
            <Text style={[iepStyles.headline, { color: iepColors.amber }]}>⚠ Changes could not be saved</Text>
            <Text style={iepStyles.body}>{saveFailure.message}</Text>
          </View>
        ) : null}

        {/* Period and session cards */}
        <View style={[iepStyles.row, { gap: 20, alignItems: 'stretch', flexWrap: 'wrap' }]}>
          <View style={[iepStyles.card, { flex: 1, minWidth: 320, gap: 12 }]}>
            <View style={[iepStyles.row, { justifyContent: 'space-between' }]}>
              <Text style={iepStyles.headline}>📅 Reporting period</Text>
              <Text style={iepStyles.caption}>{{ '4w': 'Last 4 weeks', '12w': 'Last 12 weeks', '6m': 'Last 6 months', custom: 'Custom range' }[settings.periodPreset]}</Text>
            </View>
            <Segmented
              accessibilityLabel="Reporting period"
              options={[{ key: '4w', label: '4 weeks' }, { key: '12w', label: '12 weeks' }, { key: '6m', label: '6 months' }, { key: 'custom', label: 'Custom' }]}
              value={settings.periodPreset}
              onChange={key => {
                update({ iepReportingPeriod: key });
                trackIep(IEP_EVENTS.REPORTING_PERIOD_CHANGED, { period_preset: key });
              }}
            />
            {settings.periodPreset === 'custom' ? (
              <View style={[iepStyles.row, { gap: 10, flexWrap: 'wrap' }]}>
                <DateField label="From" valueMs={period.startMs} maxMs={Math.min(period.endMs, Date.now())} onChange={ms => setCustomRange(ms, period.endMs, 'from')} />
                <DateField label="To" valueMs={period.endMs} minMs={period.startMs} maxMs={Date.now()} onChange={ms => setCustomRange(period.startMs, ms, 'to')} />
              </View>
            ) : (
              <Text style={iepStyles.subtle}>{monthDay(period.startMs)}, {new Date(period.startMs).getFullYear()} → {monthDay(period.endMs)}, {new Date(period.endMs).getFullYear()}</Text>
            )}
            <Text style={iepStyles.caption}>{periodLabel(period)}</Text>
          </View>

          <View style={[iepStyles.card, { flex: 1, minWidth: 320, gap: 12 }]}>
            <View style={[iepStyles.row, { justifyContent: 'space-between' }]}>
              <Text style={iepStyles.headline}>⏱ Session tracking</Text>
              {active ? <Text style={{ color: iepColors.green, fontWeight: '700' }}>● Active</Text> : null}
            </View>
            <Text style={iepStyles.subtle}>
              {!active ? 'No session is active.' : `Started at ${shortTime(active.startedAtMs)}${settings.autoStopEnabled ? ` · Stops after ${formatMinutes(settings.autoStopMinutes)}` : ''}`}
            </Text>
            {active ? (
              <PrimaryButton label="■ Stop session" danger onPress={() => stopForReview('manual')} />
            ) : (
              <PrimaryButton label="▶ Start session" onPress={() => setStartOpen(true)} disabled={!ready || settings.mockMode} />
            )}
            {settings.mockMode ? <Text style={iepStyles.caption}>Live sessions are paused while mock data is shown.</Text> : null}
            <View style={[iepStyles.row, { justifyContent: 'space-between' }]}>
              <Text style={iepStyles.body}>Stop automatically</Text>
              <Switch
                value={settings.autoStopEnabled}
                onValueChange={v => {
                  update({ iepAutoStopEnabled: v ? '1' : '0' });
                  trackIep(IEP_EVENTS.AUTO_STOP_CHANGED, { enabled: v, minutes: settings.autoStopMinutes, source: 'switch' });
                }}
                accessibilityLabel="Stop automatically"
              />
            </View>
            {settings.autoStopEnabled ? (
              <View style={iepStyles.rowWrap}>
                <Chip label="30 min" selected={!customTimer && settings.autoStopMinutes === 30} onPress={() => { setCustomTimer(false); chooseAutoStopMinutes(30, 'preset'); }} />
                <Chip label="1 hour" selected={!customTimer && settings.autoStopMinutes === 60} onPress={() => { setCustomTimer(false); chooseAutoStopMinutes(60, 'preset'); }} />
                <Chip label={customTimer ? `Custom · ${formatMinutes(settings.autoStopMinutes)}` : 'Custom'} selected={customTimer} onPress={() => setCustomTimer(true)} />
                {customTimer ? (
                  <View style={[iepStyles.row, { gap: 6 }]}>
                    <SecondaryButton label="−5" onPress={() => chooseAutoStopMinutes(settings.autoStopMinutes - 5, 'step')} accessibilityLabel="Shorten by 5 minutes" />
                    <TextInput
                      disableFullscreenUI
                      accessibilityLabel="Session length in minutes"
                      keyboardType="number-pad"
                      value={customMinutesText}
                      onChangeText={onCustomMinutesText}
                      onBlur={commitCustomMinutesText}
                      onSubmitEditing={commitCustomMinutesText}
                      style={[iepStyles.input, { width: 76, textAlign: 'center', paddingVertical: 8 }]}
                    />
                    <Text style={iepStyles.caption}>min</Text>
                    <SecondaryButton label="+5" onPress={() => chooseAutoStopMinutes(settings.autoStopMinutes + 5, 'step')} accessibilityLabel="Extend by 5 minutes" />
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        {/* Actions row */}
        <View style={[iepStyles.row, { gap: 12, flexWrap: 'wrap' }]}>
          {settings.mockMode ? <Text style={{ color: iepColors.teal, fontWeight: '700' }}>🧪 Mock data · {MOCK_DATASET_LABEL[settings.mockDataset]}</Text> : null}
          <View style={{ flex: 1 }} />
          <PrimaryButton label="+ Add goal" onPress={() => navigation.navigate(views.IEP_ADD_GOAL)} accessibilityLabel="Add goal" />
          <SecondaryButton label="⋯ More" onPress={() => setMenuOpen(true)} accessibilityLabel="More dashboard options" />
        </View>

        {/* Goals header */}
        <View style={[iepStyles.row, { gap: 12, flexWrap: 'wrap' }]}>
          <Text style={iepStyles.sectionTitle}>Active goals</Text>
          <Text style={iepStyles.subtle}>{all.length} {all.length === 1 ? 'goal' : 'goals'}</Text>
          <View style={{ flex: 1 }} />
          <View style={[iepStyles.row, { gap: 6 }]}>
            <CheckMark size={16} />
            <Text style={{ color: iepColors.green, fontWeight: '600' }}>Achieved</Text>
          </View>
          <Text style={{ color: iepColors.muted, fontWeight: '600' }}>● In progress</Text>
        </View>
        {all.length > 0 ? (
          <View style={iepStyles.rowWrap}>
            {FILTER_OPTIONS.map(([key, label]) => (
              <Chip
                key={key}
                label={label}
                selected={filter === key}
                onPress={() => {
                  setFilter(key);
                  trackIep(IEP_EVENTS.DASHBOARD_FILTER_CHANGED, { filter: key, goal_count: all.length });
                }}
                accessibilityLabel={`Show ${label.toLowerCase()} goals`}
              />
            ))}
          </View>
        ) : null}

        {all.length === 0 ? (
          <View style={[iepStyles.card, { gap: 8 }]}>
            <Text style={iepStyles.headline}>No IEP goals yet</Text>
            <Text style={iepStyles.subtle}>Add a goal in the SLP’s own words. AI proposes a measurement plan for you to review before anything is scored.</Text>
          </View>
        ) : null}

        {visible.map(p => (
          <GoalCard
            key={p.goalId}
            progress={p}
            editing={editing}
            onOpen={() => navigation.navigate(views.IEP_GOAL, { goalId: p.goalId })}
            onRemove={() => setRemoveTarget(p)}
            onDate={() => setDateTarget(p)}
          />
        ))}
        {all.length > 0 && visible.length === 0 && filter !== 'all' ? <Text style={iepStyles.subtle}>{EMPTY_FILTER_TEXT[filter]}</Text> : null}

        {all.length > 0 ? (
          <View style={iepStyles.blueNote}>
            <Text style={{ color: iepColors.blue, fontWeight: '700' }}>✦ Insight</Text>
            <Text style={[iepStyles.body, { marginTop: 6 }]}>{dashboardInsightMessage(all, null)}</Text>
            {language.words.length > 0 ? <Text style={[iepStyles.caption, { marginTop: 6 }]}>Most used: {language.words.slice(0, 3).map(w => w.label).join(' · ')}</Text> : null}
            <Text style={[iepStyles.caption, { marginTop: 4 }]}>Based on {sessionCount} {sessionCount === 1 ? 'session' : 'sessions'} in this reporting period.</Text>
          </View>
        ) : null}
      </ScrollView>

      <OptionMenu
        visible={menuOpen}
        title="More"
        options={[
          { key: 'edit', label: editing ? 'Done editing goals' : 'Edit goals' },
          { key: 'mock', label: 'Mock mode', selected: settings.mockMode },
          ...(settings.mockMode ? [{ key: 'dataset', label: `Dataset · ${MOCK_DATASET_LABEL[settings.mockDataset]}` }] : []),
        ]}
        onSelect={key => {
          if (key === 'edit') {
            trackIep(IEP_EVENTS.EDIT_MODE_TOGGLED, { editing: !editing, goal_count: all.length });
            setEditing(e => !e);
            setMenuOpen(false);
          } else if (key === 'mock') {
            trackIep(IEP_EVENTS.MOCK_MODE_CHANGED, { enabled: !settings.mockMode });
            update({ iepMockMode: settings.mockMode ? '0' : '1' });
          } else if (key === 'dataset') {
            setMenuOpen(false);
            setDatasetMenu(true);
          }
        }}
        onClose={() => setMenuOpen(false)}
      />
      <OptionMenu
        visible={datasetMenu}
        title="Dataset"
        options={(['standard', 'edgeCases'] as MockDatasetId[]).map(id => ({ key: id, label: MOCK_DATASET_LABEL[id], selected: settings.mockDataset === id }))}
        onSelect={key => { update({ iepMockDataset: key }); trackIep(IEP_EVENTS.MOCK_DATASET_CHANGED, { dataset: key }); setDatasetMenu(false); }}
        onClose={() => setDatasetMenu(false)}
      />
      <SessionStartSheet visible={startOpen} onClose={() => setStartOpen(false)} childName={settings.heroName} />
      <SessionReviewSheet sessionId={reviewSession} onClose={() => setReviewSession(null)} />
      <ConfirmDialog
        visible={removeTarget !== null}
        title="Remove goal?"
        message={`Remove ${removeTarget?.title ?? ''}? Session measurements will remain.`}
        confirmLabel="Remove goal"
        onConfirm={() => {
          if (removeTarget) {
            trackIep(IEP_EVENTS.GOAL_REMOVED, { ...goalEventProps(removeTarget), source: 'dashboard' });
            store.deleteGoal(removeTarget.goalId);
          }
          setRemoveTarget(null);
        }}
        onCancel={() => setRemoveTarget(null)}
      />
      <GoalDateSheet
        visible={dateTarget !== null}
        targetDateMs={dateTarget?.goal.targetDateMs ?? null}
        onSave={ms => {
          if (dateTarget) {
            store.setGoalTargetDate(dateTarget.goalId, ms);
            trackIep(IEP_EVENTS.GOAL_TARGET_DATE_CHANGED, { ...goalEventProps(dateTarget), has_date: ms !== null, days_from_now: ms !== null ? daysBetween(Date.now(), ms) : null, source: 'dashboard' });
          }
        }}
        onClose={() => setDateTarget(null)}
      />
    </View>
  );
};

export function isAiProvider(provider: string | null | undefined): boolean {
  const p = (provider ?? '').trim().toLowerCase();
  if (!p) {
    return false;
  }
  return !['built-in', 'builtin', 'manual', 'user', 'derived', 'deterministic', 'mock', 'fallback', 'seed'].includes(p);
}

const GoalCard: React.FC<{ progress: GoalProgress; editing: boolean; onOpen: () => void; onRemove: () => void; onDate: () => void }> = ({ progress: p, editing, onOpen, onRemove, onDate }) => {
  const percent = p.headline.percent;
  const latest = p.sessions.length > 0 ? p.sessions[p.sessions.length - 1] : null;
  const requirement =
    p.status === 'noTrackedSessions'
      ? 'Start a session to begin measuring this goal.'
      : p.status === 'notScorable'
        ? 'Needs a configured measurement rule.'
        : !p.hasTarget
          ? 'Tracked measurements are available, but no target was stated, so this goal is not scored.'
          : sessionRequirementText(p);
  const summary = [`Goal ${p.displayNumber}, ${p.title}`, GOAL_STATUS_LABEL[p.status], p.status !== 'notScorable' && percent !== null ? `goal attainment ${percent} percent, ${p.headline.caption}` : '', sessionRequirementText(p)].filter(Boolean).join('. ');
  return (
    <TouchableOpacity accessibilityRole={editing ? undefined : 'button'} accessibilityLabel={summary} accessibilityHint={editing ? 'Edit mode is active.' : 'Opens goal details.'} disabled={editing} onPress={onOpen} activeOpacity={0.8} style={[iepStyles.card, iepStyles.row, { gap: 16, alignItems: 'stretch', flexWrap: 'wrap' }]}>
      <View style={{ justifyContent: 'center' }}>
        {editing ? (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove ${p.title}`} onPress={onRemove} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: iepColors.red, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: iepColors.white, fontSize: 24, fontWeight: '800' }}>−</Text></TouchableOpacity>
        ) : (
          <StatusBadge status={p.status} />
        )}
      </View>
      <View style={{ flex: 2, minWidth: 220, gap: 4, justifyContent: 'center' }}>
        <Text style={iepStyles.headline}>Goal {p.displayNumber} · {p.title}</Text>
        <Text style={iepStyles.subtle} numberOfLines={3}>{p.statement}</Text>
      </View>
      <View style={[iepStyles.divider, { width: 1, height: 62, alignSelf: 'center' }]} />
      <View style={{ width: 150, justifyContent: 'center', gap: 2 }}>
        <Text style={iepStyles.captionStrong}>Goal attainment</Text>
        {p.status === 'notScorable' ? (
          <Text style={[iepStyles.headline, { color: iepColors.muted }]}>Not measured</Text>
        ) : percent !== null && p.hasTarget ? (
          <>
            <Text style={{ fontSize: 34, fontWeight: '900', color: statusColor(p.status) }}>{percent}%</Text>
            <Text style={{ color: statusColor(p.status), fontWeight: '700' }}>{GOAL_STATUS_LABEL[p.status]}</Text>
          </>
        ) : (
          <>
            <Text style={{ fontSize: 34, fontWeight: '900', color: iepColors.muted }}>—</Text>
            <Text style={{ color: iepColors.muted, fontWeight: '700' }}>{GOAL_STATUS_LABEL[p.status]}</Text>
          </>
        )}
      </View>
      <View style={[iepStyles.divider, { width: 1, height: 62, alignSelf: 'center' }]} />
      <View style={{ flex: 1.5, minWidth: 180, justifyContent: 'center', gap: 6 }}>
        <Text style={iepStyles.captionStrong}>Session requirement</Text>
        <Text style={[iepStyles.body, { fontWeight: '600' }]}>{requirement}</Text>
        {p.hasTarget && p.status !== 'noTrackedSessions' && p.status !== 'notScorable' ? (
          <View style={[iepStyles.row, { gap: 6, flexWrap: 'wrap' }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {recentOutcomes(p).map((met, i) => (met ? <CheckMark key={i} size={18} /> : <View key={i} style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: iepColors.border }} />))}
          </View>
        ) : null}
      </View>
      <View style={[iepStyles.divider, { width: 1, height: 62, alignSelf: 'center' }]} />
      <View style={{ width: 110, justifyContent: 'center', gap: 4 }}>
        {!p.isMock ? (
          <TouchableOpacity accessibilityRole="button" onPress={onDate}><Text style={{ color: p.goal.targetDateMs ? iepColors.blue : iepColors.muted, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>📅 {p.goal.targetDateMs ? `Target ${monthDay(p.goal.targetDateMs)}` : 'Set target date'}</Text></TouchableOpacity>
        ) : null}
        <Text style={iepStyles.captionStrong}>Updated</Text>
        <Text style={iepStyles.body}>{latest ? monthDay(latest.dateMs) : '—'}</Text>
      </View>
      <Text style={{ alignSelf: 'center', color: iepColors.muted, fontSize: 22 }}>›</Text>
    </TouchableOpacity>
  );
};

export default IepDashboardScreen;
