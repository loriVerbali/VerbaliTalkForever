/**
 * Ready-made IEP goals an SLP can pick instead of typing one out.
 *
 * Offered in mock mode only: these are reference and demonstration wordings. The
 * published set keeps its (date) and (name) placeholders; the dataset wordings are the
 * same nineteen goals written out concretely, matching the 52-week synthetic sessions.
 */

export type LibraryGoalSource = 'published' | 'dataset' | 'edgeCase';

export const LIBRARY_SOURCE_LABEL: Record<LibraryGoalSource, string> = {
  published: 'Published goal set',
  dataset: 'Sample data goals',
  edgeCase: 'Edge cases',
};

export interface LibraryGoal {
  readonly id: string;
  readonly title: string;
  readonly source: LibraryGoalSource;
  readonly statement: string;
}

const g = (id: string, title: string, source: LibraryGoalSource, statement: string): LibraryGoal => ({
  id,
  title,
  source,
  statement,
});

export const publishedGoals: readonly LibraryGoal[] = [
  g('P01', 'Conversation initiation', 'published', 'By (date), given open access to a robust AAC system and modeling, (name) will initiate communication independently at least 5 times within a treatment session using their AAC device.'),
  g('P02', 'Communication-function diversity (3)', 'published', 'By (date), given open access to a familiar communication partner and AAC, (name) will use at least 3 different functions of communication (e.g., commenting, requesting, protesting, sharing) within a treatment session in self-directed ways.'),
  g('P03', 'Preferred-page navigation', 'published', 'By (date), given open access to an affirming environment and unrestricted AAC access, (name) will navigate to a preferred category/page of their AAC system independently in at least 3 times within a treatment session.'),
  g('P04', 'Meaningful 2-word sentences', 'published', 'By (date), given open access to modeling and multimodal supports, (name) will use their AAC system to combine at least 2 symbols/words to express a meaningful message at least 5 times within a treatment session.'),
  g('P05', 'Self-directed device exploration', 'published', 'By (date), given unrestricted access to their AAC system and affirming communication partners, (name) will explore and interact with their device in a self-directed manner at least X times over baseline across 3 consecutive sessions.'),
  g('P06', 'Turn-taking', 'published', "By (date), given open access to modeling and an affirming communication environment, (name) will demonstrate emerging communicative intent by engaging in turn-taking with their AAC device (e.g., pressing a button in response to a partner's message, using a single-word utterance to participate in an interaction) at least 3 times within a treatment session."),
  g('P07', 'One interaction per session', 'published', 'By (date), given consistent modeling and access to multimodal supports, (name) will use their AAC device to initiate at least one interaction per session with a familiar communication partner across 3 consecutive sessions.'),
  g('P08', 'Different words activated', 'published', 'By (date), given access to modeling and self-directed exploration, (name) will independently locate and activate at least 5 different symbols/words within their AAC system during a session.'),
  g('P09', 'Requesting', 'published', 'By (date), given access to an affirming communication environment and familiar partners, (name) will use their AAC system to request a preferred item, action, or activity at least 3 times per session in a self-directed manner.'),
  g('P10', 'Communication-function diversity (5)', 'published', 'By (date), given access to a robust AAC system and communication partners who respond meaningfully to all communication attempts, (name) will use at least 5 different communicative functions (e.g., commenting, requesting, protesting, sharing, asking questions) within a treatment session in self-directed ways.'),
  g('P11', 'Reciprocal peer interaction', 'published', 'By (date), given access to peer modeling and interaction opportunities, (name) will use their AAC system to engage in at least one reciprocal social interaction with a peer per session across 3 consecutive sessions.'),
  g('P12', 'Novel contributions', 'published', 'By (date), given open-ended discussion prompts and a familiar communication partner, (name) will use their AAC system to contribute a novel thought, idea, or opinion during a structured conversation at least 3 times per session.'),
  g('P13', 'Regulation-related communication', 'published', 'By (date), given access to self-advocacy modeling and supportive communication partners, (name) will use their AAC system to communicate a regulation-related need (e.g., requesting a break, asking for help, indicating discomfort) at least 2 times per session.'),
  g('P14', 'Navigation plus 3-word sentences', 'published', 'By (date), given a familiar routine and access to their AAC system, (name) will independently navigate to at least 3 different categories/pages within their AAC device and select relevant words to construct a meaningful three-word message at least 3 times per session.'),
  g('P15', 'Communication repair', 'published', 'By (date), given unrestricted AAC access and a responsive communication partner, (name) will use their AAC system to clarify a miscommunication or repair a conversational breakdown (e.g., rephrasing, expanding a message, using a different word) in at least 2 instances per session.'),
  g('P16', 'Preferences and boundaries', 'published', 'By (date), given access to a robust AAC system and self-advocacy opportunities, (name) will use their AAC system to express a preference or set a boundary (e.g., declining an activity, choosing an alternative) in at least 3 different situations within a session.'),
  g('P17', 'WH-questions', 'published', 'By (date), given open-ended communication opportunities and affirming modeling, (name) will use their AAC system to ask at least 2 wh-questions (e.g., who, what, where, when, why) during a session to gather information from a communication partner.'),
  g('P18', '4-word sentences with descriptor', 'published', 'By (date), given access to their AAC system and embedded literacy opportunities, (name) will use their AAC device to construct a grammatically correct 4-word utterance that includes a descriptor (e.g., "big red ball," "I want more music") at least 3 times per session.'),
  g('P19', 'Event retelling', 'published', 'By (date), given meaningful access to storytelling and language modeling, (name) will use their AAC system to retell a familiar event or sequence of events with at least 3 details across 3 consecutive sessions.'),
];

export const datasetGoals: readonly LibraryGoal[] = [
  g('G01', 'Conversation initiation', 'dataset', 'By the target date, given open access to a robust AAC system and modeling, the child will initiate communication independently at least 5 times within a treatment session.'),
  g('G02', 'Communication-function diversity (3)', 'dataset', 'By the target date, given open access to a familiar communication partner and AAC, the child will use at least 3 different functions of communication within a treatment session in self-directed ways.'),
  g('G03', 'Preferred-page navigation', 'dataset', 'By the target date, given open access to an affirming environment and unrestricted AAC access, the child will navigate to a preferred category or page independently at least 3 times within a treatment session.'),
  g('G04', 'Meaningful 2-word sentences', 'dataset', 'By the target date, given access to modeling and multimodal supports, the child will use the AAC system to combine at least 2 words to express a meaningful sentence at least 5 times within a treatment session.'),
  g('G05', 'Self-directed device exploration', 'dataset', 'By the target date, given unrestricted access to the AAC system and affirming communication partners, the child will explore and interact with the device in a self-directed manner at least 5 interactions over baseline across 3 consecutive sessions.'),
  g('G06', 'Turn-taking', 'dataset', 'By the target date, given access to modeling and an affirming communication environment, the child will demonstrate emerging communicative intent by engaging in turn-taking with the AAC device at least 3 times within a treatment session.'),
  g('G07', 'One interaction per session', 'dataset', 'By the target date, given consistent modeling and access to multimodal supports, the child will use the AAC system to initiate at least one interaction per session with a familiar communication partner across 3 consecutive sessions.'),
  g('G08', 'Different words activated', 'dataset', 'By the target date, given access to modeling and self-directed exploration, the child will independently locate and activate at least 5 different words within the AAC system during a session.'),
  g('G09', 'Requesting', 'dataset', 'By the target date, given access to an affirming communication environment and familiar partners, the child will use the AAC system to request a preferred item, action, or activity at least 3 times per session in a self-directed manner.'),
  g('G10', 'Communication-function diversity (5)', 'dataset', 'By the target date, given access to a robust AAC system and responsive communication partners, the child will use at least 5 different communicative functions within a treatment session in self-directed ways.'),
  g('G11', 'Reciprocal peer interaction', 'dataset', 'By the target date, given access to peer modeling and interaction opportunities, the child will use the AAC system to engage in at least one reciprocal social interaction with a peer per session across 3 consecutive sessions.'),
  g('G12', 'Novel contributions', 'dataset', 'By the target date, given open-ended discussion prompts and a familiar communication partner, the child will use the AAC system to contribute a novel thought, idea, or opinion during a structured conversation at least 3 times per session.'),
  g('G13', 'Regulation-related communication', 'dataset', 'By the target date, given access to self-advocacy modeling and supportive communication partners, the child will use the AAC system to communicate a regulation-related need at least 2 times per session.'),
  g('G14', 'Navigation plus 3-word sentences', 'dataset', 'By the target date, given a familiar routine and access to the AAC system, the child will independently navigate to at least 3 different categories or pages and select relevant words to construct a meaningful three-word sentence at least 3 times per session.'),
  g('G15', 'Communication repair', 'dataset', 'By the target date, given unrestricted AAC access and a responsive communication partner, the child will use the AAC system to clarify a miscommunication or repair a conversational breakdown in at least 2 instances per session.'),
  g('G16', 'Preferences and boundaries', 'dataset', 'By the target date, given access to a robust AAC system and self-advocacy opportunities, the child will use the AAC system to express a preference or set a boundary in at least 3 different situations within a session.'),
  g('G17', 'WH-questions', 'dataset', 'By the target date, given open-ended communication opportunities and affirming modeling, the child will use the AAC system to ask at least 2 WH-questions during a session to gather information from a communication partner.'),
  g('G18', '4-word sentences with descriptor', 'dataset', 'By the target date, given access to their AAC system and embedded literacy opportunities, the child will construct a grammatically correct 4-word sentence that includes a descriptor at least 3 times per session.'),
  g('G19', 'Event retelling', 'dataset', 'By the target date, given meaningful access to storytelling and language modeling, the child will use the AAC system to retell a familiar event or sequence of events with at least 3 details across 3 consecutive sessions.'),
];

export const edgeCaseGoals: readonly LibraryGoal[] = [
  g('E01', 'Declining sentence complexity', 'edgeCase', 'Child will combine at least 2 words to express a meaningful sentence at least 5 times within a session.'),
  g('E02', 'Plateau below target', 'edgeCase', 'Child will initiate communication independently at least 5 times within a treatment session.'),
  g('E03', 'Dip and recovery', 'edgeCase', 'Child will produce at least 4 conversation turns within a session across 3 consecutive sessions.'),
  g('E04', 'Dormant goal', 'edgeCase', 'Child will navigate independently to 3 different pages within a session.'),
  g('E05', 'Single session so far', 'edgeCase', 'Child will use at least 5 different communication functions within a session.'),
  g('E06', 'Three sessions only', 'edgeCase', 'Child will ask at least 3 WH-questions within a session.'),
  g('E07', 'Expanding vocabulary', 'edgeCase', 'Child will combine at least 3 words to express a meaningful sentence at least 6 times within a session.'),
  g('E08', 'Single context, unknown support', 'edgeCase', 'Child will take at least 3 reciprocal turns with a peer within a session.'),
  g('E09', 'Irregular attendance', 'edgeCase', 'Child will produce at least 8 sentences within a session.'),
  g('E10', 'Partially recorded sessions', 'edgeCase', 'Child will activate at least 12 different words within a session.'),
  g('E11', 'One strong session', 'edgeCase', 'Child will produce at least 4 requests within a session.'),
];

/** Every goal, in the order a therapist would browse them. */
export const allLibraryGoals: readonly LibraryGoal[] = [
  ...publishedGoals,
  ...datasetGoals,
  ...edgeCaseGoals,
];

export const libraryGoalsBySource: ReadonlyArray<[LibraryGoalSource, readonly LibraryGoal[]]> = [
  ['published', publishedGoals],
  ['dataset', datasetGoals],
  ['edgeCase', edgeCaseGoals],
];
