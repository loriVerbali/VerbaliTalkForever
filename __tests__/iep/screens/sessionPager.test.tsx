/**
 * The Evidence tab's session picker: every session is reachable, the arrows step through
 * neighbours and stop at the ends, and the arrows are full-size touch targets.
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ScrollView } from 'react-native';
import { PAGER_ARROW_SIZE, SessionPager } from '../../../src/features/iep/ui/SessionPager';

const SESSIONS = Array.from({ length: 8 }, (_, i) => ({ id: `s${i + 1}`, label: `Week ${i + 1} · Jan ${i + 1}` }));

function render(selectedId: string | null, onSelect = jest.fn()) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(<SessionPager sessions={SESSIONS} selectedId={selectedId} onSelect={onSelect} />);
  });
  const button = (label: string) => tree.root.find(n => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  return { tree, onSelect, button };
}

describe('SessionPager', () => {
  it('renders a chip for every session, not just the three nearest', () => {
    const { button } = render('s8');
    SESSIONS.forEach(s => expect(button(s.label)).toBeTruthy());
    expect(button('Week 8 · Jan 8').props.accessibilityState.selected).toBe(true);
    expect(button('Week 1 · Jan 1').props.accessibilityState.selected).toBe(false);
  });

  it('puts the chips in a horizontal scroll strip', () => {
    const { tree } = render('s4');
    const strip = tree.root.findByType(ScrollView);
    expect(strip.props.horizontal).toBe(true);
  });

  it('tapping a chip selects that session', () => {
    const { button, onSelect } = render('s4');
    act(() => button('Week 7 · Jan 7').props.onPress());
    expect(onSelect).toHaveBeenCalledWith('s7');
  });

  it('arrows step to the neighbouring session and stop at the ends', () => {
    const middle = render('s4');
    act(() => middle.button('Previous session').props.onPress());
    expect(middle.onSelect).toHaveBeenLastCalledWith('s3');
    act(() => middle.button('Next session').props.onPress());
    expect(middle.onSelect).toHaveBeenLastCalledWith('s5');

    const first = render('s1');
    expect(first.button('Previous session').props.disabled).toBe(true);
    expect(first.button('Next session').props.disabled).toBe(false);

    const last = render('s8');
    expect(last.button('Next session').props.disabled).toBe(true);
    expect(last.button('Previous session').props.disabled).toBe(false);
  });

  it('arrows are at least 44 points square with extra hit slop', () => {
    const { button } = render('s4');
    for (const label of ['Previous session', 'Next session']) {
      const arrow = button(label);
      expect(PAGER_ARROW_SIZE).toBeGreaterThanOrEqual(44);
      expect(arrow.props.style.width).toBe(PAGER_ARROW_SIZE);
      expect(arrow.props.style.height).toBe(PAGER_ARROW_SIZE);
      expect(arrow.props.hitSlop.left).toBeGreaterThan(0);
    }
  });

  it('scrolls the selected chip into view once it has been laid out', () => {
    const { tree } = render('s6');
    const strip = tree.root.findByType(ScrollView);
    const scrollTo = jest.fn();
    strip.instance.scrollTo = scrollTo;
    act(() => strip.props.onLayout({ nativeEvent: { layout: { width: 300 } } }));
    // The host View wrapping the selected chip (the scroll view's own host node also carries an onLayout).
    const wrapper = tree.root.findAll(n => String(n.type) === 'View' && typeof n.props.onLayout === 'function' && n.findAll(c => c.props.accessibilityLabel === 'Week 6 · Jan 6').length > 0).pop()!;
    act(() => wrapper.props.onLayout({ nativeEvent: { layout: { x: 500 } } }));
    expect(scrollTo).toHaveBeenCalledWith({ x: 400, animated: true });
  });
});
