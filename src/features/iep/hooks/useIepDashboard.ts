/**
 * Turns store state and settings into the GoalProgress models every screen reads.
 * Mock mode changes only the source and provenance; the builder is the same.
 */

import { useCallback, useMemo } from 'react';
import { useAppSettings } from '../../../utils/persistance';
import { buildGoalProgress, ProgressContext } from '../application/buildGoalProgress';
import { GoalProgress } from '../application/goalProgress';
import { ReportingPeriod, ReportingPeriodPreset, periodLabel, reportingPeriod } from '../application/reportingPeriod';
import { MockDatasetId, MockDataset, loadMockDataset } from '../mock/mockDataset';
import { IepGoal } from '../model/types';
import { useIepStore, useIepStoreVersion } from './IepStoreProvider';

/** Shortest auto-stop length. There is deliberately no upper limit. */
export const MIN_AUTO_STOP_MINUTES = 5;

export interface IepSettings {
  mockMode: boolean;
  mockDataset: MockDatasetId;
  autoStopEnabled: boolean;
  autoStopMinutes: number;
  periodPreset: ReportingPeriodPreset;
  customStartMs: number | null;
  customEndMs: number | null;
  heroName: string;
}

export function useIepSettings() {
  const { preferences, setItem } = useAppSettings();
  const settings: IepSettings = useMemo(
    () => ({
      mockMode: preferences.iepMockMode === '1',
      mockDataset: preferences.iepMockDataset === 'edgeCases' ? 'edgeCases' : 'standard',
      autoStopEnabled: preferences.iepAutoStopEnabled === '1',
      autoStopMinutes: Math.max(MIN_AUTO_STOP_MINUTES, parseInt(preferences.iepAutoStopMinutes || '30', 10) || 30),
      periodPreset: (['4w', '12w', '6m', 'custom'] as ReportingPeriodPreset[]).includes(preferences.iepReportingPeriod as ReportingPeriodPreset)
        ? (preferences.iepReportingPeriod as ReportingPeriodPreset)
        : '12w',
      customStartMs: preferences.iepReportingStartMs ? Number(preferences.iepReportingStartMs) : null,
      customEndMs: preferences.iepReportingEndMs ? Number(preferences.iepReportingEndMs) : null,
      heroName: preferences.heroName && preferences.heroName !== 'Name' ? preferences.heroName : 'Your child',
    }),
    [preferences],
  );
  const update = useCallback(
    (patch: Partial<Record<'iepMockMode' | 'iepMockDataset' | 'iepAutoStopEnabled' | 'iepAutoStopMinutes' | 'iepReportingPeriod' | 'iepReportingStartMs' | 'iepReportingEndMs', string>>) => {
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) {
          setItem(key as keyof typeof preferences, value);
        }
      }
    },
    [setItem],
  );
  return { settings, update };
}

export function useReportingPeriod(): { period: ReportingPeriod; label: string } {
  const { settings } = useIepSettings();
  const period = useMemo(() => {
    const custom = settings.customStartMs && settings.customEndMs ? { startMs: settings.customStartMs, endMs: settings.customEndMs } : undefined;
    return reportingPeriod(settings.periodPreset, Date.now(), custom);
  }, [settings.periodPreset, settings.customStartMs, settings.customEndMs]);
  return { period, label: settings.periodPreset === 'custom' ? periodLabel(period) : { '4w': '4 weeks', '12w': '12 weeks', '6m': '6 months', custom: '' }[settings.periodPreset] };
}

export function useProgressContext(): { context: ProgressContext; dataset: MockDataset | null } {
  const { store } = useIepStore();
  const { settings } = useIepSettings();
  useIepStoreVersion();
  return useMemo(() => {
    if (settings.mockMode) {
      const dataset = loadMockDataset(settings.mockDataset);
      return { context: { kind: 'mock' as const, dataset }, dataset };
    }
    return { context: { kind: 'live' as const, state: store.snapshot() }, dataset: null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.mockMode, settings.mockDataset, store, store.snapshot()]);
}

export function useAllGoalProgress(): { all: GoalProgress[]; period: ReportingPeriod; periodLabelText: string } {
  const { store } = useIepStore();
  const version = useIepStoreVersion();
  const { period, label } = useReportingPeriod();
  const { context } = useProgressContext();
  const all = useMemo(
    () => store.activeGoals.map(goal => buildGoalProgress(goal, period, context)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, version, period, context],
  );
  return { all, period, periodLabelText: label };
}

export function useGoalProgress(goalId: string): { progress: GoalProgress | null; goal: IepGoal | null } {
  const { store } = useIepStore();
  const version = useIepStoreVersion();
  const { period } = useReportingPeriod();
  const { context } = useProgressContext();
  return useMemo(() => {
    const goal = store.goals.find(g => g.id === goalId) ?? null;
    return { goal, progress: goal ? buildGoalProgress(goal, period, context) : null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version, goalId, period, context]);
}
