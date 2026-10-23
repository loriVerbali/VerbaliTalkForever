/**
 * The metric trend card: a supporting metric as a line over its sessions, the padded
 * range labelled at both ends, weeks along the bottom and the latest value beside the name.
 * Its spoken label quotes what was observed, not the padded axis.
 *
 * Also the progress chart's metric name: on the y-axis once drawn, in plain text until then.
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { GoalProgress, MetricTrend, formatValue } from '../../../src/features/iep/application';
import { MetricTrendCard, ProgressChart, trendRange, weekTicks } from '../../../src/features/iep/ui/ProgressChart';
import { fixtureProgress } from '../export/helpers';

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  const host = (name: string) => (props: any) => React.createElement(View, { ...props, testID: name }, props.children);
  return {
    __esModule: true,
    default: host('Svg'),
    Svg: host('Svg'),
    Circle: host('Circle'),
    Defs: host('Defs'),
    Line: host('Line'),
    LinearGradient: host('LinearGradient'),
    Path: host('Path'),
    Stop: host('Stop'),
    Text: (props: any) => React.createElement(Text, { ...props, testID: 'SvgText' }, props.children),
  };
});

const DAY = 86_400_000;
/** Weekly Monday sessions from 22 June 2026. */
const day = (n: number) => new Date(2026, 5, 22 + 7 * n, 10).getTime();

function trend(overrides: Partial<MetricTrend> = {}): MetricTrend {
  return {
    key: 'total_sentences',
    name: 'Total sentences per session',
    unit: 'sentences',
    usesAi: false,
    targetLine: null,
    unavailableReason: null,
    points: [11, 11, 12, 11, 12].map((value, i) => ({ sessionId: `S${i + 1}`, dateMs: day(i), value })),
    ...overrides,
  };
}

function render(t: MetricTrend, width = 320) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(<MetricTrendCard trend={t} />);
  });
  const plot = tree.root.findAll(n => typeof n.props.onLayout === 'function')[0];
  if (plot) {
    act(() => plot.props.onLayout({ nativeEvent: { layout: { width, height: 120 } } }));
  }
  const hosts = (id: string) => tree.root.findAll(n => typeof n.type === 'string' && n.props.testID === id);
  const svgTexts = () => hosts('SvgText').map(n => String(n.props.children));
  const card = tree.root.findAll(n => n.props.accessible === true && typeof n.props.accessibilityLabel === 'string')[0];
  return { tree, hosts, svgTexts, card };
}

/** The progress chart before any layout; `layout` gives it a width so the SVG can draw. */
function mountChart(progress: GoalProgress) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(<ProgressChart progress={progress} />);
  });
  const layout = (width: number) => {
    const plot = tree.root.findAll(n => typeof n.props.onLayout === 'function')[0];
    act(() => plot.props.onLayout({ nativeEvent: { layout: { width, height: 210 } } }));
  };
  const hosts = (id: string) => tree.root.findAll(n => typeof n.type === 'string' && n.props.testID === id);
  /** Host Text nodes outside the SVG whose whole content is `s`. */
  const plainTexts = (s: string) => tree.root.findAll(n => typeof n.type === 'string' && n.props.testID !== 'SvgText' && n.props.children === s);
  const svgTexts = () => hosts('SvgText').map(n => String(n.props.children));
  return { tree, layout, hosts, plainTexts, svgTexts };
}

describe('trendRange', () => {
  it('pads the observed range by 35% each side and never dips below zero for counts', () => {
    const [low, high] = trendRange([11, 12]);
    expect(low).toBeCloseTo(10.65);
    expect(high).toBeCloseTo(12.35);
    expect(trendRange([0, 0.5])[0]).toBe(0);
    expect(trendRange([3, 3])).toEqual([2, 4]);
    expect(trendRange([-2, 2])[0]).toBeCloseTo(-3.4);
  });
});

describe('weekTicks', () => {
  it('marks each Sunday inside the span, thinned to five labels at most', () => {
    expect(weekTicks(day(0), day(4)).map(ms => new Date(ms).getDate())).toEqual([28, 5, 12, 19]);
    const thinned = weekTicks(day(0), day(11));
    expect(thinned).toHaveLength(4);
    expect(new Date(thinned[0]).getDate()).toBe(28);
  });

  it('falls back to the span start when no Sunday falls inside it', () => {
    expect(weekTicks(day(0), day(0) + 2 * DAY)).toEqual([day(0)]);
  });
});

describe('MetricTrendCard', () => {
  it('calls out the latest value and labels the padded range and the weeks', () => {
    const { hosts, svgTexts, card } = render(trend());
    const [low, high] = trendRange([11, 12]);
    expect(svgTexts()).toEqual([formatValue(high), formatValue(low), 'W27', 'W28', 'W29', 'W30']);
    expect(hosts('Path')).toHaveLength(1);
    expect(hosts('Circle')).toHaveLength(0);
    expect(card.props.accessibilityLabel).toBe('Total sentences per session: latest 12 sentences, 5 sessions between 11 and 12');
  });

  it('speaks the observed extremes, not the padded axis, even when a target widens the axis', () => {
    const { card } = render(trend({ targetLine: 20 }));
    expect(card.props.accessibilityLabel).toBe('Total sentences per session: latest 12 sentences, 5 sessions between 11 and 12');
  });

  it('draws a single session as a point with its week', () => {
    const { hosts, svgTexts, card } = render(trend({ points: [{ sessionId: 'S1', dateMs: day(0), value: 7 }] }));
    expect(hosts('Circle')).toHaveLength(1);
    expect(hosts('Path')).toHaveLength(0);
    expect(svgTexts()).toEqual(['8', '6', 'W26']);
    expect(card.props.accessibilityLabel).toBe('Total sentences per session: latest 7 sentences, 1 session at 7');
  });

  it('draws the target line only when one is given', () => {
    const dashed = (hosts: (id: string) => ReactTestRenderer.ReactTestInstance[]) => hosts('Line').filter(n => n.props.strokeDasharray !== undefined);
    expect(dashed(render(trend()).hosts)).toHaveLength(0);
    expect(dashed(render(trend({ targetLine: 10 })).hosts)).toHaveLength(1);
  });

  it('says why when nothing can be drawn', () => {
    const { hosts, card, tree } = render(trend({ unavailableReason: 'Not measured by the app.', points: [] }));
    expect(hosts('Svg')).toHaveLength(0);
    expect(card.props.accessibilityLabel).toBe('Total sentences per session: Not measured by the app.');
    expect(tree.root.findAll(n => typeof n.type === 'string' && n.props.children === '—')).toHaveLength(1);
  });
});

describe('ProgressChart metric name', () => {
  const label = 'Qualifying sentences';

  it('names the tracked metric in plain text when there is nothing to chart', () => {
    const { hosts, plainTexts } = mountChart(fixtureProgress([]));
    expect(hosts('Svg')).toHaveLength(0);
    expect(plainTexts('No session results to chart yet.')).toHaveLength(1);
    expect(plainTexts(label)).toHaveLength(1);
  });

  it('names the metric in plain text until the axis can carry it', () => {
    const { layout, hosts, plainTexts, svgTexts } = mountChart(fixtureProgress([3]));
    expect(hosts('Svg')).toHaveLength(0);
    expect(plainTexts(label)).toHaveLength(1);
    layout(320);
    expect(hosts('Svg')).toHaveLength(1);
    expect(svgTexts()).toContain(label);
    expect(plainTexts(label)).toHaveLength(0);
  });
});
