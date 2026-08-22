import AppConfig from '../../../utils/config';
import { sessionManager } from '../../../utils/sessionManager';
import {
  PredictionRequest,
  PredictionResponse,
  ConversationResponse,
  UtteranceBody,
  UtteranceResponse,
} from '../state/verbiTypes';

const BASE_URL = AppConfig.baseUrl;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await sessionManager.ensureValidSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function fetchWithAbort<T>(
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, { ...init, signal });

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  if (!response.ok) {
    let errorBody: any;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = { status: response.status };
    }
    const code = errorBody?.code ?? `HTTP_${response.status}`;
    throw Object.assign(new Error(errorBody?.message ?? `Request failed: ${response.status}`), {
      code,
      status: response.status,
    });
  }

  return response.json() as Promise<T>;
}

export const verbiApi = {
  /**
   * Creates a new Verbi conversation session.
   */
  async createConversation(
    boardId: string,
    locale: string,
  ): Promise<ConversationResponse> {
    const headers = await getAuthHeaders();
    return fetchWithAbort<ConversationResponse>(
      `${BASE_URL}/v1/verbi/conversations`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ boardId, locale }),
      },
    );
  },

  /**
   * Appends a finalized utterance (AAC user or partner) to the conversation.
   */
  async appendUtterance(
    conversationId: string,
    body: UtteranceBody,
    signal?: AbortSignal,
  ): Promise<UtteranceResponse> {
    const headers = await getAuthHeaders();
    return fetchWithAbort<UtteranceResponse>(
      `${BASE_URL}/v1/verbi/conversations/${encodeURIComponent(conversationId)}/utterances`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      },
      signal,
    );
  },

  /**
   * Requests word predictions from the Verbi AI engine.
   * Supports AbortSignal for cancelling stale requests.
   */
  async predict(
    request: PredictionRequest,
    signal?: AbortSignal,
  ): Promise<PredictionResponse> {
    const headers = await getAuthHeaders();
    return fetchWithAbort<PredictionResponse>(
      `${BASE_URL}/v1/verbi/predictions`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      },
      signal,
    );
  },

  /**
   * Closes a Verbi conversation session (fire-and-forget in practice).
   */
  async closeConversation(conversationId: string): Promise<void> {
    try {
      const headers = await getAuthHeaders();
      await fetchWithAbort<void>(
        `${BASE_URL}/v1/verbi/conversations/${encodeURIComponent(conversationId)}/close`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        },
      );
    } catch {
      // Fire-and-forget: log but don't throw
      console.warn('[VerbiAPI] closeConversation failed silently');
    }
  },
};
