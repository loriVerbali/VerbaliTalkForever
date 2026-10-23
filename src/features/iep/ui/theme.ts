/** Colour and shape tokens for the IEP screens, from IMPLEMENTATION_GUIDE.md Step 7. */

import { StyleSheet } from 'react-native';
import { GoalUiStatus } from '../application/goalProgress';
import { Trend } from '../core';

export const iepColors = {
  canvas: '#F2F7FA',
  ink: '#1A293D',
  muted: '#5E738F',
  blue: '#306EE0',
  teal: '#149E8F',
  green: '#2E9E57',
  amber: '#EB9117',
  red: '#D64545',
  border: '#D6E0EB',
  white: '#FFFFFF',
} as const;

export function statusColor(status: GoalUiStatus): string {
  switch (status) {
    case 'achieved':
      return iepColors.green;
    case 'progressing':
    case 'onTrack':
      return iepColors.blue;
    case 'stable':
      return iepColors.teal;
    case 'needsAttention':
      return iepColors.red;
    default:
      return iepColors.muted;
  }
}

export const TREND_TITLE: Record<Trend, string> = {
  improving: 'Improving',
  stable: 'Stable',
  declining: 'Needs attention',
  insufficientData: 'Building baseline',
};

export const TREND_SYMBOL: Record<Trend, string> = {
  improving: '↗',
  stable: '→',
  declining: '↘',
  insufficientData: '…',
};

export function trendColor(trend: Trend): string {
  switch (trend) {
    case 'improving':
      return iepColors.green;
    case 'stable':
      return iepColors.teal;
    case 'declining':
      return iepColors.red;
    default:
      return iepColors.muted;
  }
}

export const iepStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: iepColors.canvas },
  content: { paddingHorizontal: 42, paddingVertical: 24, maxWidth: 1180, width: '100%', alignSelf: 'center', gap: 20 },
  card: {
    backgroundColor: iepColors.white,
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: iepColors.border,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  innerCard: { backgroundColor: iepColors.white, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: iepColors.border },
  tile: { backgroundColor: iepColors.canvas, padding: 14, borderRadius: 12 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, color: iepColors.muted, textTransform: 'uppercase' },
  title: { fontSize: 28, fontWeight: '800', color: iepColors.ink },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: iepColors.ink },
  headline: { fontSize: 17, fontWeight: '600', color: iepColors.ink },
  body: { fontSize: 15, color: iepColors.ink },
  subtle: { fontSize: 15, color: iepColors.muted },
  caption: { fontSize: 12, color: iepColors.muted },
  captionStrong: { fontSize: 12, fontWeight: '700', color: iepColors.muted, letterSpacing: 0.6, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowWrap: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  buttonPrimary: { backgroundColor: iepColors.blue, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  buttonPrimaryText: { color: iepColors.white, fontWeight: '700', fontSize: 15 },
  buttonSecondary: { backgroundColor: iepColors.white, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: iepColors.border, alignItems: 'center', justifyContent: 'center' },
  buttonSecondaryText: { color: iepColors.blue, fontWeight: '600', fontSize: 15 },
  buttonDanger: { backgroundColor: iepColors.red, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12, alignItems: 'center' },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: iepColors.border, backgroundColor: iepColors.white },
  chipSelected: { borderColor: iepColors.blue, backgroundColor: '#E8F0FD' },
  chipText: { fontSize: 13, color: iepColors.muted, fontWeight: '600' },
  chipTextSelected: { color: iepColors.blue },
  divider: { height: 1, backgroundColor: iepColors.border, alignSelf: 'stretch' },
  input: { borderWidth: 1, borderColor: iepColors.border, borderRadius: 12, padding: 12, fontSize: 15, color: iepColors.ink, backgroundColor: iepColors.white },
  amberNote: { backgroundColor: '#FDF3E3', borderColor: '#F3D2A3', borderWidth: 1, borderRadius: 14, padding: 14 },
  blueNote: { backgroundColor: '#EEF4FD', borderRadius: 16, padding: 18 },
});
