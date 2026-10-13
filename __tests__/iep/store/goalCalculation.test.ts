import {
  GoalMetric,
  annotateMetrics,
  calculationFromPlanner,
  goalPlanFromPlannerResponse,
  isSupportedMetric,
  matchingMetricId,
} from '../../../src/features/iep/model';

function metric(id: string, name: string, extra: Partial<GoalMetric> = {}): GoalMetric {
  return { id, name, category: '', definition: '', measurementMethod: '', ...extra };
}

function choice(goal: string, candidates: Array<[string, string]>) {
  return matchingMetricId(
    candidates.map(([id, name]) => metric(id, name)),
    goal,
  );
}

/** Proves the app grades a goal on the measure the goal is actually about. */
describe('metric routing', () => {
  it('a reciprocal turns goal is graded on turns, not initiations', () => {
    expect(
      choice('Child will take at least 3 reciprocal turns with a peer within a session.', [
        ['conversation_initiations', 'Conversation initiations'],
        ['child_responses', 'Child responses'],
        ['conversation_turns', 'Conversation turns'],
      ]),
    ).toBe('conversation_turns');
  });

  it('common goal words do not decide the match', () => {
    expect(
      choice('The child will produce 5 requests during a session.', [
        ['child_responses', 'Child responses'],
        ['request_count', 'Requests'],
      ]),
    ).toBe('request_count');
  });

  it('choice is independent of candidate order', () => {
    const goal = 'Child will take at least 3 reciprocal turns with a peer within a session.';
    const forwards: Array<[string, string]> = [
      ['conversation_initiations', 'Conversation initiations'],
      ['conversation_turns', 'Conversation turns'],
    ];
    expect(choice(goal, forwards)).toBe(choice(goal, [...forwards].reverse()));
  });

  it('no match returns null rather than guessing', () => {
    expect(
      choice('Child will participate in the morning routine.', [
        ['wh_questions', 'WH-questions'],
        ['repair_attempts', 'Communication repairs'],
      ]),
    ).toBeNull();
  });

  const catalogue: Array<[string, string]> = [
    ['qualifying_sentences', 'Qualifying sentences'],
    ['average_words_per_sentence', 'Average words per sentence'],
    ['conversation_initiations', 'Conversation initiations'],
    ['conversation_turns', 'Conversation turns'],
    ['child_responses', 'Child responses'],
    ['request_count', 'Requests'],
    ['different_communication_functions', 'Different communication functions'],
    ['page_navigations', 'Page navigations'],
    ['preferred_page_navigations', 'Preferred page navigations'],
    ['different_pages_visited', 'Different pages visited'],
    ['different_words_activated', 'Different words activated'],
    ['device_interactions', 'Device interactions'],
    ['questions_asked', 'Questions asked'],
    ['wh_questions', 'WH-questions'],
    ['novel_contributions', 'Novel contributions'],
    ['repair_attempts', 'Communication repairs'],
    ['preference_boundary_situations', 'Preferences and boundaries'],
    ['regulation_communications', 'Regulation communications'],
    ['retelling_details', 'Retelling details'],
  ];

  it('every goal picks its own measure from the full catalogue', () => {
    const expectations: Array<[string, string]> = [
      ['Child will create sentences with 3 or more words.', 'qualifying_sentences'],
      ['Child will increase average words per sentence.', 'average_words_per_sentence'],
      ['Child will initiate 4 conversations per session.', 'conversation_initiations'],
      ['Child will take at least 3 reciprocal turns with a peer within a session.', 'conversation_turns'],
      ['Child will respond to a partner turn 5 times per session.', 'child_responses'],
      ['Child will make 8 requests during a session.', 'request_count'],
      ['Child will use 5 different communication functions in a session.', 'different_communication_functions'],
      ['Child will navigate pages to find target vocabulary.', 'page_navigations'],
      ['Child will navigate to preferred pages 6 times per session.', 'preferred_page_navigations'],
      ['Child will visit 8 different pages during a session.', 'different_pages_visited'],
      ['Child will activate 20 different words in a session.', 'different_words_activated'],
      ['Child will increase device interactions above baseline.', 'device_interactions'],
      ['Child will ask 3 questions per session.', 'questions_asked'],
      ['Child will produce 2 WH-questions per session.', 'wh_questions'],
      ['Child will make 3 novel contributions to a conversation.', 'novel_contributions'],
      ['Child will attempt communication repairs when misunderstood.', 'repair_attempts'],
      ['Child will express preferences and boundaries 4 times per session.', 'preference_boundary_situations'],
      ['Child will produce regulation communications when dysregulated.', 'regulation_communications'],
      ['Child will retell an event with 4 details.', 'retelling_details'],
    ];
    expect(expectations).toHaveLength(19);
    const wrong = expectations
      .map(([goal, expected]) => [goal, expected, choice(goal, catalogue) ?? 'no match'])
      .filter(([, expected, actual]) => expected !== actual);
    expect(wrong).toEqual([]);
  });
});

/** Proves each measure carries the target the goal states for it, and no target otherwise. */
describe('metric targets', () => {
  const observedMetrics = () => [
    metric('conversation_initiations', 'Conversation initiations'),
    metric('child_responses', 'Child responses'),
    metric('conversation_turns', 'Conversation turns'),
  ];

  it('annotation does not invent a target from goal prose', () => {
    const annotated = annotateMetrics(observedMetrics());
    const turns = annotated.find(m => m.id === 'conversation_turns');
    expect(turns?.targetValue ?? null).toBeNull();
    expect(turns?.targetUnit ?? null).toBeNull();
  });

  it('measures the goal gives no number for get no target', () => {
    const annotated = annotateMetrics(observedMetrics());
    expect(annotated.find(m => m.id === 'conversation_initiations')?.targetValue ?? null).toBeNull();
    expect(annotated.find(m => m.id === 'child_responses')?.targetValue ?? null).toBeNull();
  });

  it('each measure keeps its own target', () => {
    const annotated = annotateMetrics([
      metric('qualifying_sentences', 'Qualifying sentences', { targetValue: 5, targetUnit: 'sentences' }),
      metric('different_words_activated', 'Different words activated', { targetValue: 20, targetUnit: 'words' }),
    ]);
    expect(annotated.find(m => m.id === 'qualifying_sentences')?.targetValue).toBe(5);
    expect(annotated.find(m => m.id === 'different_words_activated')?.targetValue).toBe(20);
  });

  it('an existing target is never overwritten', () => {
    const annotated = annotateMetrics([metric('conversation_turns', 'Conversation turns', { targetValue: 8, targetUnit: 'turns' })]);
    expect(annotated[0].targetValue).toBe(8);
  });

  it('measures the code cannot calculate are marked', () => {
    const annotated = annotateMetrics([
      metric('conversation_turns', 'Conversation turns'),
      metric('eye_contact_duration', 'Eye contact duration'),
    ]);
    expect(annotated.find(m => m.id === 'conversation_turns')?.isSupported).toBe(true);
    expect(annotated.find(m => m.id === 'eye_contact_duration')?.isSupported).toBe(false);
  });

  it('reciprocal interactions is a supported measure, peer proximity is not', () => {
    expect(isSupportedMetric('reciprocal_interactions')).toBe(true);
    expect(isSupportedMetric('peer_proximity_minutes')).toBe(false);
  });

  it('a word minimum is not invented as a word-count target', () => {
    const annotated = annotateMetrics([
      metric('qualifying_sentences', 'Qualifying sentences', { constraints: { minimumWordsPerSentence: 3 } }),
      metric('average_words_per_sentence', 'Average words per sentence'),
      metric('total_word_count_per_sentence', 'Total word count per sentence'),
    ]);
    expect(annotated[0].constraints?.minimumWordsPerSentence).toBe(3);
    for (const m of annotated) {
      expect(m.targetValue ?? null).toBeNull();
    }
  });

  it('the server metric contract decodes without creating a word target', () => {
    const plan = goalPlanFromPlannerResponse({
      goal_title: 'Sentence length',
      goal_summary: 'Produce sentences of 3 or more words.',
      metrics: [
        {
          id: 'qualifying_sentences',
          name: 'Qualifying sentences',
          category: 'Communication production',
          definition: 'Sentences meeting the word condition.',
          measurement_method: 'Count completed sentences meeting the condition.',
          role: 'direct',
          target_value: null,
          target_unit: null,
          target_timeframe: null,
          constraints: { minimum_words_per_sentence: 3 },
        },
        {
          id: 'average_words_per_sentence',
          name: 'Average words per sentence',
          category: 'Communication production',
          definition: 'Mean final word count.',
          measurement_method: 'Calculate the session mean.',
          role: 'context',
          target_value: null,
          target_unit: null,
          target_timeframe: null,
          constraints: null,
        },
      ],
      condition: 'At least 3 words per sentence.',
      target_value: null,
      target_unit: null,
      timeframe: null,
      consecutive_sessions: null,
      dashboard_title: 'Sentence length',
      dashboard_tiles: ['Progress'],
      confidence_note: 'No frequency target was stated.',
      provider: 'gemini',
      status: 'needs_review',
      primary_metric_id: 'qualifying_sentences',
      ambiguities: ['No frequency target was stated.'],
      achievement_rule: { type: 'tracking_only', required_metric_ids: [], explanation: 'No metric target was stated.' },
    });
    expect(plan).not.toBeNull();
    expect(plan!.metrics[0].role).toBe('direct');
    expect(plan!.metrics[0].constraints?.minimumWordsPerSentence).toBe(3);
    expect(plan!.metrics[0].targetValue ?? null).toBeNull();
    expect(plan!.metrics.find(m => m.id === 'average_words_per_sentence')?.targetValue ?? null).toBeNull();
    expect(plan!.achievementRule?.type).toBe('tracking_only');
    expect(plan!.calculation?.primaryMetricId).toBe('qualifying_sentences');
    expect(plan!.targetValue).toBe(0);
  });

  it('direct metric and constraint drive the calculation', () => {
    const calculation = calculationFromPlanner({
      metrics: [
        metric('total_sentences', 'Total sentences per session', { role: 'supporting' }),
        metric('qualifying_sentences', 'Qualifying sentences', { role: 'direct', constraints: { minimumWordsPerSentence: 3 } }),
      ],
      goalSummary: 'Sentence length',
      condition: 'The student will produce sentences of 3 or more words.',
      consecutiveSessions: null,
      serverPrimaryMetricId: 'total_sentences',
    });
    expect(calculation.primaryMetricId).toBe('qualifying_sentences');
    expect(calculation.minimumWordsPerSentence).toBe(3);
  });

  it('an explicit word metric remains the selected primary metric', () => {
    const calculation = calculationFromPlanner({
      metrics: [
        metric('qualifying_sentences', 'Qualifying sentences', { role: 'supporting', constraints: { minimumWordsPerSentence: 3 } }),
        metric('total_word_count_per_sentence', 'Total words per session', { role: 'direct', targetValue: 3, targetUnit: 'words' }),
      ],
      goalSummary: 'Sentence length',
      condition: 'The student will produce sentences of 3 or more words.',
      consecutiveSessions: null,
      serverPrimaryMetricId: 'qualifying_sentences',
    });
    expect(calculation.primaryMetricId).toBe('total_word_count_per_sentence');
    expect(calculation.minimumWordsPerSentence).toBe(3);
  });

  it('the server primary metric wins when legacy metrics have no roles', () => {
    const calculation = calculationFromPlanner({
      metrics: [
        metric('qualifying_sentences', 'Qualifying sentences'),
        metric('total_word_count_per_sentence', 'Total words per session'),
      ],
      goalSummary: 'Sentence length',
      condition: 'The student will produce sentences of 3 or more words.',
      consecutiveSessions: null,
      serverPrimaryMetricId: 'total_word_count_per_sentence',
    });
    expect(calculation.primaryMetricId).toBe('total_word_count_per_sentence');
  });
});

/** Pins defects that reached a running app. */
describe('regressions on the planner path', () => {
  it('a two-word goal keeps a two-word threshold', () => {
    const calculation = calculationFromPlanner({
      metrics: [metric('qualifying_sentences', 'Qualifying sentences')],
      goalSummary: 'Child will create 5 sentences with 2 or more words during a session.',
      condition: '',
      consecutiveSessions: 3,
      serverPrimaryMetricId: 'qualifying_sentences',
    });
    expect(calculation.minimumWordsPerSentence).toBe(2);
  });

  it('a four-word goal keeps a four-word threshold', () => {
    const calculation = calculationFromPlanner({
      metrics: [metric('qualifying_sentences', 'Qualifying sentences')],
      goalSummary: 'Child will produce 3 sentences of at least 4 words.',
      condition: '',
      consecutiveSessions: null,
      serverPrimaryMetricId: null,
    });
    expect(calculation.minimumWordsPerSentence).toBe(4);
  });

  it('the planner builds structured POS and independence conditions', () => {
    const calculation = calculationFromPlanner({
      metrics: [metric('qualifying_sentences', 'Qualifying sentences')],
      goalSummary: 'Child will independently create 5 sentences with at least 5 words, one noun and one adjective.',
      condition: 'without prompts',
      consecutiveSessions: null,
      serverPrimaryMetricId: 'qualifying_sentences',
    });
    expect(calculation.minimumWordsPerSentence).toBe(5);
    expect(calculation.requiredPartOfSpeechCounts).toEqual({ noun: 1, adjective: 1 });
    expect(calculation.allowedSupportLevels).toEqual(['independent']);
  });

  it('a non-sentence goal has no word threshold', () => {
    const calculation = calculationFromPlanner({
      metrics: [metric('conversation_turns', 'Conversation turns')],
      goalSummary: 'Child will take at least 3 reciprocal turns with a peer within a session.',
      condition: '',
      consecutiveSessions: 3,
      serverPrimaryMetricId: null,
    });
    expect(calculation.minimumWordsPerSentence).toBeNull();
    expect(calculation.comparisonOperator).toBe('atLeast');
  });

  it('a build-time goal carries the at-most direction', () => {
    const calculation = calculationFromPlanner({
      metrics: [metric('build_seconds', 'Time to build a sentence', { role: 'direct', targetValue: 20 })],
      goalSummary: 'Child will build a sentence in 20 seconds or less.',
      condition: '',
      consecutiveSessions: null,
      serverPrimaryMetricId: null,
    });
    expect(calculation.primaryMetricId).toBe('build_seconds');
    expect(calculation.comparisonOperator).toBe('atMost');
  });

  it("the planner path preserves the server's explicit choice", () => {
    const calculation = calculationFromPlanner({
      metrics: [
        metric('conversation_initiations', 'Conversation initiations'),
        metric('child_responses', 'Child responses'),
        metric('conversation_turns', 'Conversation turns'),
      ],
      goalSummary: 'Child will take at least 3 reciprocal turns with a peer within a session.',
      condition: '',
      consecutiveSessions: 3,
      serverPrimaryMetricId: 'conversation_initiations',
    });
    expect(calculation.primaryMetricId).toBe('conversation_initiations');
  });

  it('falls back to the server choice when wording says nothing', () => {
    const calculation = calculationFromPlanner({
      metrics: [metric('repair_attempts', 'Communication repairs')],
      goalSummary: 'Child will participate in the morning routine.',
      condition: '',
      consecutiveSessions: null,
      serverPrimaryMetricId: 'repair_attempts',
    });
    expect(calculation.primaryMetricId).toBe('repair_attempts');
  });

  it('keeps the consecutive-session rule and conditions', () => {
    const calculation = calculationFromPlanner({
      metrics: [metric('qualifying_sentences', 'Qualifying sentences')],
      goalSummary: 'Child will create 5 sentences with 3 or more words.',
      condition: 'given modelling',
      consecutiveSessions: 4,
      serverPrimaryMetricId: null,
    });
    expect(calculation.requiredSessionCount).toBe(4);
    expect(calculation.requiredConditions).toEqual(['given modelling']);
  });
});

describe('part-of-speech inference', () => {
  it('comes from the goal wording only, never from a metric\'s explanatory prose', () => {
    const calculation = calculationFromPlanner({
      metrics: [metric('qualifying_sentences', 'Qualifying sentences', { definition: 'Completed messages of two or more words, e.g. a noun plus a verb', role: 'direct' })],
      goalSummary: 'Child will combine at least 2 words to express a meaningful message 5 times per session.',
      condition: 'during a treatment session',
      consecutiveSessions: 3,
      serverPrimaryMetricId: null,
    });
    expect(calculation.requiredPartOfSpeechCounts).toBeNull();
  });
});
