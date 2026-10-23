/**
 * Pure evaluation rules behind the IEP mock-data audit scripts.
 *
 * A Node port of the two Python tools in
 * docs/iep-dashboard-agent-package/reference-source/tools/:
 *
 *   mock_coverage_report.py     -> coverageReport(), consistencyReport()
 *   reconcile_mock_evidence.py  -> reconcile()
 *
 * The rules are reproduced verbatim (including the Python quirks noted inline) so the
 * printed reports are byte-identical to the originals. Nothing here imports the app;
 * it reads the canonical CSVs with the small parser in ./csv.js.
 *
 * Node built-ins only.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { parseCsv, stringifyCsv } = require('./csv');

// ----------------------------------------------------------------- Python compat

/** Python's float(value) with a fallback: empty or non-numeric text -> default. */
const FLOAT_RE = /^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\s*$/;
const SPECIAL_RE = /^\s*([+-]?)(inf|infinity|nan)\s*$/i;
function num(value, fallback = 0.0) {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value !== 'string') {
    return fallback;
  }
  if (FLOAT_RE.test(value)) {
    return Number(value.trim());
  }
  const special = SPECIAL_RE.exec(value);
  if (special) {
    if (special[2].toLowerCase() === 'nan') {
      return NaN;
    }
    return special[1] === '-' ? -Infinity : Infinity;
  }
  return fallback;
}

/** Python's int(float) truncates toward zero. */
function pyInt(value) {
  return Math.trunc(value);
}

/** Python's round(x) and f"{x:.0f}": ties go to the even neighbour. */
function pyRound(x) {
  const floor = Math.floor(x);
  if (x - floor === 0.5) {
    return floor % 2 === 0 ? floor : floor + 1;
  }
  return Math.round(x);
}

function ljust(s, width) {
  return s + ' '.repeat(Math.max(0, width - s.length));
}

function rjust(s, width) {
  return ' '.repeat(Math.max(0, width - s.length)) + s;
}

/**
 * Python's random module (MT19937) so a seeded run appends exactly the events the
 * original tool would. Supports the calls the reconcile tool makes: choice, shuffle.
 */
/* eslint-disable no-bitwise */
class PyRandom {
  constructor(seed) {
    this.N = 624;
    this.mt = new Uint32Array(this.N);
    this.index = this.N + 1;
    this.seed(seed);
  }

  initGenrand(s) {
    const mt = this.mt;
    mt[0] = s >>> 0;
    for (let i = 1; i < this.N; i += 1) {
      mt[i] = (Math.imul(1812433253, mt[i - 1] ^ (mt[i - 1] >>> 30)) + i) >>> 0;
    }
    this.index = this.N;
  }

  initByArray(key) {
    const mt = this.mt;
    const N = this.N;
    this.initGenrand(19650218);
    let i = 1;
    let j = 0;
    let k = Math.max(N, key.length);
    for (; k > 0; k -= 1) {
      mt[i] = ((mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1664525)) + key[j] + j) >>> 0;
      i += 1;
      j += 1;
      if (i >= N) {
        mt[0] = mt[N - 1];
        i = 1;
      }
      if (j >= key.length) {
        j = 0;
      }
    }
    for (k = N - 1; k > 0; k -= 1) {
      mt[i] = ((mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1566083941)) - i) >>> 0;
      i += 1;
      if (i >= N) {
        mt[0] = mt[N - 1];
        i = 1;
      }
    }
    mt[0] = 0x80000000;
  }

  /** random.seed(int): the absolute value split into 32-bit little-endian words. */
  seed(n) {
    let value = Math.abs(Math.trunc(n));
    const key = [];
    do {
      key.push(value % 0x100000000);
      value = Math.floor(value / 0x100000000);
    } while (value > 0);
    this.initByArray(key);
  }

  genrandUint32() {
    const mt = this.mt;
    const N = this.N;
    const M = 397;
    if (this.index >= N) {
      for (let kk = 0; kk < N; kk += 1) {
        const y = ((mt[kk] & 0x80000000) | (mt[(kk + 1) % N] & 0x7fffffff)) >>> 0;
        mt[kk] = (mt[(kk + M) % N] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0)) >>> 0;
      }
      this.index = 0;
    }
    let y = mt[this.index];
    this.index += 1;
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  /** random.random(): 53-bit float in [0, 1). */
  random() {
    const a = this.genrandUint32() >>> 5;
    const b = this.genrandUint32() >>> 6;
    return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0);
  }

  getrandbits(k) {
    if (k <= 0 || k > 32) {
      throw new Error('PyRandom.getrandbits supports 1..32 bits');
    }
    return this.genrandUint32() >>> (32 - k);
  }

  /** random._randbelow_with_getrandbits(n). */
  randbelow(n) {
    const k = n.toString(2).length;
    let r = this.getrandbits(k);
    while (r >= n) {
      r = this.getrandbits(k);
    }
    return r;
  }

  choice(seq) {
    if (seq.length === 0) {
      throw new Error('Cannot choose from an empty sequence');
    }
    return seq[this.randbelow(seq.length)];
  }

  /** In-place Fisher-Yates in Python's order. */
  shuffle(list) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = this.randbelow(i + 1);
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }
}
/* eslint-enable no-bitwise */

// ---------------------------------------------------------------------- dates

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** datetime.date.fromisoformat, as a whole-day count since the epoch. */
function dayNumber(iso) {
  const m = ISO_DATE_RE.exec(iso);
  if (!m) {
    throw new Error(`Invalid isoformat string: '${iso}'`);
  }
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== Number(m[1]) ||
    check.getUTCMonth() !== Number(m[2]) - 1 ||
    check.getUTCDate() !== Number(m[3])
  ) {
    throw new Error(`Invalid isoformat string: '${iso}'`);
  }
  return ms / 86400000;
}

// ------------------------------------------------------------------ constants

/** Keep in step with the synthetic calendar (TODAY in mock_coverage_report.py). */
const TODAY = '2026-07-27';
const DEFAULT_WEEKS = 12;

const DEFAULT_DATA_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  'docs',
  'iep-dashboard-agent-package',
  'mock-data',
);

/** Dataset keys accepted on the API; `label` is the name printed in reports. */
const DATASETS = [
  {
    key: 'standard',
    label: 'standard',
    summaryFile: 'IEP_dashboard_mock_summary_52_weeks.csv',
    eventsFile: 'IEP_dashboard_mock_events_52_weeks.csv',
  },
  {
    key: 'edge',
    label: 'edge cases',
    summaryFile: 'IEP_dashboard_mock_summary_edge_cases.csv',
    eventsFile: 'IEP_dashboard_mock_events_edge_cases.csv',
  },
];

/**
 * Mirrors GoalProgress / GoalMetricCatalog in the Swift reference source.
 *
 * ACHIEVEMENT_FLOOR: a goal whose sessions_required is 1 (or unset) is only reported
 * as "card: Achieved" here after a streak of 3 met sessions. That is the Python tool's
 * rule and it is kept verbatim so the coverage numbers match. The app's GoalHeadline
 * (src/features/iep/core/goalHeadline.ts, sessionsRequired()) deliberately does NOT
 * apply this floor: it honours the requirement the goal itself states, with a minimum
 * of 1, because a requirement the clinician did not set is not the app's to invent.
 */
const ACHIEVEMENT_FLOOR = 3; // GoalProgress.achievementFloorSessions
const MIN_SESSIONS_PER_GROUP = 3; // GoalProgress.minimumSessionsPerGroup
const MIN_SPREAD = 20; // GoalProgress.minimumMeaningfulSpread

const ALL_STATES = [
  'card: Achieved',
  'card: On track',
  'card: Progressing',
  'card: Stable',
  'card: Needs attention',
  'card: Not enough data',
  'card: No tracked sessions',
  'trend: improving',
  'trend: stable',
  'trend: declining',
  'trend: not enough data',
  'chart: series',
  'chart: single session',
  'chart: empty state',
  'session requirement strip',
  'tile: longest streak',
  'tile: metric trend',
  'tile: sentence length shares',
  'tile: average build time',
  'tile: build time improvement',
  // 'tile: build time actually moves' is produced by evaluateGoal but, as in the
  // Python, is not part of the reported list (32 states).
  'pattern: context comparison',
  'pattern: context meets spread threshold',
  'pattern: partner comparison',
  'pattern: partner meets spread threshold',
  'words card',
  'words card: 5+ to rank',
  'measurement caveat',
  'gap: missing metric value',
  'gap: missing duration',
  'gap: missing context',
  'gap: unknown support level',
  'gap: irregular spacing',
];

// -------------------------------------------------------------------- loading

/** csv.DictReader over summary text. */
function parseSummary(text) {
  return parseCsv(text).rows;
}

/** csv.DictReader over events text; also returns the header order for rewriting. */
function parseEvents(text) {
  const { headers, rows } = parseCsv(text);
  return { columns: headers, events: rows };
}

/** Summary rows keyed by goal_id, in file order. */
function groupByGoal(summary) {
  const goals = new Map();
  for (const row of summary) {
    const list = goals.get(row.goal_id);
    if (list) {
      list.push(row);
    } else {
      goals.set(row.goal_id, [row]);
    }
  }
  return goals;
}

/** Event rows keyed by session_id, in file order. */
function groupBySession(events) {
  const bySession = new Map();
  for (const e of events) {
    const list = bySession.get(e.session_id);
    if (list) {
      list.push(e);
    } else {
      bySession.set(e.session_id, [e]);
    }
  }
  return bySession;
}

function datasetSpec(dataset) {
  const spec = DATASETS.find(d => d.key === dataset || d.label === dataset);
  if (!spec) {
    throw new Error(`Unknown dataset '${dataset}' (expected standard|edge)`);
  }
  return spec;
}

function datasetExists(dataDir, dataset) {
  return fs.existsSync(path.join(dataDir, datasetSpec(dataset).summaryFile));
}

/** load() in the Python: goals by id plus events by session. */
function loadDataset(dataDir, dataset) {
  const spec = datasetSpec(dataset);
  const summaryText = fs.readFileSync(path.join(dataDir, spec.summaryFile), 'utf8');
  const eventsText = fs.readFileSync(path.join(dataDir, spec.eventsFile), 'utf8');
  const summary = parseSummary(summaryText);
  const { columns, events } = parseEvents(eventsText);
  return {
    spec,
    summary,
    events,
    eventColumns: columns,
    goals: groupByGoal(summary),
    bySession: groupBySession(events),
  };
}

// ------------------------------------------------------------------- coverage

const sortedKeys = map => Array.from(map.keys()).sort();
const byField = key => (a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);

/** Rows within the reporting window, sorted by session_date (stable). */
function windowRows(rows, weeks = DEFAULT_WEEKS, today = TODAY) {
  const end = dayNumber(today);
  const start = end - weeks * 7;
  const kept = rows.filter(r => {
    const d = dayNumber(r.session_date);
    return start <= d && d <= end;
  });
  return kept.sort(byField('session_date'));
}

/** (words, seconds, date) per completed sentence, as the app derives them. */
function sentenceSamples(rows, bySession) {
  const out = [];
  for (const row of rows) {
    const spans = new Map();
    for (const e of bySession.get(row.session_id) || []) {
      const sid = e.sentence_id || '';
      if (!sid) {
        continue;
      }
      const t = num(e.elapsed_seconds);
      const words = pyInt(num(e.word_count, 0));
      const prev = spans.get(sid) || [t, t, 0];
      spans.set(sid, [Math.min(prev[0], t), Math.max(prev[1], t), words || prev[2]]);
    }
    for (const [lo, hi, w] of spans.values()) {
      if (hi > lo && w > 0) {
        out.push([w, hi - lo, row.session_date]);
      }
    }
  }
  return out;
}

const isAlpha = w => /^\p{L}+$/u.test(w);

/** Returns the set of UI states this goal produces in the window. */
function evaluateGoal(rows, bySession) {
  const states = new Set();
  if (rows.length === 0) {
    return new Set(['card: No tracked sessions', 'chart: empty state']);
  }

  const field = rows[0].primary_metric_field;
  if (!(field in rows[0])) {
    throw new Error(`KeyError: '${field}'`);
  }
  const required = pyInt(num(rows[0].sessions_required, 1)) || 1;
  const floor = required > 1 ? required : ACHIEVEMENT_FLOOR;

  const met = rows.map(r => r.target_met_this_session === 'Yes');
  const values = rows.map(r => num(r[field]));

  let streak = 0;
  for (let i = met.length - 1; i >= 0; i -= 1) {
    if (met[i]) {
      streak += 1;
    } else {
      break;
    }
  }
  let longest = 0;
  let run = 0;
  for (const m of met) {
    run = m ? run + 1 : 0;
    longest = Math.max(longest, run);
  }

  const first = values[0];
  const last = values[values.length - 1];
  let trend = last > first ? 'improving' : last < first ? 'declining' : 'stable';
  if (rows.length < 2) {
    trend = 'not enough data';
  }

  if (streak >= floor) {
    states.add('card: Achieved');
  } else if (met[met.length - 1]) {
    states.add('card: On track');
  } else if (rows.length < 2) {
    states.add('card: Not enough data');
  } else if (trend === 'declining') {
    states.add('card: Needs attention');
  } else if (trend === 'stable') {
    states.add('card: Stable');
  } else {
    states.add('card: Progressing');
  }

  states.add(`trend: ${trend}`);
  states.add(rows.length < 2 ? 'chart: single session' : 'chart: series');
  if (rows.length > 1) {
    states.add('session requirement strip');
  }

  // --- insight tiles
  if (longest > 0) {
    states.add('tile: longest streak');
  }
  const samples = sentenceSamples(rows, bySession);
  const buckets = new Map(); // insertion-ordered, like a defaultdict
  for (const [w, secs, date] of samples) {
    const label = w >= 4 ? '4+ words' : `${w} word${w === 1 ? '' : 's'}`;
    const entries = buckets.get(label);
    if (entries) {
      entries.push([secs, date]);
    } else {
      buckets.set(label, [[secs, date]]);
    }
  }
  if (samples.length > 0) {
    states.add('tile: sentence length shares');
  }
  if (Array.from(buckets.values()).some(v => v.length >= 3)) {
    states.add('tile: average build time');
  }
  if (samples.length >= 8) {
    const ordered = samples.slice().sort((a, b) => (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0));
    const mid = ordered[Math.floor(ordered.length / 2)][2];
    for (const entries of buckets.values()) {
      const early = entries.filter(([, d]) => d < mid).map(([s]) => s);
      const late = entries.filter(([, d]) => d >= mid).map(([s]) => s);
      if (early.length >= 3 && late.length >= 3) {
        states.add('tile: build time improvement');
        const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
        if (Math.abs(mean(late) - mean(early)) > 0.5) {
          states.add('tile: build time actually moves');
        }
        break;
      }
    }
  }

  // a supporting metric with two differing points earns a trend tile
  for (const extra of ['total_sentences', 'average_words_per_sentence']) {
    const series = rows
      .filter(r => r[extra] !== '' && r[extra] !== null && r[extra] !== undefined)
      .map(r => num(r[extra]));
    if (series.length >= 2 && series[0] !== series[series.length - 1]) {
      states.add('tile: metric trend');
      break;
    }
  }

  // --- pattern comparisons
  for (const [dimension, key] of [
    ['context', 'context'],
    ['partner', 'partner_type'],
  ]) {
    const groups = new Map(); // value -> [sessions, met]
    rows.forEach((row, i) => {
      const evs = bySession.get(row.session_id) || [];
      const hit = evs.find(e => e[key]);
      const value = hit ? hit[key] : '';
      if (!value) {
        return;
      }
      const g = groups.get(value) || [0, 0];
      g[0] += 1;
      g[1] += met[i] ? 1 : 0;
      groups.set(value, g);
    });
    const usable = Array.from(groups.values()).filter(v => v[0] >= MIN_SESSIONS_PER_GROUP);
    if (usable.length >= 2) {
      states.add(`pattern: ${dimension} comparison`);
      const rates = usable.map(([n, s]) => pyRound((s / n) * 100));
      if (Math.max(...rates) - Math.min(...rates) >= MIN_SPREAD) {
        states.add(`pattern: ${dimension} meets spread threshold`);
      }
    }
  }

  // --- vocabulary
  const words = new Set();
  for (const row of rows) {
    for (const e of bySession.get(row.session_id) || []) {
      if (e.event_type === 'sentence_completed') {
        for (const w of e.content.toLowerCase().trim().split(/\s+/)) {
          if (w && isAlpha(w)) {
            words.add(w);
          }
        }
      }
    }
  }
  if (words.size > 0) {
    states.add('words card');
  }
  if (words.size >= 5) {
    states.add('words card: 5+ to rank');
  }

  // --- honesty and gaps
  const notNo = v => !['', 'no'].includes((v || '').toLowerCase());
  if (notNo(rows[0].slp_help_required) || notNo(rows[0].ai_required)) {
    states.add('measurement caveat');
  }
  if (rows.some(r => !r.average_words_per_sentence)) {
    states.add('gap: missing metric value');
  }
  if (rows.some(r => !r.session_duration_minutes)) {
    states.add('gap: missing duration');
  }
  if (rows.some(r => !(bySession.get(r.session_id) || []).some(e => e.context))) {
    states.add('gap: missing context');
  }
  if (
    rows.some(r =>
      (bySession.get(r.session_id) || []).some(
        e => e.support_level === '' && e.event_type === 'sentence_completed',
      ),
    )
  ) {
    states.add('gap: unknown support level');
  }
  const dates = rows.map(r => dayNumber(r.session_date));
  if (dates.some((d, i) => i > 0 && d - dates[i - 1] > 10)) {
    states.add('gap: irregular spacing');
  }
  return states;
}

/**
 * Coverage for one loaded dataset: which states at least one goal produces.
 * @returns {{covered: Map<string, string[]>, reached: number, total: number, missing: string[]}}
 */
function evaluateDataset(loaded, { weeks = DEFAULT_WEEKS, today = TODAY } = {}) {
  const covered = new Map();
  for (const gid of sortedKeys(loaded.goals)) {
    for (const state of evaluateGoal(windowRows(loaded.goals.get(gid), weeks, today), loaded.bySession)) {
      const list = covered.get(state);
      if (list) {
        list.push(gid);
      } else {
        covered.set(state, [gid]);
      }
    }
  }
  const missing = ALL_STATES.filter(s => !covered.has(s));
  return { covered, reached: ALL_STATES.length - missing.length, total: ALL_STATES.length, missing };
}

/** The coverage report as printed by mock_coverage_report.py (lines, no trailing \n). */
function formatCoverage(results, { weeks = DEFAULT_WEEKS, today = TODAY } = {}) {
  const lines = [`Dashboard state coverage · ${weeks}-week reporting window · as of ${today}`, ''];
  const width = Math.max(...ALL_STATES.map(s => s.length)) + 2;
  const labels = results.map(r => r.label);
  const header = ljust('state', width) + labels.map(l => ljust(l, 26)).join('');
  lines.push(header, '-'.repeat(header.length));
  for (const state of ALL_STATES) {
    let line = ljust(state, width);
    for (const r of results) {
      const hit = r.covered.get(state) || [];
      const cell = hit.length ? `${rjust(String(hit.length), 2)}  ${hit.slice(0, 3).join(',')}` : ' —';
      line += ljust(cell, 26);
    }
    lines.push(line);
  }
  lines.push('');
  for (const r of results) {
    const pct = (r.reached / r.total) * 100;
    lines.push(`${r.label}: ${r.reached}/${r.total} states (${pyRound(pct)}%)`);
    for (const s of r.missing) {
      lines.push(`    not exercised: ${s}`);
    }
  }
  return lines;
}

/** Runs coverage over every dataset present in dataDir. */
function coverageReport({ dataDir = DEFAULT_DATA_DIR, weeks = DEFAULT_WEEKS, today = TODAY } = {}) {
  const results = [];
  for (const spec of DATASETS) {
    if (!datasetExists(dataDir, spec.key)) {
      continue;
    }
    const loaded = loadDataset(dataDir, spec.key);
    results.push({ key: spec.key, label: spec.label, ...evaluateDataset(loaded, { weeks, today }) });
  }
  return { results, lines: formatCoverage(results, { weeks, today }) };
}

// ---------------------------------------------------------------- consistency

const distinctFunctions = es =>
  new Set(es.filter(e => e.communication_function).map(e => e.communication_function)).size;

/**
 * Metrics whose headline value can be recomputed from the event stream. The rest of
 * the goals are listed as unverifiable rather than silently passing.
 */
const DERIVABLE = {
  G02: ['different_communication_functions', distinctFunctions],
  G03: ['preferred_page_navigations', es => es.filter(e => e.is_preferred_page === 'Yes').length],
  G04: [
    'qualifying_sentences_2plus',
    es => es.filter(e => e.event_type === 'sentence_completed' && num(e.word_count) >= 2).length,
  ],
  G08: [
    'different_words_activated',
    es => new Set(es.filter(e => e.event_type === 'word_selected' && e.word_text).map(e => e.word_text)).size,
  ],
  G09: ['request_count', es => es.filter(e => e.communication_function === 'request').length],
  G10: ['different_communication_functions', distinctFunctions],
  G12: ['novel_contributions', es => es.filter(e => e.is_novel_contribution === 'Yes').length],
  G13: ['regulation_communications', es => es.filter(e => e.communication_function === 'regulation').length],
  G15: ['repair_attempts', es => es.filter(e => e.is_repair_attempt === 'Yes').length],
  G16: [
    'preference_boundary_situations',
    es => es.filter(e => ['preference', 'boundary'].includes(e.communication_function)).length,
  ],
  G17: ['wh_questions', es => es.filter(e => e.is_wh_question === 'Yes').length],
  G18: [
    'four_word_descriptor_sentences',
    es => es.filter(e => e.event_type === 'sentence_completed' && num(e.word_count) >= 4).length,
  ],
  G19: ['retelling_details', es => es.filter(e => e.event_type === 'retelling_detail').length],
};

/**
 * Summary-vs-evidence check for one loaded dataset, over all sessions.
 * @returns {{checked: Array, unverifiable: string[], failures: number}}
 */
function checkConsistency(loaded) {
  const gids = sortedKeys(loaded.goals);
  const checked = [];
  let failures = 0;
  for (const gid of gids.filter(g => g in DERIVABLE)) {
    const [column, derive] = DERIVABLE[gid];
    const rows = loaded.goals.get(gid).slice().sort(byField('session_date'));
    const mismatches = [];
    for (const row of rows) {
      // Note: the Python uses a substring test (`gid in goal_ids_supported`), kept as-is.
      const evs = (loaded.bySession.get(row.session_id) || []).filter(e =>
        e.goal_ids_supported.includes(gid),
      );
      const want = num(row[column]);
      const got = derive(evs);
      if (want !== got) {
        mismatches.push({ date: row.session_date, want, got });
      }
    }
    if (mismatches.length) {
      failures += 1;
    }
    checked.push({ gid, column, sessions: rows.length, mismatches });
  }
  return { checked, unverifiable: gids.filter(g => !(g in DERIVABLE)), failures };
}

function formatConsistencyDataset(label, result) {
  const lines = [];
  if (result.checked.length === 0) {
    lines.push(`${label}: no derivable metrics in this dataset — nothing to check`);
    return lines;
  }
  lines.push(`${label}:`);
  for (const { gid, column, sessions, mismatches } of result.checked) {
    if (mismatches.length) {
      const first = mismatches[0];
      lines.push(
        `   FAIL ${gid} ${ljust(column, 38)} ${mismatches.length}/${sessions} sessions disagree ` +
          `(e.g. ${first.date}: summary ${pyRound(first.want)}, evidence ${first.got})`,
      );
    } else {
      lines.push(`   ok   ${gid} ${ljust(column, 38)} ${sessions}/${sessions}`);
    }
  }
  if (result.unverifiable.length) {
    lines.push(`   note: not verifiable from events — ${result.unverifiable.join(', ')}`);
  }
  return lines;
}

/** Runs the consistency check over every dataset present in dataDir. */
function consistencyReport({ dataDir = DEFAULT_DATA_DIR } = {}) {
  const lines = ['', '', 'Summary-vs-evidence consistency (all sessions, not just the window)', ''];
  const results = [];
  let failures = 0;
  for (const spec of DATASETS) {
    if (!datasetExists(dataDir, spec.key)) {
      continue;
    }
    const result = checkConsistency(loadDataset(dataDir, spec.key));
    failures += result.failures;
    results.push({ key: spec.key, label: spec.label, ...result });
    lines.push(...formatConsistencyDataset(spec.label, result));
  }
  if (failures) {
    lines.push('', `${failures} goal(s) inconsistent between summary and evidence.`);
  } else {
    lines.push('', 'All derivable metrics are supported by the event stream.');
  }
  return { results, failures, lines };
}

// ------------------------------------------------------------------ reconcile

const RECONCILE_SEED = 4471;

/** A real AAC lexicon (see reconcile_mock_evidence.py). */
const LEXICON = [
  'i', 'want', 'more', 'music', 'you', 'me', 'my', 'we', 'it', 'that',
  'go', 'stop', 'help', 'play', 'eat', 'drink', 'look', 'see', 'make', 'give',
  'get', 'put', 'open', 'read', 'sing', 'come', 'need', 'like', 'feel', 'turn',
  'book', 'ball', 'car', 'toy', 'juice', 'water', 'snack', 'cookie', 'apple',
  'park', 'school', 'home', 'mom', 'dad', 'friend', 'dog', 'cat', 'story',
  'big', 'little', 'red', 'blue', 'happy', 'again', 'please', 'all', 'done', 'fast',
];
const FUNCTIONS = ['request', 'comment', 'protest', 'question', 'answer',
  'preference', 'help', 'regulation', 'boundary'];

const countDistinctWords = evs =>
  new Set(evs.filter(e => e.event_type === 'word_selected' && e.word_text).map(e => e.word_text)).size;

/** metric id -> (summary column, count from events, excess candidates, build a satisfying event) */
function buildRules(rng) {
  const sentence = extra => ({
    event_type: 'sentence_completed',
    speaker: 'child',
    word_count: '3',
    sentence_status: 'completed',
    ...extra,
  });
  return {
    G03: {
      column: 'preferred_page_navigations',
      count: evs => evs.filter(e => e.is_preferred_page === 'Yes').length,
      excess: evs => evs.filter(e => e.is_preferred_page === 'Yes'),
      make: () => ({
        event_type: 'page_opened',
        speaker: 'child',
        is_preferred_page: 'Yes',
        from_page_id: 'home',
        to_page_id: 'favourites',
        page_id: 'favourites',
        content: 'Open page',
      }),
    },
    G08: {
      column: 'different_words_activated',
      count: countDistinctWords,
      excess: evs => evs.filter(e => e.event_type === 'word_selected'),
      make: null, // handled specially: needs distinct words, not a count
    },
    G09: {
      column: 'request_count',
      count: evs => evs.filter(e => e.communication_function === 'request').length,
      excess: evs => evs.filter(e => e.communication_function === 'request'),
      make: () => sentence({ communication_function: 'request', content: 'i want more' }),
    },
    G13: {
      column: 'regulation_communications',
      count: evs => evs.filter(e => e.communication_function === 'regulation').length,
      excess: evs => evs.filter(e => e.communication_function === 'regulation'),
      make: () => sentence({ communication_function: 'regulation', content: 'i need help' }),
    },
    G15: {
      column: 'repair_attempts',
      count: evs => evs.filter(e => e.is_repair_attempt === 'Yes').length,
      excess: evs => evs.filter(e => e.is_repair_attempt === 'Yes'),
      make: () =>
        sentence({
          is_repair_attempt: 'Yes',
          is_successful_repair: rng.choice(['Yes', 'No']),
          communication_function: 'request',
          content: 'i want go park now',
          word_count: '5',
        }),
    },
    G16: {
      column: 'preference_boundary_situations',
      count: evs => evs.filter(e => ['preference', 'boundary'].includes(e.communication_function)).length,
      excess: evs => evs.filter(e => ['preference', 'boundary'].includes(e.communication_function)),
      make: () =>
        sentence({
          communication_function: rng.choice(['preference', 'boundary']),
          content: 'all done please',
        }),
    },
    G17: {
      column: 'wh_questions',
      count: evs => evs.filter(e => e.is_wh_question === 'Yes').length,
      excess: evs => evs.filter(e => e.is_wh_question === 'Yes'),
      make: () =>
        sentence({
          is_wh_question: 'Yes',
          communication_function: 'question',
          content: rng.choice(['where mom go', 'what that', 'who come now']),
        }),
    },
    G02: { column: 'different_communication_functions', count: distinctFunctions, excess: () => [], make: null },
    G10: { column: 'different_communication_functions', count: distinctFunctions, excess: () => [], make: null },
  };
}

/**
 * Makes the event stream support the summary numbers for the standard dataset.
 * Pure: returns the adjusted event list and a per-goal report; callers decide whether
 * to write it back.
 *
 * @param {{summary: Record<string,string>[], events: Record<string,string>[], eventColumns: string[]}} data
 * @returns {{report: Map<string, [number, number]>, added: number, dropped: number, events: Array}}
 */
function reconcile(data) {
  const { summary, eventColumns } = data;
  const events = data.events.slice();
  const rng = new PyRandom(RECONCILE_SEED);
  const rules = buildRules(rng);

  const bySessionGoal = new Map();
  for (const e of events) {
    for (const g of e.goal_ids_supported.split('|')) {
      if (g) {
        const k = `${e.session_id} ${g}`;
        const list = bySessionGoal.get(k);
        if (list) {
          list.push(e);
        } else {
          bySessionGoal.set(k, [e]);
        }
      }
    }
  }

  let added = 0;
  let dropped = 0;
  let seq = 0;
  const report = new Map();
  const bump = (gid, slot) => {
    const r = report.get(gid) || [0, 0];
    r[slot] += 1;
    report.set(gid, r);
  };

  for (const row of summary) {
    const gid = row.goal_id;
    const rule = rules[gid];
    if (!rule) {
      continue;
    }
    const session = row.session_id;
    const evs = bySessionGoal.get(`${session} ${gid}`) || [];
    const want = pyInt(num(row[rule.column]));
    const have = rule.count(evs);
    if (want === have) {
      continue;
    }

    const template = evs.length ? evs[0] : null;
    if (template === null) {
      continue;
    }
    const baseElapsed = evs.length ? Math.max(...evs.map(e => num(e.elapsed_seconds))) : 0;

    const newEvent = (extra, offset) => {
      seq += 1;
      const e = {};
      for (const c of eventColumns) {
        e[c] = '';
      }
      Object.assign(e, {
        event_id: `R${String(seq).padStart(6, '0')}`,
        session_id: session,
        week_number: template.week_number,
        session_date: template.session_date,
        event_timestamp: template.event_timestamp,
        elapsed_seconds: String(pyInt(baseElapsed + offset)),
        partner_type: template.partner_type,
        context: template.context,
        goal_ids_supported: gid,
        mock_data_note: 'Reconciled so evidence supports the summary metric',
      });
      Object.assign(e, extra);
      return e;
    };

    if (have < want) {
      const shortfall = want - have;
      if (gid === 'G08') {
        const present = new Set(evs.filter(e => e.word_text).map(e => e.word_text));
        const pool = LEXICON.filter(w => !present.has(w));
        rng.shuffle(pool);
        pool.slice(0, shortfall).forEach((word, i) => {
          events.push(
            newEvent(
              {
                event_type: 'word_selected',
                speaker: 'child',
                word_id: `RW${i + 1}`,
                word_text: word,
                content: word,
                support_level: 'independent',
                support_confidence: '0.88',
              },
              5 * (i + 1),
            ),
          );
          added += 1;
        });
      } else if (gid === 'G02' || gid === 'G10') {
        const present = new Set(evs.filter(e => e.communication_function).map(e => e.communication_function));
        const pool = FUNCTIONS.filter(f => !present.has(f));
        pool.slice(0, shortfall).forEach((fn, i) => {
          events.push(
            newEvent(
              {
                event_type: 'sentence_completed',
                speaker: 'child',
                communication_function: fn,
                content: 'i want more',
                word_count: '3',
                sentence_status: 'completed',
              },
              5 * (i + 1),
            ),
          );
          added += 1;
        });
      } else if (rule.make) {
        for (let i = 0; i < shortfall; i += 1) {
          events.push(newEvent(rule.make(), 5 * (i + 1)));
          added += 1;
        }
      }
      bump(gid, 0);
    } else {
      const surplus = have - want;
      const candidates = rule.excess(evs);
      for (const e of candidates.slice(0, surplus)) {
        const tags = e.goal_ids_supported.split('|').filter(t => t && t !== gid);
        e.goal_ids_supported = tags.join('|');
        dropped += 1;
      }
      bump(gid, 1);
    }
  }

  const sortKey = e => [e.session_date, pyInt(num(e.elapsed_seconds)), e.event_id];
  events.sort((a, b) => {
    const ka = sortKey(a);
    const kb = sortKey(b);
    for (let i = 0; i < 3; i += 1) {
      if (ka[i] < kb[i]) {
        return -1;
      }
      if (ka[i] > kb[i]) {
        return 1;
      }
    }
    return 0;
  });

  return { report, added, dropped, events, eventColumns };
}

/** The report table as printed by reconcile_mock_evidence.py (lines, no trailing \n). */
function formatReconcile(result) {
  const lines = [`${ljust('goal', 6)}${rjust('sessions topped up', 20)}${rjust('sessions trimmed', 18)}`];
  for (const gid of sortedKeys(result.report)) {
    const [up, trimmed] = result.report.get(gid);
    lines.push(`${ljust(gid, 6)}${rjust(String(up), 20)}${rjust(String(trimmed), 18)}`);
  }
  lines.push(
    '',
    `events added: ${result.added} | goal tags removed: ${result.dropped} | total events now ${result.events.length}`,
  );
  return lines;
}

/**
 * Reconciles the standard dataset in dataDir. Writes the events CSV back unless dryRun.
 * @returns {{result: object, lines: string[], written: string|null}}
 */
function reconcileDataset({ dataDir = DEFAULT_DATA_DIR, dryRun = false } = {}) {
  const loaded = loadDataset(dataDir, 'standard');
  const result = reconcile(loaded);
  const lines = formatReconcile(result);
  let written = null;
  if (dryRun) {
    lines.push('', 'dry run — nothing written');
  } else {
    const target = path.join(dataDir, loaded.spec.eventsFile);
    fs.writeFileSync(target, stringifyCsv(result.eventColumns, result.events));
    written = target;
    lines.push('', `wrote ${loaded.spec.eventsFile}`);
  }
  return { result, lines, written };
}

module.exports = {
  // constants
  TODAY,
  DEFAULT_WEEKS,
  DEFAULT_DATA_DIR,
  DATASETS,
  ACHIEVEMENT_FLOOR,
  MIN_SESSIONS_PER_GROUP,
  MIN_SPREAD,
  ALL_STATES,
  DERIVABLE,
  LEXICON,
  FUNCTIONS,
  RECONCILE_SEED,
  // python compat
  num,
  pyInt,
  pyRound,
  PyRandom,
  dayNumber,
  // parsing
  parseSummary,
  parseEvents,
  groupByGoal,
  groupBySession,
  loadDataset,
  datasetExists,
  // coverage
  windowRows,
  sentenceSamples,
  evaluateGoal,
  evaluateDataset,
  formatCoverage,
  coverageReport,
  // consistency
  checkConsistency,
  consistencyReport,
  // reconcile
  reconcile,
  formatReconcile,
  reconcileDataset,
};
