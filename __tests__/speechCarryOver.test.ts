import {
  EARLY_RESULT_MS,
  SpeechCarryOverGuard,
  dropLeadingWords,
  resultWords,
} from '../src/utils/speechCarryOver';

/** A guard with a controllable clock. */
const makeGuard = () => {
  let now = 10_000;
  const guard = new SpeechCarryOverGuard(() => now);
  return {guard, advance: (ms: number) => (now += ms)};
};

/** Convo's partner talked, the session was paused mid-segment, Home starts. */
const convoThenHome = () => {
  const t = makeGuard();
  t.guard.sessionStarted('verbi-partner');
  expect(t.guard.filter(['do you want'])).toEqual(['do you want']);
  expect(t.guard.filter(['do you want some tea'])).toEqual(['do you want some tea']);
  t.guard.sessionPaused();
  t.advance(30_000);
  t.guard.sessionStarted('home');
  return t;
};

describe('SpeechCarryOverGuard', () => {
  it('trims the previous screen\'s open segment from the next screen\'s results', () => {
    const {guard, advance} = convoThenHome();
    advance(3000);
    expect(guard.filter(['do you want some tea how are you'])).toEqual(['how are you']);
    expect(guard.isTrimming).toBe(true);
    expect(guard.filter(['do you want some tea how are you feeling'])).toEqual([
      'how are you feeling',
    ]);
    // The final for the segment carries the same prefix.
    expect(guard.filter(['Do you want some tea, how are you feeling?'])).toEqual([
      'how are you feeling?',
    ]);
  });

  it('drops a result that is nothing but leftovers, re-emitted right after the start', () => {
    const {guard, advance} = convoThenHome();
    advance(200);
    expect(guard.filter(['do you want some tea'])).toEqual([]);
    expect(guard.filter(['do you want some tea'])).toEqual([]);
    advance(2000);
    expect(guard.filter(['do you want some tea hungry'])).toEqual(['hungry']);
  });

  it('leaves a screen resuming its own session alone', () => {
    const {guard} = makeGuard();
    guard.sessionStarted('verbi-partner');
    guard.filter(['are you coming to']);
    guard.sessionPaused(); // Verbi speaks
    guard.sessionStarted('verbi-partner');
    expect(guard.filter(['are you coming to dinner'])).toEqual(['are you coming to dinner']);
    expect(guard.isTrimming).toBe(false);
  });

  it('stands down when the new session starts fresh, and stays down', () => {
    const {guard, advance} = convoThenHome();
    advance(2000);
    const fresh = ['how'];
    expect(guard.filter(fresh)).toBe(fresh);
    // Coincidental overlap later is the user's own speech.
    expect(guard.filter(['how do you want some tea'])).toEqual(['how do you want some tea']);
    expect(guard.isTrimming).toBe(false);
  });

  it('treats an equal result late after the start as the user repeating the words', () => {
    const {guard, advance} = convoThenHome();
    advance(EARLY_RESULT_MS + 1);
    expect(guard.filter(['do you want some tea'])).toEqual(['do you want some tea']);
    expect(guard.isTrimming).toBe(false);
  });

  it('stops trimming once the recogniser moves to a fresh segment', () => {
    const {guard, advance} = convoThenHome();
    advance(2000);
    expect(guard.filter(['do you want some tea hello'])).toEqual(['hello']);
    expect(guard.filter(['hello there'])).toEqual(['hello there']);
    expect(guard.isTrimming).toBe(false);
    expect(guard.filter(['do you want some tea'])).toEqual(['do you want some tea']);
  });

  it('does not trim a one-word leftover', () => {
    const {guard, advance} = makeGuard();
    guard.sessionStarted('verbi-partner');
    guard.filter(['yes']);
    guard.sessionPaused();
    guard.sessionStarted('home');
    advance(100);
    expect(guard.filter(['yes'])).toEqual(['yes']);
    expect(guard.filter(['yes please'])).toEqual(['yes please']);
  });

  it('takes a late event after the pause as what the session left behind', () => {
    const {guard, advance} = makeGuard();
    guard.sessionStarted('home');
    guard.filter(['are you cold']);
    guard.sessionPaused();
    // Android delivers the final after stop; it belongs to the paused session.
    const late = ['are you cold today'];
    expect(guard.filter(late)).toBe(late);
    guard.sessionStarted('intake');
    advance(2000);
    expect(guard.filter(['are you cold today my name is Sam'])).toEqual(['my name is Sam']);
  });

  it('trims each alternative that carries the leftover and removes emptied ones', () => {
    const {guard, advance} = convoThenHome();
    advance(2000);
    expect(
      guard.filter(['do you want some tea hungry', 'do you want some tea', 'hungry']),
    ).toEqual(['hungry', 'hungry']);
  });

  it('what the next session leaves behind includes the stale prefix it was still carrying', () => {
    const {guard, advance} = convoThenHome();
    advance(2000);
    guard.filter(['do you want some tea hungry']);
    guard.sessionPaused();
    guard.sessionStarted('intake');
    advance(2000);
    expect(guard.filter(['do you want some tea hungry my name is Sam'])).toEqual([
      'my name is Sam',
    ]);
  });

  it('keeps the leftover through the same owner\'s silent pause/resume cycles', () => {
    const {guard, advance} = makeGuard();
    guard.sessionStarted('verbi-partner');
    guard.filter(['do you want some tea']);
    // Verbi speaks a word: pause, resume, partner says nothing; several times.
    for (let i = 0; i < 3; i += 1) {
      guard.sessionPaused();
      advance(1500);
      guard.sessionStarted('verbi-partner');
      advance(4000);
    }
    guard.sessionPaused(); // leaving Convo
    advance(10_000);
    guard.sessionStarted('home');
    advance(2500);
    expect(guard.filter(['do you want some tea how are you'])).toEqual(['how are you']);
  });

  it('a same-owner session that heard more replaces the leftover with the whole segment', () => {
    const {guard, advance} = makeGuard();
    guard.sessionStarted('verbi-partner');
    guard.filter(['do you want']);
    guard.sessionPaused();
    guard.sessionStarted('verbi-partner');
    // Cumulative results: the resumed session reports the whole open segment.
    expect(guard.filter(['do you want some tea'])).toEqual(['do you want some tea']);
    guard.sessionPaused();
    guard.sessionStarted('home');
    advance(2500);
    expect(guard.filter(['do you want some tea hungry'])).toEqual(['hungry']);
  });

  it('forgets everything on reset', () => {
    const {guard, advance} = convoThenHome();
    guard.reset();
    advance(100);
    expect(guard.filter(['do you want some tea'])).toEqual(['do you want some tea']);
  });

  it('ignores punctuation and case when matching', () => {
    const {guard, advance} = makeGuard();
    guard.sessionStarted('verbi-partner');
    guard.filter(['Hello there.']);
    guard.sessionPaused();
    guard.sessionStarted('home');
    advance(2000);
    expect(guard.filter(['hello there, how are you?'])).toEqual(['how are you?']);
  });
});

describe('word helpers', () => {
  it('normalises words', () => {
    expect(resultWords('  Hello, there... - "Dad\'s" here! ')).toEqual(['hello', 'there', 'dads', 'here']);
  });
  it('drops leading words without counting punctuation-only tokens', () => {
    expect(dropLeadingWords('hello - there, how are you', 2)).toBe('how are you');
    expect(dropLeadingWords('hello there', 2)).toBe('');
    expect(dropLeadingWords('hello there', 5)).toBe('');
  });
});
