# Matalk Personal Memory — Product Overview (Non-Technical)

**Audience:** Product managers and non-engineering stakeholders
**Companion document:** `PERSONAL_MEMORY_PRD.md` (the technical implementation spec)
**Status:** Draft for review

---

## 1. What is Personal Memory?

Personal Memory makes Matalk get to know its user — the way a great teacher or
therapist does — simply by paying attention to how the child actually communicates.

Today, Matalk gives every child the same starting experience. The caregiver can fill in
background during intake ("Tell Us More"), and that helps, but the app itself never
learns anything from day-to-day use. If a child says "swimming" every single afternoon,
Matalk doesn't notice.

With Personal Memory, the device quietly builds two kinds of understanding:

1. **How the child communicates** — which words they use, when they use them, and what
   usually comes next. We call this **Communication Memory**.
2. **What matters to the child** — their people, places, favorite foods, likes,
   dislikes, and routines. We call this **Personal Knowledge**.

Everything is stored on the device itself. There is no cloud memory profile, no account,
and nothing the family has to set up or maintain. Learning happens automatically during
normal use.

---

## 2. The two layers, in plain terms

### Communication Memory — "the child's own dictionary of habits"

Think of it as a private notebook the app keeps:

- *"Bear said 'water' 14 times this month, mostly in the afternoon."*
- *"After 'I want', Bear usually says 'water' or 'outside'."*
- *"Bear built the sentence 'I want to go home' three times this week."*

No AI is involved in this layer. It's simple counting and timekeeping, done entirely on
the device, and it works even with no internet connection.

### Personal Knowledge — "what we know about the child"

This is a small set of clear, durable facts, each one readable in plain English:

- *Danielle is Bear's sister.*
- *Bear goes to Pinecrest School.*
- *Bear likes swimming.*
- *Bear doesn't like broccoli.*

Facts come from three places, and each fact remembers where it came from:

| Source | Example | Trust level |
|---|---|---|
| **Intake** — the caregiver told us during setup | "His sister is Danielle" typed into Tell Us More | Highest — treated as confirmed |
| **Learned** — the AI noticed it in the child's own communication | Child builds the sentence "My sister is Danielle" | Starts as a suggestion or a lower-trust fact |
| **Caregiver review** — the caregiver confirmed, edited, or corrected a fact in Settings | Tapping "Confirm" on a suggested fact | Highest — caregiver's word is final |

**The golden rule of the whole system: the caregiver always outranks the algorithm.**
The app can notice things, suggest things, and gently flag things — but only a caregiver
can change a confirmed fact.

---

## 3. Where does memory come from?

Memory is only created at moments of **real, completed communication**:

- The child **taps an answer** in the Q&A experience.
- The child **taps a word** on the Conversation Board.
- The child **plays a finished sentence** out loud.

And it is deliberately *never* created from:

- Suggestions that were shown but never tapped
- Sentences that were started and abandoned
- Words that were added and then deleted
- Anything the conversation partner (parent, teacher) said
- Loading screens, errors, or system text

Why this matters: an AAC app constantly *shows* the child options. If we learned from
what was shown rather than what was chosen, the memory would reflect our guesses, not
the child's voice. Only deliberate choices count.

---

## 4. How intake and memory work together

Intake ("Tell Us More" and "People & Stuff") is the caregiver telling us about the
child. Personal Memory is the child showing us, over time. These two must cooperate,
not compete.

**On day one**, everything the caregiver entered during intake is imported into Personal
Knowledge as confirmed facts. A family that completes intake starts with a rich,
populated memory — the "About the User" screen is never empty.

**Over time**, the two layers cross-check each other:

- If the caregiver marked bananas as a favorite food, but the child's actual
  communication shows bananas quietly disappearing, the app doesn't argue — it asks.
  (Details in §6, "The bananas problem.")
- If the child repeatedly communicates something the caregiver never entered — say,
  "My teacher is Mr. Jones" comes up again and again — the app can offer:
  *"Would you like to add Mr. Jones to People & Stuff?"* One tap, and the learned fact
  becomes part of the curated profile, complete with a tile the child can use.

So intake seeds memory, memory enriches intake, and the caregiver approves every change
that crosses between them.

---

## 5. How things are calculated

This section explains every number in the system in everyday terms. (Exact values are
tunable; the ones below are the recommended starting points.)

### 5.1 The usage score — "how alive is this word?"

Every word and sentence the child uses gets a score built from two ingredients:

- **How often** it's been used (frequency)
- **How recently** it's been used (recency)

The two are combined with a simple idea: **a word's score fades by half every 30 days
of non-use.** We call this the half-life.

Worked example — the word "swimming" has been used 20 times:

| Situation | Score |
|---|---|
| Used today | 20 |
| Last used 30 days ago | 10 (faded by half) |
| Last used 60 days ago | 5 (halved again) |
| Used again today after 60 days | back to full strength immediately |

Two important properties:

- **Nothing is ever deleted by fading.** A word that fades to a tiny score is still
  remembered; the moment the child uses it again, it springs back fully.
- **Facts don't fade.** "Danielle is Bear's sister" is not less true because Bear hasn't
  mentioned her lately. Fading applies only to Communication Memory, never to confirmed
  Personal Knowledge.

On top of the base score, small boosts are added when relevant:

- **Time-of-day boost:** each word remembers *when* it tends to be used (morning /
  afternoon / evening / night). At breakfast time, breakfast-time words score a little
  higher.
- **Next-word boost:** the app remembers common pairs — "I want" → "water", "more" →
  "please". If the child has just said "I want", the words that historically follow it
  get a strong boost.
- **Pin boost:** a caregiver can pin a word to keep it prominent regardless of usage.

### 5.2 Fact confidence — "how sure are we?"

Every fact carries a confidence between 0 and 1 (never shown to users as a number —
caregivers see friendly labels instead).

**Where confidence starts:**

- Intake facts start at **0.95** and are marked Confirmed — the caregiver said so.
- AI-learned facts start wherever the AI's assessment lands, and only matter if they
  clear the bar below.

**The bar for automatically accepting an AI-learned fact is 0.85** (configurable).
In practice:

| AI's confidence | What happens |
|---|---|
| High (0.85 and above) | Fact is saved and starts working |
| Medium (0.60–0.84) | Fact is saved as a **suggestion** — visible in the caregiver review queue, but not used until confirmed |
| Low (below 0.60) | Discarded entirely |

**What moves confidence up:**

- The child communicates the same fact again, on a different day (+0.05 each time,
  capped at 0.99)
- The caregiver confirms it (jumps to confirmed status, top priority)

**What keeps confidence low:** the fact appeared only once, the wording was ambiguous,
it might be about someone else ("*The dog* likes swimming"), or it might be temporary.

### 5.3 What qualifies as a fact at all — "durable vs. temporary"

Before confidence even matters, a statement has to pass a durability test. The AI is
instructed to propose facts only for things that will still be true next month.

| The child communicates… | Becomes a fact? | Why |
|---|---|---|
| "My sister is Danielle" | ✅ Yes | Durable, personal, explicit |
| "I don't like broccoli" | ✅ Yes | A stated preference |
| "I go to Pinecrest School" | ✅ Yes | Durable personal fact |
| "I am hungry" | ❌ No | A moment, not a fact |
| "I am at school" | ❌ No | Temporary location |
| "Dad is here" | ❌ No | An observation, not a relationship |
| "I want water" | ❌ No | A need — but it still counts toward Communication Memory |
| "The dog likes swimming" | ❌ No | Not about the child |

Everything in the "No" column still updates Communication Memory (word counts, timing,
sequences) — it just never becomes a permanent "fact about the child."

Additionally, most communication is never even sent for fact evaluation. A quick
on-device check only forwards statements that *look* fact-shaped (a few words long,
first-person, containing words like "my", "like", "favorite", "go to"). Single-word
answers and simple requests are handled entirely on the device.

### 5.4 The bananas problem — how drift is detected

**Scenario:** During intake, the caregiver marked bananas as a favorite food. Six months
later, bananas have vanished from the child's communication. What should the app do?

**What it must NOT do:** silently delete or overwrite what the caregiver said. Maybe
bananas just haven't been offered lately. Absence is weak evidence.

**What it does instead — the drift check.** Once a day, the app quietly compares each
preference-type fact against actual usage. A fact gets flagged only when **all** of the
following hold:

1. The word used to be genuinely present — at least 3 real uses in the past (so we never
   flag something that was never used; the caregiver may know things the app hasn't
   observed yet).
2. It has then dropped to zero (or nearly zero) for **45 days or more** — deliberately
   long, so a vacation or a phase doesn't trigger it.
3. The caregiver hasn't re-confirmed it since the drop began.

A fact is also flagged **immediately** — no waiting period — if the child explicitly
contradicts it in completed communication: building and speaking the sentence
*"I don't like bananas."*

**What "flagged" means:**

- The fact stays exactly where it is — nothing is deleted, nothing is overwritten.
- It steps back from everyday AI personalization: it's no longer volunteered as
  background context, though it still applies when directly relevant (if bananas
  actually come up in conversation).
- A gentle review card appears for the caregiver:

  > 🍌 **Bananas haven't come up in over 6 weeks. Still a favorite?**
  > [ Still true ]  [ Not anymore ]

  - **Still true** → the flag clears, the fact is re-confirmed, and the clock resets.
  - **Not anymore** → the fact is marked as no longer current (kept in history, labeled
    "Replaced"), and if it's linked to a People & Stuff tile, the app offers to unmark
    that tile's favorite heart too.
  - **Dismissed without answering** → the app won't nag; it waits at least 30 days
    before asking again.

**The hierarchy, in one line:** caregiver's latest word > caregiver's intake answers >
what the child repeatedly shows us > any single observation.

### 5.5 Handling changes and contradictions

When new communication conflicts with an existing fact, the action depends on how strong
each side is:

- *"My favorite food is pasta now"* against a learned "favorite food: pizza" →
  pasta becomes current, pizza is kept in history as "Replaced." No duplicate,
  no lost history.
- A contradiction against a **confirmed** fact (or anything from intake) → the fact does
  not flip. The contradiction is recorded as evidence and the caregiver gets a review
  card. Names and relationships especially must never change on the algorithm's say-so.
- The same fact restated → not a duplicate; it's counted as reinforcement and confidence
  goes up.

---

## 6. What the child and family actually experience

### For the child: Matalk gradually feels like *their* app

- **Verbi suggestions** favor the words this child actually uses. If "swimming" is a big
  word in their life, it shows up sooner — while still keeping suggestions grammatical
  and never rearranging cards under the child's finger mid-use.
- **Q&A answers** become more personally relevant. Asked "What do you want for lunch?",
  the answers can reflect *this* child's actual foods, not generic ones.
- **Nothing visible changes shape.** Same number of answer cards, same length, same
  tone, same layout. Personalization changes *which* words appear, never *how* the app
  behaves. A child who relies on motor-memory and predictability is not disrupted.

### Day one (before any learning)

The app works exactly as it does today. Memory adds on top; it never replaces the
defaults. If intake was completed, personalization starts immediately from those
answers; otherwise it builds gradually. The experience is never empty or broken because
"the app hasn't learned enough yet."

### Offline

The counting-and-timing layer (Communication Memory) works fully offline — it's all on
the device. Known facts remain available offline. Only new fact *extraction* needs a
connection, and communication that happens offline is simply evaluated later, when the
device is back online. Nothing is lost.

---

## 7. Caregiver visibility and control

A new **Personal Memory** area in Settings, with plain-language explanation up front:

> Matalk learns from the words, answers, phrases, and sentences selected on this device.
> Personal Memory is stored locally on this device. Relevant parts of Personal Memory
> may be sent as text context during Verbi Board predictions and Q&A requests to improve
> the quality and personalization of AI responses.

### Three switches

1. **Personal Memory** (on/off) — off means no learning, no influence, nothing sent.
   Existing memory is kept but dormant.
2. **Pause learning** — freeze what's known; keep using it, but learn nothing new.
   Useful when someone else borrows the device.
3. **Use Personal Memory to improve AI answers** — controls whether any memory context
   leaves the device with AI requests. Off = fully local personalization only.

### Two review screens

**Learned Communication** — the child's words and sentences with friendly labels only
(*Used often, Used sometimes, Recently learned, Not used recently*). Caregivers can pin
words or delete individual entries. No scores, percentages, or graphs of the child's
behavior — this is a communication tool, not a surveillance report.

**About the User** — every fact, grouped by People, Relationships, Places, Preferences,
Activities, Routines, and Important facts. Each shows a plain sentence, where it came
from ("From intake" / "Learned"), and a status badge: *Confirmed, Suggested, Learned
from repeated communication, May be outdated, Replaced.* At the top sits the **review
queue**: suggested facts awaiting a yes/no, drift questions (the bananas card), and
"add to People & Stuff?" offers.

So the caregiver doesn't have to remember to check, the **About the User** row in
Settings shows a small count badge — "2 to review" — whenever the queue has items
waiting. The badge is just a number: it never reveals what the items are, and there are
no push notifications. The nudge exists only inside Settings, and it disappears as items
are answered or dismissed.

For any fact, the caregiver can: **Confirm · Edit · Delete · Mark incorrect · Mark
outdated · Exclude from AI use · Restore.** Marking a fact incorrect also stops the app
from re-learning that same fact later.

### Clearing and resetting

- **Clear Recent Memory** — wipes the short-term layer (recent words, current session)
  but keeps long-term patterns and all facts.
- **Reset Personal Memory** — deletes everything learned, back to a blank slate, with an
  explicit confirmation. Default vocabulary, intake data, and app settings are untouched.

### "Is this still the same Matalk hero?"

If the caregiver changes the hero's name or imports a profile while memory exists, the
app pauses and asks whether this is still the same child:

- **Keep Personal Memory** — same child, updated details. Everything stays.
- **Clear Personal Memory** — the device is moving to a different child. Everything
  learned about the previous child is deleted so no memories carry over.
- **Cancel** — nothing changes.

Personal Memory is included in the family's own profile backup (export/import), so a
device migration doesn't lose years of learning — and importing still triggers the
same-hero question above.

---

## 8. Privacy, in plain words

- **The memory lives on the device.** There is no cloud copy, no server-side profile,
  and no continuous syncing. The company cannot look up what a child said.
- **What leaves the device is small and purposeful:** a short, relevant summary (a few
  hundred characters — e.g. "Recent words: school, teacher, lunch. Sister: Danielle")
  attached to an AI request, plus fact-shaped sentences sent for evaluation. Both stop
  entirely when the caregiver turns the AI switch off.
- **The full memory is never transmitted.** Not the word history, not the fact store.
- **Analytics never contain communication content.** Usage analytics may record that
  "a memory context was included" — never what was in it. Same for crash reports and logs.
- **Hard limits on sensitive territory.** The system is forbidden — at two independent
  layers — from inferring or storing medical conditions, mental-health conclusions,
  religion, sexuality, politics, or family-conflict interpretations. It never draws
  psychological conclusions from patterns. If a child explicitly communicates something
  sensitive that genuinely helps communication, it is held for caregiver approval before
  it is ever used.
- **Failure is invisible.** If any part of memory breaks, the child's communication
  experience continues untouched. Memory is an enhancement layer, never a dependency.

---

## 9. How we'll roll it out

Five stages, each independently shippable and each protected behind the master switch:

1. **Foundations & fixes** — small corrections so every real word selection is counted
   consistently (today a few paths slip through), and cleanup of unused legacy pieces.
2. **The listening layer** — Communication Memory starts counting: frequency, recency,
   timing, word pairs. Invisible to users; measurable in data quality.
3. **Smarter AI answers** — Verbi and Q&A requests start carrying the short memory
   summary (and Verbi finally receives the intake "Tell Us More" text, which it never
   has before). First user-visible improvement.
4. **Facts & caregiver review** — AI fact extraction turns on; the Settings area and
   both review screens ship; the same-hero dialog ships.
5. **Reconciliation & polish** — the bananas drift check, "add to People & Stuff"
   offers, and memory-aware suggestion ordering.

Stages 2–3 alone already deliver visible personalization, before any fact extraction
exists.

## 10. How we'll know it's working

- Verbi suggestions increasingly match each child's actual vocabulary (higher
  suggestion-tap rates, fewer "get more answers" presses in Q&A).
- The About the User screen fills with facts caregivers agree with — measured by
  confirm-vs-delete ratios in the review queue.
- Drift questions get answered (either answer is a success; the point is the caregiver
  stayed in charge).
- Zero regressions in the core experience: response speed, answer counts, and layout are
  identical with memory on or off.
- No support tickets about "the app said something it shouldn't know" — the privacy
  posture holds.
