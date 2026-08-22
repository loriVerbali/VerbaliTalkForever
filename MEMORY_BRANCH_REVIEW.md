# `memory` branch — code review vs `develop`

Reviewed 2026-08-10.

| Repo | Branch | Base | Commits ahead | Diff |
|---|---|---|---|---|
| `Matalk` (app) | `origin/memory` | `origin/develop` | 3 (`933ec5e`, `9094764`, `407d7e8`) | 46 files, +6090 / −305 |
| `MatalkBE/matalkapi` (backend) | `origin/memory` | `origin/develop` | 3 (`7dce26a`, `ca222e1`, `f65363b`) | 7 files, +515 / −30 |

Neither `develop` is ahead of its `memory` branch, so both merge as fast-forwards — no conflict risk.

## Verification performed

- **`npx tsc --noEmit`** — no new type errors in any file touched by this branch. The ~30 errors reported are all pre-existing (`recieptValidation.ts`, `sentenceBuilderDb.ts`, `WhisperModelManager.ts`, `sessionManager.ts`, `Login.tsx`, `NavigationButtons.tsx`, `Home.android.tsx:1567`).
- **`npx jest`** — 58 tests passed across 9 suites, including the 8 new Personal Memory suites. `__tests__/App.test.tsx` fails to *run* on a missing `RNPermissions` TurboModule; this is pre-existing (the `LoggedNavigation → Home → Home.ios → react-native-permissions` import chain is identical on `develop`) and unrelated to this work.
- Manual read of the full diff in both repos.

---

# Part 1 — Findings

## A. Real bugs

### A1. Caregiver-deleted intake facts resurrect on the next app launch
**Files:** [PersonalMemoryService.ts](src/services/PersonalMemoryService.ts) (`seedFromIntake`), [AboutTheUser.tsx](src/Views/AboutTheUser.tsx) (`handleDelete`, `handleNotAnymore`)

`handleDelete` and `handleNotAnymore` both set `status: 'inactive'`. `seedFromIntake()` treats `inactive` as "the tile was removed and has now come back":

```ts
if (existing.status === 'inactive') {
  patch.status = 'active'; // tile restored
}
```

`seedFromIntake()` runs on every app init, on every People & Stuff save, and on every Tell Us More save. So a caregiver who deletes an intake-mirrored fact ("Rex is a pet in the user's life") gets it back on the next launch, silently, forever.

**Fix direction:** separate the two meanings. Either route caregiver deletes on intake-sourced facts to `rejected` (which `seedFromIntake` should then never revive), or add a `deactivated_by` column so only auto-deactivations are eligible for revival.

### A2. Utterances captured while AI context is OFF get uploaded when it's turned ON
**File:** [PersonalMemoryService.ts](src/services/PersonalMemoryService.ts)

`recordCompletedCommunication` enqueues into `extraction_queue` behind `isLearningEnabled()` — which checks `memoryEnabled` and `memoryLearningPaused` but **not** `memoryAiContextEnabled`. The network gate lives only in `drainExtractionQueue`:

```ts
if (enabled !== '1' || aiEnabled !== '1') { return; }
```

Net effect: with "Use Personal Memory to improve AI answers" off, up to 50 raw utterance texts accumulate on disk, and every one of them is POSTed to `/api/memory/extract` the moment a caregiver flips that switch on. For a children's AAC app that's the wrong default. Gate the *enqueue* on `memoryAiContextEnabled`, or purge the queue when the toggle goes off.

### A3. Word `use_count` is double-counted for spoken sentences
**Files:** [Convo.tsx](src/Views/Convo.tsx), [SentenceBuilderGrid.tsx](src/Components/SentenceBuilder/SentenceBuilderGrid.tsx), [PersonalMemoryService.ts](src/services/PersonalMemoryService.ts)

Each tile tap records a `kind: 'word'` event. Playing the sentence then records a `kind: 'sentence'` event, and `recordCompletedCommunication` re-upserts every constituent word:

```ts
if (kind !== 'word' && words.length > 1) {
  for (const word of words) { await personalMemoryDb.upsertMemoryItem('word', word, occurredAt); }
}
```

So a word inside a played sentence scores +2; a word tapped but never played scores +1. This skews `decayedScore`, the "Often / Sometimes / New" labels on the Communication tab, Verbi's `memoryScore` ordering, and the drift baseline (`DRIFT_BASELINE_MIN_USES = 3`). Pick one source of truth — either don't record per-tap words in Convo, or don't expand sentences into constituent words there.

## B. Behaviour changes worth confirming

### B1. Verbi suggestion taps now count in word-selection analytics
**File:** [SentenceBuilderGrid.tsx:1030](src/Components/SentenceBuilder/SentenceBuilderGrid.tsx#L1030), [:1066](src/Components/SentenceBuilder/SentenceBuilderGrid.tsx#L1066)

Two new `logWordSelection(textToSpeak)` calls were added inside the imperative handle used for Verbi-inserted words. Before this branch, `logWordSelection` fired only on board tile taps. Reports totals (utterance counts, word-selection history) will step up discontinuously at release. If the intent was only to feed Personal Memory, call `personalMemoryService.recordCompletedCommunication` directly instead of the analytics wrapper.

### B2. `learning_feedback` round-trip removed — safe
**Files:** [Home.ios.tsx](src/Views/Home.ios.tsx), [Home.android.tsx](src/Views/Home.android.tsx)

The post-selection `generateAnswers(…, {mode: 'learning_feedback'})` call was deleted from both platforms. Verified against the backend: `server.js:2159` and `server.js:2486` both short-circuit `learning_feedback` with `return res.json({ results: [] })` — nothing is stored. This is a pure latency win, no data loss.

### B3. `learned_facts` schema file deleted — safe but undocumented
`create_learned_facts_table.sql` was removed. `grep -r learned_facts` over the backend returns nothing, so no code path is affected. If the table still exists in the production database, its schema is now recorded nowhere.

### B4. Import "Keep Personal Memory" can merge two children
**File:** [ProfileImportService.ts](src/services/ProfileImportService.ts)

`_clearCurrentData(preserveMemory=true)` retains `personal_memory.db` but still restores the *backup's* preferences and People & Stuff. `seedFromIntake` then mirrors the imported child's tiles into the retained child's knowledge store. The prompt copy ("Is this still the same Matalk hero?") makes this a deliberate choice, but a mis-tap merges two children's data with no undo.

### B5. `IntakeChatModal` escaping fix changes transcript shape
**File:** [IntakeChatModal.tsx](src/Components/TellUsMore/IntakeChatModal.tsx)

`.join('\\n\\n')` → `.join('\n\n')` in four places. This is a genuine fix (transcripts were joined with literal backslash-n), but it changes the `tellUsMore` text that gets stored and later fed to the intake LLM and to Verbi. Existing stored transcripts keep the old escaping. Also `${activeStepIndex + 1}/6` → `/${INTAKE_STEPS.length}`.

## C. Backend hardening gaps

### C1. `existingFacts` is not size-capped per item
**File:** [routes/memory.routes.js](../MatalkBE/matalkapi/routes/memory.routes.js)

The array is capped at 40 entries, but each entry is passed straight into `JSON.stringify(existingFacts)` in the prompt with no per-field length limit — unlike `communications[].text`, which is correctly `.slice(0, 500)`. A client can push arbitrarily large strings into a Gemini prompt. Cap `subject`/`value`/`statement` the same way.

### C2. `contextCues.memoryContext` is trusted verbatim on the server
**File:** [services/verbi/verbi.prompts.js](../MatalkBE/matalkapi/services/verbi/verbi.prompts.js)

`formatCuesBlock` joins `frequentWords`, `recentWords`, `commonSequences` and `personal.facts` into the prompt with no length or count cap. The app caps the serialized block at 1000 chars, but the server shouldn't depend on the client for that. Same for the new `tellUsMore` cue — that one at least has `.slice(0, 500)`.

This is also free-text user content going directly into the system prompt. It's the same prompt-injection surface as the pre-existing `pepes` cue, so not a new class of risk — but the surface just got wider, and it's now reachable by anything the child says (extracted facts round-trip back into prompts).

### C3. No rate limit on `POST /api/memory/extract`
Each request is one Gemini call, gated only by `requireAppSession`. That matches `/api/context`, but this endpoint is invoked automatically by the client's queue drainer, so a client-side loop turns into an uncapped LLM bill. Body limit is the global `express.json({limit: "10mb"})`.

## D. Smaller issues

| # | Where | Issue |
|---|---|---|
| D1 | `PersonalMemoryService.reopen()` | Returns early when `this.failed` is true, and `failed` is only cleared by `init()`. After a boot-time DB failure, import/export never retries — acceptable — but `resetAll()` from Settings then becomes a silent no-op behind a success-looking UI. |
| D2 | `PersonalMemoryService.resetAll()` | Writes prefs with `DefaultPreference.set` directly, bypassing the `useAppSettings` context. The Settings reset path re-calls `setItem` afterwards; the hero-name "Clear Personal Memory" path does not, so toggles can show stale values. |
| D3 | `evaluateKnowledgeDrift()` | `setMeta('lastDriftRun')` is written *before* the work runs. If drift evaluation throws midway, it won't retry for 24h. |
| D4 | `drainExtractionQueue()` | `applyMemoryUpdates` then `deleteExtractionRows` are not atomic. A crash between them re-sends the same batch, and `create` actions are only de-duplicated against `activeDuplicates`, not against `suggested` rows — so a duplicate suggestion card can appear. |
| D5 | `getMemoryScores()` | Queries `getMemoryItemsByNormalized` across all kinds, so a one-word *sentence* row can supply the score for a word suggestion. Harmless today, surprising later. |
| D6 | `repairBoardsForCapacity()` | N deletes + N updates with no transaction; a mid-run failure leaves a half-repaired board. Also runs a full `SELECT` over the whole `nodes` table (~8k seed rows) on every cold start. |
| D7 | `memoryApiCli.mjs` | Hardcodes `https://matalkapi-copy-nologin.up.railway.app` as the default base URL. Dev-only tool, but worth pointing at an env var with no default. |

## E. The non-Memory work riding on this branch

This is the part most likely to break something, and it has nothing to do with Personal Memory. Consider splitting it into its own PR so it can be QA'd and reverted independently.

### E1. SentenceBuilder drag-and-drop was rewritten from scratch
**File:** [SentenceBuilderGrid.tsx](src/Components/SentenceBuilder/SentenceBuilderGrid.tsx) (433 lines changed)

The board moved to a **slot-stable** model: `orderIndex` is now a literal cell number in `[0, rows*cols)`, every cell renders exactly once, and `DraggableGrid`'s own re-sorting is disabled on every cell (`disabledReSorted: true`). The drop outcome is computed manually in `handleDragRelease` from raw finger coordinates. Verified the library prop signatures match (`onDragStart(item)`, `onDragging(gestureState)`, `onDragRelease(data)` — `react-native-draggable-grid/src/draggable-grid.tsx:36-38`), and `getFullGridData()[targetSlot]` can't be out of range. Remaining risks are all runtime/geometry:

- **Drop target is the finger, not the tile.** Dropping near a cell boundary lands one cell off from what the user sees.
- **Row math can diverge from layout.** `cellHeight = getCardDimensions().height + 4`, but `getCardDimensions` applies `Math.max(measured, 40)` and, on tablets in the pre-measure path, `Math.min(cardHeight, 200)`. If either clamp engages, every drop below row 0 targets the wrong row.
- **`boardRectRef` is captured once, asynchronously**, by a `measureInWindow` fired at drag start. If it hasn't resolved, or the ScrollView scrolls mid-drag, the drop is silently discarded.
- **The board no longer scrolls in edit mode** unless overflow rows exist (`scrollEnabled={isEditing && hasOverflowRows}`), and `gridScrollContent.paddingBottom: 40` / `gridChunk.marginBottom: 40` were removed. If the measured grid area is even slightly short, the bottom row becomes unreachable.

**Needs device QA:** phone + tablet, portrait + landscape, every grid size, with and without the Verbi column, in and out of edit mode.

### E2. Destructive one-time seed migration
**File:** [sentenceBuilderSqlite.ts](src/utils/sentenceBuilderSqlite.ts) (`trimOversizedSeedFolders`)

Existing installs lose the **Seasons** folder plus its four season words, and the **Sleep** shortcut — with no notice. Rationale (making Shortcuts/Time fit a 5×6 grid) is sound; the execution has gaps:

- Deletes key off hardcoded ids `'shortcuts_sleep'` and `'folder_seasons'`. Those come from `sanitizeTitle`, and `seedData()` appends `_1`, `_2`… on id collision. Any install that generated a suffixed id is missed — and the `seedTrim5x6V1` flag is still written, so it never retries.
- The Seasons guard (`COUNT(*) … isSeed = 0`) only checks direct children, and ignores the `deleted` column.
- No user-facing notice that cards were removed.

### E3. Grid-size change can now be refused
`handleGridSizeChange` calls `repairBoardsForCapacity(…, 'strict')` and, on failure, shows a "Cannot Change Grid Size" alert naming the offending board. New user-visible failure mode; worth a line in release notes.

### E4. Settings screen restructure
Quick-nav tile grid, per-section "Back to top" buttons, and scroll-position restore via a **module-level** `lastSettingsScrollY`. That variable survives unmount and is reset only by the back button — not by Android hardware back, deep links, or `restartApp()` — so Settings can open pre-scrolled. Also `renderBackToTop('about')` references a section key not present in `SETTINGS_SECTIONS` (harmless: it only scrolls to 0).

---

# Part 2 — How Personal Memory works

## 2.1 Storage

A dedicated SQLite database, `personal_memory.db`, separate from `matalk_metrics.db` and `sentence_builder.db`. Opened by `personalMemoryDb.init()`, schema in [personalMemoryDb.ts](src/utils/personalMemoryDb.ts).

| Table | Holds | Notes |
|---|---|---|
| `memory_items` | Every distinct word / sentence / answer | `UNIQUE(kind, normalized)`, `use_count`, `first_used`, `last_used`, `pinned` |
| `time_patterns` | Per-item use counts per morning/afternoon/evening/night bucket | PK `(item_id, bucket)` |
| `sequences` | Bigrams `prev → next` from completed sentences | PK `(prev_normalized, next_normalized)` |
| `recent_items` | Rolling log of the last 200 utterances | Capped on insert |
| `knowledge_items` | Durable personal facts | category / subject / value / statement / confidence / source / status / `ai_context_enabled` / `pepes_item_id` / `review_flag` |
| `knowledge_evidence` | Audit trail per fact | kinds: `create`, `reinforce`, `contradict`, `caregiver` |
| `extraction_queue` | Utterances awaiting server extraction | `UNIQUE(event_id)`, capped at 50, `attempts` |
| `pending_updates`, `meta` | Reserved / `lastDriftRun` timestamp | |

Every service method is a no-op when the DB failed to open (`isReady()` guard), so a storage failure degrades the app to exactly its pre-Memory behaviour.

## 2.2 The four preference switches

Stored via `DefaultPreference`, declared in [persistance.tsx](src/utils/persistance.tsx), surfaced in the Settings → Personal Memory section.

| Key | Default | Effect |
|---|---|---|
| `memoryEnabled` | `'1'` | Master switch. Off ⇒ no recording, no ranking influence, no AI context. Stored data is kept. |
| `memoryLearningPaused` | `'0'` | On ⇒ no new recording and no AI updates applied; existing memory still influences. |
| `memoryAiContextEnabled` | `'1'` | On ⇒ memory context is attached to Q&A / Verbi requests **and** the extraction queue is drained. |
| `memoryExtractionThreshold` | `'0.85'` | Confidence at or above which an AI-proposed `create` lands as `active` instead of `suggested`. |

Two derived gates in the service: `isLearningEnabled()` = ready ∧ enabled ∧ ¬paused; `isAiContextEnabled()` = ready ∧ enabled ∧ aiContext.

## 2.3 Recording — what the app captures

`personalMemoryService.recordCompletedCommunication(event)` is fire-and-forget. It appends onto a serialized `writeChain` promise so writes never interleave and never block the tap path.

Three call sites, all on *completed, intentional* communication:

| Site | Kind | Source |
|---|---|---|
| `SentenceBuilderGrid.logWordSelection` — tile tap or Verbi insert | `word` | `Convo` |
| `Convo.tsx` — sentence played | `sentence` | `Convo` |
| `Home.ios.tsx` / `Home.android.tsx` — Q&A answer chosen | `answer` | `Home` |

Per event the service:

1. Upserts the full text into `memory_items` (`use_count += 1`, `last_used = now`).
2. Bumps its `time_patterns` row for the current bucket (`getTimeOfDay`: <12 morning, <17 afternoon, <21 evening, else night).
3. For multi-word sentences/answers, upserts each constituent word too (see finding **A3**).
4. For sentences, upserts each adjacent bigram into `sequences`.
5. Inserts into `recent_items` and trims to 200.
6. Runs the **prefilter** and, if the text passes, enqueues it for extraction and kicks the drainer when online.

### The extraction prefilter
[extractionPrefilter.ts](src/services/personalMemory/extractionPrefilter.ts) — a deterministic on-device gate so most utterances never leave the device:

- ≥ 3 words, and
- not on the stoplist (`^i want`, `^i need`, bare `yes/no/ok`, `help`, `more`, `stop`, `please`, `thank you`, `all done`, `i'm hungry/thirsty/tired/…`), and
- matches a fact-marker pattern (`my`, `i`, `is`, `are`, `like(s)`, `love(s)`, `hate(s)`, `favorite`, `don't like`, `go to`, `lives in/at/with`, …).

## 2.4 Extraction — the one server round-trip

```
device                                   backend
──────                                   ───────
drainExtractionQueue()
  ├ gate: memoryEnabled && memoryAiContextEnabled
  ├ batch = up to 10 queued rows
  ├ existingFacts = up to 40 active facts
  └ POST /api/memory/extract ──────────► routes/memory.routes.js
       {communications[], childName,       ├ validate: 1..10 items, eventId+text required
        existingFacts[], locale}           ├ clamp text to 500 chars
                                           └ memoryExtract.service.extract()
                                                ├ callLLM (Gemini, temp 0.1, 1024 tok,
                                                │          fully-specified responseSchema)
                                                ├ tryRepairJson fallback
                                                └ sanitizeUpdates(): known eventIds only,
                                                  valid action+category, confidence 0..1,
                                                  max 3 updates per communication
     ◄──────────────────────────────────  { memoryUpdates: [...] }
  ├ applyMemoryUpdates(...)
  └ deleteExtractionRows(batch eventIds)
```

On any failure: `bumpExtractionAttempts` increments each row, and rows reaching `attempts >= 3` are dropped. The backend stores **nothing** — the endpoint is stateless by design; the device owns the data.

The prompt ([memoryExtract.prompt.js](../MatalkBE/matalkapi/services/memory/memoryExtract.prompt.js)) enforces: user-referent facts only, explicitly stated (never inferred), durable (not "I am hungry"), no hypotheticals, sensitive categories only with `needsCaregiverReview=true`, confidence floor 0.6, max 3 per communication, and use of `existingFacts` for `reinforce` / `update` / `contradict` instead of duplicating.

## 2.5 Validation and landing — the device is the authority

[memoryUpdateValidator.ts](src/services/personalMemory/memoryUpdateValidator.ts), a pure module, re-checks everything the server said. Defence in depth: an LLM proposal never writes directly.

- Structural validation (action, category, subject, statement, confidence range).
- `rejectedBlocklist` — anything the caregiver marked incorrect (`category:subject`) can never be re-learned.
- Non-`create` actions must name an `existingFactId` that actually exists locally.
- `create` below 0.6 confidence → dropped; duplicate of an active fact → dropped.
- A **local sensitive-content regex** (diagnoses, medication, therapy, religion, politics, sexuality, abuse, custody…) forces `status: 'suggested'` **and** `ai_context_enabled: 0`, so such a fact is never sent to any LLM until a caregiver confirms it.
- Confidence below `memoryExtractionThreshold`, or `needsCaregiverReview` → lands as `suggested` (review queue) rather than `active`.

Apply order puts `contradict` last (`orderForApply`), because Gemini often emits a `contradict` + `create` pair where a single `update` was intended; running creates first lets the contradiction link to its replacement. `resolveContradiction` then decides:

| Target fact | Outcome |
|---|---|
| confirmed, or `source` = intake/caregiver | never overridden — a review card is queued |
| unconfirmed AI fact with a same-event replacement | `replaced`, `replaced_by` set |
| unconfirmed AI fact, no replacement | `possibly_outdated` |

Every applied action writes a `knowledge_evidence` row.

## 2.6 Intake seeding — People & Stuff mirrors into knowledge

[intakeSeeding.ts](src/services/personalMemory/intakeSeeding.ts) maps caregiver-curated tiles to seed facts:

`People → person` (or `relationship` when the tile has one) · `Pets/Toys/TVShows → object` · `Food/Drinks → food` · `Places → place`, plus a `like` fact for any tile marked favourite.

Seeds land as `source: 'intake'`, `confirmed: true`, `confidence: 0.95`, keyed by `pepes_item_id` so re-runs are idempotent. `seedFromIntake()` runs on service init, on `MyPepesAndStuff` save, and on `TellUsMoreSection` save. Tiles the caregiver removes deactivate their mirrored facts — which is the mechanism behind finding **A1**.

## 2.7 Drift detection — the "bananas problem"

[driftDetection.ts](src/services/personalMemory/driftDetection.ts). Runs at most once per 24h (`meta.lastDriftRun`), on service init and on app foreground.

Only **preference-type** facts are eligible: `like`, `dislike`, and `food`/`activity` facts whose `value` is `'favorite'`. A fact is flagged when:

- its subject (plus any People & Stuff aliases) had a baseline of ≥ 3 uses in days 30–90, **and**
- zero uses in the last 30 days, **and** ≥ 45 days of silence, **and**
- the caregiver hasn't re-confirmed it since the drop began, **and** no recent dismissal.

Explicit contradiction evidence also flags immediately. Absence is treated as weak evidence throughout: the remediation is always a **review card**, never an automatic change. Unconfirmed AI facts go to `status: 'possibly_outdated'`; confirmed/intake/caregiver facts only get a `review_flag`.

`computePromotionOffers()` then flags high-confidence AI facts reinforced on ≥ 3 distinct days with `review_flag: 'promotion_offer'` — offering to add them to People & Stuff.

## 2.8 Influence — where memory actually changes output

### (a) Q&A answers — [AssistantContext.tsx](src/contexts/AssistantContext.tsx)

```ts
const memoryContext = mode.startsWith('generate_')
  ? await personalMemoryService.buildMemoryContext({currentText: sentence})
  : undefined;
// … metadata: { …, ...(memoryContext ? { memoryContext } : {}) }
```

The backend (`server.js`, both `makeModePrompt` and `makeModePromptAdult`) only adds the rule when the key is present:

> *"Use 'memoryContext' for the child's recent and frequent communication and known personal facts. Prefer personally relevant answers when appropriate. Never output these facts unprompted; never change answer count, length, tone, or format."*

The "never change answer count/length/tone/format" clause is what keeps this additive — the answer contract is unchanged.

### (b) Verbi predictions — [useVerbiPrediction.ts](src/features/verbi/hooks/useVerbiPrediction.ts)

`memoryContext` (and the new `tellUsMore`) ride along in `contextCues`. Server-side `formatCuesBlock` renders them as `Child's frequent words: …`, `Child's recent words: …`, `Common next-word patterns: …`, `Known facts about the child: …`, closing with *"Prefer suggesting words the child actually uses when equally grammatical."*

### (c) Verbi card ordering — [verbiReducer.ts](src/features/verbi/state/verbiReducer.ts)

After the response maps to suggestions, `getMemoryScores(labels)` batch-looks-up decayed usage scores and stamps `memoryScore` on each. `stableMergeSuggestions` sorts newcomers by `memoryScore` descending (stable, so server rank breaks ties), then re-applies the previous on-screen order for surviving cards. **Cards already under the child's finger never move** — freshness loses to stability, deliberately.

### The context block itself — [memoryContextBuilder.ts](src/services/personalMemory/memoryContextBuilder.ts)

```jsonc
{
  "communication": {
    "recentWords":     ["…"],  // ≤10, deduped, from recent_items
    "frequentWords":   ["…"],  // ≤10, ranked
    "commonSequences": ["a → b"], // ≤5, use_count ≥ 2
    "timeOfDay": "afternoon"
  },
  "personal": { "facts": ["…"] } // ≤8 statements
}
```

Fact selection scores `confirmed` (+4), confidence (≤+2), lexical overlap with the current text (+3), and recency of reinforcement (≤+1). Facts with `ai_context_enabled = 0` are **never** included. Flagged/`possibly_outdated` facts join only on a direct lexical match with what's being said right now. `capContextSize` then trims to a 1000-char hard cap, shedding facts first, then sequences, then frequent words, then recent words — and returns `undefined` if nothing survives, so the key is omitted from the request entirely.

### Ranking math — [memoryRanking.ts](src/utils/memoryRanking.ts)

```
decayed   = use_count × 0.5 ^ (days_since_last_used / 30)
composite = decayed × (1 + 0.5 × timeOfDayAffinity + 1.0 × sequenceBoost) + (pinned ? 5 : 0)
```

Caregiver-facing labels are qualitative only — `Often` (decayed ≥ 8), `New` (first used ≤ 14 days ago), `Sometimes` (decayed ≥ 2), `Not recent` (≥ 45 days silent). No numeric scores are ever shown.

## 2.9 The caregiver surface

Settings → Personal Memory → **"{Hero}'s Profile"** ([HeroProfile.tsx](src/Views/HeroProfile.tsx), route `views.HERO_PROFILE`) — one screen, two tabs over the two stores. A badge on the Settings row shows `suggested + flagged` counts, refreshed on focus.

**Tab 1 — About {Hero}** ([AboutTheUser.tsx](src/Views/AboutTheUser.tsx)): a "To review" queue at the top (new suggestions, "Still true?" drift cards, "Add to People & Stuff?" promotion offers), then facts grouped by category with provenance badges. Per-fact actions: confirm, edit, exclude from AI context, delete, mark incorrect (adds to the permanent blocklist), promote to a People & Stuff tile.

**Tab 2 — Communication** ([LearnedCommunication.tsx](src/Views/LearnedCommunication.tsx)): words and phrases with qualitative usage labels, time-of-day highlights ("mostly in the morning", ≥3 uses and ≥60% share), and top bigram patterns. Per-item: pin (+5 score) or remove.

**Elsewhere in Settings:** the three toggles, *Clear Recent Memory* (wipes `recent_items` only), *Reset Personal Memory* (drops and recreates every table).

## 2.10 Lifecycle

| Trigger | Action |
|---|---|
| App bootstrap ([App.tsx](src/App.tsx)) | `personalMemoryService.init()` — open DB, then queue `seedFromIntake()` and `evaluateKnowledgeDrift()` |
| App foreground | `onAppForeground()` — drift check + drain the extraction queue if online |
| People & Stuff / Tell Us More save | `seedFromIntake()` |
| Hero name change with existing memory | Prompt: *Keep Personal Memory* / *Clear Personal Memory* / Cancel |
| Profile **export** | Close `personal_memory.db`, include it in the zip, reopen after |
| Profile **import** | Prompt: *Keep Personal Memory* (skip restoring the file) / *Replace* / Cancel |
| Reset Installation | `resetAll()` + prefs back to defaults |

---

# Recommended order of work

1. Fix **A1** (resurrecting deleted intake facts) and **A2** (retroactive upload of queued text) — both are user-visible correctness/privacy issues.
2. Decide on **A3** (double-counted words) before real usage data accumulates; the skew is baked into stored `use_count` values and won't self-correct.
3. Confirm **B1** (analytics discontinuity) is intended, or route it around `logWordSelection`.
4. Add the server-side caps in **C1**/**C2**.
5. **Split section E into its own PR.** The drag-and-drop rewrite and the destructive seed migration need device QA and an independent revert path; bundling them with Personal Memory means one rollback loses both.
