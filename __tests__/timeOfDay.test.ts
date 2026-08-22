import {getTimeOfDay} from '../src/utils/timeOfDay';

function at(hour: number): Date {
  const d = new Date(2026, 0, 15);
  d.setHours(hour, 0, 0, 0);
  return d;
}

describe('getTimeOfDay', () => {
  it('maps boundary hours to the right buckets', () => {
    expect(getTimeOfDay(at(0))).toBe('morning');
    expect(getTimeOfDay(at(11))).toBe('morning');
    expect(getTimeOfDay(at(12))).toBe('afternoon');
    expect(getTimeOfDay(at(16))).toBe('afternoon');
    expect(getTimeOfDay(at(17))).toBe('evening');
    expect(getTimeOfDay(at(20))).toBe('evening');
    expect(getTimeOfDay(at(21))).toBe('night');
    expect(getTimeOfDay(at(23))).toBe('night');
  });
});
