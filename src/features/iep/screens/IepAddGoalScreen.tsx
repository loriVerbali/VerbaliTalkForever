/** Add an IEP goal: write the goal, review the generated plan, confirmation. */

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { requestGoalPlan } from '../ai/iepAiClient';
import { LIBRARY_SOURCE_LABEL, MetricCatalogue, MetricDefinition, libraryGoalsBySource } from '../core';
import { useIepStore } from '../hooks/IepStoreProvider';
import { useIepSettings } from '../hooks/useIepDashboard';
import { GOAL_METRIC_ROLE_LABEL, GoalMetric, GoalPlan } from '../model/types';
import { AiTag, Chip, PrimaryButton, SecondaryButton, Segmented, Sheet } from '../ui/primitives';
import { iepColors, iepStyles } from '../ui/theme';

type Step = 'write' | 'review' | 'created';

const TOPICS: Array<{ title: string; category: string; ids: string[] }> = [
  { title: 'Sentence production', category: 'Communication production', ids: ['total_sentences', 'qualifying_sentences', 'average_words_per_sentence', 'total_word_count_per_sentence', 'longest_sentence_words', 'build_seconds'] },
  { title: 'Conversation & interaction', category: 'Communication interaction', ids: ['conversation_initiations', 'conversation_turns', 'reciprocal_interactions', 'repair_attempts', 'retelling_details'] },
  { title: 'Communication functions', category: 'Communication interaction', ids: ['request_count', 'different_communication_functions', 'questions_asked', 'wh_questions', 'novel_contributions'] },
  { title: 'AAC & device use', category: 'AAC usage', ids: ['page_navigations', 'different_pages_visited', 'preferred_page_navigations', 'different_words_activated', 'total_word_activations', 'device_interactions'] },
];

function isSentenceScoped(id: string): boolean {
  const r = MetricCatalogue.resolve(id);
  return !!r && MetricCatalogue.definitionFor(r.id)?.scope === 'sentence';
}

/** Drops planner metrics the catalogue does not know, collecting their names. */
function droppingInventedMetrics(plan: GoalPlan): { plan: GoalPlan; ignored: string[] } {
  const ignored: string[] = [];
  const metrics = plan.metrics.filter(m => {
    if (MetricCatalogue.resolve(m.id)) {
      return true;
    }
    ignored.push(m.name);
    return false;
  });
  return { plan: { ...plan, metrics }, ignored };
}

/** Surfaces the sentence bar as a visible Level 3 row when the plan has none. */
function surfacingSentenceTargets(plan: GoalPlan): GoalPlan {
  const bar = plan.calculation?.minimumWordsPerSentence ?? plan.metrics.find(m => typeof m.constraints?.minimumWordsPerSentence === 'number')?.constraints?.minimumWordsPerSentence ?? null;
  if (bar === null || plan.metrics.some(m => m.id === MetricCatalogue.totalWordCountPerSentence.id)) {
    return plan;
  }
  const def = MetricCatalogue.totalWordCountPerSentence;
  const row: GoalMetric = { id: def.id, name: def.displayName, category: 'Communication production', definition: def.clinicalDefinition, measurementMethod: 'Count the words in each completed sentence.', role: 'supporting', constraints: null, targetValue: bar, targetUnit: def.unit, targetTimeframe: null, isSupported: true };
  return { ...plan, metrics: [row, ...plan.metrics] };
}

const IepAddGoalScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { store } = useIepStore();
  const { settings } = useIepSettings();
  const [step, setStep] = useState<Step>('write');
  const [goalText, setGoalText] = useState('');
  const [analysing, setAnalysing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<GoalPlan | null>(null);
  const [title, setTitle] = useState('');
  const [ignored, setIgnored] = useState<string[]>([]);
  const [source, setSource] = useState<'provider' | 'fallback'>('provider');
  const [addMenu, setAddMenu] = useState(false);
  const [targets, setTargets] = useState<Record<string, string>>({});

  const analyse = async () => {
    setAnalysing(true);
    setError(null);
    try {
      const reply = await requestGoalPlan(goalText);
      const cleaned = droppingInventedMetrics(reply.plan);
      const surfaced = surfacingSentenceTargets(cleaned.plan);
      setIgnored(cleaned.ignored);
      setPlan(surfaced);
      setTitle(surfaced.goalTitle);
      setSource(reply.source === 'provider' ? 'provider' : 'fallback');
      setTargets(Object.fromEntries(surfaced.metrics.map(m => [m.id, typeof m.targetValue === 'number' ? String(m.targetValue) : ''])));
      if (reply.source !== 'provider') {
        setError("We couldn't create the AI plan. Check the AI service connection and try again. A starter plan is shown below for review.");
      }
      setStep('review');
    } catch {
      setError("We couldn't create the AI plan. Check the AI service connection and try again.");
    } finally {
      setAnalysing(false);
    }
  };

  const updatePlan = (fn: (p: GoalPlan) => GoalPlan) => setPlan(prev => (prev ? fn(prev) : prev));

  const setTarget = (metricId: string, text: string) => {
    setTargets(prev => ({ ...prev, [metricId]: text }));
    const value = text.trim() === '' ? null : Number(text);
    const numeric = value !== null && Number.isFinite(value) ? value : null;
    updatePlan(p => {
      const metrics = p.metrics.map(m => (m.id === metricId ? { ...m, targetValue: numeric } : m));
      let calculation = p.calculation ?? null;
      if (isSentenceScoped(metricId) && calculation) {
        const bar = numeric !== null ? Math.trunc(numeric) : null;
        calculation = { ...calculation, minimumWordsPerSentence: bar };
        return { ...p, metrics: metrics.map(m => (typeof m.constraints?.minimumWordsPerSentence === 'number' ? { ...m, constraints: { minimumWordsPerSentence: bar } } : m)), calculation };
      }
      return { ...p, metrics, calculation };
    });
  };

  const removeMetric = (metricId: string) => updatePlan(p => {
    const metrics = p.metrics.filter(m => m.id !== metricId);
    let calculation = p.calculation ?? null;
    if (calculation && calculation.primaryMetricId === metricId) {
      const replacement = metrics.find(m => typeof m.targetValue === 'number' && m.isSupported !== false && !isSentenceScoped(m.id)) ?? metrics[0];
      calculation = { ...calculation, primaryMetricId: replacement?.id ?? '' };
    }
    return { ...p, metrics, calculation };
  });

  const addMetric = (def: MetricDefinition, category: string) => {
    updatePlan(p => ({
      ...p,
      metrics: [...p.metrics, { id: def.id, name: def.displayName, category, definition: def.clinicalDefinition, measurementMethod: 'Calculate from the recorded session evidence.', role: 'supporting', constraints: null, targetValue: null, targetUnit: def.unit, targetTimeframe: null, isSupported: def.requirement !== 'notImplemented' }],
    }));
    setAddMenu(false);
  };

  const requiredSessions = plan ? Math.max(1, plan.calculation?.requiredSessionCount ?? plan.consecutiveSessions ?? 1) : 1;
  const consecutive = plan?.calculation?.requiresConsecutiveSessions ?? true;
  const levelTwo = useMemo(() => (plan ? plan.metrics.filter(m => !isSentenceScoped(m.id) && (typeof m.targetValue === 'number' || m.id === plan.calculation?.primaryMetricId || m.role === 'direct')) : []), [plan]);
  const levelThree = useMemo(() => (plan ? plan.metrics.filter(m => !levelTwo.includes(m)) : []), [plan, levelTwo]);
  const canCreate = !!plan && title.trim().length > 0 && plan.metrics.some(m => m.isSupported !== false);
  const available = plan ? MetricCatalogue.all.filter(d => !plan.metrics.some(m => MetricCatalogue.resolve(m.id)?.id === d.id)) : [];

  const savePlan = () => {
    if (!plan) {
      return;
    }
    const targeted = plan.metrics.find(m => m.role === 'direct' && typeof m.targetValue === 'number' && m.isSupported !== false && !isSentenceScoped(m.id)) ?? plan.metrics.find(m => typeof m.targetValue === 'number' && m.isSupported !== false && !isSentenceScoped(m.id));
    const finalPlan: GoalPlan = {
      ...plan,
      goalTitle: title.trim(),
      targetValue: targeted?.targetValue ?? 0,
      targetUnit: targeted?.targetUnit ?? '',
      calculation: plan.calculation ? { ...plan.calculation, eligibleEvidenceTypes: plan.metrics.map(m => m.id) } : null,
    };
    store.addGoal({ title: finalPlan.goalTitle, description: goalText.trim(), targetValue: finalPlan.targetValue, targetUnit: finalPlan.targetUnit, timeframe: finalPlan.timeframe, plan: finalPlan, targetDateMs: null });
    setStep('created');
  };

  return (
    <View style={iepStyles.screen}>
      <ScrollView contentContainerStyle={[iepStyles.content, { maxWidth: 900 }]} keyboardShouldPersistTaps="handled">
        <View style={[iepStyles.row, { justifyContent: 'space-between' }]}>
          <TouchableOpacity accessibilityRole="button" onPress={() => navigation.goBack()}><Text style={{ color: iepColors.blue, fontWeight: '600', fontSize: 16 }}>{step === 'created' ? 'Done' : 'Cancel'}</Text></TouchableOpacity>
          <Text style={iepStyles.headline}>{step === 'write' ? 'Add an IEP goal' : step === 'review' ? 'Review goal plan' : 'Goal created'}</Text>
          <View style={{ width: 60 }} />
        </View>

        {step === 'write' ? (
          <View style={[iepStyles.card, { gap: 14 }]}>
            <View style={[iepStyles.row, { gap: 10, flexWrap: 'wrap' }]}><Text style={iepStyles.sectionTitle}>✍️ Start with the IEP wording</Text><AiTag /></View>
            <Text style={iepStyles.subtle}>Write the goal in your own words. AI will identify the relevant metrics, their targets when stated, measurement conditions, timeframe and dashboard tiles for you to review.</Text>
            {settings.mockMode ? (
              <View style={{ gap: 8 }}>
                <View style={[iepStyles.row, { justifyContent: 'space-between' }]}>
                  <Text style={iepStyles.captionStrong}>Choose a sample goal</Text>
                  <Text style={iepStyles.caption}>Mock mode</Text>
                </View>
                {libraryGoalsBySource.map(([src, goals]) => (
                  <View key={src} style={{ gap: 6 }}>
                    <Text style={iepStyles.caption}>{LIBRARY_SOURCE_LABEL[src]}</Text>
                    <View style={iepStyles.rowWrap}>
                      {goals.map(g => <Chip key={g.id} label={`${g.id} · ${g.title}`} onPress={() => setGoalText(g.statement)} accessibilityLabel={`${g.id} ${g.title}. Fills the goal text with a reviewed sample wording`} />)}
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
            <TextInput
              accessibilityLabel="Goal text"
              multiline
              value={goalText}
              onChangeText={setGoalText}
              placeholder="Example: The child will create at least five sentences containing at least three words during a session across three consecutive sessions."
              placeholderTextColor={iepColors.muted}
              style={[iepStyles.input, { minHeight: 190, textAlignVertical: 'top', borderColor: '#B7CCF3' }]}
            />
            {goalText.length > 0 ? <SecondaryButton label="Clear" onPress={() => setGoalText('')} style={{ alignSelf: 'flex-start' }} /> : null}
            <Text style={iepStyles.caption}>The goal text is sent only to the configuration AI service to create this reviewable plan. It is not used as a progress result until you confirm it.</Text>
            {error ? <Text style={{ color: iepColors.amber, fontWeight: '600' }}>⚠ {error}</Text> : null}
            <PrimaryButton label={analysing ? 'Creating plan…' : 'Create measurement plan'} disabled={analysing || goalText.trim().length === 0} onPress={analyse} />
            {analysing ? <ActivityIndicator color={iepColors.blue} /> : null}
          </View>
        ) : null}

        {step === 'review' && plan ? (
          <>
            <View style={[iepStyles.card, { gap: 8 }]}>
              <View style={[iepStyles.row, { gap: 10, flexWrap: 'wrap' }]}><Text style={iepStyles.sectionTitle}>✅ Review the generated plan</Text><AiTag /></View>
              <Text style={iepStyles.subtle}>Confirm the details before this goal is used to measure progress.</Text>
              {source === 'fallback' ? <Text style={{ color: iepColors.amber, fontWeight: '600' }}>⚠ {error ?? 'This is a deterministic starter plan created without AI. Review every field.'}</Text> : null}
            </View>
            <View style={[iepStyles.card, { gap: 10 }]}>
              <View style={[iepStyles.row, { gap: 10 }]}><Text style={iepStyles.captionStrong}>Goal</Text><AiTag /></View>
              <TextInput accessibilityLabel="Goal title" value={title} onChangeText={setTitle} placeholder="Goal title" style={iepStyles.input} />
              <Text style={iepStyles.body}>{plan.goalSummary}</Text>
              {plan.condition ? <Text style={iepStyles.caption}>{plan.condition}</Text> : null}
            </View>
            <View style={[iepStyles.card, { gap: 10 }]}>
              <Text style={iepStyles.captionStrong}>Level 1 · Across the period</Text>
              <View style={[iepStyles.row, { justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }]}>
                <View>
                  <Text style={iepStyles.headline}>Sessions at target</Text>
                  <Text style={{ color: iepColors.blue, fontSize: 13 }}>Measures the goal</Text>
                </View>
                <View style={[iepStyles.row, { gap: 8 }]}>
                  <Text style={iepStyles.caption}>Target</Text>
                  <TextInput
                    accessibilityLabel="Sessions required"
                    keyboardType="number-pad"
                    value={String(requiredSessions)}
                    onChangeText={t => updatePlan(p => { const n = Math.max(1, parseInt(t, 10) || 1); return { ...p, consecutiveSessions: n, calculation: p.calculation ? { ...p.calculation, requiredSessionCount: n } : p.calculation }; })}
                    style={[iepStyles.input, { width: 72, textAlign: 'center' }]}
                  />
                  <Text style={iepStyles.caption}>sessions</Text>
                </View>
              </View>
              <View style={{ maxWidth: 280 }}>
                <Segmented options={[{ key: 'consecutive', label: 'Consecutive' }, { key: 'any', label: 'Any order' }]} value={consecutive ? 'consecutive' : 'any'} onChange={k => updatePlan(p => ({ ...p, calculation: p.calculation ? { ...p.calculation, requiresConsecutiveSessions: k === 'consecutive' } : p.calculation }))} />
              </View>
              <Text style={iepStyles.caption}>{consecutive ? 'A session that misses the target resets the run.' : 'Successful sessions count in any order.'}</Text>
              <Text style={iepStyles.caption}>How many sessions must reach the Level 2 target before the goal itself is met.</Text>
            </View>
            <View style={[iepStyles.card, { gap: 10 }]}>
              <View style={[iepStyles.row, { gap: 10 }]}><Text style={iepStyles.captionStrong}>Level 2 · In each session</Text><AiTag /></View>
              {levelTwo.length === 0 ? <Text style={iepStyles.subtle}>No session measure is set. Add one below and give it a target.</Text> : levelTwo.map(m => <MetricRow key={m.id} metric={m} plan={plan} targetText={targets[m.id] ?? ''} onTarget={t => setTarget(m.id, t)} onRemove={() => removeMetric(m.id)} />)}
              <Text style={iepStyles.caption}>How many qualifying events one session needs. A session counts toward Level 1 when it reaches this.</Text>
            </View>
            <View style={[iepStyles.card, { gap: 10 }]}>
              <View style={[iepStyles.row, { gap: 10 }]}><Text style={iepStyles.captionStrong}>Level 3 · What makes one count</Text><AiTag /></View>
              {levelThree.map(m => <MetricRow key={m.id} metric={m} plan={plan} targetText={targets[m.id] ?? ''} onTarget={t => setTarget(m.id, t)} onRemove={() => removeMetric(m.id)} />)}
              <SecondaryButton label="+ Add metric" onPress={() => setAddMenu(true)} disabled={available.length === 0} style={{ alignSelf: 'flex-start' }} />
              <Text style={iepStyles.caption}>The measures behind each event, and anything else worth tracking. Remove what this goal did not ask for with the ⊖ button. A metric without a target is tracked but not scored.</Text>
              {ignored.length > 0 ? <Text style={iepStyles.caption}>Ignored: {ignored.join(', ')} — not something this app measures.</Text> : null}
            </View>
            {plan.confidenceNote ? <View style={iepStyles.card}><Text style={iepStyles.subtle}>{plan.confidenceNote}</Text></View> : null}
            <View style={[iepStyles.row, { gap: 12, justifyContent: 'flex-end' }]}>
              <SecondaryButton label="Edit goal text" onPress={() => setStep('write')} />
              <PrimaryButton label="Create dashboard" disabled={!canCreate} onPress={savePlan} />
            </View>
          </>
        ) : null}

        {step === 'created' ? (
          <View style={[iepStyles.card, { alignItems: 'center', gap: 12, paddingVertical: 40 }]}>
            <Text style={{ fontSize: 56, color: iepColors.green }}>✔</Text>
            <Text style={iepStyles.sectionTitle}>Your goal dashboard is ready</Text>
            <Text style={[iepStyles.subtle, { textAlign: 'center' }]}>The goal is now active and will be included when you start a new AAC data session. You can see its detected measures on the dashboard.</Text>
            <PrimaryButton label="Done" onPress={() => navigation.goBack()} />
          </View>
        ) : null}
      </ScrollView>

      <Sheet visible={addMenu} title="Add metric" onClose={() => setAddMenu(false)} closeLabel="Close" maxWidth={560}>
        {TOPICS.map(topic => {
          const defs = topic.ids.map(id => MetricCatalogue.definitionFor(id)).filter((d): d is MetricDefinition => !!d && available.includes(d));
          if (defs.length === 0) {
            return null;
          }
          return (
            <View key={topic.title} style={{ gap: 6 }}>
              <Text style={iepStyles.captionStrong}>{topic.title}</Text>
              {defs.map(d => (
                <TouchableOpacity key={d.id} accessibilityRole="button" onPress={() => addMetric(d, topic.category)} style={iepStyles.innerCard}>
                  <Text style={iepStyles.body}>{d.displayName}</Text>
                  <Text style={iepStyles.caption}>{d.clinicalDefinition}</Text>
                </TouchableOpacity>
              ))}
            </View>
          );
        })}
      </Sheet>
    </View>
  );
};

const MetricRow: React.FC<{ metric: GoalMetric; plan: GoalPlan; targetText: string; onTarget: (t: string) => void; onRemove: () => void }> = ({ metric, plan, targetText, onTarget, onRemove }) => {
  const sentenceScoped = isSentenceScoped(metric.id);
  const supported = metric.isSupported !== false;
  const bar = plan.calculation?.minimumWordsPerSentence ?? null;
  const noTargetNote = !supported
    ? null
    : targetText.trim() === ''
      ? metric.id === MetricCatalogue.qualifyingSentences.id && bar !== null
        ? `No target set — a session counts as met when at least one sentence reaches ${bar} words. Type a number to require more.`
        : sentenceScoped
          ? 'The goal states no words-per-sentence target — every sentence will be counted.'
          : 'The goal states no target for this — it will be tracked, not scored.'
      : null;
  return (
    <View style={[iepStyles.innerCard, { gap: 6 }]}>
      <View style={[iepStyles.row, { justifyContent: 'space-between', gap: 10 }]}>
        <View style={[iepStyles.row, { gap: 8, flexShrink: 1, flexWrap: 'wrap' }]}>
          <Text style={[iepStyles.headline, !supported && { color: iepColors.muted }]}>{metric.name}</Text>
          <AiTag />
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove ${metric.name}`} onPress={onRemove}><Text style={{ color: iepColors.red, fontSize: 22 }}>⊖</Text></TouchableOpacity>
      </View>
      <Text style={{ color: iepColors.blue, fontSize: 13 }}>{metric.role ? GOAL_METRIC_ROLE_LABEL[metric.role] : 'Goal measure'}</Text>
      {!supported ? (
        <Text style={{ color: iepColors.amber, fontWeight: '600' }}>⚠ Not measured by the app yet — it will not be scored</Text>
      ) : (
        <View style={[iepStyles.row, { gap: 8, flexWrap: 'wrap' }]}>
          <Text style={iepStyles.caption}>{sentenceScoped ? 'Target per sentence' : 'Target'}</Text>
          <TextInput accessibilityLabel={`Target for ${metric.name}`} keyboardType="decimal-pad" value={targetText} onChangeText={onTarget} placeholder="none" placeholderTextColor={iepColors.muted} style={[iepStyles.input, { width: 72, textAlign: 'center' }]} />
          <Text style={iepStyles.caption}>{metric.targetUnit ?? MetricCatalogue.definitionFor(MetricCatalogue.resolve(metric.id)?.id ?? '')?.unit ?? ''}</Text>
        </View>
      )}
      {noTargetNote ? <Text style={iepStyles.caption}>{noTargetNote}</Text> : null}
      {metric.targetTimeframe ? <Text style={iepStyles.caption}>Target timeframe: {metric.targetTimeframe}</Text> : null}
      {typeof metric.constraints?.minimumWordsPerSentence === 'number' ? <Text style={iepStyles.caption}>Counts sentences that reached the words-per-sentence target of {metric.constraints.minimumWordsPerSentence}.</Text> : null}
      {metric.definition ? <Text style={iepStyles.caption}>{metric.definition}</Text> : null}
    </View>
  );
};

export default IepAddGoalScreen;
