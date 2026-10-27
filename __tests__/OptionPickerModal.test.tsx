/**
 * @format
 */
import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import OptionPickerModal from '../src/Components/OptionPickerModal';

const FAMILY = [
  'Mom',
  'Dad',
  'Sister',
  'Brother',
  'Son',
  'Daughter',
  'Grandpa',
  'Grandma',
  'Uncle',
  'Aunt',
  'Cousin',
  'Nephew',
  'Niece',
  'Grandchild',
  'Other',
];

const render = (overrides: Partial<React.ComponentProps<typeof OptionPickerModal>> = {}) => {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <OptionPickerModal
        visible
        title="Select Relationship"
        options={FAMILY}
        onSelect={onSelect}
        onClose={onClose}
        {...overrides}
      />,
    );
  });
  return {renderer, onSelect, onClose};
};

describe('OptionPickerModal', () => {
  it('renders every option, not just the first three', () => {
    const {renderer} = render();
    const texts = renderer.root.findAllByType(Text).map(t => t.props.children);
    FAMILY.forEach(option => expect(texts).toContain(option));
    expect(texts).toContain('Select Relationship');
    expect(texts).toContain('Cancel');
  });

  it('reports the tapped option', () => {
    const {renderer, onSelect, onClose} = render();
    act(() => {
      renderer.root.findByProps({testID: 'option-picker-item-Grandchild'}).props.onPress();
    });
    expect(onSelect).toHaveBeenCalledWith('Grandchild');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on cancel and on backdrop tap without selecting', () => {
    const {renderer, onSelect, onClose} = render();
    act(() => {
      renderer.root.findByProps({testID: 'option-picker-cancel'}).props.onPress();
    });
    act(() => {
      renderer.root.findByProps({testID: 'option-picker-backdrop'}).props.onPress();
    });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('marks the current value as selected', () => {
    const {renderer} = render({selected: 'Sister'});
    const sister = renderer.root.findByProps({testID: 'option-picker-item-Sister'});
    const mom = renderer.root.findByProps({testID: 'option-picker-item-Mom'});
    expect(sister.props.accessibilityState).toEqual({selected: true});
    expect(mom.props.accessibilityState).toEqual({selected: false});
  });
});
