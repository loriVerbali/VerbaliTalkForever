import fetchHelper from '../../../src/utils/fetcher';
import { requestGoalOverviewNarrative } from '../../../src/features/iep/ai/iepAiClient';

jest.mock('../../../src/utils/fetcher', () => ({ __esModule: true, default: jest.fn() }));

const mockedFetch = fetchHelper as jest.MockedFunction<typeof fetchHelper>;

const facts = {
  metrics: { completed_sessions: 2 },
  sessions: [
    { session_id: 'S1', date: '2026-09-01', result: 4, target: 5 },
    { session_id: 'S2', date: '2026-09-03', result: 5, target: 5 },
  ],
};

describe('requestGoalOverviewNarrative', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('falls back to the local narrative when the request never settles', async () => {
    jest.useFakeTimers();
    // A host that silently drops packets: the fetch layer has no timeout of its own.
    mockedFetch.mockImplementation(() => new Promise(() => {}));

    let reply: Awaited<ReturnType<typeof requestGoalOverviewNarrative>> | null = null;
    const pending = requestGoalOverviewNarrative('goal-1', facts).then(r => {
      reply = r;
    });

    await jest.advanceTimersByTimeAsync(19_999);
    expect(reply).toBeNull();

    await jest.advanceTimersByTimeAsync(1);
    await pending;

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedFetch.mock.calls[0][0]).toBe('iepDashboard');
    expect(reply).not.toBeNull();
    expect(reply!.source).toBe('local_fallback');
    expect(reply!.summary).toBe('2 completed sessions are included in this view.');
    expect(reply!.patternInsight).toBe('The session target was met in 1 of 2 recent sessions.');
  });

  it('uses the provider narrative when the request answers in time', async () => {
    mockedFetch.mockResolvedValue({
      source: 'provider',
      pattern_insight: 'Pattern from provider.',
      opportunity: 'Opportunity from provider.',
      summary: 'Summary from provider.',
    });

    const reply = await requestGoalOverviewNarrative('goal-1', facts);

    expect(reply.source).toBe('provider');
    expect(reply.patternInsight).toBe('Pattern from provider.');
    expect(reply.opportunity).toBe('Opportunity from provider.');
    expect(reply.summary).toBe('Summary from provider.');
  });
});
