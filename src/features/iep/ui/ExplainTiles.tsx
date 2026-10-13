/**
 * The tiles under "What explains this goal": the same six for every goal, each saying
 * what it still needs when the sessions cannot support it yet. Every bar carries its
 * value as text beside it, so length and colour are never the only signal.
 */

import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { BuildTimeChange, DurationBucket, LengthShare, StreakTile, TrendShift } from '../application/details';
import { formatValue } from '../application/goalProgress';
import { monthDay } from '../application/reportingPeriod';
import { OptionMenu } from './primitives';
import { iepColors, iepStyles } from './theme';

const wholeSeconds = (s: number) => `${Math.round(s)}s`;

const titleStyle = { fontSize: 15, fontWeight: '600' as const, color: iepColors.muted, flexShrink: 1 };
const bigStyle = { fontSize: 30, fontWeight: '900' as const, color: iepColors.ink };
const arrowStyle = { fontSize: 20, fontWeight: '700' as const, color: iepColors.muted };

/** A track with a filled share of its width. Decorative: the row's text states the value. */
export const MeterBar: React.FC<{ fraction: number; color: string; height?: number }> = ({ fraction, color, height = 8 }) => {
  const share = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: iepColors.border, overflow: 'hidden' }}>
      <View testID="meter-fill" style={{ width: `${share * 100}%`, height, borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
};

const Needs: React.FC<{ text: string }> = ({ text }) => <Text style={[iepStyles.subtle, { fontSize: 14 }]}>{text}</Text>;

/**
 * The white card every tile sits in. Given a label, the whole card reads as one element;
 * without one, the tile exposes its own parts (a tile with a control inside keeps the
 * control reachable).
 */
export const ExplainTile: React.FC<{ title: string; trailing?: React.ReactNode; minWidth?: number; accessibilityLabel?: string; children: React.ReactNode }> = ({
  title,
  trailing,
  minWidth = 220,
  accessibilityLabel,
  children,
}) => (
  <View
    style={[iepStyles.card, { flexGrow: 1, flexBasis: 0, minWidth, gap: 10 }]}
    accessible={accessibilityLabel !== undefined}
    accessibilityLabel={accessibilityLabel}>
    <View style={[iepStyles.row, { justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }]}>
      <Text style={titleStyle}>{title}</Text>
      {trailing}
    </View>
    {children}
  </View>
);

export const LONGEST_RUN_TITLE = 'Longest run of successful sessions';

/**
 * The longest run of sessions at target, and whether the child is still on it. The run is
 * still going when it ends at the latest measured session (`latestSessionMs`); length alone
 * cannot say, because an earlier run of equal length is the one kept on a tie.
 */
export const LongestRunTile: React.FC<{ streak: StreakTile | null; currentStreak: number; latestSessionMs: number | null }> = ({ streak, currentStreak, latestSessionMs }) => {
  const count = streak ? `${streak.length} ${streak.length === 1 ? 'session' : 'sessions'}` : null;
  const range = streak ? `${monthDay(streak.startMs)} – ${monthDay(streak.endMs)}` : null;
  const stillGoing = streak !== null && latestSessionMs !== null && streak.endMs === latestSessionMs;
  const status = !streak ? 'No session at target yet.' : stillGoing ? 'That run is still going.' : `Current run: ${currentStreak}.`;
  return (
    <ExplainTile title={LONGEST_RUN_TITLE} accessibilityLabel={`${LONGEST_RUN_TITLE}: ${count ? `${count}, ${range}. ` : ''}${status}`}>
      {streak ? (
        <>
          <Text style={{ fontSize: 34, fontWeight: '900', color: iepColors.green }}>{count}</Text>
          <Text style={iepStyles.caption}>{range}</Text>
          <Text style={iepStyles.caption}>{status}</Text>
        </>
      ) : (
        <Needs text={status} />
      )}
    </ExplainTile>
  );
};

/** A language statistic's earlier half against its recent half, "2.1 → 2.3". */
export const ShiftTile: React.FC<{ title: string; shift: TrendShift | null; unit: string }> = ({ title, shift, unit }) => {
  const from = shift ? formatValue(shift.from) : null;
  const to = shift ? formatValue(shift.to) : null;
  // Judged on the figures shown: a change too small to print is not announced either.
  const direction = from === null || to === null ? null : Number(to) > Number(from) ? 'up' : Number(to) < Number(from) ? 'down' : 'flat';
  const word = direction === 'up' ? 'Improving' : direction === 'down' ? 'Declining' : 'No change';
  const arrow = direction === 'up' ? '↑' : direction === 'down' ? '↓' : '→';
  const color = direction === 'up' ? iepColors.green : direction === 'down' ? iepColors.amber : iepColors.muted;
  const needs = 'Needs two measured sessions.';
  const label = shift ? `${title}: ${from} to ${to} ${unit} across the period, ${word.toLowerCase()}` : `${title}: ${needs}`;
  return (
    <ExplainTile title={title} accessibilityLabel={label}>
      {shift ? (
        <>
          <View style={[iepStyles.row, { gap: 10 }]}>
            <Text style={bigStyle}>{from}</Text>
            <Text style={arrowStyle}>→</Text>
            <Text style={bigStyle}>{to}</Text>
          </View>
          <Text style={{ color, fontWeight: '700', fontSize: 15 }}>
            {arrow}  {word}
          </Text>
          <Text style={iepStyles.caption}>across the period, in {unit}</Text>
        </>
      ) : (
        <Needs text={needs} />
      )}
    </ExplainTile>
  );
};

export const BUILD_TIME_CHANGE_TITLE = 'Change in time to build a sentence';
const BUILD_TIME_CHANGE_NEEDS = 'Needs eight timed sentences, with three of one length in each half of the period.';

/**
 * For one sentence length at a time, the mean build time of the earlier half of the
 * period's sentences against the recent half. The length is chosen from a menu so the
 * comparison is always like for like.
 */
export const BuildTimeChangeTile: React.FC<{ changes: readonly BuildTimeChange[] }> = ({ changes }) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const change = changes.find(c => c.label === selected) ?? changes[0] ?? null;
  const faster = change !== null && change.percentChange < 0;
  const unchanged = change !== null && change.percentChange === 0;
  const verdict = !change ? '' : faster ? `${Math.abs(change.percentChange)}% faster` : unchanged ? 'No change' : `${change.percentChange}% slower`;
  const arrow = faster ? '↓' : unchanged ? '→' : '↑';
  const color = faster ? iepColors.green : unchanged ? iepColors.muted : iepColors.amber;
  const earlier = change ? wholeSeconds(change.earlierSeconds) : '';
  const recent = change ? wholeSeconds(change.recentSeconds) : '';
  const counts = change ? `${change.earlierCount} sentences earlier, ${change.recentCount} recently` : '';
  return (
    <ExplainTile
      title={BUILD_TIME_CHANGE_TITLE}
      minWidth={300}
      trailing={
        change && changes.length > 1 ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Sentence length: ${change.label}`}
            accessibilityHint="Chooses which sentence length to compare"
            onPress={() => setMenuOpen(true)}
            hitSlop={8}>
            <Text style={{ color: iepColors.blue, fontSize: 15, fontWeight: '600' }}>{change.label} ▾</Text>
          </TouchableOpacity>
        ) : null
      }>
      {change ? (
        <View style={{ gap: 6 }} accessible accessibilityLabel={`${BUILD_TIME_CHANGE_TITLE}, ${change.label}: ${earlier} earlier to ${recent} recently, ${verdict}. ${counts}.`}>
          <View style={[iepStyles.row, { gap: 10 }]}>
            <Text style={[bigStyle, { color: iepColors.muted }]}>{earlier}</Text>
            <Text style={arrowStyle}>→</Text>
            <Text style={bigStyle}>{recent}</Text>
          </View>
          <Text style={{ color, fontWeight: '700', fontSize: 15 }}>
            {arrow}  {verdict}
          </Text>
          <Text style={iepStyles.caption}>{counts}</Text>
        </View>
      ) : (
        <Needs text={BUILD_TIME_CHANGE_NEEDS} />
      )}
      <OptionMenu
        visible={menuOpen}
        title="Sentence length"
        options={changes.map(c => ({ key: c.label, label: c.label, selected: c.label === change?.label }))}
        onSelect={key => {
          setSelected(key);
          setMenuOpen(false);
        }}
        onClose={() => setMenuOpen(false)}
      />
    </ExplainTile>
  );
};

export interface BarRow {
  label: string;
  valueText: string;
  /** Shown faint after the value, such as a sample count. */
  detail?: string;
  /** 0–1 of the bar's width. */
  fraction: number;
}

export const SHARES_TITLE = 'Sentence length distribution';
export const DURATIONS_TITLE = 'Average time to build by sentence length';

export function shareRows(shares: readonly LengthShare[]): BarRow[] {
  return shares.map(s => ({ label: s.label, valueText: `${s.percent}%`, fraction: s.percent / 100 }));
}

/** Bars relative to the slowest length, so the longest bar is always full. */
export function durationRows(durations: readonly DurationBucket[]): BarRow[] {
  const slowest = Math.max(0.001, ...durations.map(d => d.averageSeconds));
  return durations.map(d => ({ label: d.label, valueText: wholeSeconds(d.averageSeconds), detail: `(${d.count})`, fraction: d.averageSeconds / slowest }));
}

/** A list of labelled bars, each with its value printed above it. */
export const BarListTile: React.FC<{ title: string; rows: readonly BarRow[]; color: string; emptyText: string; minWidth?: number }> = ({ title, rows, color, emptyText, minWidth = 300 }) => {
  const label = rows.length === 0 ? `${title}: ${emptyText}` : `${title}: ${rows.map(r => `${r.label} ${r.valueText}${r.detail ? ` ${r.detail}` : ''}`).join(', ')}`;
  return (
    <ExplainTile title={title} minWidth={minWidth} accessibilityLabel={label}>
      {rows.length === 0 ? (
        <Needs text={emptyText} />
      ) : (
        <View style={{ gap: 10 }}>
          {rows.map(r => (
            <View key={r.label} style={{ gap: 5 }}>
              <View style={[iepStyles.row, { justifyContent: 'space-between', gap: 8 }]}>
                <Text style={[iepStyles.body, { fontSize: 14 }]}>{r.label}</Text>
                <View style={[iepStyles.row, { gap: 6 }]}>
                  <Text style={[iepStyles.body, { fontSize: 14, fontWeight: '700' }]}>{r.valueText}</Text>
                  {r.detail ? <Text style={iepStyles.caption}>{r.detail}</Text> : null}
                </View>
              </View>
              <MeterBar fraction={r.fraction} color={color} />
            </View>
          ))}
        </View>
      )}
    </ExplainTile>
  );
};

/** Word counts as bars relative to the most-used word, label left and count right. */
export const WordBars: React.FC<{ words: ReadonlyArray<{ label: string; count: number }> }> = ({ words }) => {
  const most = Math.max(1, ...words.map(w => w.count));
  return (
    <View style={{ gap: 10 }}>
      {words.map(w => (
        <View key={w.label} style={[iepStyles.row, { gap: 14 }]} accessible accessibilityLabel={`${w.label}: ${w.count}`}>
          <Text style={[iepStyles.body, { fontWeight: '600', width: 78 }]} numberOfLines={1}>
            {w.label}
          </Text>
          <View style={{ flex: 1 }}>
            <MeterBar fraction={w.count / most} color={iepColors.blue} height={11} />
          </View>
          <Text style={[iepStyles.body, { fontWeight: '700', minWidth: 36, textAlign: 'right' }]}>{w.count}</Text>
        </View>
      ))}
    </View>
  );
};
