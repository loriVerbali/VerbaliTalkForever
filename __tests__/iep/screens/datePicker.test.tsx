/**
 * The calendar that replaces typed dates: the month grid, day selection, range limits
 * and month navigation.
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { monthWeeks } from '../../../src/features/iep/application/reportingPeriod';
import { Calendar } from '../../../src/features/iep/ui/DatePicker';

const day = (y: number, m: number, d: number) => new Date(y, m, d).getTime();

function render(props: Partial<React.ComponentProps<typeof Calendar>> & { onChange?: jest.Mock }) {
  const onChange = props.onChange ?? jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(<Calendar valueMs={day(2026, 8, 17)} {...props} onChange={onChange} />);
  });
  const button = (label: string) => tree.root.find(n => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  return { tree, onChange, button };
}

describe('monthWeeks', () => {
  it('pads a month into whole Sunday-first weeks', () => {
    // September 2026 starts on a Tuesday and has 30 days.
    const weeks = monthWeeks(2026, 8);
    expect(weeks[0]).toEqual([null, null, 1, 2, 3, 4, 5]);
    expect(weeks[weeks.length - 1]).toEqual([27, 28, 29, 30, null, null, null]);
    expect(weeks.every(w => w.length === 7)).toBe(true);
  });

  it('handles a leap February', () => {
    expect(monthWeeks(2028, 1).flat().filter(d => d !== null)).toHaveLength(29);
  });
});

describe('Calendar', () => {
  it('marks the current value and reports a tapped day as local midnight', () => {
    const { button, onChange } = render({});
    expect(button('Sep 17, 2026').props.accessibilityState.selected).toBe(true);
    act(() => button('Sep 3, 2026').props.onPress());
    expect(onChange).toHaveBeenCalledWith(day(2026, 8, 3));
  });

  it('disables days outside the allowed range', () => {
    const { button } = render({ minMs: day(2026, 8, 10), maxMs: day(2026, 8, 20) + 5000 });
    expect(button('Sep 9, 2026').props.disabled).toBe(true);
    expect(button('Sep 10, 2026').props.disabled).toBe(false);
    expect(button('Sep 20, 2026').props.disabled).toBe(false);
    expect(button('Sep 21, 2026').props.disabled).toBe(true);
    expect(button('Previous month').props.disabled).toBe(true);
    expect(button('Next month').props.disabled).toBe(true);
  });

  it('moves between months, across a year boundary', () => {
    const { button } = render({ valueMs: day(2026, 11, 15) });
    act(() => button('Next month').props.onPress());
    expect(button('Jan 1, 2027')).toBeTruthy();
    act(() => button('Previous month').props.onPress());
    act(() => button('Previous month').props.onPress());
    expect(button('Nov 30, 2026')).toBeTruthy();
  });
});
