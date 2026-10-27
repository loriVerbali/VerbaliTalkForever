/**
 * Keeps text from one speech session out of the next one.
 *
 * STTService never really stops the recogniser: its "stop" is DaVoice's Lite
 * pause, which keeps the session warm so the next start is instant, and its
 * "start" resumes that session. A segment still open at the pause (words with
 * no final yet) resumes together with the next session, whose first results
 * then begin with text spoken on another screen - what the partner said in
 * Convo turning up as the question in Home.
 *
 * The guard remembers what the paused session had and, when a different owner
 * (screen) starts the next session, trims that text off the results for as
 * long as they still begin with it. A screen resuming its own session (Convo
 * pausing for TTS, Home asking the next question) is left alone: there the
 * continuation is wanted, or at least is today's behaviour. The leftover is
 * still remembered through those resumes - Convo pauses and resumes for every
 * word Verbi speaks, usually with the partner silent in between, and the
 * segment stays open in the recogniser the whole time - so it is still there
 * to trim when another screen finally takes over.
 *
 * Pure TypeScript with an injectable clock, so it can be unit tested without
 * the native module.
 */

/** Shorter leftovers are not trimmed: a lone "yes" is too easily the user's own next word. */
export const MIN_CARRIED_WORDS = 2;

/**
 * A first result that merely equals the leftover (no new words) is only
 * treated as stale when it arrives this soon after the start - the recogniser
 * re-emitting its pending hypothesis. Later, it is the user saying the same
 * words again.
 */
export const EARLY_RESULT_MS = 1500;

const PUNCTUATION = /[\s"'“”‘’.,!?;:()[\]{}<>\-–—…/\\]+/g;

const normalise = (token: string): string => token.toLowerCase().replace(PUNCTUATION, '');

/** Normalised, non-empty words of a result. */
export const resultWords = (text: string): string[] =>
  text.trim().split(/\s+/).map(normalise).filter(Boolean);

const beginsWith = (words: string[], prefix: string[]): boolean =>
  prefix.length > 0 &&
  words.length >= prefix.length &&
  prefix.every((word, i) => words[i] === word);

/** The raw text without its first `count` words (punctuation-only tokens do not count). */
export const dropLeadingWords = (text: string, count: number): string => {
  const tokens = text.trim().split(/\s+/);
  let dropped = 0;
  let i = 0;
  while (i < tokens.length && dropped < count) {
    if (normalise(tokens[i])) dropped += 1;
    i += 1;
  }
  return tokens.slice(i).join(' ');
};

type Phase = 'off' | 'pending' | 'trimming';

export class SpeechCarryOverGuard {
  private owner = '';
  /** Newest text the live session has produced, stale prefix included. */
  private latest = '';
  /** Normalised words the paused session left open. */
  private carried: string[] = [];
  private active = false;
  private phase: Phase = 'off';
  private startedAt = 0;

  constructor(private readonly now: () => number = Date.now) {}

  /** A session is starting for `owner`; arm trimming when another owner left text behind. */
  sessionStarted(owner: string): void {
    const changedOwner = owner !== this.owner;
    this.owner = owner;
    this.active = true;
    this.latest = '';
    this.startedAt = this.now();
    // Same owner: the leftover is kept (the segment is still open in the
    // recogniser) but not trimmed; another owner later still gets it trimmed.
    this.phase =
      changedOwner && this.carried.length >= MIN_CARRIED_WORDS ? 'pending' : 'off';
  }

  /** The session is being paused; whatever it has now may resume with the next one. */
  sessionPaused(): void {
    this.active = false;
    this.phase = 'off';
    // Results are cumulative, so the newest text is the whole open segment,
    // leftover included. A session that heard nothing leaves the segment as
    // it was: keep the leftover rather than forget it.
    if (this.latest.trim()) this.carried = resultWords(this.latest);
    this.latest = '';
  }

  /** The recogniser was torn down and rebuilt: nothing can carry over. */
  reset(): void {
    this.latest = '';
    this.carried = [];
    this.phase = 'off';
  }

  /** True while results are being trimmed (for logging). */
  get isTrimming(): boolean {
    return this.phase === 'trimming';
  }

  /**
   * The values to hand to subscribers for a partial or final result. The same
   * array when nothing applies; a shorter one when leftovers were trimmed;
   * empty when the result was nothing but leftovers.
   */
  filter(values: string[]): string[] {
    const text = typeof values[0] === 'string' ? values[0] : '';
    if (!this.active) {
      // A late event from the paused session (Android delivers the final after
      // stop): what it says is what the session leaves behind.
      if (text.trim()) this.carried = resultWords(text);
      return values;
    }
    this.latest = text;
    if (this.phase === 'off') return values;

    const words = resultWords(text);
    const stale = beginsWith(words, this.carried);
    if (this.phase === 'pending') {
      const early = this.now() - this.startedAt <= EARLY_RESULT_MS;
      const confirmed = stale && (words.length > this.carried.length || early);
      if (!confirmed) {
        this.disarm();
        return values;
      }
      this.phase = 'trimming';
    } else if (!stale) {
      // The recogniser has moved on to a fresh segment.
      this.disarm();
      return values;
    }

    const count = this.carried.length;
    return values
      .map(value =>
        typeof value === 'string' && beginsWith(resultWords(value), this.carried)
          ? dropLeadingWords(value, count)
          : value,
      )
      .filter(value => typeof value === 'string' && value.length > 0);
  }

  private disarm(): void {
    this.phase = 'off';
    this.carried = [];
  }
}
