/** Export selected goals as PDF and/or CSV through the system share sheet. */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { IEP_EVENTS, trackIep } from '../analytics/iepAnalytics';
import { exportAndShare } from '../export/exportService';
import { useAllGoalProgress, useIepSettings } from '../hooks/useIepDashboard';
import { Checkbox, PrimaryButton } from '../ui/primitives';
import { iepColors, iepStyles } from '../ui/theme';

const IepExportScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { all, periodLabelText } = useAllGoalProgress();
  const { settings } = useIepSettings();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pdf, setPdf] = useState(true);
  const [csv, setCsv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selected.size === 0 && all.length > 0) {
      setSelected(new Set(all.map(p => p.goalId)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all.length]);

  useEffect(() => {
    trackIep(IEP_EVENTS.EXPORT_SCREEN_VIEWED, { goal_count: all.length, mock_mode: settings.mockMode, period_preset: settings.periodPreset });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async () => {
    setBusy(true);
    setError(null);
    const startedAtMs = Date.now();
    // "Exported" means the files were written and the share sheet opened; a cancelled share still counts.
    const outcome = {
      pdf,
      csv,
      selected_goal_count: selected.size,
      goal_count: all.length,
      all_goals_selected: selected.size === all.length,
      achieved_goal_count: all.filter(p => selected.has(p.goalId) && p.status === 'achieved').length,
      mock_mode: settings.mockMode,
      period_preset: settings.periodPreset,
    };
    try {
      await exportAndShare({
        student: settings.heroName,
        reportingPeriodLabel: periodLabelText,
        goals: all.filter(p => selected.has(p.goalId)),
        formats: { pdf, csv },
      });
      trackIep(IEP_EVENTS.REPORT_EXPORTED, { ...outcome, duration_ms: Date.now() - startedAtMs });
    } catch (e) {
      setError(`The report could not be created. ${e instanceof Error ? e.message : String(e)}`);
      trackIep(IEP_EVENTS.REPORT_EXPORT_FAILED, { ...outcome, duration_ms: Date.now() - startedAtMs });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={iepStyles.screen}>
      <ScrollView contentContainerStyle={[iepStyles.content, { maxWidth: 820, paddingHorizontal: 36 }]}>
        <View style={[iepStyles.row, { justifyContent: 'space-between' }]}>
          <TouchableOpacity accessibilityRole="button" onPress={() => navigation.goBack()}><Text style={{ color: iepColors.blue, fontWeight: '600', fontSize: 16 }}>Close</Text></TouchableOpacity>
          <Text style={iepStyles.headline}>Export</Text>
          <View style={{ width: 60 }} />
        </View>
        <Text style={iepStyles.title}>Export goal report</Text>
        <Text style={iepStyles.subtle}>{periodLabelText}{settings.mockMode ? ' · Mock data (synthetic)' : ''}</Text>
        <View style={[iepStyles.card, { gap: 6 }]}>
          <Text style={iepStyles.headline}>Choose goals</Text>
          <Text style={iepStyles.caption}>Select one or more goals to include.</Text>
          {all.length === 0 ? <Text style={iepStyles.subtle}>No active goals to export.</Text> : null}
          {all.map(p => (
            <Checkbox key={p.goalId} checked={selected.has(p.goalId)} label={`Goal ${p.displayNumber}: ${p.title}`} subtitle={p.statement} onToggle={() => setSelected(prev => { const next = new Set(prev); if (next.has(p.goalId)) { next.delete(p.goalId); } else { next.add(p.goalId); } return next; })} />
          ))}
        </View>
        <View style={[iepStyles.card, { gap: 6 }]}>
          <Text style={iepStyles.headline}>File format</Text>
          <Text style={iepStyles.caption}>PDF is best for sharing and review. CSV keeps the session data editable.</Text>
          <Checkbox checked={pdf} label="📄 PDF report" subtitle="Formatted progress report" onToggle={() => setPdf(v => !v)} />
          <Checkbox checked={csv} label="▦ CSV data" subtitle="Spreadsheet-ready session data" onToggle={() => setCsv(v => !v)} />
        </View>
        {error ? <Text style={{ color: iepColors.red, fontWeight: '600' }}>⚠ {error}</Text> : null}
        {busy ? <ActivityIndicator color={iepColors.blue} /> : null}
        <PrimaryButton label="⇪ Export report" disabled={busy || selected.size === 0 || (!pdf && !csv)} onPress={run} accessibilityLabel="Export report" />
        <Text style={iepStyles.caption}>Files open in the system share sheet, where Google Drive is available when installed. Every exported percentage states what it counted, and synthetic data is labelled in both formats.</Text>
      </ScrollView>
    </View>
  );
};

export default IepExportScreen;
