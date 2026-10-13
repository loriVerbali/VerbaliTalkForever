/**
 * The constant tiles under "What explains this goal": what each says with data, what it
 * asks for without, and how far each bar fills its track.
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { BuildTimeChange } from '../../../src/features/iep/application/details';
import {
  BarListTile,
  BuildTimeChangeTile,
  DURATIONS_TITLE,
  LongestRunTile,
  SHARES_TITLE,
  ShiftTile,
  WordBars,
  durationRows,
  shareRows,
} from '../../../src/features/iep/ui/ExplainTiles';

/** Weekly Monday sessions from 29 June 2026. */
const day = (n: number) => new Date(2026, 5, 29 + 7 * n, 10).getTime();

function render(element: React.ReactElement) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(element);
  });
  const text = () => {
    const out: string[] = [];
    const walk = (node: ReactTestRenderer.ReactTestRendererNode | ReactTestRenderer.ReactTestRendererNode[] | null) => {
      if (node === null) {
        return;
      }
      if (Array.isArray(node)) {
        node.forEach(walk);
      } else if (typeof node === 'string') {
        out.push(node);
      } else if (node.children) {
        walk(node.children);
      }
    };
    walk(tree.toJSON());
    return out.join('');
  };
  /** Host-level labels only, so a composite and its host View are not counted twice. */
  const labels = () => tree.root.findAll(n => typeof n.type === 'string' && n.props.accessible === true && typeof n.props.accessibilityLabel === 'string').map(n => n.props.accessibilityLabel as string);
  const button = (label: string) => tree.root.find(n => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  const buttonWithText = (label: string) =>
    tree.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function').find(n => n.findAll(t => t.props.children === label).length > 0);
  const fills = () => tree.root.findAll(n => typeof n.type === 'string' && n.props.testID === 'meter-fill').map(n => String(n.props.style.width));
  return { tree, text, labels, button, buttonWithText, fills };
}

describe('LongestRunTile', () => {
  it('shows the run, its dates and that it is still going', () => {
    const { text, labels } = render(<LongestRunTile streak={{ length: 12, startMs: day(0), endMs: day(11) }} currentStreak={12} latestSessionMs={day(11)} />);
    expect(text()).toContain('12 sessions');
    expect(text()).toContain('Jun 29 – Sep 14');
    expect(text()).toContain('That run is still going.');
    expect(labels()[0]).toBe('Longest run of successful sessions: 12 sessions, Jun 29 – Sep 14. That run is still going.');
  });

  it('gives the current run when the longest one ended', () => {
    const { text } = render(<LongestRunTile streak={{ length: 4, startMs: day(0), endMs: day(3) }} currentStreak={1} latestSessionMs={day(5)} />);
    expect(text()).toContain('4 sessions');
    expect(text()).toContain('Current run: 1.');
  });

  it('does not call an earlier run still going when the current run merely ties it', () => {
    // Met Jun 29 - Jul 13, missed Jul 20, met Aug 3 - 17: longestStreak keeps the earlier run.
    const { text, labels } = render(<LongestRunTile streak={{ length: 3, startMs: day(0), endMs: day(2) }} currentStreak={3} latestSessionMs={day(6)} />);
    expect(text()).toContain('3 sessions');
    expect(text()).toContain('Jun 29 – Jul 13');
    expect(text()).toContain('Current run: 3.');
    expect(text()).not.toContain('still going');
    expect(labels()[0]).toBe('Longest run of successful sessions: 3 sessions, Jun 29 – Jul 13. Current run: 3.');
  });

  it('says so when no session has met the target', () => {
    const { text, labels } = render(<LongestRunTile streak={null} currentStreak={0} latestSessionMs={null} />);
    expect(text()).toContain('No session at target yet.');
    expect(labels()[0]).toBe('Longest run of successful sessions: No session at target yet.');
  });
});

describe('ShiftTile', () => {
  it('reads the earlier and recent averages and the direction between them', () => {
    const { text, labels } = render(<ShiftTile title="Average words per sentence" shift={{ from: 2.1, to: 2.3 }} unit="words" />);
    expect(text()).toContain('2.1');
    expect(text()).toContain('2.3');
    expect(text()).toContain('Improving');
    expect(text()).toContain('across the period, in words');
    expect(labels()[0]).toBe('Average words per sentence: 2.1 to 2.3 words across the period, improving');
  });

  it('judges the direction on the figures shown', () => {
    expect(render(<ShiftTile title="T" shift={{ from: 2.14, to: 2.1 }} unit="words" />).text()).toContain('No change');
    expect(render(<ShiftTile title="T" shift={{ from: 26, to: 23.2 }} unit="words" />).text()).toContain('Declining');
  });

  it('asks for two sessions when there is nothing to compare', () => {
    const { text, labels } = render(<ShiftTile title="Average words per session" shift={null} unit="words" />);
    expect(text()).toContain('Needs two measured sessions.');
    expect(labels()[0]).toBe('Average words per session: Needs two measured sessions.');
  });
});

describe('BuildTimeChangeTile', () => {
  const changes: BuildTimeChange[] = [
    { label: '1 word', earlierSeconds: 2.2, recentSeconds: 2.4, earlierCount: 29, recentCount: 24, percentChange: 9 },
    { label: '2 words', earlierSeconds: 5, recentSeconds: 4, earlierCount: 10, recentCount: 8, percentChange: -20 },
  ];

  it('starts on the first length and switches from the menu', () => {
    const { text, labels, button, buttonWithText } = render(<BuildTimeChangeTile changes={changes} />);
    expect(text()).toContain('9% slower');
    expect(text()).toContain('29 sentences earlier, 24 recently');
    expect(labels().find(l => l.startsWith('Change in time'))).toBe('Change in time to build a sentence, 1 word: 2s earlier to 2s recently, 9% slower. 29 sentences earlier, 24 recently.');
    act(() => button('Sentence length: 1 word').props.onPress());
    const option = buttonWithText('2 words');
    expect(option).toBeDefined();
    act(() => option!.props.onPress());
    expect(text()).toContain('20% faster');
    expect(text()).toContain('10 sentences earlier, 8 recently');
    expect(button('Sentence length: 2 words')).toBeTruthy();
  });

  it('offers no menu for a single length and says no change at equal means', () => {
    const { text, tree } = render(<BuildTimeChangeTile changes={[{ ...changes[0], recentSeconds: 2.2, percentChange: 0 }]} />);
    expect(text()).toContain('No change');
    expect(tree.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')).toHaveLength(0);
  });

  it('states what it needs without enough timed sentences', () => {
    const { text } = render(<BuildTimeChangeTile changes={[]} />);
    expect(text()).toContain('Needs eight timed sentences');
  });
});

describe('BarListTile', () => {
  it('fills each share bar to its percentage and prints the value', () => {
    const rows = shareRows([
      { label: '1 word', count: 36, percent: 36 },
      { label: '2 words', count: 23, percent: 23 },
      { label: '3+ words', count: 41, percent: 41 },
    ]);
    const { text, fills, labels } = render(<BarListTile title={SHARES_TITLE} rows={rows} color="#306EE0" emptyText="No sentences recorded yet." />);
    expect(fills()).toEqual(['36%', '23%', '41%']);
    expect(text()).toContain('36%');
    expect(labels()[0]).toBe('Sentence length distribution: 1 word 36%, 2 words 23%, 3+ words 41%');
  });

  it('scales build times to the slowest length and shows each sample count', () => {
    const rows = durationRows([
      { label: '1 word', averageSeconds: 2.4, count: 53 },
      { label: '4+ words', averageSeconds: 8, count: 25 },
    ]);
    expect(rows.map(r => [r.valueText, r.detail, r.fraction])).toEqual([
      ['2s', '(53)', 0.3],
      ['8s', '(25)', 1],
    ]);
    const { fills, labels } = render(<BarListTile title={DURATIONS_TITLE} rows={rows} color="#149E8F" emptyText="Needs three timed sentences of one length." />);
    expect(fills().map(parseFloat)).toEqual([30, 100]);
    expect(labels()[0]).toBe('Average time to build by sentence length: 1 word 2s (53), 4+ words 8s (25)');
  });

  it('shows the empty text in place of bars', () => {
    const { text, fills, labels } = render(<BarListTile title={SHARES_TITLE} rows={[]} color="#306EE0" emptyText="No sentences recorded yet." />);
    expect(fills()).toEqual([]);
    expect(text()).toContain('No sentences recorded yet.');
    expect(labels()[0]).toBe('Sentence length distribution: No sentences recorded yet.');
  });
});

describe('WordBars', () => {
  it('draws each word against the most-used one', () => {
    const { fills, labels, text } = render(<WordBars words={[{ label: 'Music', count: 538 }, { label: 'Park', count: 53 }]} />);
    expect(fills().map(parseFloat)[0]).toBe(100);
    expect(fills().map(parseFloat)[1]).toBeCloseTo(9.85, 1);
    expect(labels()).toEqual(['Music: 538', 'Park: 53']);
    expect(text()).toContain('538');
  });
});
