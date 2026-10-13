/** Session start, session review, and goal date sheets. */

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useIepStore, useIepStoreVersion } from '../hooks/IepStoreProvider';
import { IEP_EVENTS, trackIep } from '../analytics/iepAnalytics';
import { requestEventAnalysis } from '../ai/iepAiClient';
import { COMMUNICATION_FUNCTIONS, COMMUNICATION_FUNCTION_LABEL, CommunicationFunction, SUPPORT_LEVELS, SUPPORT_LEVEL_LABEL, SupportLevel } from '../model/types';
import { humanDay, startOfLocalDay } from '../application/reportingPeriod';
import { Calendar } from './DatePicker';
import { iepColors, iepStyles } from './theme';
import { AiTag, PrimaryButton, SecondaryButton, Segmented, Sheet } from './primitives';

const SESSION_TYPES = ['Therapy', 'Classroom', 'Home', 'Peer interaction'];
const PARTNERS = ['SLP', 'Parent', 'Peer', 'Teacher', 'Other'];

export const SessionStartSheet: React.FC<{ visible: boolean; onClose: () => void; childName: string }> = ({ visible, onClose, childName }) => {
  const { store } = useIepStore();
  const [sessionType, setSessionType] = useState('Therapy');
  const [partner, setPartner] = useState('SLP');
  return (
    <Sheet visible={visible} title="Session tracking" onClose={onClose} maxWidth={560}>
      <Text style={iepStyles.title}>Start AAC session</Text>
      <Text style={iepStyles.subtle}>{childName} · The app captures AAC activity automatically while the session is active.</Text>
      <Text style={iepStyles.captionStrong}>Session type</Text>
      <Segmented options={SESSION_TYPES.map(s => ({ key: s, label: s }))} value={sessionType} onChange={setSessionType} accessibilityLabel="Session type" />
      <Text style={iepStyles.captionStrong}>Communication partner</Text>
      <View style={iepStyles.rowWrap}>
        {PARTNERS.map(p => (
          <TouchableOpacity key={p} accessibilityRole="button" accessibilityState={{ selected: partner === p }} onPress={() => setPartner(p)} style={[iepStyles.chip, partner === p && iepStyles.chipSelected]}>
            <Text style={[iepStyles.chipText, partner === p && iepStyles.chipTextSelected]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <PrimaryButton
        label="Start session"
        onPress={() => {
          const trackedGoalIds = store.activeGoals.map(g => g.id);
          store.startSession({ partnerType: partner.toLowerCase(), treatmentContext: sessionType.toLowerCase(), trackedGoalIds });
          trackIep(IEP_EVENTS.SESSION_STARTED, { session_type: sessionType.toLowerCase(), partner_type: partner.toLowerCase(), tracked_goal_count: trackedGoalIds.length });
          onClose();
        }}
      />
    </Sheet>
  );
};

export const SessionReviewSheet: React.FC<{ sessionId: string | null; onClose: () => void }> = ({ sessionId, onClose }) => {
  const { store } = useIepStore();
  const [analysing, setAnalysing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Which classifier produced the suggestions the clinician reviewed; reported with the outcome.
  const [aiSource, setAiSource] = useState<string | null>(null);
  const version = useIepStoreVersion();
  const sentences = useMemo(
    () => (sessionId ? store.sentences.filter(s => s.sessionId === sessionId).slice().sort((a, b) => a.startedAtMs - b.startedAtMs) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, sessionId, version],
  );

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    const communications = store.communications.filter(c => c.sessionId === sessionId && c.content.trim().length > 0);
    if (communications.length === 0) {
      setAnalysing(false);
      setMessage('There are no completed messages to classify.');
      setAiSource('none');
      return;
    }
    // The reply may land after "Review later" or Finalize, when the sheet is closed or
    // shows another session: the store still learns the labels for a postponed session,
    // but a finalized session is closed to edits and this sheet's state is never touched.
    let cancelled = false;
    setAnalysing(true);
    const goalIds = store.session(sessionId)?.trackedGoalIds ?? [];
    const metricIds = store.goals.filter(g => goalIds.includes(g.id)).flatMap(g => g.plan?.metrics.map(m => m.id) ?? []);
    requestEventAnalysis(goalIds[0] ?? 'session', metricIds, communications.map(c => ({ eventId: c.id, content: c.content, source: c.source })))
      .then(reply => {
        if (store.session(sessionId)?.reviewState !== 'finalized') {
          store.applyAiEventAnalysis(reply.results);
        }
        if (cancelled) {
          return;
        }
        setAiSource(reply.source);
        setMessage(reply.source === 'provider' ? 'AI suggestions are ready. You can correct any function before finalizing.' : 'AI analysis is unavailable. Local suggestions remain visible and editable.');
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setAiSource('error');
        setMessage('AI analysis is unavailable. Local suggestions remain visible and editable.');
      })
      .finally(() => {
        if (!cancelled) {
          setAnalysing(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, store]);

  useEffect(() => {
    if (!sessionId) {
      setMessage(null);
      setAiSource(null);
    }
  }, [sessionId]);

  if (!sessionId) {
    return null;
  }
  const canFinalize = store.canFinalizeReview(sessionId);
  const outcomeProps = { sentence_count: sentences.length, ai_source: aiSource };
  const postpone = () => {
    trackIep(IEP_EVENTS.SESSION_REVIEW_POSTPONED, { ...outcomeProps, can_finalize: canFinalize });
    onClose();
  };
  const finalize = () => {
    if (store.finalizeSessionReview(sessionId)) {
      trackIep(IEP_EVENTS.SESSION_REVIEW_FINALIZED, outcomeProps);
      onClose();
    }
  };
  return (
    <Sheet
      visible
      title="Review session"
      onClose={postpone}
      closeLabel="Review later"
      trailing={
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: !canFinalize }} disabled={!canFinalize} onPress={finalize}>
          <Text style={{ color: canFinalize ? iepColors.blue : iepColors.muted, fontWeight: '700', fontSize: 16 }}>Finalize</Text>
        </TouchableOpacity>
      }>
      <Text style={iepStyles.subtle}>Review every sentence before finalizing the session. Communication functions are suggested by AI from the complete session; support level is confirmed by you.</Text>
      {analysing ? (
        <View style={[iepStyles.row, { gap: 10 }]}><ActivityIndicator color={iepColors.blue} /><Text style={iepStyles.subtle}>Classifying communication functions…</Text></View>
      ) : message ? (
        <Text style={iepStyles.subtle}>ℹ︎ {message}</Text>
      ) : null}
      {sentences.length === 0 ? (
        <View style={[iepStyles.innerCard, { alignItems: 'center', gap: 6 }]}>
          <Text style={iepStyles.headline}>No completed sentences</Text>
          <Text style={iepStyles.subtle}>This session can be finalized without sentence review.</Text>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Text style={iepStyles.captionStrong}>Sentence audit</Text>
          {sentences.map(sentence => {
            const review = store.sentenceReview(sentence.id);
            const communication = store.communications.find(c => c.sentenceId === sentence.id);
            const fn = communication?.analysis.communicationFunction ?? 'otherOrUnclear';
            const provenance = communication?.analysis.functionSource === 'manual' ? 'Clinician edited' : communication?.analysis.functionSource === 'ai' ? 'AI suggested' : 'Local suggestion';
            return (
              <View key={sentence.id} style={[iepStyles.innerCard, { gap: 10 }]}>
                <Text style={iepStyles.headline}>{sentence.finalWords.join(' ')}</Text>
                <Text style={iepStyles.caption}>{sentence.finalWords.length} words{sentence.wasAbandoned ? ' · ended by inactivity' : sentence.wasCleared ? ' · cleared' : ''}</Text>
                <Text style={iepStyles.captionStrong}>Function · {provenance}</Text>
                <View style={iepStyles.rowWrap}>
                  {COMMUNICATION_FUNCTIONS.map((f: CommunicationFunction) => (
                    <TouchableOpacity key={f} accessibilityRole="button" accessibilityState={{ selected: fn === f }} onPress={() => store.setCommunicationFunction(sentence.id, f)} style={[iepStyles.chip, fn === f && iepStyles.chipSelected]}>
                      <Text style={[iepStyles.chipText, fn === f && iepStyles.chipTextSelected]}>{COMMUNICATION_FUNCTION_LABEL[f]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Segmented
                  accessibilityLabel="Choose whether this sentence was independent, prompted without physical touch, or physically assisted"
                  options={SUPPORT_LEVELS.map((l: SupportLevel) => ({ key: l, label: SUPPORT_LEVEL_LABEL[l] }))}
                  value={review?.supportLevel ?? 'unrated'}
                  onChange={key => store.setSupportLevel(sentence.id, key as SupportLevel)}
                />
              </View>
            );
          })}
        </View>
      )}
      <View style={[iepStyles.innerCard, { gap: 6 }]}>
        <Text style={iepStyles.captionStrong}>Support definitions</Text>
        <Text style={iepStyles.body}><Text style={{ fontWeight: '700' }}>Independent</Text> · No assistance or prompt</Text>
        <Text style={iepStyles.body}><Text style={{ fontWeight: '700' }}>Prompted</Text> · Verbal, visual, gestural, or modeled; no physical touch</Text>
        <Text style={iepStyles.body}><Text style={{ fontWeight: '700' }}>Assisted</Text> · Physical assistance, including hand-over-hand</Text>
      </View>
    </Sheet>
  );
};

export const GoalDateSheet: React.FC<{ visible: boolean; targetDateMs: number | null; onSave: (ms: number | null) => void; onClose: () => void }> = ({ visible, targetDateMs, onSave, onClose }) => {
  const [enabled, setEnabled] = useState(targetDateMs !== null);
  const [dateMs, setDateMs] = useState(startOfLocalDay(targetDateMs ?? Date.now()));
  useEffect(() => {
    setEnabled(targetDateMs !== null);
    setDateMs(startOfLocalDay(targetDateMs ?? Date.now()));
  }, [targetDateMs, visible]);
  return (
    <Sheet visible={visible} title="Goal date" onClose={onClose} maxWidth={480} trailing={
      <TouchableOpacity accessibilityRole="button" onPress={() => { onSave(enabled ? dateMs : null); onClose(); }}>
        <Text style={{ color: iepColors.blue, fontWeight: '700', fontSize: 16 }}>Save</Text>
      </TouchableOpacity>
    }>
      <View style={[iepStyles.row, { justifyContent: 'space-between' }]}>
        <Text style={iepStyles.body}>Set a target date</Text>
        <Switch value={enabled} onValueChange={setEnabled} accessibilityLabel="Set a target date" />
      </View>
      {enabled ? (
        <View style={{ gap: 6 }}>
          <Text style={iepStyles.captionStrong}>Target date · {humanDay(dateMs)}</Text>
          <Calendar valueMs={dateMs} onChange={setDateMs} />
        </View>
      ) : null}
      <Text style={iepStyles.caption}>This date is a planning reminder. It does not change which sessions are included in a reporting period.</Text>
      <SecondaryButton label="Cancel" onPress={onClose} />
    </Sheet>
  );
};

export const AiTagInline = AiTag;
