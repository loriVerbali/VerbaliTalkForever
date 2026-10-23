/**
 * The goal progress chart: zero baseline, dashed amber target, blue monotone line with a
 * fading area, points green when met and blue otherwise, value labels up to 16 sessions,
 * at most six date labels. Colour is never the only signal: the legend, the point labels
 * and the interpretation sentence carry the same facts. The metric's name sits on the
 * y-axis once the chart is drawn and in the legend whenever it is not (no sessions, or
 * before layout), so the card always says what it tracks.
 *
 * Also the metric trend card: one supporting metric as a line over its sessions, the
 * y-axis padded around what was observed and labelled at both ends, weeks along the x-axis
 * and the latest value called out beside the name. Its spoken label quotes the observed
 * extremes; the padding is for the axis only.
 */

import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { MetricTrend } from '../application/details';
import { GoalProgress, formatValue } from '../application/goalProgress';
import { monthDay, weekOfYear } from '../application/reportingPeriod';
import { measuredValue } from '../core';
import { AiTag } from './primitives';
import { iepColors, iepStyles, TREND_SYMBOL, TREND_TITLE, trendColor } from './theme';

interface Point {
  sessionId: string;
  dateMs: number;
  value: number;
  met: boolean | null;
}

function monotonePath(xs: number[], ys: number[]): string {
  const n = xs.length;
  if (n === 0) {
    return '';
  }
  if (n === 1) {
    return `M ${xs[0]} ${ys[0]}`;
  }
  const dx: number[] = [];
  const dy: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx.push(xs[i + 1] - xs[i]);
    dy.push(ys[i + 1] - ys[i]);
    m.push(dx[i] === 0 ? 0 : dy[i] / dx[i]);
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i += 1) {
    t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  }
  t.push(m[n - 2]);
  let d = `M ${xs[0]} ${ys[0]}`;
  for (let i = 0; i < n - 1; i += 1) {
    const c1x = xs[i] + dx[i] / 3;
    const c1y = ys[i] + (t[i] * dx[i]) / 3;
    const c2x = xs[i + 1] - dx[i] / 3;
    const c2y = ys[i + 1] - (t[i + 1] * dx[i]) / 3;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${xs[i + 1]} ${ys[i + 1]}`;
  }
  return d;
}

export interface ProgressChartProps {
  progress: GoalProgress;
  onSelectSession?: (sessionId: string) => void;
  height?: number;
  showHeader?: boolean;
}

export const ProgressChart: React.FC<ProgressChartProps> = ({ progress, onSelectSession, height = 210, showHeader = true }) => {
  const [width, setWidth] = useState(0);
  const points: Point[] = useMemo(
    () =>
      progress.sessions
        .map(s => ({ sessionId: s.sessionId, dateMs: s.dateMs, value: measuredValue(s.result), met: s.metTarget }))
        .filter((p): p is Point => p.value !== null),
    [progress.sessions],
  );
  const target = progress.hasTarget ? (progress.target as number) : null;
  const label = progress.primaryLabel;

  const interpretation = useMemo(() => {
    if (points.length <= 1) {
      return 'More sessions are needed before a direction can be read.';
    }
    const first = points[0].value;
    const last = points[points.length - 1].value;
    const verb = last > first ? 'rose' : last < first ? 'fell' : 'held steady';
    const n = points.length;
    if (target === null) {
      return `${label} ${verb} from ${formatValue(first)} to ${formatValue(last)} across ${n} sessions. No target was stated, so this chart is for tracking only.`;
    }
    const met = points.filter(p => p.met).length;
    return `${label} ${verb} from ${formatValue(first)} to ${formatValue(last)} across ${n} sessions, meeting the target of ${formatValue(target)} in ${met}.`;
  }, [points, target, label]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const padL = 48;
  const padR = 14;
  const padT = 18;
  const padB = 26;
  const plotW = Math.max(0, width - padL - padR);
  const plotH = Math.max(0, height - padT - padB);
  const maxValue = Math.max(target ?? 0, ...points.map(p => p.value), 0);
  const upper = Math.max(1, maxValue * 1.25);
  const xFor = (i: number) => (points.length === 1 ? padL + plotW / 2 : padL + (i / (points.length - 1)) * plotW);
  const yFor = (v: number) => padT + plotH - (Math.min(v, upper) / upper) * plotH;
  const xs = points.map((_, i) => xFor(i));
  const ys = points.map(p => yFor(p.value));
  const line = monotonePath(xs, ys);
  const area = points.length > 1 ? `${line} L ${xs[xs.length - 1]} ${padT + plotH} L ${xs[0]} ${padT + plotH} Z` : '';
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  const yTicks = [0, Math.round(upper / 2), Math.round(upper)].filter((v, i, arr) => arr.indexOf(v) === i);
  const axisLabelDrawn = points.length > 0 && width > 0;

  return (
    <View style={{ gap: 10 }} accessible accessibilityLabel={`Progress per session. ${interpretation}`}>
      {showHeader ? (
        <View style={[iepStyles.row, { justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }]}>
          <Text style={iepStyles.headline}>Progress per session</Text>
          <View style={{ backgroundColor: `${trendColor(progress.trend)}1F`, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ color: trendColor(progress.trend), fontWeight: '700', fontSize: 13 }}>{TREND_SYMBOL[progress.trend]} {TREND_TITLE[progress.trend]}</Text>
          </View>
        </View>
      ) : null}
      {points.length === 0 ? (
        <View style={{ minHeight: 120, justifyContent: 'center' }}>
          <Text style={iepStyles.subtle}>No session results to chart yet.</Text>
        </View>
      ) : (
        <View onLayout={onLayout} style={{ height }}>
          {width > 0 ? (
            <Svg width={width} height={height}>
              <Defs>
                <LinearGradient id="iepArea" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={iepColors.blue} stopOpacity={0.22} />
                  <Stop offset="1" stopColor={iepColors.blue} stopOpacity={0.01} />
                </LinearGradient>
              </Defs>
              <SvgText
                x={11}
                y={padT + plotH / 2}
                fontSize={10}
                fontWeight="600"
                fill={iepColors.muted}
                textAnchor="middle"
                transform={`rotate(-90 11 ${padT + plotH / 2})`}>
                {label}
              </SvgText>
              {yTicks.map(v => (
                <React.Fragment key={`y${v}`}>
                  <Line x1={padL} x2={padL + plotW} y1={yFor(v)} y2={yFor(v)} stroke={iepColors.border} strokeWidth={0.75} />
                  <SvgText x={padL - 6} y={yFor(v) + 4} fontSize={10} fill={iepColors.muted} textAnchor="end">{String(v)}</SvgText>
                </React.Fragment>
              ))}
              {target !== null ? (
                <Line x1={padL} x2={padL + plotW} y1={yFor(target)} y2={yFor(target)} stroke={iepColors.amber} strokeWidth={1.5} strokeDasharray="6 5" />
              ) : null}
              {area ? <Path d={area} fill="url(#iepArea)" /> : null}
              {points.length > 1 ? <Path d={line} stroke={iepColors.blue} strokeWidth={3} strokeLinecap="round" fill="none" /> : null}
              {points.map((p, i) => (
                <React.Fragment key={p.sessionId}>
                  <Circle
                    cx={xs[i]}
                    cy={ys[i]}
                    r={points.length > 16 ? 3.5 : 5.5}
                    fill={p.met ? iepColors.green : iepColors.blue}
                    onPress={onSelectSession ? () => onSelectSession(p.sessionId) : undefined}
                  />
                  {points.length <= 16 ? (
                    <SvgText x={xs[i]} y={ys[i] - 9} fontSize={10} fontWeight="700" fill={p.met ? iepColors.green : iepColors.blue} textAnchor="middle">
                      {formatValue(p.value)}{p.met ? ' ✓' : ''}
                    </SvgText>
                  ) : null}
                  {i % labelEvery === 0 || i === points.length - 1 ? (
                    <SvgText x={xs[i]} y={height - 8} fontSize={10} fill={iepColors.muted} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>
                      {monthDay(p.dateMs)}
                    </SvgText>
                  ) : null}
                </React.Fragment>
              ))}
            </Svg>
          ) : null}
        </View>
      )}
      <View style={[iepStyles.rowWrap, { gap: 14 }]}>
        {axisLabelDrawn ? null : <Text style={iepStyles.caption}>{label}</Text>}
        {target !== null ? (
          <>
            <Text style={[iepStyles.caption, { color: iepColors.green }]}>● Met target</Text>
            <Text style={[iepStyles.caption, { color: iepColors.blue }]}>● Below target</Text>
            <Text style={[iepStyles.caption, { color: iepColors.amber }]}>▬ Goal threshold {formatValue(target)}</Text>
          </>
        ) : (
          <Text style={iepStyles.caption}>Tracking only · no target set</Text>
        )}
      </View>
      <Text style={iepStyles.caption}>{interpretation}</Text>
    </View>
  );
};

const DAY = 86_400_000;

/**
 * Padded around the observed range rather than anchored at zero, so a real 10 → 11 move
 * stays visible. Counts cannot be negative, so the axis never claims a value below zero
 * for them.
 */
export function trendRange(values: readonly number[]): [number, number] {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const pad = high > low ? (high - low) * 0.35 : 1;
  const floor = low >= 0 ? Math.max(0, low - pad) : low - pad;
  return [floor, high + pad];
}

/** Sunday midnights inside the span, thinned to at most five. The span's start when it holds none. */
export function weekTicks(startMs: number, endMs: number): number[] {
  const cursor = new Date(startMs);
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() - cursor.getDay());
  const ticks: number[] = [];
  while (cursor.getTime() <= endMs) {
    if (cursor.getTime() >= startMs) {
      ticks.push(cursor.getTime());
    }
    cursor.setDate(cursor.getDate() + 7);
  }
  if (ticks.length === 0) {
    return [startMs];
  }
  const step = Math.ceil(ticks.length / 5);
  return ticks.filter((_, i) => i % step === 0);
}

/**
 * One supporting metric over its sessions. A metric that cannot be produced, is awaiting
 * analysis or recorded nothing says so instead of drawing: a flat line at zero for absent
 * data is the same wrong claim as a zero in the count.
 */
export const MetricTrendCard: React.FC<{ trend: MetricTrend; height?: number }> = ({ trend, height = 120 }) => {
  const [width, setWidth] = useState(0);
  const { points, targetLine } = trend;
  const latest = points.length > 0 ? points[points.length - 1].value : null;
  const latestText = latest === null ? '—' : formatValue(latest);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const padL = 34;
  const padR = 10;
  const padT = 8;
  const padB = 20;
  const plotW = Math.max(0, width - padL - padR);
  const plotH = Math.max(0, height - padT - padB);

  const values = points.map(p => p.value);
  const [low, high] = trendRange([...values, ...(targetLine !== null ? [targetLine] : [])]);
  let startMs = points.length > 0 ? Math.min(...points.map(p => p.dateMs)) : 0;
  let endMs = points.length > 0 ? Math.max(...points.map(p => p.dateMs)) : 0;
  if (endMs <= startMs) {
    startMs -= 3.5 * DAY;
    endMs += 3.5 * DAY;
  }
  const xFor = (ms: number) => padL + ((ms - startMs) / (endMs - startMs)) * plotW;
  const yFor = (v: number) => padT + plotH - ((v - low) / (high - low)) * plotH;
  const xs = points.map(p => xFor(p.dateMs));
  const ys = points.map(p => yFor(p.value));
  const ticks = weekTicks(startMs, endMs);

  // What was observed, not the padded axis: "between 6 and 8" would misreport a lone 7.
  const observedLow = Math.min(...values);
  const observedHigh = Math.max(...values);
  const spread = observedLow === observedHigh ? `at ${formatValue(observedLow)}` : `between ${formatValue(observedLow)} and ${formatValue(observedHigh)}`;
  const label =
    trend.unavailableReason !== null
      ? `${trend.name}: ${trend.unavailableReason}`
      : `${trend.name}: latest ${latestText} ${trend.unit}, ${points.length} ${points.length === 1 ? 'session' : 'sessions'} ${spread}`;

  return (
    <View style={[iepStyles.innerCard, { flex: 1, minWidth: 240, gap: 12 }]} accessible accessibilityLabel={label}>
      <View style={[iepStyles.row, { justifyContent: 'space-between', gap: 8 }]}>
        <View style={[iepStyles.row, { gap: 8, flexShrink: 1 }]}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: iepColors.muted, flexShrink: 1 }}>{trend.name}</Text>
          {trend.usesAi ? <AiTag /> : null}
        </View>
        <Text style={{ fontSize: 22, fontWeight: '800', color: iepColors.ink }}>{latestText}</Text>
      </View>
      {trend.unavailableReason !== null ? (
        <Text style={[iepStyles.caption, { color: iepColors.amber, fontWeight: '600' }]}>⚠ {trend.unavailableReason}</Text>
      ) : (
        <View onLayout={onLayout} style={{ height }}>
          {width > 0 ? (
            <Svg width={width} height={height}>
              {[high, low].map(v => (
                <React.Fragment key={`y${v}`}>
                  <Line x1={padL} x2={width - padR} y1={yFor(v)} y2={yFor(v)} stroke={iepColors.border} strokeWidth={0.75} />
                  <SvgText x={0} y={yFor(v) + 4} fontSize={10} fill={iepColors.muted} textAnchor="start">{formatValue(v)}</SvgText>
                </React.Fragment>
              ))}
              {targetLine !== null ? (
                <Line x1={padL} x2={width - padR} y1={yFor(targetLine)} y2={yFor(targetLine)} stroke={iepColors.amber} strokeWidth={1.5} strokeDasharray="6 5" />
              ) : null}
              {points.length > 1 ? (
                <Path d={monotonePath(xs, ys)} stroke={iepColors.blue} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              ) : (
                <Circle cx={xs[0]} cy={ys[0]} r={4} fill={iepColors.blue} />
              )}
              {ticks.map(ms => {
                const x = xFor(ms);
                const anchor = x < padL + 12 ? 'start' : x > width - padR - 12 ? 'end' : 'middle';
                return (
                  <SvgText key={`w${ms}`} x={x} y={height - 6} fontSize={10} fill={iepColors.muted} textAnchor={anchor}>{`W${weekOfYear(ms)}`}</SvgText>
                );
              })}
            </Svg>
          ) : null}
        </View>
      )}
    </View>
  );
};
