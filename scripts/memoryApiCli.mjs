#!/usr/bin/env node
// Standalone Personal Memory API tester — exercises the backend without the app.
//
// The backend memory endpoints are stateless: the app keeps facts in SQLite and
// sends them with each request. This CLI mimics that with a local JSON store
// (scripts/.memory-cli-state.json) so you can seed memories and hit the API
// directly.
//
// Usage:
//   node scripts/memoryApiCli.mjs add "Mom's name is Sarah" --category person --subject mom --value Sarah
//   node scripts/memoryApiCli.mjs list
//   node scripts/memoryApiCli.mjs remove 3
//   node scripts/memoryApiCli.mjs clear
//   node scripts/memoryApiCli.mjs extract "I went swimming with grandpa" [--apply] [--child Alex]
//   node scripts/memoryApiCli.mjs answers "what do you want for breakfast" [--mode generate_answers] [--number 5]
//   node scripts/memoryApiCli.mjs verbi "i want" [--limit 8]
//
// Env: MATALK_BASE_URL overrides the backend URL.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

const BASE_URL =
  process.env.MATALK_BASE_URL || 'https://matalkapi-copy-nologin.up.railway.app';
const STATE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '.memory-cli-state.json',
);

const CATEGORIES = [
  'person', 'relationship', 'place', 'food', 'activity',
  'object', 'like', 'dislike', 'routine', 'fact',
];

// ── state ───────────────────────────────────────────────────────────────────

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {guid: randomUUID(), token: null, nextId: 1, facts: []};
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
}

// ── auth (mirrors sessionManager: guest session from installation GUID) ─────

async function initSession(state) {
  const res = await fetch(`${BASE_URL}/api/session/init`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({guid: state.guid}),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok || !data.token) {
    throw new Error(`session init failed (${res.status}): ${JSON.stringify(data)}`);
  }
  state.token = data.token;
  saveState(state);
  return data.token;
}

async function api(state, method, suffix, body) {
  if (!state.token) await initSession(state);
  const doFetch = () =>
    fetch(`${BASE_URL}${suffix}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.token}`,
      },
      ...(body !== undefined ? {body: JSON.stringify(body)} : {}),
    });

  let res = await doFetch();
  if (res.status === 401) {
    await initSession(state);
    res = await doFetch();
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${suffix} → ${res.status}: ${text.slice(0, 500)}`);
  }
  return json;
}

// ── memoryContext builder (mirrors PersonalMemoryService.buildMemoryContext) ─

function timeOfDay(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'night';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 21) return 'evening';
  return 'night';
}

function buildMemoryContext(state, opts = {}) {
  const facts = state.facts
    .filter(f => f.status === 'active' || f.status === 'possibly_outdated')
    .map(f => f.statement)
    .slice(0, 15);
  const context = {};
  if (opts.words?.length) {
    context.communication = {frequentWords: opts.words, timeOfDay: timeOfDay()};
  }
  if (facts.length > 0) {
    context.personal = {facts};
  }
  return Object.keys(context).length > 0 ? context : undefined;
}

// ── arg parsing ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(argv[i]);
    }
  }
  return {positional, flags};
}

function printFacts(facts) {
  if (facts.length === 0) {
    console.log('(no facts stored — use the `add` command)');
    return;
  }
  for (const f of facts) {
    console.log(
      `#${f.id} [${f.status}] (${f.category}/${f.subject}` +
        `${f.value ? ` = ${f.value}` : ''}) conf=${f.confidence} src=${f.source}` +
        `\n    "${f.statement}"`,
    );
  }
}

// ── commands ────────────────────────────────────────────────────────────────

const commands = {
  async add(state, positional, flags) {
    const statement = positional.join(' ');
    if (!statement) throw new Error('usage: add "<statement>" [--category X --subject Y --value Z --confidence 0.95 --source caregiver]');
    const category = flags.category || 'fact';
    if (!CATEGORIES.includes(category)) {
      throw new Error(`--category must be one of: ${CATEGORIES.join(', ')}`);
    }
    const fact = {
      id: state.nextId++,
      category,
      subject: flags.subject || statement.split(' ')[0].toLowerCase(),
      value: flags.value ?? null,
      statement,
      confidence: parseFloat(flags.confidence || '0.95'),
      source: flags.source || 'caregiver',
      status: 'active',
      confirmed: true,
    };
    state.facts.push(fact);
    saveState(state);
    console.log('Added:');
    printFacts([fact]);
  },

  async list(state) {
    printFacts(state.facts);
  },

  async remove(state, positional) {
    const id = parseInt(positional[0], 10);
    const before = state.facts.length;
    state.facts = state.facts.filter(f => f.id !== id);
    saveState(state);
    console.log(before === state.facts.length ? `#${id} not found` : `Removed #${id}`);
  },

  async clear(state) {
    state.facts = [];
    state.nextId = 1;
    saveState(state);
    console.log('Cleared all facts.');
  },

  // POST /api/memory/extract — same payload shape as drainExtractionQueue()
  async extract(state, positional, flags) {
    const text = positional.join(' ');
    if (!text) throw new Error('usage: extract "<communication text>" [--apply] [--child NAME] [--source Home|Convo]');
    const payload = {
      communications: [
        {
          eventId: `mem_${Date.now()}_cli`,
          text,
          source: flags.source || 'Home',
          occurredAt: new Date().toISOString(),
        },
      ],
      childName: flags.child || 'Alex',
      existingFacts: state.facts
        .filter(f => f.status === 'active')
        .slice(0, 40)
        .map(f => ({
          id: f.id,
          category: f.category,
          subject: f.subject,
          value: f.value,
          statement: f.statement,
          source: f.source,
          confirmed: f.confirmed,
        })),
      locale: 'en-US',
    };
    console.log(`POST /api/memory/extract  (${payload.existingFacts.length} existing facts)`);
    const response = await api(state, 'POST', '/api/memory/extract', payload);
    console.log('\nResponse:');
    console.log(JSON.stringify(response, null, 2));

    if (flags.apply && Array.isArray(response.memoryUpdates)) {
      for (const u of response.memoryUpdates) {
        if (u.action === 'create') {
          state.facts.push({
            id: state.nextId++,
            category: u.category,
            subject: u.subject,
            value: u.value ?? null,
            statement: u.statement,
            confidence: u.confidence,
            source: 'ai',
            status: 'active',
            confirmed: false,
          });
        } else {
          const target = state.facts.find(f => f.id === u.existingFactId);
          if (!target) continue;
          if (u.action === 'reinforce') {
            target.confidence = Math.min(0.99, target.confidence + 0.05);
          } else if (u.action === 'update') {
            target.status = 'replaced';
            state.facts.push({
              id: state.nextId++,
              category: u.category,
              subject: u.subject,
              value: u.value ?? null,
              statement: u.statement,
              confidence: u.confidence,
              source: 'ai',
              status: 'active',
              confirmed: false,
            });
          } else if (u.action === 'contradict') {
            target.status = 'possibly_outdated';
          }
        }
      }
      saveState(state);
      console.log('\nApplied updates. Current facts:');
      printFacts(state.facts);
    }
  },

  // POST /answers/generate — same payload shape as AssistantContext.generateAnswers
  async answers(state, positional, flags) {
    const sentence = positional.join(' ');
    if (!sentence) throw new Error('usage: answers "<question/sentence>" [--mode generate_answers] [--number 5] [--child NAME] [--no-memory]');
    const memoryContext = flags['no-memory'] ? undefined : buildMemoryContext(state);
    const number = parseInt(flags.number || '5', 10);
    const payload = {
      sentence,
      number,
      mode: flags.mode || 'generate_answers',
      metadata: {
        kidName: flags.child || 'I',
        speaker: 'anyone',
        audience: 'my',
        tellUsMore: '',
        pepes: null,
        ...(memoryContext ? {memoryContext} : {}),
        conversationHistory: [],
      },
      prior: {},
      options: {number, countMin: number, countMax: number, genderType: 'white boy'},
    };
    console.log(
      `POST /answers/generate  (memoryContext: ${memoryContext ? `${memoryContext.personal?.facts.length ?? 0} facts` : 'none'})`,
    );
    const response = await api(state, 'POST', '/answers/generate', payload);
    console.log('\nResponse:');
    console.log(JSON.stringify(response, null, 2));
  },

  // Verbi round-trip: create conversation → predict with memoryContext → close
  async verbi(state, positional, flags) {
    const text = positional.join(' ');
    const memoryContext = flags['no-memory'] ? undefined : buildMemoryContext(state);
    const convo = await api(state, 'POST', '/v1/verbi/conversations', {
      boardId: 'cli-test-board',
      locale: 'en-US',
    });
    const conversationId = convo.conversationId ?? convo.id;
    console.log(`Conversation: ${conversationId}`);
    try {
      const payload = {
        requestId: randomUUID(),
        conversationId,
        turnId: randomUUID(),
        mode: flags.mode || (text ? 'continuation' : 'starter'),
        sentence: {
          text,
          items: text ? text.split(/\s+/).map(w => ({label: w})) : [],
          isStale: false,
        },
        folder: null,
        board: {boardId: 'cli-test-board', locale: 'en-US'},
        contextCues: {
          timeOfDay: timeOfDay(),
          date: new Date().toISOString().split('T')[0],
          pepes: null,
          ...(memoryContext ? {memoryContext} : {}),
        },
        limit: parseInt(flags.limit || '8', 10),
      };
      console.log(
        `POST /v1/verbi/predictions  (memoryContext: ${memoryContext ? `${memoryContext.personal?.facts.length ?? 0} facts` : 'none'})`,
      );
      const response = await api(state, 'POST', '/v1/verbi/predictions', payload);
      console.log('\nResponse:');
      console.log(JSON.stringify(response, null, 2));
    } finally {
      await api(state, 'POST', `/v1/verbi/conversations/${encodeURIComponent(conversationId)}/close`, {}).catch(() => {});
    }
  },
};

// ── main ────────────────────────────────────────────────────────────────────

const [, , command, ...rest] = process.argv;
const {positional, flags} = parseArgs(rest);

if (!command || !commands[command]) {
  console.log(`Matalk Personal Memory API tester  (backend: ${BASE_URL})

Commands:
  add "<statement>" [--category ${CATEGORIES.join('|')}] [--subject S] [--value V] [--confidence 0.95] [--source caregiver|intake|ai]
  list
  remove <id>
  clear
  extract "<text>" [--apply] [--child NAME] [--source Home|Convo]
  answers "<sentence>" [--mode generate_answers] [--number 5] [--no-memory]
  verbi "<current sentence text>" [--mode starter|continuation|folder] [--limit 8] [--no-memory]

State (facts + session token) lives in scripts/.memory-cli-state.json.
Set MATALK_BASE_URL to point at a local backend.`);
  process.exit(command ? 1 : 0);
}

const state = loadState();
commands[command](state, positional, flags).catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
