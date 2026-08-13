# Matalk On-Device Personal Memory — Implementation PRD

**Status:** Draft for review — not yet approved for implementation
**Scope:** Matalk app (this repo) + matalkapi backend (`../MatalkBE/matalkapi`)
**Date:** 2026-08-03

This document turns the Personal Memory ("Second Brain") concept PRD into a concrete,
codebase-grounded implementation plan. It reflects the actual architecture of the app and
backend as of the `intake` branch, integrates the intake / "Tell Us More" feature as a
first-class memory source, and specifies how caregiver-stated facts and observed
communication behavior are reconciled (the "bananas problem").
Bannans problem : Caregiver added that banana's are childs favourite. memory sees this is not the case after a while

Decisions that deviate from the concept draft are marked **[D#]** and collected in
§20 for review.

---

## 1. Summary

Personal Memory is one unified on-device system with two layers:

- **Communication Memory** — deterministic, local-only learning of _how_ the user
  communicates: frequency, recency, time-of-day patterns, and word sequences derived from
  completed communication events. No AI involved. Works fully offline.
- **Personal Knowledge** — structured facts about the user (people, places, foods,
  likes/dislikes, routines…) from **three sources**:
  1. **Intake / caregiver-curated** — the existing `tellUsMore` free text and `pepes`
     tiles (highest trust, caregiver-confirmed by definition)
  2. **AI-extracted** — Gemini evaluates completed communication for clear, durable,
     personal facts (proposed, gated by confidence + validation + optionally caregiver review)
  3. **Caregiver review actions** — confirm / edit / delete / mark outdated

Both layers feed:

- Concise context blocks injected into Q&A (`/answers/generate`) and Verbi
  (`/v1/verbi/predictions`) requests
- Local suggestion ordering (within-group Verbi ordering, pepes image priority)
- Caregiver-facing review screens in Settings

Everything durable lives on the device. The backend stays stateless with respect to
memory: it extracts and it consumes context per-request, it never stores.

---

## 2. Current State (grounding)

What exists today and is reused. File references are to this repo unless noted.

### 2.1 Completed-communication event sites (the "Dashboard pipeline")

The Dashboard pipeline is **local SQLite** (`matalk_metrics.db`, `src/utils/database.ts`),
written via `src/contexts/DatabaseContext.tsx`. There is no upload/queue — these writes ARE
the event pipeline the concept PRD asks us to reuse:

| Event                                              | Where it fires                                                          | Table                           |
| -------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------- |
| Q&A answer selected                                | `Home.ios.tsx` `handleAnswerSelected` → `logWordSelection(word,'Home')` | `utterances`                    |
| Q&A round resolved (question + all rounds + picks) | `Home.ios.tsx` `handleAnswerSelected` → `addAIResolved`                 | `ai_resolved`                   |
| Convo word tile tapped                             | `SentenceBuilderGrid.tsx` `processCardPress` → `logWordSelection(word)` | `utterances` (`source:'Convo'`) |
| Convo sentence played (completed)                  | `Convo.tsx` `handleSentencePlayed` → `addClassicEntry`                  | `classic`                       |

These are exactly the "intentional, completed communication" moments Personal Memory
needs. **Suggestions that are displayed but never selected never reach these sites**, so
the no-learning-from-ignored-suggestions rule holds by construction.

Known gaps to fix (prerequisites, §18 Phase 0):

- `SentenceBuilderGrid.addWordByLabel` (Verbi-injected words) calls `onWordAdded` but
  **not** `logWordSelection` — Verbi-sourced words never reach `utterances` today.
- `Home.ios.tsx` fires a `mode:'learning_feedback'` call to `/answers/generate` on every
  selection; the backend short-circuits it to `{results: []}` (no-op). This will be retired
  and replaced by local memory recording.
- Sentence abandonment (4-minute timer in `Convo.tsx`) correctly produces **no** event — good.

### 2.2 Intake ("Tell Us More") — the user-generated context

- Free text: preference key `tellUsMore` (string), written by
  `src/Components/TellUsMore/TellUsMoreSection.tsx`
- Structured tiles: preference key `pepes` — `PepesData` with categories
  `People, Toys, Pets, TVShows, Food, Drinks, Places`; items
  `{id, name, aliases[], type?, relationship?, isFavorite?, imageUri}`
- Produced by the intake chat (`IntakeChatModal`) / magic build / preview flow via backend
  `/api/context/*` (stateless Gemini "Context Engine")
- Sent to AI today: Q&A gets `metadata.tellUsMore` + `metadata.pepes`; **Verbi gets only
  `contextCues.pepes`** (no `tellUsMore`) — a gap this PRD closes.
- `isFavorite` is currently write-only — never read by any ranking or prompt logic.

### 2.3 Storage conventions

- Key-value: `react-native-default-preference` via `src/utils/persistance.tsx`
  (all values strings; `'1'`/`'0'` booleans; new keys must be added to both the
  `Preferences` interface and `initialPreferences` — that also auto-includes them in
  profile export/import)
- SQLite: `react-native-sqlite-storage` (`matalk_metrics.db`, `sentence_builder.db`)
- Profile export/import: `src/services/ProfileExportService.ts` / `ProfileImportService.ts`
  copy `storage.json` + the two SQLite DBs + image folders

### 2.4 Backend (matalkapi) facts that shape this design

- **Gemini only.** Direct path (`/answers/generate`, `/polish-text`) uses
  `geminiStreamModeJSON` — SSE streaming that returns the **first complete parseable
  JSON** for lowest latency. Router path (`services/llm/llmRouter.js` →
  `geminiProvider`) supports `response_schema` structured output (used by Context Engine).
- Verbi predictions: `services/verbi/verbi.prompts.js` injects context only through
  `formatCuesBlock` (timeOfDay, date, pepes); 5s LLM timeout; child-mode word filtering
  against `word_image`.
- `verbi_utterances` / `verbi_conversations` are transient (deleted on conversation close).
- A `learned_facts` Postgres table exists (`create_learned_facts_table.sql`) but is
  **never written**. It will NOT be used — memory is on-device. **[D7]**
- The backend is stateless for child context; the intake prompt itself promises
  _"stored only on your device and never shared."_ This PRD preserves that promise.

---

## 3. Architecture Overview

```
                         ┌────────────────────────────────────────────┐
                         │              MATALK APP (device)           │
                         │                                            │
 Q&A selection ──────┐   │  ┌──────────────────────────────────────┐  │
 Q&A round resolved ─┤   │  │  PersonalMemoryService (new)         │  │
 Convo word tapped ──┼──►│  │  recordEvent() — same call sites as  │  │
 Convo sentence ─────┘   │  │  the Dashboard writes                │  │
   played                │  └──────┬───────────────────────────────┘  │
                         │         │ async, non-blocking              │
                         │         ▼                                  │
                         │  personal_memory.db (new SQLite)           │
                         │  ├─ Communication Memory tables            │
                         │  ├─ Personal Knowledge tables              │
                         │  └─ extraction queue                       │
                         │         │                    ▲             │
                         │         │ context builder    │ validated   │
                         │         ▼                    │ updates     │
                         │  memoryContext blocks   MemoryUpdate       │
                         │  (concise, capped)      validator          │
                         └────┬──────────────┬──────────┬─────────────┘
                              │              │          │
              ┌───────────────▼──┐  ┌────────▼───────┐  │
              │ POST /answers/   │  │ POST /v1/verbi/│  │
              │ generate         │  │ predictions    │  │
              │ (+memoryContext) │  │ (+memoryContext│  │
              └──────────────────┘  │  +tellUsMore)  │  │
                                    └────────────────┘  │
                                    ┌───────────────────▼────────────┐
                                    │ POST /api/memory/extract (new) │
                                    │ stateless Gemini extraction    │
                                    │ → memoryUpdates[]              │
                                    └────────────────────────────────┘
```

**[D1] Extraction transport.** The concept draft embedded `memoryUpdates` in every Verbi
and Q&A response. This PRD instead uses a **dedicated, stateless
`POST /api/memory/extract` endpoint**, called fire-and-forget after eligible completed
communication. Rationale:

1. `/answers/generate` streams and early-exits on the first parseable JSON specifically
   for latency. Adding `memoryUpdates` to that schema delays the parse-complete moment on
   **every** request — violating the draft's own "no added delay to visible answers" rule.
2. Verbi predictions fire on every tap (100ms debounce, 5s budget); extraction is only
   relevant at sentence completion — a different cadence entirely.
3. Offline completions queue locally and drain later — trivial with a dedicated endpoint,
   awkward when extraction can only ride along on a future unrelated answer request.
4. Mixing "generate answers for a child" and "extract durable facts" in one Gemini call
   degrades both; they need different prompts, temperatures, and schemas.

The **`memoryUpdates` contract itself (shape, actions, confidence, validation) is kept
exactly as drafted** — only the transport differs. The app-side processing pipeline is
identical to the draft's intent.

---

## 4. On-Device Data Model

**[D2]** New SQLite database **`personal_memory.db`** (not new tables inside
`matalk_metrics.db`), because: independent reset/clear semantics (§14–15), independent
export/import handling (§16), and metrics stays a pure analytics store. Managed by a new
`src/utils/personalMemoryDb.ts` following the `sentenceBuilderSqlite.ts` singleton pattern
(open/close lifecycle compatible with ProfileImport's close-DBs-restore-reopen flow).

### 4.1 Communication Memory tables

```sql
-- One row per distinct communication item (word / phrase / sentence)
CREATE TABLE memory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK(kind IN ('word','sentence','answer')),
  text TEXT NOT NULL,
  normalized TEXT NOT NULL,              -- lowercased, trimmed; match key
  first_used DATETIME NOT NULL,
  last_used DATETIME NOT NULL,
  use_count INTEGER NOT NULL DEFAULT 1,
  pinned INTEGER NOT NULL DEFAULT 0,     -- caregiver pin (§15)
  UNIQUE(kind, normalized)
);

-- Time-of-day usage buckets (morning/afternoon/evening/night, same
-- boundaries as getTimeOfDay(): <12 / <17 / <21 / else)
CREATE TABLE time_patterns (
  item_id INTEGER NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL CHECK(bucket IN ('morning','afternoon','evening','night')),
  use_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (item_id, bucket)
);

-- Bigram sequences from completed sentences and Q&A follow-ups
CREATE TABLE sequences (
  prev_normalized TEXT NOT NULL,
  next_normalized TEXT NOT NULL,
  use_count INTEGER NOT NULL DEFAULT 1,
  last_used DATETIME NOT NULL,
  PRIMARY KEY (prev_normalized, next_normalized)
);

-- Session-scoped recent items (cleared by "Clear Recent Memory")
CREATE TABLE recent_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  used_at DATETIME NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('Home','Convo'))
);
-- capped: keep newest 200 rows, pruned on insert
```

Frequency + recency are combined at read time into a decayed score (§6.3); no separate
"long-term memory" table is needed — long-term IS `memory_items`, recency IS
`last_used` + `recent_items`.

### 4.2 Personal Knowledge tables

```sql
CREATE TABLE knowledge_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL CHECK(category IN
    ('person','relationship','place','food','activity','object',
     'like','dislike','routine','fact')),
  subject TEXT NOT NULL,                 -- e.g. "Danielle", "banana", "Pinecrest School"
  value TEXT,                            -- e.g. "sister", "favorite", "school"
  statement TEXT NOT NULL,               -- human-readable: "Danielle is the user's sister"
  confidence REAL NOT NULL,              -- 0..1
  source TEXT NOT NULL CHECK(source IN ('intake','ai','caregiver')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN
    ('active','suggested','possibly_outdated','replaced','inactive','rejected')),
  confirmed INTEGER NOT NULL DEFAULT 0,  -- caregiver confirmed
  ai_context_enabled INTEGER NOT NULL DEFAULT 1,  -- caregiver can exclude per-fact
  pepes_item_id TEXT,                    -- link to a pepes tile when subject matches (§8)
  replaced_by INTEGER REFERENCES knowledge_items(id),
  first_learned DATETIME NOT NULL,
  last_reinforced DATETIME NOT NULL,
  usage_checked_at DATETIME              -- last drift evaluation (§8.3)
);

-- Evidence trail: which completed communications support/contradict a fact
CREATE TABLE knowledge_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  knowledge_id INTEGER NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('create','reinforce','contradict','caregiver')),
  communication_text TEXT,               -- the supporting completed communication
  occurred_at DATETIME NOT NULL
);

-- Completed communications awaiting AI extraction (offline tolerant)
CREATE TABLE extraction_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,         -- client-generated, for dedup
  text TEXT NOT NULL,
  source TEXT NOT NULL,                  -- 'Home' | 'Convo'
  occurred_at DATETIME NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
-- capped: newest 50; older rows dropped (extraction is best-effort)

-- AI-proposed updates awaiting caregiver review (medium-confidence path)
CREATE TABLE pending_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payload TEXT NOT NULL,                 -- JSON of the proposed MemoryUpdate
  created_at DATETIME NOT NULL
);
```

### 4.3 New preference keys (`persistance.tsx`)

| Key                         | Default  | Meaning                                             |
| --------------------------- | -------- | --------------------------------------------------- |
| `memoryEnabled`             | `'1'`    | Master switch (§15.1)                               |
| `memoryLearningPaused`      | `'0'`    | Pause new learning (§15.2)                          |
| `memoryAiContextEnabled`    | `'1'`    | "Use Personal Memory to improve AI answers" (§15.3) |
| `memoryExtractionThreshold` | `'0.85'` | Auto-accept confidence threshold                    |
| `memorySchemaVersion`       | `'1'`    | For future migrations                               |

Adding them to `initialPreferences` automatically includes them in profile export/import.

---

## 5. Event Capture & Processing

### 5.1 One event, all sinks

A new `PersonalMemoryService` (`src/services/PersonalMemoryService.ts`) exposes
`recordCompletedCommunication(event)`. It is invoked at the **same four call sites** as
the existing Dashboard writes — no second pipeline, no duplicated rows:

```ts
type CompletedCommunicationEvent = {
  eventId: string; // `mem_${Date.now()}_${rand}` — dedup key
  kind: 'answer' | 'word' | 'sentence';
  text: string;
  words: string[]; // constituent words (sentence) or [text]
  source: 'Home' | 'Convo';
  occurredAt: Date;
  question?: string; // Q&A: the partner's question
};
```

| Call site                                                                                           | Event emitted                                            |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `Home.ios.tsx` / `Home.android.tsx` `handleAnswerSelected` (real answers only, not `'MoreAnswers'`) | `kind:'answer'`, `question` = `currentAIRecord.question` |
| `SentenceBuilderGrid.processCardPress` (after `logWordSelection`)                                   | `kind:'word'`                                            |
| `SentenceBuilderGrid.addWordByLabel` (Verbi injection — **after Phase-0 fix**)                      | `kind:'word'`                                            |
| `Convo.handleSentencePlayed` (after `addClassicEntry`)                                              | `kind:'sentence'`, `words` = spoken tokens               |

Processing (all local, all inside one `InteractionManager.runAfterInteractions` /
fire-and-forget async task so TTS, navigation, and selection are never blocked):

1. Upsert `memory_items` (per word + per full sentence/answer), bump `use_count`,
   `last_used`.
2. Bump `time_patterns` for the current bucket.
3. For sentences: upsert consecutive-word bigrams into `sequences`.
4. Insert into `recent_items` (prune to 200).
5. **Eligibility prefilter** (§7.4): if the text may contain Personal Knowledge, enqueue
   into `extraction_queue`.
6. Kick the extraction drainer (§7.5) if online.

Gating: steps 1–5 are skipped entirely when `memoryEnabled === '0'` or
`memoryLearningPaused === '1'`. Dashboard writes are unaffected.

### 5.2 What is never captured

Unchanged from the concept draft, and already true structurally: displayed-but-unselected
suggestions, abandoned sentences (4-min timer), deleted words, drafts, partner utterances
(Verbi `speaker:'partner'` STT is context, not user communication — it must never create
memory), loading/system/debug text.

---

## 6. Communication Memory Mechanics

### 6.1 Frequency & recency

Raw counts live in `memory_items`; effective score is computed at read time.

### 6.2 Decay

Exponential decay with a **30-day half-life** (configurable constant):

```
score(item) = use_count * 0.5 ^ (days_since_last_used / 30)
```

Nothing is deleted by decay. A reused item's `last_used` reset restores its score
instantly. Pinned items get a fixed additive boost. Personal Knowledge never decays this
way (only the drift mechanism in §8.3 can change its status, and confirmed facts require
caregiver action).

### 6.3 Ranking signal (exposed to consumers)

```ts
getRankedWords(opts: {
  bucket?: TimeBucket;        // boost items used in this bucket
  precedingWord?: string;     // boost sequence continuations
  limit: number;
}): Array<{ text: string; score: number }>
```

Composite: `score = decayedFrequency * (1 + 0.5*timeOfDayAffinity + 1.0*sequenceBoost + pinBoost)`.
Weights are constants in one place (`memoryRanking.ts`) — tunable, never user-visible.

### 6.4 Where local ranking is applied **[D5-local]**

Today the app has no local suggestion surface that ranks (Verbi order is server `rank` →
POS grouping → stable merge). Scoped applications:

1. **Verbi within-group ordering:** inside each POS group in `buildVerbiGroups`, order by
   memory score (desc), falling back to server rank. `stableMergeSuggestions` still wins —
   stability under the child's finger beats freshness.
2. **Image/answer resolution priority:** `resolvePepesImage` already prefers pepes; no change.
3. **Out of scope for v1** (listed for future): an auto-curated "My Words" row in
   Sentence Builder; reordering Q&A answer cards client-side (answer order is
   pedagogically meaningful — do not touch).

---

## 7. AI-Assisted Personal Knowledge Extraction

### 7.1 Endpoint (backend, new)

`POST /api/memory/extract` — mounted next to `/api/context` in `server.js` (before the
global auth gate), `requireAppSession`, same rate-limit posture as `/api/context`.
Stateless: nothing persisted server-side.

Request:

```jsonc
{
  "communications": [
    // batch, 1..10 (drained queue)
    {
      "eventId": "mem_...",
      "text": "My sister is Danielle",
      "source": "Convo",
      "occurredAt": "2026-08-03T14:01:00Z"
    }
  ],
  "childName": "Bear", // heroName, for referent disambiguation
  "existingFacts": [
    // capped summary for dedup/contradiction detection
    {
      "id": 12,
      "category": "food",
      "subject": "banana",
      "value": "favorite",
      "statement": "Bananas are a favorite food",
      "source": "intake",
      "confirmed": true
    }
  ],
  "locale": "en-US"
}
```

Response:

```jsonc
{
  "memoryUpdates": [
    // ≤3 per communication, usually []
    {
      "eventId": "mem_...", // which communication produced it
      "action": "create", // create|reinforce|update|contradict
      "category": "relationship",
      "subject": "Danielle",
      "value": "sister",
      "statement": "Danielle is Bear's sister",
      "confidence": 0.93,
      "existingFactId": null, // set for reinforce/update/contradict
      "needsCaregiverReview": false
    }
  ]
}
```

Implementation: `services/memory/memoryExtract.prompt.js` +
`services/memory/memoryExtract.service.js`, called through the existing
`llmRouter`/`geminiProvider` with a **fully-specified Gemini `responseSchema`** (the
Context Engine codebase already documents that Gemini structured output requires complete
item schemas — same pattern as `magicBuild.prompt.js`). Temperature 0.1,
`maxOutputTokens` 1024. `deactivate` is a caregiver-only action and is not in the AI
vocabulary.

The prompt encodes the concept draft's rules verbatim: user-referent only, explicit not
inferred, durable not temporary ("I am hungry" / "I am at school" / "Dad is here" → no
update), no hypotheticals, no sensitive-category inference (§17), supported categories
only, high-confidence bar, ≤3 updates per communication, empty array as the default
outcome. `existingFacts` lets Gemini return `reinforce`/`update`/`contradict` with the
right `existingFactId` instead of duplicate `create`s.

### 7.2 Legacy cleanup

- Retire `mode:'learning_feedback'` on `/answers/generate` (server no-op today; the app
  call in `handleAnswerSelected` is removed in Phase 1).
- Do **not** use the orphaned `learned_facts` Postgres table; delete
  `create_learned_facts_table.sql` or mark it superseded. **[D7]**

### 7.3 Client-side drain

`PersonalMemoryService.drainExtractionQueue()`:

- Triggered after enqueue (if `isConnected` from `ConnectionContext`), on app foreground,
  and after a successful AI request completes.
- Batches up to 10 queued communications; ≤1 in-flight request at a time; per-row
  `attempts` capped at 3 then dropped; failures silent (never surfaces to the child UI).
- Gated by `memoryEnabled` **and** `memoryAiContextEnabled` — if the caregiver has turned
  off AI context, communication text also stops leaving the device for extraction.
  The queue text is the only content transmitted; never the memory stores.

### 7.4 Eligibility prefilter (on device, deterministic)

To keep volume and cost near zero, only plausible fact-bearers are enqueued:

- ≥3 words, AND
- contains a first-person/possessive marker (`my, I, mine, we, our`) or a copular pattern
  (`is, are, like, love, hate, don't like, favorite, go to, live`), AND
- not on the stoplist of pure-need utterances (`I want X`, `yes`, `no`, `help`, `more`, …)

Single-word answers and short need-expressions still update Communication Memory (step 1–4)
but skip extraction. False negatives are acceptable; false positives cost one cheap
Gemini call that returns `[]`.

### 7.5 Validation of returned updates (app-side, before storage)

Reject any update that: is missing required fields; has an unsupported category; falls
below `memoryExtractionThreshold`; references an `existingFactId` that doesn't exist;
duplicates an active fact without being a `reinforce`; matches the sensitive-boundary
blocklist (§17); or arrives when learning is paused/disabled. Rejections are dropped
silently (debug-log count only, never content).

Accepted updates apply as:

| Action                                                         | Effect                                                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `create` (high conf.)                                          | Insert `knowledge_items` `status:'active'`, `source:'ai'`, `confirmed:0` + evidence row                |
| `create` (`needsCaregiverReview` or conf. in [0.6, threshold)) | Insert with `status:'suggested'` → appears in review queue (§15)                                       |
| `reinforce`                                                    | `last_reinforced = now`, `confidence = min(0.99, confidence + 0.05)`, evidence row                     |
| `update`                                                       | New item `active`; old item `status:'replaced'`, `replaced_by` set; history preserved                  |
| `contradict` vs unconfirmed AI fact                            | Old → `possibly_outdated`; contradiction evidence row                                                  |
| `contradict` vs **confirmed or intake/caregiver fact**         | Fact stays `active`; evidence recorded; a review item is queued — **never silently overridden** (§8.4) |

---

## 8. Intake Integration & Reconciliation (the bananas problem)

This section is new relative to the concept draft. **[D3][D4]**

### 8.1 Roles of the three stores

| Store                    | Owner                       | Role                                                                     |
| ------------------------ | --------------------------- | ------------------------------------------------------------------------ |
| `tellUsMore` (free text) | Caregiver via intake        | Narrative background; already sent to Q&A, now also to Verbi             |
| `pepes` tiles            | Caregiver via intake/editor | Canonical caregiver-curated entities (names, aliases, favorites, images) |
| `knowledge_items`        | Personal Memory             | Unified fact layer: seeds from intake + AI-learned + caregiver actions   |

`pepes` and `tellUsMore` remain the caregiver's editing surface — Personal Memory does not
replace them, it **links to them and layers observed evidence on top**.

### 8.2 Seeding from intake **[D3]**

On Personal Memory initialization, and after every intake finalize
(`handleAcceptPreview` in `TellUsMoreSection`) or pepes edit (`savePepesData`):

- Each pepes tile is mirrored into `knowledge_items` with `source:'intake'`,
  `confirmed:1`, `confidence:0.95`, `status:'active'`, and `pepes_item_id` linkage.
  Category mapping: People→person/relationship (from `relationship` field), Pets→object,
  Food/Drinks→food, Places→place, Toys→object, TVShows→object.
  `isFavorite:true` additionally creates a `like` fact ("X is a favorite") — this finally
  makes the heart do something.
- Re-seeding is an upsert keyed on `pepes_item_id`; caregiver deletion of a tile
  deactivates the mirrored fact (`status:'inactive'`), never the reverse automatically.
- `tellUsMore` free text is **not** parsed into facts locally (no on-device NLP). It flows
  to AI context as-is (§9). Optionally (Phase 5), one `magic-build`-style extraction pass
  can propose structured facts from it via the existing Context Engine — flagged as an
  open question (§21-Q3).

### 8.3 Drift detection — caregiver facts vs observed behavior **[D4]**

The scenario: intake says bananas are a favorite food, but bananas have stopped appearing
in the child's communication.

A lightweight periodic job (`evaluateKnowledgeDrift()`, run at most once/day on app
foreground):

1. For each `active` preference-type fact (`like`, `dislike`, food/activity favorites),
   look up its subject in `memory_items` (match on `normalized` against subject + pepes
   aliases).
2. Compute a **usage trend**: uses in the last 30 days vs. the prior 60 days.
3. Flag when **both** are true:
   - the subject was previously used (baseline ≥ 3 uses) and has dropped to zero or near
     zero for ≥ 45 days, **or** an explicit contradiction evidence row exists
     ("I don't like bananas");
   - the fact has not been re-confirmed by the caregiver since the drop began.
4. Flagged facts:
   - keep `status:'active'` but set a `possibly_outdated` **review flag** (for
     intake/caregiver-source facts) — they are _never_ auto-deactivated;
   - AI-source unconfirmed facts may move directly to `status:'possibly_outdated'`;
   - context weighting drops (§9.3): a flagged fact is included in AI context only when
     directly relevant to the current interaction, never in the ambient summary;
   - a review card appears in Settings → Personal Memory → About the User:
     _"Bananas haven't come up in over 6 weeks. Still a favorite?"_ → **Still true** (
     re-confirms, resets flag, records caregiver evidence) / **Not anymore** (
     `status:'replaced'`/`inactive'`, and — if linked to a pepes tile — offers to unmark
     the tile's favorite heart) / dismiss (re-ask no sooner than 30 days).

Explicit contradiction through communication ("I don't like bananas" as a completed
sentence) follows §7.5: recorded as evidence + review card immediately, but the confirmed
intake fact is not silently flipped. **The hierarchy is: caregiver action > caregiver-
stated intake fact > repeated observed communication > single observation.** Observation
can demote _influence_ on its own, but only a caregiver can flip a confirmed _fact_.

Absence alone is deliberately weak evidence (a child may simply not have had bananas
offered) — hence the long windows, the baseline requirement, and remediation via review
rather than automatic change.

### 8.4 Promotion — learned facts enriching intake data

The reverse direction: when an AI-learned fact reaches high standing
(`confidence ≥ 0.9`, ≥3 reinforcements across ≥3 distinct days, or caregiver-confirmed),
and its subject has no matching pepes tile, the review UI offers **"Add to People &
Stuff"** — creating a tile via the existing `savePepesData` path (placeholder image, name

- relationship prefilled). This closes the loop: learned knowledge becomes caregiver-
  curated context that both AI surfaces already consume. Never automatic; always a
  caregiver tap.

---

## 9. AI Context Injection

### 9.1 Context builder (app)

`PersonalMemoryService.buildMemoryContext(opts)` returns a compact object, built
synchronously from SQLite with strict caps (target: **< 600 chars serialized**, hard cap
1000):

```ts
type MemoryContext = {
  communication?: {
    recentWords?: string[]; // ≤10, from recent_items
    frequentWords?: string[]; // ≤10, decayed top
    commonSequences?: string[]; // ≤5, "I need → help"
    timeOfDay?: string;
  };
  personal?: {
    // ≤8 facts, relevance-selected
    facts: string[]; // human statements: "Sister: Danielle"
  };
};
```

Relevance selection for `personal.facts`: confirmed + active facts first, ranked by
(caregiver-confirmed, recency of reinforcement, lexical overlap with the current
question/sentence/folder when available); `possibly_outdated`-flagged facts only on
direct lexical match; `ai_context_enabled = 0`, `inactive`, `rejected`, `replaced`
facts never. The full stores are never serialized.

Gating: returns `undefined` unless `memoryEnabled === '1'` **and**
`memoryAiContextEnabled === '1'`. Build time budget ~5ms (indexed reads); on any error
return `undefined` — the request proceeds without context.

### 9.2 Q&A request (`AssistantContext.generateAnswers`)

Add `metadata.memoryContext` alongside the existing `tellUsMore`/`pepes`. Backend
(`makeModePrompt` / `makeModePromptAdult` in `server.js`): when present, append a
`context_logic.personal_memory` rule —
_"Use 'memoryContext' for the child's recent and frequent communication and known
personal facts. Prefer personally relevant answers when appropriate. Never output these
facts unprompted; never change answer count, length, tone, or format."_ — and pass
`memoryContext` through in `wanted.metadata`. The visible response contract
(`{results, countMax}`) is untouched.

### 9.3 Verbi request (`useVerbiPrediction` / `verbi.prompts.js`) **[D5]**

- Extend `contextCues` with `memoryContext` **and** `tellUsMore` (closing the existing
  gap where Verbi never sees the intake free text). `tellUsMore` is truncated to 500
  chars for the Verbi prompt (5s LLM budget).
- Backend `formatCuesBlock` renders both:
  `Child's frequent words: ...` / `Common next-word patterns: ...` /
  `About the child: <tellUsMore excerpt> / <facts>`.
- Prompt instruction: _"Prefer suggesting words the child actually uses when equally
  grammatical."_ Child-mode `word_image` filtering is unchanged, so memory-suggested words
  without images still fall out (except function words) — acceptable.

### 9.4 What is never sent

Complete `memory_items` / `knowledge_items` dumps; raw evidence text; internal scores;
anything when the AI-context toggle is off. Mixpanel events may carry **counts** only
(e.g. `memory_context_included {factCount}`), never content.

---

## 10. Offline Behavior

- Steps 1–5 of §5.1 are pure local SQLite — fully functional offline.
- `extraction_queue` accumulates (cap 50) and drains on reconnect/foreground — no
  background sync service, no continuous upload.
- Context building is local; offline AI requests already fail today and memory changes
  nothing there. Existing Personal Knowledge remains readable offline.

## 11. Cold Start

Empty memory ⇒ `buildMemoryContext` returns `undefined` and ranked-word queries return
`[]` ⇒ every consumer falls back to current behavior (server rank order, default
vocabulary, existing prompts). Intake seeding (§8.2) means a family that completes intake
starts with a populated "About the User" screen on day one — the review UI is never
embarrassingly empty if intake ran.

## 12. Performance

- All writes go through a single serialized async queue (mirroring `pressChainRef`
  patterns); `recordCompletedCommunication` returns immediately; failures are swallowed
  after debug-count logging.
- Word-selection hot path adds only an enqueue; no synchronous SQLite on the tap path.
- `buildMemoryContext` uses covering indexes (`normalized`, `last_used`,
  `(status, category)`); target <5ms, measured in dev via the existing `getStats` pattern.
- Extraction is fire-and-forget, batched, off the answer path entirely (per [D1] this is
  structural, not aspirational).

## 13. Reliability

- Idempotency: `eventId` unique keys in `extraction_queue`; upserts everywhere else make
  duplicate event delivery harmless.
- DB open failure ⇒ `PersonalMemoryService` enters a no-op mode (all methods safe
  no-ops); the app runs exactly as today.
- Extraction/API failure ⇒ answers unaffected (separate call); queue retries ≤3.
- Migrations: `memorySchemaVersion` preference + `PRAGMA user_version`; forward-only.
- ProfileImport already closes/reopens SQLite DBs — `personal_memory.db` registers with
  the same lifecycle.

---

## 14. Settings — Personal Memory area (`Settings.tsx`)

New section following the existing section/sectionTitle pattern, placed after
**Personalize Your Experience** (it is conceptually its sibling), gated by
`showAccountSettings` like its neighbors.

Explanatory copy (verbatim from concept draft):

> Matalk learns from the words, answers, phrases, and sentences selected on this device.
> Personal Memory is stored locally on this device. Relevant parts of Personal Memory may
> be sent as text context during Verbi Board predictions and Q&A requests to improve the
> quality and personalization of AI responses.

Controls (all `<Switch>` per existing convention, `'1'`/`'0'` strings):

- **Personal Memory** (`memoryEnabled`) — master switch. Off: no learning, no local
  influence, no AI context; stored data retained.
- **Pause learning** (`memoryLearningPaused`) — visible only when enabled. On: no new
  learning; existing memory keeps working.
- **Use Personal Memory to improve AI answers** (`memoryAiContextEnabled`).
- Navigation rows: **Learned Communication** and **About the User** (§15 screens).
  The **About the User** row shows a content-free count badge ("2 to review") when the
  review queue is non-empty — computed as `suggested` facts + unanswered drift cards +
  pending pepes-promotion offers. The badge shows a number only, never fact content,
  consistent with §17 (no notifications; the nudge exists only inside Settings). It
  clears as items are resolved or dismissed.
- **Clear Recent Memory** — deletes `recent_items` + in-memory session ranking state;
  preserves everything else. Single confirm.
- **Reset Personal Memory** — destructive confirm dialog (match Reset Installation's
  pattern); drops and recreates all `personal_memory.db` tables, clears
  `pending_updates`/`extraction_queue`, resets the three toggles to defaults. Preserves
  default vocabulary, pepes, tellUsMore, sentence builder, and all other settings.

## 15. Caregiver Review Screens

Two screens (new files under `src/Views/`, routed like `MetricDetail`):

**15.1 Learned Communication** — list from `memory_items`, grouped word/sentence, showing
qualitative labels only (Used often / Used sometimes / Recently learned / Not used
recently — thresholds on decayed score), last-used period, pin toggle, swipe-delete
(single item). No numeric scores anywhere.

**15.2 About the User** — `knowledge_items` grouped by category. Each card: statement,
badge (**Confirmed** / **Suggested** / **Learned from repeated communication** /
**May be outdated** / **Replaced**), source ("From intake" / "Learned"), last-reinforced
period. Actions per §25 of the concept draft: Confirm, Edit (statement/value), Delete,
Mark incorrect (`status:'rejected'` — also blocklists the exact subject+category from
future auto-creation), Mark outdated, Exclude from AI context (`ai_context_enabled`),
Restore. Top of screen: the **review queue** — `suggested` facts and drift cards (§8.3)
awaiting a decision, and pepes-promotion offers (§8.4).

Caregiver actions write `knowledge_evidence` rows (`kind:'caregiver'`) and set
`confirmed`, giving them permanent priority per §8.3's hierarchy.

## 16. Hero Change / Profile Import / Export

- **Hero name change** (`handleSaveHeroName`, Settings): if any Personal Memory exists
  (`memory_items` or non-intake `knowledge_items` nonempty), interpose the dialog
  **"Is this still the same Matalk hero?"** — _Keep Personal Memory_ (proceed, keep all) /
  _Clear Personal Memory_ (run the §14 reset, then proceed) / Cancel (abort the name
  change). No memory ⇒ no dialog.
- **Profile import** (`ProfileImportService`): same dialog before restore when local
  memory exists. `personal_memory.db` is **included in export/import** alongside the
  other DBs (it belongs to the hero, and export is the family's own backup — consistent
  with `tellUsMore` already being exported). **[D6]**
- **Reset Installation / delete-account flow**: add `personal_memory.db` teardown + the
  new preference keys to the reset list (and fix the existing gap where `tellUsMore` /
  `intakeActiveStepIndex` / `intakeStepStatuses` are not cleared — Phase 0).

---

## 17. Privacy & Sensitive Boundaries

- All memory in app-controlled local storage (`personal_memory.db` + preferences);
  never uploaded as a store; only §9's capped context blocks and §7.3's queued
  communication text ever leave the device, both gated by caregiver toggles.
- Mixpanel: event names + counts only; **no communication text, no fact content** in any
  analytics property. Crash reporting / debug logs: content-free (counts and codes).
- Sensitive-category blocklist enforced twice — in the extraction prompt (Gemini must not
  return medical/mental-health/religion/sexuality/political/abuse/family-conflict
  inferences) and in the app-side validator (§7.5) as defense in depth. Pattern-based
  inference of diagnoses or behavior is prohibited; explicitly-communicated sensitive
  facts require caregiver confirmation before entering AI context
  (`status:'suggested'`, `ai_context_enabled:0` until confirmed).
- The intake prompt's promise ("stored only on your device") remains true: the backend
  extraction endpoint is stateless and the `learned_facts` table stays unused/removed.

---

## 18. Implementation Phases

**Phase 0 — Prerequisite fixes (small, independently shippable)**

1. `addWordByLabel` logs utterances (`logWordSelection`) so Verbi-sourced words count.
2. Remove the no-op `learning_feedback` call from `handleAnswerSelected`.
3. Add missing intake keys to the delete/reset flows in `Settings.tsx`.
4. (Backend) Delete/supersede `create_learned_facts_table.sql`.
5. (Nice-to-have, same area) Fix intake transcript `'\\n\\n'` literal join and the
   hardcoded `/6` step counter in `IntakeChatModal`.

**Phase 1 — Communication Memory (local, no AI, no UI)**
`personalMemoryDb.ts` + schema; `PersonalMemoryService.recordCompletedCommunication`
wired into the four call sites; decay/ranking module; preference keys; unit tests
(`__tests__`) for upserts, bigrams, buckets, decay math, and no-op mode.

**Phase 2 — Context injection**
`buildMemoryContext`; `metadata.memoryContext` in Q&A; `contextCues.memoryContext` +
`tellUsMore` in Verbi; backend prompt updates (`makeModePrompt*`, `formatCuesBlock`);
size-cap enforcement; verify zero change to response shapes.

**Phase 3 — Personal Knowledge extraction**
Backend `POST /api/memory/extract` (prompt + service + route + responseSchema); app
prefilter, queue, drainer, validator, apply-actions; knowledge tables live; intake
seeding (§8.2).

**Phase 4 — Settings & review UI**
Settings section + toggles; Learned Communication + About the User screens; review
queue; clear/reset; hero-change + import dialogs; export/import of `personal_memory.db`.

**Phase 5 — Reconciliation & polish**
Drift job (§8.3) + drift review cards; pepes promotion (§8.4); within-group Verbi
ordering (§6.4); optional tellUsMore→facts structuring pass (pending Q3).

Each phase is shippable behind the `memoryEnabled` flag; Phases 1–2 alone already deliver
visible personalization.

## 19. Acceptance Criteria

All criteria from the concept draft §34 carry over, re-expressed for this design where
transport changed, plus the intake-integration additions:

- The four completed-communication sites update Communication Memory; no new event
  pipeline exists; Dashboard analytics are byte-for-byte unaffected.
- Verbi-injected words appear in both `utterances` and memory (Phase 0).
- Displayed-but-unselected suggestions and abandoned sentences produce no memory.
- Frequency/recency/sequence/time-of-day update locally and offline; decay per §6.2.
- Eligible completions are queued and extracted via `/api/memory/extract`; responses
  validate per §7.5; `memoryUpdates` is empty for non-eligible communication; ≤3 updates
  per communication; temporary states never become facts.
- Q&A and Verbi visible response shapes, answer counts, length, and tone are unchanged
  with memory on or off (snapshot-tested).
- Intake pepes tiles seed confirmed Personal Knowledge; `isFavorite` produces `like`
  facts; caregiver tile edits propagate.
- The bananas scenario: a confirmed intake favorite whose subject shows sustained
  non-use (or explicit contradiction) is flagged for review, loses ambient AI-context
  weight, is never auto-deleted, and resolves via the caregiver card either way.
- High-standing learned facts can be promoted into pepes via one caregiver tap.
- Settings section, both review screens, all §15 caregiver actions, Clear Recent, Reset,
  hero-change and import dialogs function as specified; caregiver-confirmed facts
  outrank AI facts everywhere.
- The About the User row shows a count-only review badge when items await review; the
  badge never exposes fact content and clears as items are resolved.
- With Personal Memory disabled: no learning, no influence, no transmission, data
  retained. With the AI toggle off: no memory text leaves the device (context **and**
  extraction).
- Memory failure of any kind never blocks selection, TTS, navigation, or answers.

## 20. Decisions Deviating from the Concept Draft (for review)

| #   | Decision                                                                                                                                             | Draft said                                                  | Why                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Dedicated stateless `POST /api/memory/extract`, fire-and-forget, batched, offline-queued                                                             | `memoryUpdates` embedded in every Verbi/Q&A response        | Q&A streams and early-exits on first parseable JSON — embedding memory in that schema slows every visible answer; Verbi fires per-tap but extraction is per-completion; offline queue needs an addressable endpoint. Contract shape is preserved. |
| D2  | New `personal_memory.db`                                                                                                                             | (unspecified)                                               | Independent reset/clear/export semantics; keeps metrics DB purely analytical                                                                                                                                                                      |
| D3  | Intake `pepes`/`tellUsMore` seed Personal Knowledge as confirmed caregiver facts; pepes stays the canonical curated store with bidirectional linking | Intake not covered                                          | Requested; avoids two competing fact stores                                                                                                                                                                                                       |
| D4  | Drift detection: long-window usage trends + explicit contradictions → review flag + reduced context weight; caregiver-only fact flips                | Not covered (only §14 contradiction rules)                  | The bananas remedy; absence is weak evidence so remediation is surfaced, not automatic                                                                                                                                                            |
| D5  | Verbi gains `tellUsMore` + memory context; local ranking limited to within-POS-group ordering                                                        | Verbi context unspecified; broad "local suggestion ranking" | Closes an existing gap; Verbi's 5s budget and stable-merge UX constrain how much reordering is safe                                                                                                                                               |
| D6  | `personal_memory.db` included in profile export/import                                                                                               | "Never uploaded as continuous backup"                       | Export is the family's own local backup (consistent with `tellUsMore` today); import still triggers the keep/clear dialog                                                                                                                         |
| D7  | Server `learned_facts` table removed/unused                                                                                                          | n/a                                                         | Memory must not live server-side                                                                                                                                                                                                                  |

## 21. Open Questions

1. **Q&A answer-card ordering:** should memory ever reorder Q&A answers client-side?
   Recommended **no** for v1 (order may be pedagogically meaningful).
2. **Suggested-fact default:** should high-confidence AI facts activate immediately
   (current spec) or always land as `suggested` until caregiver confirmation? Stricter =
   safer, but the review queue grows and unreviewed facts contribute nothing.
3. **tellUsMore structuring pass (Phase 5):** run the free text through a
   magic-build-style extraction once to seed structured facts, or leave it narrative-only?
4. **Android parity:** `Home.android.tsx` mirrors iOS; assumed in scope for all phases —
   confirm.
5. **Adult mode:** `/answers/generate-adult` gets the same `memoryContext` treatment —
   confirm the drift/review copy tone is acceptable for teen/adult users.
