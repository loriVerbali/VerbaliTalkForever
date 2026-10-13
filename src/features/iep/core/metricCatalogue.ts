/**
 * The one place an IEP metric is defined.
 *
 * Ported from `MetricCatalogue.swift`. Clinical definitions marked `awaitingDefinition`
 * come from `contracts/measurement-contract.md` Part B and need an SLP before they can
 * be scored. They stay visible; they are never scored against a guessed substitute.
 */

import {
  MetricDefinition,
  MetricId,
  MetricResolution,
  defineMetric,
} from './metricDefinition';

// Sentence production

const totalSentences = defineMetric({
  id: 'total_sentences',
  displayName: 'Total sentences per session',
  unit: 'sentences',
  clinicalDefinition: 'Every completed sentence, whatever its length.',
});

const qualifyingSentences = defineMetric({
  id: 'qualifying_sentences',
  displayName: 'Qualifying sentences',
  unit: 'sentences',
  clinicalDefinition: "Completed sentences reaching the goal's own word threshold.",
});

const averageWordsPerSentence = defineMetric({
  id: 'average_words_per_sentence',
  displayName: 'Average words per sentence',
  unit: 'words',
  clinicalDefinition: 'Words in completed sentences divided by the number of sentences.',
});

/** A property of one sentence, not of a session. */
const totalWordCountPerSentence = defineMetric({
  id: 'total_word_count_per_sentence',
  displayName: 'Words per sentence',
  unit: 'words',
  clinicalDefinition: 'The number of words in one sentence. "I want food" is 3.',
  scope: 'sentence',
});

const longestSentenceWords = defineMetric({
  id: 'longest_sentence_words',
  displayName: 'Longest sentence',
  unit: 'words',
  clinicalDefinition: 'The most words in a single completed sentence.',
  aggregation: 'maximum',
});

/** The only metric where a smaller number is the better one. */
const buildSeconds = defineMetric({
  id: 'build_seconds',
  displayName: 'Time to build a sentence',
  unit: 'seconds',
  clinicalDefinition: 'From the first word selected to the sentence being completed.',
  comparison: 'atMost',
});

// Conversation

const conversationTurns = defineMetric({
  id: 'conversation_turns',
  displayName: 'Conversation turns',
  unit: 'turns',
  clinicalDefinition:
    'Contested: the catalogue, the two calculation paths and the planner disagree on ' +
    "whether this counts the child's contributions or all exchanges. See measurement-contract.md B1.",
  approval: 'awaitingDefinition',
  unavailableReason: 'The definition of a conversation turn is awaiting SLP approval.',
});

const conversationInitiations = defineMetric({
  id: 'conversation_initiations',
  displayName: 'Conversation initiations',
  unit: 'initiations',
  clinicalDefinition: 'Conversations where the child was the first speaker.',
});

const reciprocalInteractions = defineMetric({
  id: 'reciprocal_interactions',
  displayName: 'Reciprocal interactions',
  unit: 'interactions',
  clinicalDefinition:
    'Exchanges where both the child and partner contributed. ' +
    'What makes an exchange reciprocal is unsettled. See B2.',
  approval: 'awaitingDefinition',
  unavailableReason: 'The definition of a reciprocal interaction is awaiting SLP approval.',
});

// Communication function

const requestCount = defineMetric({
  id: 'request_count',
  displayName: 'Requests',
  unit: 'requests',
  clinicalDefinition: 'Messages detected as requests.',
  requirement: 'aiAssisted',
});

const differentCommunicationFunctions = defineMetric({
  id: 'different_communication_functions',
  displayName: 'Different communication functions',
  unit: 'functions',
  clinicalDefinition: 'Distinct detected purposes, such as request, comment or protest.',
  requirement: 'aiAssisted',
});

const questionsAsked = defineMetric({
  id: 'questions_asked',
  displayName: 'Questions asked',
  unit: 'questions',
  clinicalDefinition: 'Messages detected as questions.',
  requirement: 'aiAssisted',
});

const whQuestions = defineMetric({
  id: 'wh_questions',
  displayName: 'WH-questions',
  unit: 'questions',
  clinicalDefinition:
    'Questions using who, what, where, when, why or how. A subset of questions asked.',
  requirement: 'aiAssisted',
});

const novelContributions = defineMetric({
  id: 'novel_contributions',
  displayName: 'Novel contributions',
  unit: 'contributions',
  clinicalDefinition: 'Messages detected as introducing new information.',
  requirement: 'aiAssisted',
});

const repairAttempts = defineMetric({
  id: 'repair_attempts',
  displayName: 'Communication repairs',
  unit: 'repairs',
  clinicalDefinition: 'Attempts to revise a message after a breakdown.',
  requirement: 'aiAssisted',
});

const retellingDetails = defineMetric({
  id: 'retelling_details',
  displayName: 'Retelling details',
  unit: 'details',
  clinicalDefinition: 'Distinct details included when describing an event.',
  requirement: 'aiAssisted',
});

// Navigation and device use

const pageNavigations = defineMetric({
  id: 'page_navigations',
  displayName: 'Page navigations',
  unit: 'navigations',
  clinicalDefinition: 'Each recorded move between board pages.',
});

const differentPagesVisited = defineMetric({
  id: 'different_pages_visited',
  displayName: 'Different pages visited',
  unit: 'pages',
  clinicalDefinition: 'Distinct board pages opened during the session.',
});

const differentWordsActivated = defineMetric({
  id: 'different_words_activated',
  displayName: 'Different words activated',
  unit: 'words',
  clinicalDefinition: 'Distinct words selected during the session.',
});

const totalWordActivations = defineMetric({
  id: 'total_word_activations',
  displayName: 'Total AAC button taps',
  unit: 'taps',
  clinicalDefinition:
    'Every recorded tap on an AAC word or symbol button, including repeated taps of the same button.',
});

const deviceInteractions = defineMetric({
  id: 'device_interactions',
  displayName: 'Device interactions',
  unit: 'interactions',
  clinicalDefinition:
    'Recorded in-app interactions. Baseline-change goals need a configured baseline ' +
    'before this can be interpreted.',
  role: 'contextualMetric',
});

const preferredPageNavigations = defineMetric({
  id: 'preferred_page_navigations',
  displayName: 'Preferred page navigations',
  unit: 'navigations',
  clinicalDefinition:
    'Moves to a page marked preferred. Nothing configures which pages are preferred. See B6.',
  requirement: 'notImplemented',
  approval: 'awaitingDefinition',
  unavailableReason: 'No configuration exists for which pages are preferred.',
});

const all: readonly MetricDefinition[] = [
  totalSentences,
  qualifyingSentences,
  averageWordsPerSentence,
  totalWordCountPerSentence,
  longestSentenceWords,
  buildSeconds,
  conversationTurns,
  conversationInitiations,
  reciprocalInteractions,
  requestCount,
  differentCommunicationFunctions,
  questionsAsked,
  whQuestions,
  novelContributions,
  repairAttempts,
  retellingDetails,
  pageNavigations,
  differentPagesVisited,
  differentWordsActivated,
  totalWordActivations,
  deviceInteractions,
  preferredPageNavigations,
];

const byId: ReadonlyMap<MetricId, MetricDefinition> = new Map(all.map(m => [m.id, m]));

/**
 * Identifiers the AI planner has been observed to return that are not catalogue ids,
 * mapped to what they mean. A lookup, never a fuzzy match.
 */
const aliases: ReadonlyMap<string, MetricResolution> = new Map<string, MetricResolution>([
  ['sentences', { id: totalSentences.id, minimumWordsPerSentence: null }],
  ['number_of_sentences', { id: totalSentences.id, minimumWordsPerSentence: null }],
  ['words_per_sentence', { id: averageWordsPerSentence.id, minimumWordsPerSentence: null }],
  ['qualifying_sentences_2plus', { id: qualifyingSentences.id, minimumWordsPerSentence: 2 }],
  ['qualifying_sentences_3plus', { id: qualifyingSentences.id, minimumWordsPerSentence: 3 }],
  ['qualifying_sentences_4plus', { id: qualifyingSentences.id, minimumWordsPerSentence: 4 }],
  ['communication_repairs', { id: repairAttempts.id, minimumWordsPerSentence: null }],
  ['requests', { id: requestCount.id, minimumWordsPerSentence: null }],
]);

/**
 * Identifiers deliberately left unresolved. Each names something narrower or different
 * from the metric it most resembles; mapping it across would be the nearest guess the
 * contract forbids. They are reported unsupported by name.
 */
const deliberatelyUnresolved: ReadonlySet<string> = new Set([
  'child_responses',
  'peer_reciprocal_interactions',
  'independent_conversation_initiations',
]);

/** Ids that name how a value is stored rather than what is being measured. */
const storageOnlyIdentifiers: ReadonlySet<string> = new Set([
  'qualifying_sentences_2plus',
  'qualifying_sentences_3plus',
  'qualifying_sentences_4plus',
]);

function definitionFor(id: MetricId): MetricDefinition | undefined {
  return byId.get(id);
}

/**
 * Resolves an identifier from any source to a catalogue metric, or null when it names
 * nothing the app knows.
 */
function resolve(rawId: string): MetricResolution | null {
  const key = rawId.trim().toLowerCase();
  const direct = byId.get(key);
  if (direct) {
    return { id: direct.id, minimumWordsPerSentence: null };
  }
  return aliases.get(key) ?? null;
}

export const MetricCatalogue = {
  totalSentences,
  qualifyingSentences,
  averageWordsPerSentence,
  totalWordCountPerSentence,
  longestSentenceWords,
  buildSeconds,
  conversationTurns,
  conversationInitiations,
  reciprocalInteractions,
  requestCount,
  differentCommunicationFunctions,
  questionsAsked,
  whQuestions,
  novelContributions,
  repairAttempts,
  retellingDetails,
  pageNavigations,
  differentPagesVisited,
  differentWordsActivated,
  totalWordActivations,
  deviceInteractions,
  preferredPageNavigations,
  all,
  definitionFor,
  resolve,
  deliberatelyUnresolved,
  storageOnlyIdentifiers,
} as const;
