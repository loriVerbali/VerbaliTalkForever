/**
 * Generates a unique request ID for Verbi prediction requests.
 * Format: pred_req_{timestamp}_{randomHex}
 */
export function generateRequestId(): string {
  return `pred_req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Generates a unique client event ID for utterance logging.
 */
export function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
