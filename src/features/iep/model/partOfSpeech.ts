/**
 * Local part-of-speech classification with closed word lists. Board vocabulary not in a
 * function-word list is authored as a concrete symbol and defaults to noun, only for
 * deterministic goal checks.
 */

const PRONOUNS = new Set([
  'i', 'me', 'my', 'mine', 'you', 'your', 'yours', 'he', 'him', 'his', 'she', 'her',
  'hers', 'it', 'its', 'we', 'us', 'our', 'they', 'them', 'their',
]);
const VERBS = new Set([
  'want', 'need', 'eat', 'drink', 'go', 'sleep', 'look', 'help', 'come', 'listen', 'play',
  'like', 'feel', 'have', 'do', 'say', 'open', 'close', 'read', 'watch', 'run', 'jump',
]);
const ADJECTIVES = new Set([
  'good', 'bad', 'big', 'small', 'little', 'hot', 'cold', 'red', 'blue', 'green', 'yellow',
  'happy', 'sad', 'comfortable', 'relaxed', 'warm', 'strong', 'scared', 'worried', 'angry',
]);
const ADVERBS = new Set(['more', 'again', 'now', 'later', 'today', 'here', 'there']);
const INTERJECTIONS = new Set(['yes', 'no', 'please', 'hi', 'hello']);

/** Returns a part of speech for a single token, or null for empty or multi-word input. */
export function classifyPartOfSpeech(rawWord: string): string | null {
  const word = rawWord
    .toLowerCase()
    .trim()
    .replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, '');
  if (word.includes(' ')) {
    return null;
  }
  if (word.length === 0) {
    return null;
  }
  if (PRONOUNS.has(word)) {
    return 'pronoun';
  }
  if (VERBS.has(word)) {
    return 'verb';
  }
  if (ADJECTIVES.has(word)) {
    return 'adjective';
  }
  if (ADVERBS.has(word)) {
    return 'adverb';
  }
  if (INTERJECTIONS.has(word)) {
    return 'interjection';
  }
  return 'noun';
}
