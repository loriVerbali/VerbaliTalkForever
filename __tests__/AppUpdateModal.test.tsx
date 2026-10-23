/**
 * @format
 */
import React from 'react';
import {Alert, Linking} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AppUpdateModal, {openStoreUrl} from '../src/Components/AppUpdateModal';
import type {DisplayableUpdatePolicy} from '../src/types/appUpdate';

const policy: DisplayableUpdatePolicy = {
  importance: 'important',
  title: 'An important update is available',
  message: 'Please update Matalk to get the latest improvements.',
  storeUrl: 'https://apps.apple.com/app/id0000000000',
  minimumPopupBuild: 33,
  latestBuild: 35,
  installedBuild: 31,
};

const flush = () => new Promise<void>(resolve => setImmediate(() => resolve()));

const findByTestId = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
  root.findByProps({testID: id});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AppUpdateModal', () => {
  it('renders the database-provided title and message', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <AppUpdateModal visible policy={policy} onClose={() => {}} />,
      );
    });
    const texts = renderer.root
      .findAllByType(require('react-native').Text)
      .map(t => t.props.children);
    expect(texts).toContain(policy.title);
    expect(texts).toContain(policy.message);
    expect(texts).toContain('Update now');
    expect(texts).toContain('Not now');
  });

  it('renders nothing without a policy', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <AppUpdateModal visible policy={null} onClose={() => {}} />,
      );
    });
    expect(renderer.toJSON()).toBeNull();
  });

  it('opens the configured store URL and closes on "Update now"', async () => {
    const onClose = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <AppUpdateModal visible policy={policy} onClose={onClose} />,
      );
    });
    await act(async () => {
      findByTestId(
        renderer.root,
        'app-update-modal-update-now',
      ).props.onPress();
      await flush();
    });
    expect(Linking.openURL).toHaveBeenCalledWith(policy.storeUrl);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('handles failure to open the store URL without crashing', async () => {
    (Linking.openURL as jest.Mock).mockRejectedValue(new Error('boom'));
    const onClose = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <AppUpdateModal visible policy={policy} onClose={onClose} />,
      );
    });
    await act(async () => {
      findByTestId(
        renderer.root,
        'app-update-modal-update-now',
      ).props.onPress();
      await flush();
    });
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows a fallback when the URL is not supported', async () => {
    (Linking.canOpenURL as jest.Mock).mockResolvedValue(false);
    expect(await openStoreUrl('notaurl')).toBe(false);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('"Not now" dismisses the modal', () => {
    const onClose = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <AppUpdateModal visible policy={policy} onClose={onClose} />,
      );
    });
    act(() => {
      findByTestId(renderer.root, 'app-update-modal-not-now').props.onPress();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('exposes accessible buttons with large touch targets', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <AppUpdateModal visible policy={policy} onClose={() => {}} />,
      );
    });
    const update = findByTestId(renderer.root, 'app-update-modal-update-now');
    const notNow = findByTestId(renderer.root, 'app-update-modal-not-now');
    expect(update.props.accessibilityRole).toBe('button');
    expect(update.props.accessibilityLabel).toBe('Update now');
    expect(notNow.props.accessibilityLabel).toBe('Not now');
    const flat = (s: any) => Object.assign({}, ...[].concat(s));
    expect(flat(update.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(flat(notNow.props.style).minHeight).toBeGreaterThanOrEqual(44);
  });
});
