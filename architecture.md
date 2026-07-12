# SYNAPSE — System Architecture

### A misconception-driven learning system for data engineering, cloud, and certification mastery

_Working name: **Synapse** (rename freely). Single-user, personal product — built to professional standards from day 1._

---

## 1. Goals & Target State

### Product goals

- **G1 — Diagnose, don't just grade.** Every wrong answer maps to a _named misconception_ and immediately teaches the missing concept with a cited source.
- **G2 — Trustworthy content without an expert reviewer.** Questions are generated from real documentation and pass three automated verification gates. The learner never has to approve correctness they can't judge.
- **G3 — Adaptive by design.** The system schedules _misconceptions_ (not questions) with FSRS spaced repetition, and oversamples the learner's weaknesses.
- **G4 — Multi-track & customizable.** AWS DEA-C01, SAA-C03, Spark, SQL, Airflow, DevOps/CI-CD run in parallel as "tracks" with per-track intensity and custom generation instructions. Adding a subject = adding a track + source URLs.
- **G5 — Habit-forming UX.** A 5–10 minute daily ritual the user _wants_ to open every morning: streaks, momentum, misconception bounties, a growing Neural Map, cert-readiness gauges.
- **G6 — Near-zero cost.** Free tiers only: Gemini free tier, MongoDB Atlas M0, Render free web service, GitHub Actions, Expo EAS.

### Target state (definition of "done" for v1)

- Native iOS app installed on the user's iPhone via local Xcode build with free-account provisioning (7-day re-sign ritual documented; all state persists across re-signs). Android APK available as a secondary EAS build profile.
- ≥ 300 verified questions in the pool across 3+ tracks before first use (bootstrap run).
- Nightly pipeline autonomously ingests → generates → verifies → publishes questions; disputes recycle bad ones.
- Daily 10 works fully offline; attempts sync when back online.
- All screens in §8 implemented with real states (loading / empty / error / offline), not demo stubs.

### Non-goals (v1)

- Multi-user accounts, social features, leaderboards against other people.
- Paid Apple Developer Program / TestFlight (upgrade path if the weekly re-sign gets annoying; zero code change).
- Publishing to the App Store or Play Store.

---

## 2. System Overview

```
┌───────────────────────────────┐
│  MOBILE APP (React Native +   │
│  Expo)                        │
│  • Quiz engine UI             │
│  • SQLite offline cache       │
│  • Sync engine (pull batch /  │
│    push attempts)             │
│  • Engagement layer (streaks, │
│    Neural Map, bounties)      │
└──────────────┬────────────────┘
               │ HTTPS · Bearer token
┌──────────────▼────────────────┐        ┌─────────────────────────────┐
│  API SERVER (Node + Express,  │        │  CONTENT PIPELINE           │
│  Render free tier)            │        │  (GitHub Actions, nightly)  │
│  • Quiz assembly & modes      │        │  1. Ingest sources → chunks │
│  • Attempt logging            │        │  2. Grounded generation     │
│  • FSRS scheduling            │        │  3. Gate 1: evidence check  │
│  • Mastery & readiness calc   │        │  4. Gate 2: blind solver    │
│  • Ad-hoc generation proxy    │◄──────►│  5. Gate 3: well-formedness │
│  • Dispute handling           │  Mongo │  6. Publish to pool         │
│  • Holds GEMINI_API_KEY       │        │  7. Freshness re-checks     │
└──────────────┬────────────────┘        └──────────────┬──────────────┘
               │                                        │
       ┌───────▼────────────────────────────────────────▼───────┐
       │  MongoDB Atlas (M0 free tier)                          │
       │  tracks · topics · source_chunks · questions ·         │
       │  misconceptions · concept_docs · attempts · mastery ·  │
       │  disputes · generation_runs · user_state               │
       └────────────────────────────────────────────────────────┘
```

**Security model (single-user):** one long random bearer token in an env var, required on every API route. Gemini key lives only on the server and in GitHub Actions secrets. The app binary contains no secrets.

---

## 3. Data Model (MongoDB collections)

```js
// tracks — a learning subject or certification
{ _id, key: "dea-c01", name: "AWS Data Engineer Associate",
  kind: "certification" | "skill",
  blueprint: [{ domain: "Data Ingestion & Transformation", weight: 0.34 }, ...], // cert only
  intensity: 0..3,            // 0=paused, 3=heavy — drives generation budget & Daily 10 mix
  custom_instructions: "Focus on Airflow 3.x semantics, assume Astronomer...",
  sources: ["https://docs.aws.amazon.com/...", ...],
  created_at }

// topics — tree under tracks
{ _id, track_key, parent_id | null, name: "S3 consistency model", path: "aws/s3/consistency" }

// source_chunks — ingested doc excerpts (the ground truth)
{ _id, url, track_key, topic_path, title, text,      // 500–1500 token chunks
  hash,                        // sha256 of text → freshness detection
  fetched_at, status: "active" | "stale" }

// questions
{ _id, stem, options: [
    { text, correct: true, explanation },            // exactly one
    { text, misconception_id, thought_process }      // every distractor tagged
  ],
  evidence_quote,              // verbatim sentence(s) from the chunk proving the key
  chunk_id, source_url,
  track_key, topic_path, blueprint_domain | null,
  difficulty: 1..5, is_boss: false,
  status: "staged" | "verified" | "rejected" | "disputed" | "retired",
  gate_results: { evidence: bool, solver: bool, form: bool, solver_confidence },
  created_at, verified_at }

// misconceptions — the unit of learning
{ _id: "s3-strong-consistency-unknown",              // slug ids, LLM reuses existing ones
  description: "Believes S3 is still eventually consistent for read-after-write",
  topic_path, concept_doc_id, created_at }

// concept_docs — bite-sized teaching cards (markdown)
{ _id, title, body_md,          // ≤ 400 words, ends with "Source →" link
  source_url, chunk_id, topic_path }

// attempts
{ _id, question_id, selected_index, correct: bool,
  misconception_id | null, mode: "daily"|"drill"|"topic"|"exam"|"adhoc",
  latency_ms, ts, synced: bool }

// mastery — FSRS state per misconception AND per topic
{ _id, subject_type: "misconception" | "topic", subject_id,
  fsrs: { stability, difficulty, last_review, due },
  strength: 0..1,              // derived, drives Neural Map coloring
  consecutive_distinct_correct: 0..3 }   // 3 distinct questions right → "squashed"

// disputes
{ _id, question_id, reason_tag: "two-defensible"|"contradicts-source"|"unclear"|"other",
  note, ts, resolution: "pending"|"fixed"|"retired" }

// generation_runs — pipeline observability
{ _id, started_at, track_key, chunks_used, generated, rejected_gate1, rejected_gate2,
  rejected_gate3, published, errors[] }

// user_state — singleton
{ _id: "me", streak: { current, best, freeze_tokens, last_active_date },
  xp, level, daily_goal: 10, notification_hour: 7,
  insight_cards_unlocked: [], settings: {...} }
```

---

## 4. Content Pipeline (GitHub Actions, nightly cron)

**Stage 0 — Budget.** Read active tracks; allocate ~25 questions/night proportional to `intensity`, biased +50% toward tracks with the most due/weak misconceptions.

**Stage 1 — Ingest.** For each track's `sources`: fetch → extract main text (readability) → chunk 500–1500 tokens → upsert `source_chunks` keyed by (url, chunk index). If a chunk's hash changed: mark old chunk `stale`, flag all its questions `status: "disputed"` for re-verification (auto freshness guard). Include AWS "What's New" RSS for cloud tracks so the pool tracks real launches.

**Stage 2 — Grounded generation (Gemini 2.5 Flash).** Prompt receives: one chunk, the track's `custom_instructions`, existing misconception slugs for that topic (forces reuse), and the output JSON schema. Must output per question: stem, 4 options, exactly one correct with explanation, each distractor with `misconception_id` + `thought_process` (second person: "You picked this because…"), an `evidence_quote` copied verbatim from the chunk, difficulty, and a concept-doc draft for any _new_ misconception.

**Stage 3 — Gate 1: Evidence check (deterministic code, no LLM).** `evidence_quote` must appear verbatim (whitespace-normalized) in the chunk. Missing/fabricated → reject. Kills hallucinated keys structurally.

**Stage 4 — Gate 2: Blind solver (separate Gemini call).** Receives stem + options + chunk, **not** the key. Must (a) pick the answer, (b) state whether more than one option is defensible, (c) give confidence 0–1. Mismatch with key, or "multiple defensible," or confidence < 0.8 → reject.

**Stage 5 — Gate 3: Well-formedness (Gemini rubric call).** Checks: single clear ask; options mutually exclusive & parallel in form; no "all/none of the above"; no giveaway length/keyword cues; stem doesn't leak the answer; distractors plausible to a real learner. Any fail → reject.

**Stage 6 — Publish.** Survivors → `status: "verified"`, misconceptions/concept docs upserted, run stats written to `generation_runs`. Rejects are kept with reasons (prompt-improvement data).

**Dispute loop (user-triggered, anytime).** Dispute tap → question instantly pulled from rotation → next nightly run re-verifies it with a stricter prompt + the dispute reason. Passes → restored; fails or second dispute → `retired`. FSRS state from its attempts is preserved (misconception-level, not question-level — this is why).

**Bootstrap mode.** Same pipeline, run manually with a big budget (~400 questions) before first app use, so day 1 feels like a real product.

---

## 5. Quiz Engine & Scheduling

**Modes**
| Mode | Assembly rule |
|---|---|
| **Daily 10** | Interleaved across active tracks by intensity; ~40% due misconception reviews (FSRS), ~40% weak-topic sampling, ~20% new material; ≤2 consecutive from one track; 1 boss question if any due. |
| **Weakness Drill** | Only misconceptions due or `strength < 0.5`; always serves a _different_ question tagged with the same misconception than last seen. |
| **Topic Focus** | User picks any topic node; difficulty ladders up as accuracy rises in-session. |
| **Exam Simulation** | Timed; question count & domain mix sampled from the track's real `blueprint` weights; no feedback until the end; produces domain-level score report. |
| **Ad-hoc** | "Quiz me on Spark shuffles" → server: pool match first; if <N verified matches, generate live through the full three gates (adds ~20–40s, shown honestly as "building & verifying"), then persist survivors to the pool. Ad-hoc always grows the pool. |

**Scheduling — FSRS on misconceptions.** Wrong answer → misconception review scheduled (short interval). Each later _correct_ answer on a **different** question tagged with that misconception advances FSRS stability. `consecutive_distinct_correct` reaching 3 → misconception **squashed** (celebrated in UX, interval goes long, not infinite). Topics inherit a rolled-up `strength` from their misconceptions + accuracy → powers the Neural Map and readiness scores.

**Cert Readiness score** (per certification track): blueprint-weighted mean of domain strengths, displayed as a gauge with honest framing ("estimated preparedness," not a pass guarantee).

---

## 6. Engagement Layer (the "addictive to learn" system)

Designed so every reward is _earned by real learning_, never by mere opening of the app:

1. **The Daily Ritual** — one primary CTA each morning: your Daily 10, pre-assembled at notification time, playable offline. Completing it is the only thing that extends the **streak**. 2 streak-freeze tokens/month (earned, not bought) remove the anxiety that kills habits.
2. **Momentum meter** — in-session combo bar that fills with consecutive correct answers; boss questions pay double momentum. Purely in-session (resets each quiz) so it drives focus, not grinding.
3. **Misconception bounties** — active misconceptions displayed as literal "open bugs" with a kill-progress of 0/3 → 3/3. Squashing one triggers the app's signature celebration + permanently lights the Neural Map. Turning weaknesses into trophies is the core loop.
4. **Neural Map** — the home for long-term progress: the topic tree rendered as a living network; node size = coverage, brightness = strength, dim/pulsing = due for review. Watching it grow _is_ the progress bar for months of study.
5. **Insight cards** — variable reward: finishing a session sometimes unlocks a collectible one-liner card (a sharp architectural fact drawn from concept docs). Collection screen doubles as revision.
6. **Readiness gauges & Report Card** — per-cert readiness dial on the track screen; a weekly auto-generated report (accuracy trend, squashed count, weakest domain, streak) delivered as a notification → beautiful in-app summary.
7. **Notification with a hook** — morning push contains an actual teaser question ("A Kinesis shard receives 2 MB/s… what happens?"). Curiosity opens the app, not guilt.
8. **XP & levels** — thin layer on top (XP = questions answered correctly, weighted by difficulty; bosses ×3). Levels gate nothing; they're a long-run counter that never decreases — the safety net when streaks break.

---

## 7. API Surface (summary — full contract in backend prompt)

```
GET  /v1/quiz?mode=&track=&topic=&count=      → assembled quiz payload
POST /v1/attempts  (batch)                    → logs + FSRS updates + reward events
GET  /v1/sync/batch                           → offline bundle (next daily + drill reserve + concept docs)
GET  /v1/concepts/:id
GET  /v1/misconceptions?status=active
POST /v1/disputes
GET  /v1/tracks | POST /v1/tracks | PATCH /v1/tracks/:key
GET  /v1/map                                  → Neural Map payload (nodes, strengths, due flags)
GET  /v1/stats/overview | /v1/stats/weekly-report
POST /v1/generate/adhoc                       → live grounded+gated generation
GET  /v1/user | PATCH /v1/user
```

---

## 8. Screen Inventory (specified fully in the design prompt)

Onboarding · Home/Today · Quiz Session · Answer Reveal (correct & wrong variants) · Concept Card reader · Session Summary · Neural Map · Track Detail (readiness) · Tracks & Topics Manager (+ Add Track wizard w/ custom instructions & sources) · Ad-hoc Generator · Exam Sim (setup/in-exam/results) · Bounty Board (misconceptions) · Insight Card collection · Stats & Weekly Report · Disputes history · Settings.

---

## 9. Cost & Ops

| Component          | Tier    | Notes                                                                                      |
| ------------------ | ------- | ------------------------------------------------------------------------------------------ |
| Gemini 2.5 Flash   | Free    | Nightly batch ≈ 100–150 calls — well within free quota                                     |
| MongoDB Atlas      | M0 free | ~10k questions ≈ tens of MB                                                                |
| Render web service | Free    | Cold starts ~30s — app masks with offline-first design                                     |
| GitHub Actions     | Free    | Nightly cron + on-demand bootstrap                                                         |
| Xcode local build  | Free    | iOS install via free provisioning (weekly re-sign); EAS free tier for optional Android APK |

**Observability:** `generation_runs` collection + a pipeline summary posted to Telegram (reuse of the existing digest bot pattern): "Published 22, rejected 9 (5 solver, 3 form, 1 evidence), 1 dispute retired."

## 10. Build Phases

1. **Backend core + bootstrap pipeline** (API, schemas, gates, 300+ question pool) — _backend prompt_
2. **App** (all screens, offline sync, engagement layer) — _frontend prompt_
3. **Polish loop** (exam sim tuning, weekly report, freshness guard, Telegram ops digest)
