import { VerbiSuggestionCategory } from '../state/verbiTypes';

/** The part-of-speech buckets the column groups into. */
export type CanonicalPos =
  | 'pronoun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'noun'
  | 'social'
  | 'preposition'
  | 'question'
  | 'conjunction'
  | 'article'
  | 'other';

/** Display order of the POS groups in the column. */
export const POS_ORDER: CanonicalPos[] = [
  'pronoun',
  'verb',
  'adjective',
  'adverb',
  'noun',
  'social',
  'preposition',
  'question',
  'conjunction',
  'article',
  'other',
];

/**
 * Engine category string → canonical POS.
 *
 * The engine's vocabulary isn't pinned: it may send plurals, Fitzgerald-style
 * names ("action", "describing") or grammatical synonyms. Everything that isn't
 * a part of speech — topics such as "food" or "feelings" — falls through to
 * `other` rather than becoming a section heading of its own.
 */
const POS_ALIASES: Record<string, CanonicalPos> = {
  pronoun: 'pronoun',
  pronouns: 'pronoun',
  people: 'pronoun',
  person: 'pronoun',

  verb: 'verb',
  verbs: 'verb',
  action: 'verb',
  actions: 'verb',

  adjective: 'adjective',
  adjectives: 'adjective',
  adj: 'adjective',
  describing: 'adjective',
  descriptor: 'adjective',
  descriptors: 'adjective',

  adverb: 'adverb',
  adverbs: 'adverb',

  noun: 'noun',
  nouns: 'noun',
  thing: 'noun',
  things: 'noun',
  object: 'noun',
  objects: 'noun',

  social: 'social',
  socials: 'social',
  social_word: 'social',
  socialword: 'social',
  interjection: 'social',
  interjections: 'social',
  greeting: 'social',
  greetings: 'social',

  preposition: 'preposition',
  prepositions: 'preposition',

  question: 'question',
  questions: 'question',
  question_word: 'question',
  wh: 'question',

  conjunction: 'conjunction',
  conjunctions: 'conjunction',

  article: 'article',
  articles: 'article',
  determiner: 'article',

  other: 'other',
};

/**
 * Maps an engine `category` onto one of {@link POS_ORDER}. Unrecognised values
 * (topics, empty strings) collapse into `other`, so the column's headings are
 * always parts of speech.
 */
export function normalizePos(
  category: VerbiSuggestionCategory | string | undefined | null,
): CanonicalPos {
  if (typeof category !== 'string') return 'other';
  const key = category.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return POS_ALIASES[key] ?? 'other';
}
