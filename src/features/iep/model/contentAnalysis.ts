/**
 * Deterministic, rule-based classification of a child's message. Runs locally at the
 * moment a communication is recorded, so every metric has an honest starting point; an
 * AI classification may later replace it, and an SLP may override either.
 */

import { CommunicationFunction, CommunicationSource, ContentAnalysis } from './types';

const WH_WORDS = ['who', 'what', 'where', 'when', 'why', 'how'];
const BOUNDARY = new Set(['stop', 'no', 'dont', "don't"]);
const REGULATION = new Set([
  'help',
  'tired',
  'hungry',
  'thirsty',
  'sick',
  'sad',
  'angry',
  'scared',
  'worried',
  'bathroom',
]);
const PREFERENCE = new Set(['like', 'love', 'prefer', 'favorite']);
const REQUEST = new Set(['want', 'need', 'more', 'please', 'can']);

export const RULE_BASED_CONFIDENCE = 0.6;

function tokensOf(normalized: string): Set<string> {
  return new Set(
    normalized
      .split(/[^a-z']+/)
      .map(t => t.replace(/^'+|'+$/g, ''))
      .filter(t => t.length > 0),
  );
}

function intersects(tokens: Set<string>, words: Set<string>): boolean {
  for (const w of words) {
    if (tokens.has(w)) {
      return true;
    }
  }
  return false;
}

export function analyzeContent(content: string, source: CommunicationSource): ContentAnalysis {
  const normalized = content.toLowerCase().trim();
  const tokens = tokensOf(normalized);
  const whWord = WH_WORDS.find(w => tokens.has(w)) ?? null;
  const isQuestion = normalized.includes('?') || whWord !== null;
  const isBoundary = intersects(tokens, BOUNDARY);
  const isRegulation = intersects(tokens, REGULATION);
  const isPreference = intersects(tokens, PREFERENCE);

  let fn: CommunicationFunction;
  if (source === 'qaAnswer') {
    fn = 'answer';
  } else if (isQuestion) {
    fn = 'question';
  } else if (isBoundary) {
    fn = tokens.has('no') ? 'protest' : 'boundary';
  } else if (isRegulation) {
    fn = tokens.has('help') ? 'help' : 'regulationNeed';
  } else if (isPreference) {
    fn = 'preference';
  } else if (intersects(tokens, REQUEST)) {
    fn = 'request';
  } else {
    fn = 'otherOrUnclear';
  }

  return {
    communicationFunction: fn,
    functionSource: 'ruleBased',
    functionConfidence: RULE_BASED_CONFIDENCE,
    isQuestion,
    whQuestionType: whWord,
    expressesPreference: isPreference,
    setsBoundary: isBoundary,
    relatesToRegulation: isRegulation,
    introducesNewInformation: null,
    isPartOfRetelling: null,
    retellingDetails: [],
    requiredSentenceFeatures: {},
    grammarResult: null,
  };
}
