/**
 * Prompt construction and output parsing for on-device answer generation.
 *
 * Pure functions - no React Native imports - so they can be unit tested. The
 * backend's adult prompt (matalkapi makeModePromptAdult) is a ~2 KB rules JSON
 * written for Gemini; a 2B model follows a short prose version of the same
 * rules far more reliably, and the JSON schema below constrains the output to
 * a bare array of answers so parsing never depends on the model's formatting
 * and no tokens go to anything Home does not show.
 *
 * Speed depends on prompt layout. llama.rn keeps the KV cache between
 * completions and only evaluates the tokens after the longest common prefix
 * with the previous prompt, so the user turn is laid out from the most to the
 * least stable part:
 *
 *   1. the session-constant head (rules, the user's name and people, "about
 *      the user", the answer count, a snapshot of personal memory), primed
 *      once at load time;
 *   2. the context line, with its time rounded to the quarter hour;
 *   3. the recent conversation, fixed for the length of a turn;
 *   4. the partner's sentence, which the engine prefills from partial
 *      transcripts while the partner is still talking;
 *   5. the answers already shown, only when asking for more.
 *
 * A question therefore evaluates its last few words plus the template tokens.
 */
import {CONTEXT_TIME_GRANULARITY_MINUTES, FALLBACK_ANSWER_IMAGE} from './localLlmModels';

export type LocalAnswerMode = 'generate_answers' | 'generate_more_answers';

export interface LocalChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface LocalMemoryContext {
  communication?: {
    recentWords?: string[];
    frequentWords?: string[];
    commonSequences?: string[];
    timeOfDay?: string;
  };
  personal?: {
    facts: string[];
  };
}

export type LocalPepes = Record<
  string,
  Array<{name?: string; aliases?: string[]}> | undefined
> | null;

/**
 * The part of a request that is the same for every question in a session.
 * Everything here goes into the primed prompt head, so it must be identical
 * between the warm-up, every prefill and every question: a changed byte
 * re-evaluates the whole head.
 */
export interface LocalStableContext {
  userName?: string;
  pepes?: LocalPepes;
  tellUsMore?: string;
  /** How many answer cards to produce (already clamped). */
  count: number;
  /**
   * A snapshot of personal memory taken between questions, not ranked
   * against the sentence: ranking it per question put different facts ahead
   * of the sentence each time and defeated both the cache and the prefill.
   */
  memoryContext?: LocalMemoryContext;
}

export interface LocalAnswerRequest extends LocalStableContext {
  /** What the conversation partner said to the user (or has said so far, for a prefill). */
  sentence: string;
  mode: LocalAnswerMode;
  /** Time / weather / location sentence from Home; its time is rounded, see snapshotContextInfo. */
  contextInfo?: string;
  /** Answers already shown for this question; never repeat them. */
  priorAnswers?: string[];
  conversationHistory?: LocalChatTurn[];
}

export interface LocalAnswer {
  word: string;
  type: string;
  imageUrl: string;
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export const MIN_ANSWERS = 1;
export const MAX_ANSWERS = 12;
export const DEFAULT_ANSWERS = 5;

export function clampCount(value: unknown): number {
  const n = typeof value === 'string' ? parseInt(value, 10) : Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_ANSWERS;
  return Math.min(MAX_ANSWERS, Math.max(MIN_ANSWERS, Math.floor(n)));
}

/** Longest answer the grammar lets the model write, in characters. */
export const MAX_ANSWER_CHARS = 24;

/**
 * JSON schema handed to llama.rn as response_format; it is compiled to a GBNF
 * grammar so the model can only emit this shape: a bare array of exactly
 * `count` short strings, e.g. ["Yes","No","Later"].
 *
 * Every generated token is a full forward pass, so the output is kept to the
 * answers themselves. An earlier object shape with a question echo and a
 * yes/no flag, pretty-printed the way Gemma likes, ran 40-58 tokens where
 * this runs 8-14 (measured with Gemma 2 2B). minItems = count because a 2B
 * model otherwise stops after two or three answers.
 *
 * `extra` asks for a few more than will be shown. In "more answers" mode the
 * model repeats two or three of the already-shown answers however firmly it
 * is told not to; asking for `count + extra` and dropping the repeats
 * afterwards leaves enough new ones (measured: 3 of 5 new → 5 of 8 new).
 */
export function buildLocalAnswerSchema(count: number, extra = 0) {
  const n = Math.min(MAX_ANSWERS, clampCount(count) + Math.max(0, Math.floor(extra)));
  return {
    type: 'array',
    minItems: n,
    maxItems: n,
    items: {type: 'string', maxLength: MAX_ANSWER_CHARS},
  };
}

/** How many answers beyond `count` to ask for; see buildLocalAnswerSchema. */
export function extraAnswersFor(req: Pick<LocalAnswerRequest, 'mode' | 'priorAnswers'>): number {
  if (req.mode !== 'generate_more_answers') return 0;
  return Math.min(3, (req.priorAnswers || []).length);
}

/**
 * Generation cap for `count` answers: a 24-character answer is at most ~8
 * tokens, plus quotes, comma and brackets. Generous, and still far below
 * the old fixed 160 so a confused model cannot run on for seconds.
 */
export function maxAnswerTokens(count: number): number {
  return 8 + 12 * Math.min(MAX_ANSWERS, Math.max(1, Math.floor(count)));
}

// ─── prompt ──────────────────────────────────────────────────────────────────

const truncate = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

const PEPES_ORDER = [
  'People',
  'Pets',
  'Medicine',
  'Food',
  'Drinks',
  'Places',
  'TVShows',
];

/**
 * "People: Lori (Dad), Max; Pets: Rex" - names only, capped, so a long
 * personal list cannot crowd the question out of a 4K context.
 */
export function summarizePepes(
  pepes: LocalPepes | undefined,
  maxItems = 24,
  maxChars = 400,
): string {
  if (!pepes || typeof pepes !== 'object') return '';
  const categories = [
    ...PEPES_ORDER.filter(c => c in pepes),
    ...Object.keys(pepes).filter(c => !PEPES_ORDER.includes(c)),
  ];
  const parts: string[] = [];
  let used = 0;
  for (const category of categories) {
    const items = pepes[category];
    if (!Array.isArray(items) || items.length === 0) continue;
    const names: string[] = [];
    for (const item of items) {
      if (used >= maxItems) break;
      const name = String(item?.name || '').trim();
      if (!name) continue;
      const aliases = (item?.aliases || [])
        .map(a => String(a).trim())
        .filter(a => a && a.toLowerCase() !== name.toLowerCase())
        .slice(0, 2);
      names.push(aliases.length ? `${name} (${aliases.join(', ')})` : name);
      used += 1;
    }
    if (names.length) {
      parts.push(`${category === 'TVShows' ? 'TV shows' : category}: ${names.join(', ')}`);
    }
    if (used >= maxItems) break;
  }
  return truncate(parts.join('; '), maxChars);
}

/**
 * The context's assistant turns read "a, b, c. User picked: X"; keep the
 * partner line and what the user chose, for the last few exchanges only.
 */
export function summarizeHistory(
  history: LocalChatTurn[] | undefined,
  maxExchanges = 2,
): string {
  if (!history || history.length === 0) return '';
  const lines: string[] = [];
  for (let i = 0; i < history.length; i += 1) {
    const turn = history[i];
    if (turn.role !== 'user') continue;
    const reply = history[i + 1]?.role === 'assistant' ? history[i + 1].content : '';
    const picked = /User picked:\s*(.+)$/i.exec(reply)?.[1]?.trim();
    const partner = truncate(turn.content.trim(), 100);
    lines.push(
      picked
        ? `Partner: "${partner}" → user chose "${truncate(picked, 40)}"`
        : `Partner: "${partner}"`,
    );
  }
  return lines.slice(-maxExchanges).join('\n');
}

/**
 * Keep personal facts, but omit frequent words: isolated words such as
 * "Sleep", "Go" and "No" prime the small model to reuse them as answers
 * even when the partner asked about an unrelated experience.
 */
export function summarizeMemory(
  memory: LocalMemoryContext | undefined,
  maxFacts = 5,
): string {
  if (!memory) return '';
  const facts = (memory.personal?.facts || []).filter(Boolean).slice(0, maxFacts);
  return facts.length ? `Known facts: ${facts.map(f => truncate(f, 70)).join('; ')}` : '';
}

/**
 * The rules, plus worked examples. The whole system turn sits in the cached
 * prompt head, so the examples cost nothing per question; for a 2B model they
 * do more than any rule to stop it padding a forced count with question words
 * or the partner's own words.
 */
export const SYSTEM_PROMPT = [
  'You help a non-speaking adult reply in conversation. A partner (family, caregiver, nurse, friend) has just spoken TO the user; in their words "I/me/my" is the partner and "you/your" is the user.',
  'Work out what the user is being asked or could react to, then give short answers the user can tap to say, in the user\'s own first-person voice.',
  'Rules:',
  '- Each answer is 1 to 3 words, no sentences. Give exactly the requested number, each different in meaning (no synonyms).',
  '- A plain yes/no question gets "Yes" and "No" first, then natural alternatives ("Maybe", "Later", "Not now", or a counter-proposal).',
  '- An either/or question ("tea or coffee?") gets each option exactly as said, plus a refusal such as "Neither".',
  '- Asked about a person: names from the user\'s list when they fit, otherwise roles (the nurse, a neighbour); never places. Asked about a place: places or rooms, never people.',
  '- Opinion questions: descriptive words, not yes/no. Statements: short reactions ("Great", "Tell me more", "Not now").',
  '- Asked how an activity or event was: describe that experience. Do not switch to what the user wants now; the current time and weather do not describe a past event.',
  '- The list of names is reference material, not answers: use a name only when the partner asks about that kind of thing (who, which food, which show). For any other question ignore the list completely; never pad with it.',
  '- Never answer with a question word or with the partner\'s own words.',
  '- Use the time, weather, location and personal details only when relevant; never list them as answers. No pronouns like "he"/"she" for people.',
  '- Never repeat answers listed as already shown.',
  'Reply with a JSON array of the answers only. Examples with 5 answers:',
  'Partner said: "Do you want some tea now?" → ["Yes","No","Later","Coffee instead","Just water"]',
  'Partner said: "Who is coming to visit tomorrow?" → ["My daughter","My son","Nobody","Not sure","The nurse"]',
  'Partner said: "How are you feeling today?" → ["Good","Tired","A bit sore","Happy","So-so"]',
  'Partner said: "How was your appointment yesterday?" → ["Helpful","Stressful","Long wait","Went smoothly","Not sure"]',
  'Partner said: "Where did you leave your glasses?" → ["Bedroom","Kitchen","Not sure","In my bag","Living room"]',
  'Partner said: "I spoke to the doctor this morning." → ["Tell me more","Good","What did she say","Thank you","Worried"]',
].join('\n');

/**
 * The session-constant head of the user turn. Memory comes last: it is the
 * part most likely to change as personal facts are learned, and a
 * change re-evaluates only what follows it.
 */
export function buildStableContextText(stable: LocalStableContext): string {
  const lines: string[] = [];
  if (stable.userName && stable.userName.trim()) {
    lines.push(`The user's name is ${truncate(stable.userName.trim(), 40)}.`);
  }
  const pepes = summarizePepes(stable.pepes);
  if (pepes) {
    lines.push(
      `Names the user may need only when asked about a specific person, pet, medicine, food, drink, place or show (ignore for any other question) - ${pepes}`,
    );
  }
  if (stable.tellUsMore && stable.tellUsMore.trim()) {
    lines.push(`About the user: ${truncate(stable.tellUsMore.trim(), 300)}`);
  }
  lines.push(`Number of answers: ${clampCount(stable.count)}`);
  const memory = summarizeMemory(stable.memoryContext);
  if (memory) lines.push(memory);
  return lines.join('\n');
}

const CLOCK_TIME = /\b(at )(\d{1,2}):(\d{2})( ?[AaPp][Mm])\b/;

/**
 * Round the clock time in Home's context sentence ("It's Monday afternoon at
 * 3:42 PM, ...") down to the quarter hour, so the line is byte-identical for
 * every question in that quarter hour and stays in the KV cache. The model
 * only ever uses the time for "good morning"-grade relevance, never the
 * minute. Anything without a recognisable time is returned unchanged.
 */
export function snapshotContextInfo(
  contextInfo: string,
  granularityMinutes = CONTEXT_TIME_GRANULARITY_MINUTES,
): string {
  const step = Math.max(1, Math.min(60, Math.floor(granularityMinutes)));
  return contextInfo.replace(CLOCK_TIME, (_m, at, hour, minute, suffix) => {
    const m = parseInt(minute, 10);
    if (!Number.isFinite(m) || m < 0 || m > 59) return _m;
    const rounded = Math.floor(m / step) * step;
    return `${at}${hour}:${String(rounded).padStart(2, '0')}${suffix}`;
  });
}

/**
 * Messages for a throwaway completion right after the model loads. They share
 * their whole prefix with real requests, so the rules and the user's details
 * are in the KV cache before the first question arrives.
 */
export function buildPrimingMessages(stable: LocalStableContext): ChatMessage[] {
  return [
    {role: 'system', content: SYSTEM_PROMPT},
    {role: 'user', content: buildStableContextText(stable)},
  ];
}

/** Chat messages for llama.rn's completion(); the chat template is the model's own. */
export function buildLocalAnswerMessages(req: LocalAnswerRequest): ChatMessage[] {
  // Most stable first, so the cached prefix reaches as far as possible: the
  // head (primed at load), then what changes every quarter hour, then what
  // changes every turn, then the sentence itself.
  const lines: string[] = [buildStableContextText(req)];

  if (req.contextInfo && req.contextInfo.trim()) {
    lines.push(`Context: ${truncate(snapshotContextInfo(req.contextInfo.trim()), 160)}`);
  }

  const history = summarizeHistory(req.conversationHistory);
  if (history) lines.push(`Recent conversation:\n${history}`);

  lines.push(`Partner said: "${truncate(req.sentence.trim(), 300)}"`);

  const priors = (req.priorAnswers || []).map(p => String(p).trim()).filter(Boolean);
  if (priors.length) {
    lines.push(
      `Already shown, do not repeat or paraphrase: ${truncate(priors.join(', '), 300)}`,
    );
    if (req.mode === 'generate_more_answers') {
      lines.push('The user did not find a fitting answer above; offer different ones.');
    }
  }

  return [
    {role: 'system', content: SYSTEM_PROMPT},
    {role: 'user', content: lines.join('\n')},
  ];
}

/**
 * Messages for a prefill on a partial transcript: the question's own
 * messages with the words heard so far and nothing after them. The chat
 * template closes the turn after the sentence, so the final question shares
 * the prefix up to the last word that did not change; the closing quote and
 * the template tokens are re-evaluated, a dozen tokens or so.
 */
export function buildPrefillMessages(req: LocalAnswerRequest): ChatMessage[] {
  return buildLocalAnswerMessages({
    ...req,
    mode: 'generate_answers',
    priorAnswers: undefined,
  });
}

// ─── parsing ─────────────────────────────────────────────────────────────────

const EDGE_PUNCTUATION = /^[\s"'“”‘’.,!?;:()[\]{}<>-]+|[\s"'“”‘’.,!?;:()[\]{}<>-]+$/g;

/** A bare question word is the model echoing the question, never an answer. */
const QUESTION_WORDS = /^(who|what|where|when|why|how|which|whom|whose)$/i;

/** Trim, collapse whitespace, strip edge punctuation, capitalise; '' if unusable. */
export function normalizeAnswerWord(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw.replace(/\s+/g, ' ').replace(EDGE_PUNCTUATION, '').trim();
  if (!cleaned || cleaned.length > 40) return '';
  if (cleaned.split(' ').length > 3) return '';
  if (/[{}[\]<>]/.test(cleaned)) return '';
  if (QUESTION_WORDS.test(cleaned)) return '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

const WORD_TYPES = ['noun', 'verb', 'adjective', 'adverb', 'other'] as const;

const normalizeType = (raw: unknown): string => {
  const t = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return (WORD_TYPES as readonly string[]).includes(t) ? t : 'other';
};

const stripFences = (raw: string) => raw.replace(/```(?:json)?/gi, '').trim();

function extractJson(raw: string): unknown {
  const text = stripFences(raw);
  try {
    return JSON.parse(text);
  } catch {
    // Fall through to the outermost brackets.
  }
  for (const [open, close] of [
    ['{', '}'],
    ['[', ']'],
  ]) {
    const start = text.indexOf(open);
    const end = text.lastIndexOf(close);
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        // Unparseable; try the other shape.
      }
    }
  }
  return null;
}

/**
 * Answers visible in output that is not valid JSON (cut off by the token cap
 * or the timeout). Object shape first ("word": "…"); otherwise the strings
 * after an "answers" key, or every string of a bare array.
 */
function salvageAnswers(raw: string): string[] {
  const text = stripFences(raw);
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const wordRe = /"word"\s*:\s*"([^"\\]{1,60})"/g;
  while ((m = wordRe.exec(text)) !== null) out.push(m[1]);
  if (out.length) return out;

  const answersKey = text.indexOf('"answers"');
  const tail =
    answersKey >= 0
      ? text.slice(answersKey + '"answers"'.length)
      : text.startsWith('[')
      ? text
      : '';
  const stringRe = /"([^"\\]{1,60})"/g;
  while ((m = stringRe.exec(tail)) !== null) out.push(m[1]);
  return out;
}

interface Candidate {
  word: string;
  type: string;
}

/** Dedupe (case-insensitive), drop priors, cap at `count`, attach the image. */
function finalize(candidates: Candidate[], count: number, priors: string[]): LocalAnswer[] {
  const seen = new Set(priors.map(p => p.toLowerCase()));
  const out: LocalAnswer[] = [];
  for (const c of candidates) {
    const key = c.word.toLowerCase();
    if (!c.word || seen.has(key)) continue;
    seen.add(key);
    out.push({word: c.word, type: c.type, imageUrl: FALLBACK_ANSWER_IMAGE});
    if (out.length >= count) break;
  }
  return out;
}

/**
 * Turn the model's text into answer cards. Returns [] when nothing usable
 * came back so the caller can fall back to heuristics.
 */
export function parseLocalAnswers(
  raw: string,
  opts: {count: number; priorAnswers?: string[]},
): LocalAnswer[] {
  const count = clampCount(opts.count);
  const priors = (opts.priorAnswers || []).map(normalizeAnswerWord).filter(Boolean);
  const json = extractJson(raw || '') as any;

  let items: unknown[] = [];
  if (Array.isArray(json)) {
    items = json;
  } else if (json && typeof json === 'object') {
    // A yes/no question gets exactly Yes and No - unless those were already
    // shown and the user asked for more, in which case use the model's list.
    if (json.is_yes_no === true) {
      const yesNo = finalize(
        [
          {word: 'Yes', type: 'other'},
          {word: 'No', type: 'other'},
        ],
        count,
        priors,
      );
      if (yesNo.length) return yesNo;
    }
    const list = json.answers ?? json['Possible answers'] ?? json.possible_answers;
    items = Array.isArray(list) ? list : [];
  } else {
    items = salvageAnswers(raw || '');
  }

  const candidates: Candidate[] = [];
  for (const item of items) {
    const word = normalizeAnswerWord(
      typeof item === 'string' ? item : (item as any)?.word,
    );
    if (!word) continue;
    candidates.push({
      word,
      type: normalizeType(typeof item === 'string' ? 'other' : (item as any)?.type),
    });
  }
  return finalize(candidates, count, priors);
}

// ─── names the question did not ask for ──────────────────────────────────────

/** Every name and alias in the list, trimmed and lower-cased, without repeats. */
export function listedNames(pepes: LocalPepes | undefined): string[] {
  if (!pepes || typeof pepes !== 'object') return [];
  const out = new Set<string>();
  for (const items of Object.values(pepes)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      for (const raw of [item?.name, ...(item?.aliases || [])]) {
        const name = String(raw || '').trim().toLowerCase();
        if (name) out.add(name);
      }
    }
  }
  return [...out];
}

/**
 * Words that take a person or thing from the list as an answer: the question
 * words, the categories' own words and the verbs that go with them. Kept
 * generous on purpose - a sentence with none of these ("How are you
 * feeling?", "Did you sleep well?", "I spoke to the doctor.") has no use
 * for a name, and that is the only case the filter below acts on.
 */
const ASKS_FOR_LISTED =
  /\b(who|whom|whose|which|what|where|eat\w*|ate|food|hungry|breakfast|lunch\w*|dinner|supper|snack\w*|meal\w*|drink\w*|thirsty|medicine|medication|meds|pills?|tablets?|dose|pets?|dog|cat|watch\w*|show|tv|television|movie|film|visit\w*|call\w*|phone|ring|see|meet\w*|go|going|went|place|miss\w*|talk\w*|speak\w*|invite\w*|bring|fetch|something|anything)\b/i;

// Punctuation and spaces between words; apostrophes too, so "Dad's" is "dad s".
const WORD_SEPARATORS = /[\s,.;:!?"'“”‘’()[\]{}<>\-–—/\\]+/;

const toWords = (text: string): string[] =>
  text.toLowerCase().split(WORD_SEPARATORS).filter(Boolean);

/** True when `phrase` occurs in `words` as a run of whole words. */
function hasPhrase(words: string[], phrase: string[]): boolean {
  if (phrase.length === 0 || phrase.length > words.length) return false;
  for (let i = 0; i + phrase.length <= words.length; i += 1) {
    if (phrase.every((word, j) => words[i + j] === word)) return true;
  }
  return false;
}

/**
 * Does the partner's sentence call for someone or something from the list -
 * by asking (who, which, what to eat…) or by naming one ("Is Max asleep?")?
 */
export function asksForListed(sentence: string, names: string[]): boolean {
  const text = (sentence || '').trim();
  if (!text) return false;
  if (ASKS_FOR_LISTED.test(text)) return true;
  const words = toWords(text);
  return names.some(name => hasPhrase(words, toWords(name)));
}

/**
 * Drop answers that carry a name from the list when nothing in the sentence
 * asked for one. A 2B model fills a forced count from whatever is in its
 * context, and the list is the richest thing there; "Rex" is no answer to
 * "Are you cold?". Nothing is put in their place: Home already shows fewer
 * cards than requested (Yes/No alone, for instance), and a short honest row
 * beats a padded one. An empty result lets the caller fall back as usual.
 */
export function dropUnaskedNames(
  answers: LocalAnswer[],
  req: Pick<LocalAnswerRequest, 'sentence' | 'pepes'>,
): LocalAnswer[] {
  const names = listedNames(req.pepes);
  if (names.length === 0 || answers.length === 0) return answers;
  if (asksForListed(req.sentence, names)) return answers;
  const phrases = names.map(toWords).filter(p => p.length > 0);
  return answers.filter(answer => {
    const words = toWords(answer.word);
    return !phrases.some(phrase => hasPhrase(words, phrase));
  });
}

// ─── fallback ────────────────────────────────────────────────────────────────

const DESCRIPTIVE_QUESTION = /^(how|what|when|where|why)\s+(was|were|did|does|is|are)/i;
const YES_NO_QUESTION =
  /^(did|do|does|are|is|was|were|have|has|had|can|could|will|would|should)\b/i;

const GENERIC_ANSWERS: Candidate[] = [
  {word: 'Good', type: 'adjective'},
  {word: 'Great', type: 'adjective'},
  {word: 'Ok', type: 'adjective'},
  {word: 'Fine', type: 'adjective'},
  {word: 'Well', type: 'adverb'},
  {word: 'Bad', type: 'adjective'},
  {word: 'Busy', type: 'adjective'},
  {word: 'Tired', type: 'adjective'},
  {word: 'Happy', type: 'adjective'},
  {word: 'Sad', type: 'adjective'},
  {word: 'Interesting', type: 'adjective'},
  {word: 'Boring', type: 'adjective'},
  {word: 'Difficult', type: 'adjective'},
  {word: 'Easy', type: 'adjective'},
  {word: 'Helpful', type: 'adjective'},
  {word: 'Amazing', type: 'adjective'},
  {word: 'Terrible', type: 'adjective'},
  {word: 'Perfect', type: 'adjective'},
  {word: 'Not sure', type: 'other'},
  {word: 'Later', type: 'adverb'},
];

/**
 * The backend's low-latency fallback, used when the model produced nothing
 * usable: Yes/No for yes/no questions, otherwise generic reactions.
 */
export function heuristicAnswers(
  sentence: string,
  count: number,
  priorAnswers: string[] = [],
): LocalAnswer[] {
  const n = clampCount(count);
  const priors = priorAnswers.map(normalizeAnswerWord).filter(Boolean);
  const trimmed = (sentence || '').trim();
  const isYesNo = !DESCRIPTIVE_QUESTION.test(trimmed) && YES_NO_QUESTION.test(trimmed);
  if (isYesNo) {
    const yesNo = finalize(
      [
        {word: 'Yes', type: 'other'},
        {word: 'No', type: 'other'},
      ],
      n,
      priors,
    );
    if (yesNo.length) return yesNo;
  }
  return finalize(GENERIC_ANSWERS, n, priors);
}
