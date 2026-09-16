/** The IEP progress dashboard. */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { views } from '../../../utils/constants';
import { GOAL_STATUS_LABEL, GoalProgress } from '../application/goalProgress';
import { recentOutcomes, sessionRequirementText } from '../application/buildGoalProgress';
import { analyzeLanguage, dashboardInsightMessage } from '../application/insights';
import { isoDay, periodLabel } from '../application/reportingPeriod';
import { useIepStore, useIepStoreVersion } from '../hooks/IepStoreProvider';
import { useAllGoalProgress, useIepSettings, useProgressContext } from '../hooks/useIepDashboard';
import { MOCK_DATASET_LABEL, MockDatasetId } from '../mock/mockDataset';
import { AiTag, Chip, ConfirmDialog, OptionMenu, PrimaryButton, SecondaryButton, Segmented, StatusBadge } from '../ui/primitives';
import { GoalDateSheet, SessionReviewSheet, SessionStartSheet, parseDayInput } from '../ui/SessionSheets';
import { iepColors, iepStyles, statusColor } from '../ui/theme';

type Filter = 'all' | 'achieved' | 'inProgress';
const STATUS_ORDER: Record<GoalProgress['status'], number> = {
  needsAttention: 0, progressing: 1, onTrack: 1, stable: 1,
  notEnoughData: 2, noTrackedSessions: 2, trackingOnly: 2, notScorable: 2, achieved: 3,
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (ms: number) => `${MONTHS[new Date(ms).getMonth()]} ${new Date(ms).getDate()}`;
const shortTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

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
  const [customStart, setCustomStart] = useState(isoDay(period.startMs));
  const [customEnd, setCustomEnd] = useState(isoDay(period.endMs));
  const autoStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = store.activeSession;

  // Auto-stop: stop the active session for review after the configured duration.
  useEffect(() => {
    if (autoStopTimer.current) {
      clearTimeout(autoStopTimer.current);
      autoStopTimer.current = null;
    }
    if (!active || !settings.autoStopEnabled) {
      return;
    }
    const due = active.startedAtMs + settings.autoStopMinutes * 60_000 - Date.now();
    autoStopTimer.current = setTimeout(() => {
      if (store.activeSession?.id === active.id) {
        const id = store.stopActiveSessionForReview();
        setReviewSession(id);
      }
    }, Math.max(0, due));
    return () => {
      if (autoStopTimer.current) {
        clearTimeout(autoStopTimer.current);
      }
    };
  }, [active, settings.autoStopEnabled, settings.autoStopMinutes, store]);

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

  const applyCustomRange = () => {
    const s = parseDayInput(customStart);
    const e = parseDayInput(customEnd);
    if (s !== null && e !== null) {
      update({ iepReportingPeriod: 'custom', iepReportingStartMs: String(s), iepReportingEndMs: String(e) });
    }
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
              onChange={key => update({ iepReportingPeriod: key })}
            />
            {settings.periodPreset === 'custom' ? (
              <View style={[iepStyles.row, { gap: 10, flexWrap: 'wrap' }]}>
                <View style={{ flex: 1, minWidth: 130 }}><Text style={iepStyles.caption}>From</Text><TextInput accessibilityLabel="From date" style={iepStyles.input} value={customStart} onChangeText={setCustomStart} onBlur={applyCustomRange} /></View>
                <View style={{ flex: 1, minWidth: 130 }}><Text style={iepStyles.caption}>To</Text><TextInput accessibilityLabel="To date" style={iepStyles.input} value={customEnd} onChangeText={setCustomEnd} onBlur={applyCustomRange} /></View>
              </View>
            ) : (
              <Text style={iepStyles.subtle}>{shortDate(period.startMs)}, {new Date(period.startMs).getFullYear()} → {shortDate(period.endMs)}, {new Date(period.endMs).getFullYear()}</Text>
            )}
            <Text style={iepStyles.caption}>{periodLabel(period)}</Text>
          </View>

          <View style={[iepStyles.card, { flex: 1, minWidth: 320, gap: 12 }]}>
            <View style={[iepStyles.row, { justifyContent: 'space-between' }]}>
              <Text style={iepStyles.headline}>⏱ Session tracking</Text>
              {active ? <Text style={{ color: iepColors.green, fontWeight: '700' }}>● Active</Text> : null}
            </View>
            <Text style={iepStyles.subtle}>
              {!active ? 'No session is active.' : `Started at ${shortTime(active.startedAtMs)}${settings.autoStopEnabled ? ` · Stops after ${settings.autoStopMinutes} minutes` : ''}`}
            </Text>
            {active ? (
              <PrimaryButton label="■ Stop session" danger onPress={() => setReviewSession(store.stopActiveSessionForReview())} />
            ) : (
              <PrimaryButton label="▶ Start session" onPress={() => setStartOpen(true)} disabled={!ready || settings.mockMode} />
            )}
            {settings.mockMode ? <Text style={iepStyles.caption}>Live sessions are paused while mock data is shown.</Text> : null}
            <View style={[iepStyles.row, { justifyContent: 'space-between' }]}>
              <Text style={iepStyles.body}>Stop automatically</Text>
              <Switch value={settings.autoStopEnabled} onValueChange={v => update({ iepAutoStopEnabled: v ? '1' : '0' })} accessibilityLabel="Stop automatically" />
            </View>
            {settings.autoStopEnabled ? (
              <View style={iepStyles.rowWrap}>
                <Chip label="30 min" selected={settings.autoStopMinutes === 30} onPress={() => update({ iepAutoStopMinutes: '30' })} />
                <Chip label="1 hour" selected={settings.autoStopMinutes === 60} onPress={() => update({ iepAutoStopMinutes: '60' })} />
                <Chip label={settings.autoStopMinutes !== 30 && settings.autoStopMinutes !== 60 ? `Custom · ${settings.autoStopMinutes} min` : 'Custom'} selected={settings.autoStopMinutes !== 30 && settings.autoStopMinutes !== 60} onPress={() => update({ iepAutoStopMinutes: '45' })} />
                {settings.autoStopMinutes !== 30 && settings.autoStopMinutes !== 60 ? (
                  <View style={[iepStyles.row, { gap: 6 }]}>
                    <SecondaryButton label="−5" onPress={() => update({ iepAutoStopMinutes: String(Math.max(5, settings.autoStopMinutes - 5)) })} accessibilityLabel="Shorten by 5 minutes" />
                    <SecondaryButton label="+5" onPress={() => update({ iepAutoStopMinutes: String(Math.min(240, settings.autoStopMinutes + 5)) })} accessibilityLabel="Extend by 5 minutes" />
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
          <Text style={{ color: iepColors.green, fontWeight: '600' }}>✓ Achieved</Text>
          <Text style={{ color: iepColors.muted, fontWeight: '600' }}>● In progress</Text>
        </View>
        {all.length > 1 ? (
          <View style={iepStyles.rowWrap}>
            {([['all', 'All'], ['achieved', 'Achieved'], ['inProgress', 'In progress']] as Array<[Filter, string]>).map(([key, label]) => (
              <Chip key={key} label={label} selected={filter === key} onPress={() => setFilter(key)} accessibilityLabel={`Show ${label.toLowerCase()} goals`} />
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
            usesAi={settings.mockMode || isAiProvider(p.goal.plan?.provider)}
            onOpen={() => navigation.navigate(views.IEP_GOAL, { goalId: p.goalId })}
            onRemove={() => setRemoveTarget(p)}
            onDate={() => setDateTarget(p)}
          />
        ))}

        {all.length > 0 ? (
          <View style={iepStyles.blueNote}>
            <View style={[iepStyles.row, { gap: 8 }]}><Text style={{ color: iepColors.blue, fontWeight: '700' }}>✦ Insight</Text><AiTag /></View>
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
            setEditing(e => !e);
            setMenuOpen(false);
          } else if (key === 'mock') {
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
        onSelect={key => { update({ iepMockDataset: key }); setDatasetMenu(false); }}
        onClose={() => setDatasetMenu(false)}
      />
      <SessionStartSheet visible={startOpen} onClose={() => setStartOpen(false)} childName={settings.heroName} />
      <SessionReviewSheet sessionId={reviewSession} onClose={() => setReviewSession(null)} />
      <ConfirmDialog
        visible={removeTarget !== null}
        title="Remove goal?"
        message={`Remove ${removeTarget?.title ?? ''}? Session measurements will remain.`}
        confirmLabel="Remove goal"
        onConfirm={() => { if (removeTarget) { store.deleteGoal(removeTarget.goalId); } setRemoveTarget(null); }}
        onCancel={() => setRemoveTarget(null)}
      />
      <GoalDateSheet
        visible={dateTarget !== null}
        targetDateMs={dateTarget?.goal.targetDateMs ?? null}
        onSave={ms => { if (dateTarget) { store.setGoalTargetDate(dateTarget.goalId, ms); } }}
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

const GoalCard: React.FC<{ progress: GoalProgress; editing: boolean; usesAi: boolean; onOpen: () => void; onRemove: () => void; onDate: () => void }> = ({ progress: p, editing, usesAi, onOpen, onRemove, onDate }) => {
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
        <View style={[iepStyles.row, { gap: 8, flexWrap: 'wrap' }]}>
          <Text style={iepStyles.headline}>Goal {p.displayNumber} · {p.title}</Text>
          {usesAi ? <AiTag /> : null}
        </View>
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
          <View style={[iepStyles.row, { gap: 4 }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {recentOutcomes(p).map((met, i) => (
              <Text key={i} style={{ color: met ? iepColors.green : iepColors.border, fontSize: 14 }}>{met ? '✔' : '●'}</Text>
            ))}
          </View>
        ) : null}
      </View>
      <View style={[iepStyles.divider, { width: 1, height: 62, alignSelf: 'center' }]} />
      <View style={{ width: 110, justifyContent: 'center', gap: 4 }}>
        {!p.isMock ? (
          <TouchableOpacity accessibilityRole="button" onPress={onDate}><Text style={{ color: p.goal.targetDateMs ? iepColors.blue : iepColors.muted, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>📅 {p.goal.targetDateMs ? `Target ${shortDate(p.goal.targetDateMs)}` : 'Set target date'}</Text></TouchableOpacity>
        ) : null}
        <Text style={iepStyles.captionStrong}>Updated</Text>
        <Text style={iepStyles.body}>{latest ? shortDate(latest.dateMs) : '—'}</Text>
      </View>
      <Text style={{ alignSelf: 'center', color: iepColors.muted, fontSize: 22 }}>›</Text>
    </TouchableOpacity>
  );
};

export default IepDashboardScreen;
