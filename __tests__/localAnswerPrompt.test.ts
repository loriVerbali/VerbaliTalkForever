import {
  asksForListed,
  buildLocalAnswerMessages,
  buildLocalAnswerSchema,
  buildPrefillMessages,
  dropUnaskedNames,
  extraAnswersFor,
  listedNames,
  maxAnswerTokens,
  buildPrimingMessages,
  buildStableContextText,
  clampCount,
  heuristicAnswers,
  normalizeAnswerWord,
  parseLocalAnswers,
  snapshotContextInfo,
  summarizeHistory,
  summarizePepes,
} from '../src/services/localLlm/localAnswerPrompt';
import {FALLBACK_ANSWER_IMAGE} from '../src/services/localLlm/localLlmModels';

const words = (answers: Array<{word: string}>) => answers.map(a => a.word);

describe('clampCount', () => {
  it('defaults and clamps', () => {
    expect(clampCount(undefined)).toBe(5);
    expect(clampCount('7')).toBe(7);
    expect(clampCount(0)).toBe(5);
    expect(clampCount(99)).toBe(12);
    expect(clampCount(3.9)).toBe(3);
  });
});

describe('normalizeAnswerWord', () => {
  it('trims punctuation and capitalises', () => {
    expect(normalizeAnswerWord('  "ice cream."  ')).toBe('Ice cream');
    expect(normalizeAnswerWord('go  home')).toBe('Go home');
  });
  it('rejects sentences and junk', () => {
    expect(normalizeAnswerWord('I would like some water')).toBe('');
    expect(normalizeAnswerWord('')).toBe('');
    expect(normalizeAnswerWord('wo{rd')).toBe('');
    expect(normalizeAnswerWord('(word)')).toBe('Word');
    expect(normalizeAnswerWord(42)).toBe('');
  });
});

describe('parseLocalAnswers', () => {
  it('reads the schema shape and attaches the placeholder image', () => {
    const raw = JSON.stringify({
      question: 'How are you feeling?',
      is_yes_no: false,
      answers: [
        {word: 'good', type: 'adjective'},
        {word: 'tired', type: 'adjective'},
        {word: 'Good', type: 'adjective'},
        {word: 'a bit sore today', type: 'adjective'},
      ],
    });
    const out = parseLocalAnswers(raw, {count: 5});
    expect(words(out)).toEqual(['Good', 'Tired']);
    expect(out[0]).toEqual({word: 'Good', type: 'adjective', imageUrl: FALLBACK_ANSWER_IMAGE});
  });

  it('tolerates code fences and leading prose', () => {
    const raw = 'Sure! ```json\n{"question":"q","is_yes_no":false,"answers":[{"word":"Coffee","type":"noun"}]}\n```';
    expect(words(parseLocalAnswers(raw, {count: 5}))).toEqual(['Coffee']);
  });

  it('forces Yes/No when the model flags a yes/no question', () => {
    const raw = JSON.stringify({
      question: 'Do you want tea?',
      is_yes_no: true,
      answers: [{word: 'Tea', type: 'noun'}, {word: 'Yes', type: 'other'}],
    });
    expect(words(parseLocalAnswers(raw, {count: 5}))).toEqual(['Yes', 'No']);
  });

  it('uses the model list when Yes/No were already shown', () => {
    const raw = JSON.stringify({
      question: 'Do you want tea?',
      is_yes_no: true,
      answers: [{word: 'Maybe later', type: 'other'}],
    });
    expect(words(parseLocalAnswers(raw, {count: 5, priorAnswers: ['Yes', 'No']}))).toEqual([
      'Maybe later',
    ]);
  });

  it('drops prior answers case-insensitively and caps at count', () => {
    const raw = JSON.stringify({
      question: 'q',
      is_yes_no: false,
      answers: ['pizza', 'Pasta', 'salad', 'soup', 'bread'],
    });
    expect(words(parseLocalAnswers(raw, {count: 2, priorAnswers: ['PIZZA']}))).toEqual([
      'Pasta',
      'Salad',
    ]);
  });

  it('salvages answers from truncated JSON in either shape', () => {
    const objects = '{"question":"q","is_yes_no":false,"answers":[{"word":"Park","type":"noun"},{"word":"Beach","ty';
    expect(words(parseLocalAnswers(objects, {count: 5}))).toEqual(['Park', 'Beach']);
    const strings = '{"question":"Where to go","is_yes_no":false,"answers":["Park","Beach","Ho';
    expect(words(parseLocalAnswers(strings, {count: 5}))).toEqual(['Park', 'Beach']);
  });

  it('reads bare string answers', () => {
    const raw = JSON.stringify({question: 'q', is_yes_no: false, answers: ['coffee', 'Tea', 'coffee']});
    expect(words(parseLocalAnswers(raw, {count: 5}))).toEqual(['Coffee', 'Tea']);
  });

  it('reads the bare array the schema asks for, pretty-printed or not', () => {
    expect(words(parseLocalAnswers('["Yes", "No", "Not now"]', {count: 5}))).toEqual(['Yes', 'No', 'Not now']);
    expect(words(parseLocalAnswers('[\n  "Lori",\n  "David"\n]', {count: 5}))).toEqual(['Lori', 'David']);
    expect(words(parseLocalAnswers('```json\n["Soup"]\n```', {count: 5}))).toEqual(['Soup']);
  });

  it('drops a question word echoed as an answer', () => {
    expect(words(parseLocalAnswers('["Who", "Lori", "where", "David"]', {count: 5}))).toEqual(['Lori', 'David']);
  });

  it('salvages a bare array cut off mid-way', () => {
    expect(words(parseLocalAnswers('["Park", "Beach", "Ho', {count: 5}))).toEqual(['Park', 'Beach']);
  });

  it('returns nothing for garbage so the caller can fall back', () => {
    expect(parseLocalAnswers('I cannot help with that.', {count: 5})).toEqual([]);
    expect(parseLocalAnswers('', {count: 5})).toEqual([]);
  });

  it('accepts the backend key names too', () => {
    const raw = JSON.stringify({'Possible answers': [{word: 'Mom', type: 'noun'}]});
    expect(words(parseLocalAnswers(raw, {count: 5}))).toEqual(['Mom']);
  });
});

describe('heuristicAnswers', () => {
  it('answers yes/no questions with Yes and No', () => {
    expect(words(heuristicAnswers('Did you sleep well?', 5))).toEqual(['Yes', 'No']);
  });
  it('treats descriptive questions as open', () => {
    const out = words(heuristicAnswers('How was your day?', 3));
    expect(out).toHaveLength(3);
    expect(out).not.toContain('Yes');
  });
  it('skips priors', () => {
    expect(words(heuristicAnswers('Are you cold?', 5, ['Yes', 'No']))).not.toContain('Yes');
  });
});

describe('buildLocalAnswerMessages', () => {
  it('puts the question, count, priors and compact context in the user turn', () => {
    const [system, user] = buildLocalAnswerMessages({
      sentence: 'Who is coming for dinner?',
      mode: 'generate_more_answers',
      count: 5,
      contextInfo: 'Evening, raining, at home',
      priorAnswers: ['Mom', 'Nobody'],
      pepes: {
        People: [{name: 'Lori', aliases: ['Dad']}, {name: 'Shay'}],
        Pets: [{name: 'Max'}],
        Food: [],
      },
      tellUsMore: 'Loves football.',
      conversationHistory: [
        {role: 'user', content: 'How are you?'},
        {role: 'assistant', content: 'Good, Tired. User picked: Tired'},
      ],
      memoryContext: {personal: {facts: ['Takes Tylenol at night']}},
      userName: 'Sam',
    });
    expect(system.role).toBe('system');
    expect(system.content).toContain('1 to 3 words');
    expect(user.role).toBe('user');
    // The session-constant head comes first and verbatim, so the KV cache
    // primed at load time covers it; the question is in the tail.
    const stable = buildStableContextText({
      userName: 'Sam',
      pepes: {People: [{name: 'Lori', aliases: ['Dad']}, {name: 'Shay'}], Pets: [{name: 'Max'}], Food: []},
      tellUsMore: 'Loves football.',
      count: 5,
    });
    expect(user.content.startsWith(stable)).toBe(true);
    expect(user.content.indexOf('Partner said')).toBeGreaterThan(stable.length);
    expect(user.content).toContain('Partner said: "Who is coming for dinner?"');
    expect(user.content).toContain('Number of answers: 5');
    expect(user.content).toContain('Already shown, do not repeat or paraphrase: Mom, Nobody');
    expect(user.content).toContain('did not find a fitting answer');
    expect(user.content).toContain('People: Lori (Dad), Shay; Pets: Max');
    // The list is framed as reference material, not as answer material.
    expect(user.content).toContain('ignore for any other question');
    expect(user.content).toContain('About the user: Loves football.');
    expect(user.content).toContain('Known facts: Takes Tylenol at night');
    expect(user.content).toContain('Partner: "How are you?" → user chose "Tired"');
    expect(user.content).toContain("The user's name is Sam.");
    // Memory is part of the head (it is a between-questions snapshot), so it
    // sits before the context line, the history and the sentence.
    expect(user.content.indexOf('Known facts')).toBeLessThan(user.content.indexOf('Context:'));
    expect(user.content.indexOf('Context:')).toBeLessThan(user.content.indexOf('Recent conversation'));
    expect(user.content.indexOf('Recent conversation')).toBeLessThan(
      user.content.indexOf('Partner said'),
    );
    expect(user.content.indexOf('Partner said')).toBeLessThan(user.content.indexOf('Already shown'));
  });

  it('includes personal facts after the count without priming answers with frequent words', () => {
    const head = buildStableContextText({
      count: 4,
      memoryContext: {
        personal: {facts: ['Lives alone', 'Has a dog called Rex']},
        communication: {frequentWords: ['I', 'Want', 'Sleep', 'to', 'Go', 'No', 'Dad', 'Need']},
      },
    });
    expect(head).toBe(
      'Number of answers: 4\nKnown facts: Lives alone; Has a dog called Rex',
    );
  });

  it('rounds the time in the context line to the quarter hour', () => {
    const [, user] = buildLocalAnswerMessages({
      sentence: 'Hungry?',
      mode: 'generate_answers',
      count: 5,
      contextInfo: "It's Monday afternoon at 3:42 PM, Location: Home, Weather: pleasant",
    });
    expect(user.content).toContain("Context: It's Monday afternoon at 3:30 PM, Location: Home");
  });

  it('prefill messages share their prefix with the final question up to the last word', () => {
    const req = {
      userName: 'Sam',
      count: 5,
      contextInfo: "It's Monday afternoon at 3:42 PM",
      conversationHistory: [{role: 'user' as const, content: 'How are you?'}],
      memoryContext: {personal: {facts: ['Lives alone']}},
    };
    const [prefillSystem, prefillUser] = buildPrefillMessages({
      ...req,
      sentence: 'Do you want some',
      mode: 'generate_more_answers',
      priorAnswers: ['Yes'],
    });
    const [system, user] = buildLocalAnswerMessages({
      ...req,
      sentence: 'Do you want some tea now?',
      mode: 'generate_more_answers',
      priorAnswers: ['Yes'],
    });
    expect(prefillSystem.content).toBe(system.content);
    // The prefill ends at the words heard so far: no priors, no more-answers line.
    expect(prefillUser.content.endsWith('Partner said: "Do you want some"')).toBe(true);
    expect(prefillUser.content).not.toContain('Already shown');
    // Everything up to the closing quote is a byte-identical prefix of the question.
    expect(user.content.startsWith(prefillUser.content.slice(0, -1))).toBe(true);
  });

  it('omits empty sections', () => {
    const [, user] = buildLocalAnswerMessages({
      sentence: 'Hungry?',
      mode: 'generate_answers',
      count: 5,
    });
    expect(user.content).toBe('Number of answers: 5\nPartner said: "Hungry?"');
  });

  it('priming messages are a prefix of a real request', () => {
    const stable = {userName: 'Sam', tellUsMore: 'Loves football.', count: 7};
    const [primeSystem, primeUser] = buildPrimingMessages(stable);
    const [system, user] = buildLocalAnswerMessages({
      ...stable,
      sentence: 'Tea or coffee?',
      mode: 'generate_answers',
      contextInfo: 'Morning',
    });
    expect(primeSystem.content).toBe(system.content);
    expect(user.content.startsWith(primeUser.content)).toBe(true);
    expect(primeUser.content).toContain('Number of answers: 7');
  });
});

describe('snapshotContextInfo', () => {
  it('rounds minutes down to the granularity and keeps the rest', () => {
    expect(snapshotContextInfo("It's Monday morning at 9:59 AM, raining")).toBe(
      "It's Monday morning at 9:45 AM, raining",
    );
    expect(snapshotContextInfo('at 12:07 am')).toBe('at 12:00 am');
    expect(snapshotContextInfo('at 11:30 PM')).toBe('at 11:30 PM');
    expect(snapshotContextInfo('at 3:42 PM', 60)).toBe('at 3:00 PM');
  });
  it('leaves text without a clock time alone', () => {
    expect(snapshotContextInfo('Evening, raining, at home')).toBe('Evening, raining, at home');
    expect(snapshotContextInfo('')).toBe('');
  });
});

describe('summaries', () => {
  it('caps the people list', () => {
    const many = Array.from({length: 50}, (_, i) => ({name: `Person${i}`}));
    const text = summarizePepes({People: many}, 10, 500);
    expect(text.split(',')).toHaveLength(10);
  });
  it('keeps the last exchanges only', () => {
    const history = Array.from({length: 10}, (_, i) => ({
      role: 'user' as const,
      content: `Q${i}`,
    }));
    const text = summarizeHistory(history, 2);
    expect(text).toBe('Partner: "Q8"\nPartner: "Q9"');
  });
});

describe('buildLocalAnswerSchema', () => {
  it('is a bare array of exactly count short strings', () => {
    expect(buildLocalAnswerSchema(5)).toEqual({
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: {type: 'string', maxLength: 24},
    });
    expect(buildLocalAnswerSchema(99).maxItems).toBe(12);
    expect(buildLocalAnswerSchema('3' as unknown as number).minItems).toBe(3);
    expect(buildLocalAnswerSchema(5, 3)).toMatchObject({minItems: 8, maxItems: 8});
    expect(buildLocalAnswerSchema(11, 3).maxItems).toBe(12);
  });

  it('asks for a few extra answers only in more-answers mode', () => {
    expect(extraAnswersFor({mode: 'generate_answers', priorAnswers: ['A', 'B']})).toBe(0);
    expect(extraAnswersFor({mode: 'generate_more_answers', priorAnswers: ['A', 'B']})).toBe(2);
    expect(extraAnswersFor({mode: 'generate_more_answers', priorAnswers: ['A', 'B', 'C', 'D', 'E']})).toBe(3);
    expect(extraAnswersFor({mode: 'generate_more_answers'})).toBe(0);
  });

  it('caps generation to a few tokens per answer', () => {
    expect(maxAnswerTokens(5)).toBe(68);
    expect(maxAnswerTokens(12)).toBe(152);
  });
});

describe('dropUnaskedNames', () => {
  const pepes = {
    People: [{name: 'Lori', aliases: ['Dad']}, {name: 'Dr Smith'}],
    Pets: [{name: 'Rex'}],
    Food: [{name: 'Soup'}],
    Drinks: [],
  };
  const img = FALLBACK_ANSWER_IMAGE;
  const cards = (list: string[]) => list.map(word => ({word, type: 'other', imageUrl: img}));

  it('collects names and aliases once, lower-cased', () => {
    expect(listedNames(pepes)).toEqual(['lori', 'dad', 'dr smith', 'rex', 'soup']);
    expect(listedNames(null)).toEqual([]);
  });

  it('drops list names from answers to a question that asked for none', () => {
    const out = dropUnaskedNames(
      cards(['Good', 'Rex', 'Tired', 'With Dad', 'Dr. Smith', 'Soup']),
      {sentence: 'How are you feeling today?', pepes},
    );
    expect(words(out)).toEqual(['Good', 'Tired']);
  });

  it('keeps them when the partner asks who, what to eat, what to watch…', () => {
    const answers = cards(['Lori', 'Rex', 'Nobody']);
    for (const sentence of [
      'Who is coming for dinner?',
      'What would you like to eat?',
      'Hungry?',
      'Shall we watch something?',
      'Can I bring you anything?',
      'Which doctor did you see?',
    ]) {
      expect(words(dropUnaskedNames(answers, {sentence, pepes}))).toEqual(['Lori', 'Rex', 'Nobody']);
    }
  });

  it('keeps them when the partner names one', () => {
    expect(asksForListed('Is Rex asleep?', listedNames(pepes))).toBe(true);
    expect(asksForListed("Dad's on the phone.", listedNames(pepes))).toBe(true);
    expect(asksForListed('Did you sleep well?', listedNames(pepes))).toBe(false);
    expect(words(dropUnaskedNames(cards(['Yes', 'Rex']), {sentence: 'Is Rex asleep?', pepes}))).toEqual([
      'Yes',
      'Rex',
    ]);
  });

  it('matches whole words only, and leaves answers alone without a list', () => {
    const out = dropUnaskedNames(cards(['Rexford', 'Soupy', 'Loris']), {
      sentence: 'Are you cold?',
      pepes,
    });
    expect(words(out)).toEqual(['Rexford', 'Soupy', 'Loris']);
    const none = cards(['Rex']);
    expect(dropUnaskedNames(none, {sentence: 'Are you cold?'})).toBe(none);
    expect(dropUnaskedNames(none, {sentence: 'Are you cold?', pepes: {People: []}})).toBe(none);
  });

  it('can empty the row so the caller falls back', () => {
    expect(dropUnaskedNames(cards(['Rex', 'Lori']), {sentence: 'Are you cold?', pepes})).toEqual([]);
  });
});
