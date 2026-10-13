import {
  Provenance,
  Result,
  isMeasured,
  measuredValue,
} from '../../../src/features/iep/core';

describe('MeasurementResult', () => {
  it('a measured zero is a value', () => {
    const result = Result.value(0, Provenance.recorded);
    expect(measuredValue(result)).toBe(0);
    expect(isMeasured(result)).toBe(true);
  });

  it('unmeasured states carry no number', () => {
    for (const result of [
      Result.noData('no sentences recorded'),
      Result.pending('awaiting AI analysis'),
      Result.unsupported('not in the metrics library'),
    ]) {
      expect(measuredValue(result)).toBeNull();
      expect(isMeasured(result)).toBe(false);
    }
  });

  it('measured zero is not the same as no data', () => {
    expect(Result.value(0, Provenance.recorded)).not.toEqual(Result.noData('no sentences recorded'));
  });

  it('provenance is part of the result', () => {
    expect(Result.value(5, Provenance.recorded)).not.toEqual(
      Result.value(5, Provenance.mock('52-weeks')),
    );
  });
});
