/**
 * What a measurement attempt produced.
 *
 * A bare number cannot distinguish "the child did this zero times" from "we did not
 * measure it". On a progress report those read identically and mean opposite things,
 * so the distinction lives in the type.
 */

/** Where a number came from, so a displayed result can be traced back. */
export type MeasurementProvenance =
  | { readonly kind: 'recorded' }
  | { readonly kind: 'mock'; readonly datasetId: string }
  | { readonly kind: 'aiAssisted'; readonly model: string };

export type MeasurementResult =
  /** Measured. Zero is a real, reportable value. */
  | { readonly kind: 'value'; readonly value: number; readonly provenance: MeasurementProvenance }
  /** The session was recorded but carries nothing for this metric. */
  | { readonly kind: 'noData'; readonly reason: string }
  /** Needs analysis that has not run. Not a failure, and not zero. */
  | { readonly kind: 'pending'; readonly reason: string }
  /** The app cannot produce this metric at all. */
  | { readonly kind: 'unsupported'; readonly reason: string };

export const Provenance = {
  recorded: { kind: 'recorded' } as MeasurementProvenance,
  mock(datasetId: string): MeasurementProvenance {
    return { kind: 'mock', datasetId };
  },
  aiAssisted(model: string): MeasurementProvenance {
    return { kind: 'aiAssisted', model };
  },
};

export const Result = {
  value(value: number, provenance: MeasurementProvenance = Provenance.recorded): MeasurementResult {
    return { kind: 'value', value, provenance };
  },
  noData(reason: string): MeasurementResult {
    return { kind: 'noData', reason };
  },
  pending(reason: string): MeasurementResult {
    return { kind: 'pending', reason };
  },
  unsupported(reason: string): MeasurementResult {
    return { kind: 'unsupported', reason };
  },
};

/**
 * The number, when there is one. Callers that need a number for arithmetic must handle
 * the other cases explicitly rather than defaulting them to zero.
 */
export function measuredValue(result: MeasurementResult): number | null {
  return result.kind === 'value' ? result.value : null;
}

export function isMeasured(result: MeasurementResult): boolean {
  return result.kind === 'value';
}

/** The reason text for any unmeasured state, or null for a value. */
export function unmeasuredReason(result: MeasurementResult): string | null {
  return result.kind === 'value' ? null : result.reason;
}
