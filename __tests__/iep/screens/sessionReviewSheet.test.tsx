/**
 * The review sheet's AI request is tied to the session it was made for: a reply that lands
 * after "Review later" or Finalize never touches the sheet now showing another session,
 * still labels a postponed session for when it is reopened, and leaves a finalized
 * session alone.
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ActivityIndicator } from 'react-native';

const mockTrack = jest.fn();
jest.mock('../../../src/utils/mixpanelInstance', () => ({
  __esModule: true,
  default: { track: (...args: unknown[]) => mockTrack(...args) },
}));
jest.mock('../../../src/utils/persistance', () => ({
  useAppSettings: () => ({ preferences: {}, setItem: jest.fn() }),
}));

type Reply = { results: Array<Record<string, unknown>>; source: string; model: string | null };
type Deferred = { resolve: (reply: Reply) => void; reject: (error: unknown) => void };
const mockPending: Deferred[] = [];
const mockRequest = jest.fn(() => new Promise<Reply>((resolve, reject) => mockPending.push({ resolve, reject })));
jest.mock('../../../src/features/iep/ai/iepAiClient', () => ({
  requestEventAnalysis: () => mockRequest(),
}));

import { IEP_EVENTS } from '../../../src/features/iep/analytics/iepAnalytics';
import { IepStoreProvider, useIepStore } from '../../../src/features/iep/hooks/IepStoreProvider';
import { IepMeasurementStore, MemoryPersistence } from '../../../src/features/iep/store';
import { SessionReviewSheet } from '../../../src/features/iep/ui/SessionSheets';

const READY_MESSAGE = 'AI suggestions are ready';

let store!: IepMeasurementStore;
const Probe: React.FC = () => {
  store = useIepStore().store;
  return null;
};

async function flush() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

async function renderSheet() {
  const onClose = jest.fn();
  const persistence = new MemoryPersistence();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  const show = async (sessionId: string | null) => {
    const element = (
      <IepStoreProvider persistence={persistence}>
        <Probe />
        <SessionReviewSheet sessionId={sessionId} onClose={onClose} />
      </IepStoreProvider>
    );
    await act(async () => {
      if (renderer) {
        renderer.update(element);
      } else {
        renderer = ReactTestRenderer.create(element);
      }
    });
    await flush();
  };
  await show(null);
  const texts = () => renderer.root.findAll(n => String(n.type) === 'Text' && typeof n.props.children !== 'undefined').map(n => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children)));
  const spinning = () => renderer.root.findAllByType(ActivityIndicator).length > 0;
  const press = (label: string) => {
    const node = renderer.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && n.findAll(c => String(c.type) === 'Text' && c.props.children === label).length > 0)[0];
    expect(node).toBeDefined();
    act(() => node.props.onPress());
  };
  return { show, onClose, texts, spinning, press, unmount: () => act(() => renderer.unmount()) };
}

/** One played sentence, then the session is stopped for review. */
function stoppedSession(): string {
  let id!: string;
  act(() => {
    store.startSession();
    const sentence = store.recordWordSelection({ word: 'more', pageId: 'core' });
    store.completeSentence(sentence, ['more'], 'play');
    id = store.stopActiveSessionForReview()!;
  });
  return id;
}

const providerReply = (sessionId: string): Reply => ({
  results: store.communications.filter(c => c.sessionId === sessionId).map(c => ({ eventId: c.id, status: 'ok', communicationFunction: 'request', communicationFunctionConfidence: 0.9 })),
  source: 'provider',
  model: 'gemini',
});

const functionSources = (sessionId: string) => store.communications.filter(c => c.sessionId === sessionId).map(c => c.analysis.functionSource);

beforeEach(() => {
  mockTrack.mockClear();
  mockRequest.mockClear();
  mockPending.length = 0;
});

describe('SessionReviewSheet AI reply', () => {
  it('shows the reply for the session that is open', async () => {
    const sheet = await renderSheet();
    const a = stoppedSession();
    await sheet.show(a);
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(sheet.spinning()).toBe(true);

    await act(async () => mockPending[0].resolve(providerReply(a)));
    expect(sheet.spinning()).toBe(false);
    expect(sheet.texts().some(t => t.includes(READY_MESSAGE))).toBe(true);
    expect(functionSources(a)).toEqual(['ai']);
  });

  it('ignores a late reply for a postponed session while another session is under review', async () => {
    const sheet = await renderSheet();
    const a = stoppedSession();
    await sheet.show(a);
    sheet.press('Review later');
    expect(sheet.onClose).toHaveBeenCalledTimes(1);
    await sheet.show(null);

    const b = stoppedSession();
    await sheet.show(b);
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(sheet.spinning()).toBe(true);

    await act(async () => mockPending[0].resolve(providerReply(a)));
    // B is still waiting for its own classifier; nothing from A's reply is shown.
    expect(sheet.spinning()).toBe(true);
    expect(sheet.texts().some(t => t.includes(READY_MESSAGE))).toBe(false);
    // The postponed session keeps the labels for when it is reopened.
    expect(functionSources(a)).toEqual(['ai']);
    expect(functionSources(b)).toEqual(['ruleBased']);

    sheet.press('Review later');
    const postponed = mockTrack.mock.calls.filter(([name]) => name === IEP_EVENTS.SESSION_REVIEW_POSTPONED).map(([, props]) => props);
    expect(postponed).toHaveLength(2);
    expect(postponed[1].ai_source).toBeNull();

    await sheet.show(null);
    await act(async () => mockPending[1].resolve(providerReply(b)));
    expect(functionSources(b)).toEqual(['ai']);
  });

  it('does not rewrite a session that was finalized before its reply arrived', async () => {
    const sheet = await renderSheet();
    const a = stoppedSession();
    await sheet.show(a);
    const sentence = store.sentences.find(s => s.sessionId === a)!;
    act(() => store.setSupportLevel(sentence.id, 'independent'));
    sheet.press('Finalize');
    expect(store.session(a)?.reviewState).toBe('finalized');
    expect(sheet.onClose).toHaveBeenCalledTimes(1);
    await sheet.show(null);

    const apply = jest.spyOn(store, 'applyAiEventAnalysis');
    await act(async () => mockPending[0].resolve(providerReply(a)));
    expect(apply).not.toHaveBeenCalled();
    expect(functionSources(a)).toEqual(['ruleBased']);
  });

  it('drops a reply that arrives after the sheet unmounted', async () => {
    const sheet = await renderSheet();
    const a = stoppedSession();
    await sheet.show(a);
    const apply = jest.spyOn(store, 'applyAiEventAnalysis');
    sheet.unmount();
    await act(async () => mockPending[0].resolve(providerReply(a)));
    // The postponed session is still labelled; only the sheet state is left alone.
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
