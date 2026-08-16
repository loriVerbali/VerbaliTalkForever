export type TimeBucket = 'morning' | 'afternoon' | 'evening' | 'night';

export const TIME_BUCKETS: TimeBucket[] = [
  'morning',
  'afternoon',
  'evening',
  'night',
];

/**
 * Shared time-of-day bucketing used by Verbi context cues and Personal Memory
 * time patterns. Boundaries: <12 morning, <17 afternoon, <21 evening, else night.
 */
export function getTimeOfDay(date: Date = new Date()): TimeBucket {
  const hour = date.getHours();
  if (hour < 12) {
    return 'morning';
  }
  if (hour < 17) {
    return 'afternoon';
  }
  if (hour < 21) {
    return 'evening';
  }
  return 'night';
}
