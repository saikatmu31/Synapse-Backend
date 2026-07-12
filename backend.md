# PROMPT FOR CLAUDE CODE — Synapse Backend + Content Pipeline

_(Paste into Claude Code at the root of a new repo `synapse-backend`. Build Phase 1 completely before touching the app.)_

---

## Mission

Build the production backend for **Synapse**, a single-user, misconception-driven quiz learning system. Two deliverables in one repo:

1. **API server** — Node.js 20 + Express + Mongoose, deployed on Render free tier, MongoDB Atlas M0.
2. **Content pipeline** — Node scripts run by GitHub Actions nightly: ingest documentation sources → generate questions with Gemini 2.5 Flash grounded on real doc excerpts → verify through three automated gates → publish to the pool. Includes a manual **bootstrap mode** that builds a 300+ question starting pool.

**Goal state:** `npm run bootstrap` produces ≥300 verified questions across the seed tracks; the API serves all endpoints below with tests passing; nightly workflow runs green and posts a summary to Telegram.

**Non-goals:** multi-user auth, admin UI, payments, iOS/Android code (separate repo).

## Ground rules

- TypeScript, strict mode. ESLint + Prettier. Vitest for tests.
- Single-user security: every `/v1/*` route requires `Authorization: Bearer ${APP_TOKEN}` (constant-time compare). 401 otherwise. Secrets only via env: `MONGODB_URI`, `APP_TOKEN`, `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
- Gemini calls: `@google/genai` SDK, model `gemini-2.5-flash`, **always** `responseMimeType: "application/json"` with a `responseSchema` — never parse free text. Global rate limiter + exponential backoff on 429/5xx (reuse the pattern: max 5 retries, jitter). Free-tier friendly: the pipeline must batch sequentially, not blast parallel calls.
- Every pipeline stage idempotent and resumable (checkpoint per run in `generation_runs`); a crashed run can re-run safely.
- Repo layout:

```
src/
  api/            # express app, routes, middleware
  models/         # mongoose schemas (source of truth = ARCHITECTURE §3 below)
  services/       # quiz assembly, fsrs, mastery, readiness, rewards
  pipeline/       # ingest.ts, generate.ts, gates/, publish.ts, freshness.ts, bootstrap.ts
  prompts/        # generation & gate prompts as exported template functions
  lib/            # gemini client, telegram, chunker, hash
scripts/          # bootstrap, seed-tracks, run-nightly
.github/workflows/nightly.yml
test/
```

## Data model

Implement exactly the collections in **ARCHITECTURE.md §3** (provided alongside this prompt): `tracks, topics, source_chunks, questions, misconceptions, concept_docs, attempts, mastery, disputes, generation_runs, user_state`. Add indexes: `questions {status, track_key, topic_path}`, `questions {"options.misconception_id"}`, `attempts {ts}`, `mastery {subject_type, "fsrs.due"}`, `source_chunks {url, hash}`.

## Seed data (`scripts/seed-tracks.ts`)

Create these tracks with real blueprint weights and starter sources (verify weights against current official exam guides at build time):

- **dea-c01** AWS Data Engineer Associate — 4 domains; sources: AWS official exam guide PDF page, S3/Glue/Kinesis/Redshift/EMR docs + FAQs, AWS What's New RSS.
- **saa-c03** Solutions Architect Associate — 4 domains; core service docs + FAQs.
- **spark** (skill) — Apache Spark docs: RDD/DataFrame guide, SQL performance tuning, structured streaming.
- **sql** (skill) — PostgreSQL docs: queries, window functions, aggregates; custom_instructions: "Emphasize join semantics, NULL behavior in aggregates, grain, execution order traps."
- **airflow** (skill) — Airflow 3.x docs + Astronomer docs; custom_instructions: "Assume Astronomer runtime, Airflow 3.x semantics."
- **devops** (skill) — GitLab CI docs, GitHub Actions docs, Docker docs.

## Content pipeline (the load-bearing wall — build with care)

### `pipeline/ingest.ts`

Fetch each source URL → extract main content (`@mozilla/readability` + jsdom; handle PDFs for exam guides via `pdf-parse`) → chunk 500–1500 tokens on heading boundaries → upsert `source_chunks` by (url, index) with sha256 hash. Hash changed → mark old chunk `stale` **and** set every question with that `chunk_id` to `status:"disputed"` with a system dispute record (`reason_tag:"source-changed"`). Politeness: 1 req/sec, honest UA, skip on 4xx with logged warning.

### `pipeline/generate.ts`

Budget: `25 * intensity_share` per track nightly (cap 40 total), +50% weighting to tracks with most due misconceptions. Pick chunks least-covered by existing questions. Per chunk, call Gemini with **Prompt G** and parse into candidate questions.

**Prompt G — generation (implement as template fn; JSON schema enforced):**

> You are an expert item-writer for professional certification exams, specializing in _diagnostic distractors_.
> Using ONLY the source excerpt below, write {n} multiple-choice questions.
> Rules:
>
> 1. Every fact needed to answer must be present in or directly inferable from the excerpt. If the excerpt cannot support a good question, return an empty array.
> 2. Exactly one correct option. For it, write a 1–2 sentence `explanation`.
> 3. Each of the 3 distractors must represent a _specific, plausible mistake a real learner makes_ — not random wrong facts. For each: `misconception_id` (reuse one of the EXISTING_MISCONCEPTIONS below if it fits, else mint a new kebab-case slug), and `thought_process` — 1–2 sentences in second person explaining the exact reasoning that leads a learner to pick it ("You picked this because…").
> 4. `evidence_quote`: copy VERBATIM the sentence(s) from the excerpt that prove the correct answer. Do not paraphrase.
> 5. For each NEW misconception, include a `concept_doc`: title + ≤350-word markdown explanation that fixes the misconception, written for a SQL/Python-fluent data engineer.
> 6. Difficulty 1–5. Mark `is_boss: true` only if it requires combining two or more facts from the excerpt.
> 7. Question style: scenario-based where possible ("A pipeline writes… what happens?"), matching real {track_name} exam register. {custom_instructions}
>    EXISTING_MISCONCEPTIONS for this topic: {list}
>    SOURCE EXCERPT ({url}): {chunk_text}

### `pipeline/gates/`

- **gate1-evidence.ts** (pure code, no LLM): normalize whitespace/quotes; `evidence_quote` must be a substring of the chunk. Fail → reject `rejected_gate1`.
- **gate2-solver.ts**: fresh Gemini call — receives stem, shuffled options, and the chunk; NOT the key. Must return `{answer_index, multiple_defensible: bool, confidence: 0..1, reasoning}`. Reject if answer ≠ key after unshuffling, or `multiple_defensible`, or `confidence < 0.8`.
- **gate3-form.ts**: Gemini rubric call returning per-check booleans: single clear ask; options parallel in structure & mutually exclusive; no all/none-of-the-above; correct option not longest/most-hedged; stem doesn't contain the answer; distractors would tempt a real learner. Any false → reject with the failing checks recorded.

Store full `gate_results` on every candidate, including rejects (kept for prompt tuning).

### `pipeline/publish.ts`

Survivors → `status:"verified"`, upsert new misconceptions + concept_docs (concept docs carry `source_url` + `chunk_id`), write `generation_runs` stats, send Telegram summary: `"Nightly: 22 published / 9 rejected (1 evidence, 5 solver, 3 form) / 1 freshness re-check"`.

### Dispute re-verification (in nightly run)

For `status:"disputed"` questions: re-run gates 2+3 with the dispute reason injected ("A learner disputed this because: {reason}. Scrutinize that specifically."). Pass → restore `verified`, mark dispute `fixed`. Fail or second dispute → `retired`.

### `pipeline/bootstrap.ts`

Same pipeline, budget parameter (default 400 candidates), runs tracks sequentially with progress logging, resumable. Must respect free-tier rate limits (this run may take a couple of hours — that's fine).

## API endpoints (all under `/v1`, all bearer-authed)

**Quiz & learning**

- `GET /quiz?mode=daily|drill|topic|exam|adhoc&track=&topic=&count=` → `{quiz_id, mode, questions:[{id, stem, options:[text only], meta:{category, is_boss, code_lang?}}]}`. Assembly rules exactly per ARCHITECTURE §5 (Daily 10 mix 40/40/20, ≤2 consecutive per track, misconception-variety rule for drills). **Never leak** correct index, explanations, or misconception ids in the quiz payload.
- `POST /attempts` (batch) → for each: grade server-side, return `{correct, correct_index, explanation, evidence_quote, source_url, misconception?: {id, description, thought_process, kill_progress}, concept_doc_id?}` + updated reward state `{xp_delta, momentum_events, streak, squashed?: misconception_id, insight_card?: id}`. Applies FSRS updates + `user_state` mutations atomically.
- `GET /sync/batch` → offline bundle: tomorrow-ready daily quiz, 20-question drill reserve, all referenced concept docs & misconceptions, user_state snapshot, map payload. (App stores in SQLite; attempts POST later with `client_ts` — grading is deterministic so late sync is safe.)
- `GET /concepts/:id`, `GET /misconceptions?status=active|squashed`
- `POST /disputes {question_id, reason_tag, note}` → immediately sets question `disputed` (out of rotation).

**Structure & progress**

- `GET/POST /tracks`, `PATCH /tracks/:key` (intensity, custom_instructions, sources — validate URLs).
- `GET /map` → `{nodes:[{topic_path, name, track, coverage, strength, due_count}], edges:[…]}` (edges = topic-tree adjacency).
- `GET /stats/overview`, `GET /stats/weekly-report` (computed Monday, cached).
- `GET /user`, `PATCH /user` (goal, notification hour, settings).
- `POST /generate/adhoc {prompt, count}` → pool-first; if short, live generation through ALL three gates; stream progress via SSE (`stage: generating|gate1|gate2|gate3, passed, total`); persist survivors.

**FSRS**: implement FSRS-4.5 (`ts-fsrs` package) keyed on misconceptions; map correct-on-distinct-question → `Good`, wrong → `Again`; `consecutive_distinct_correct` = 3 ⇒ squashed (rating `Easy`, long interval). Topic `strength` = weighted rollup (children mean × accuracy factor); readiness = blueprint-weighted domain strengths.

## Cases that must be handled (test these)

- Duplicate attempt POST (idempotency key per attempt) — no double XP/FSRS.
- Quiz requested when pool has too few matching questions → return fewer with `meta.shortfall`, never pad with unverified items.
- Gemini returns malformed JSON / empty → retry once, then skip chunk, log to run.
- Source URL dead or paywalled → warn, continue.
- Streak: timezone-safe day boundary (user TZ in `user_state`), freeze-token auto-spend with event flag, streak restore not possible otherwise.
- Boss question absent when none due — Daily 10 still assembles.
- Concurrent nightly + adhoc generation — Mongo-level run lock.
- Every route: zod-validated input, structured error `{code, message}`.

## Definition of done

- `npm test` green: unit tests for gates (fixture chunks incl. a deliberately-hallucinated evidence quote), FSRS transitions, Daily-10 assembly rules, streak edge cases, idempotency.
- `npm run bootstrap` on seed tracks yields ≥300 verified questions; print gate rejection breakdown.
- `render.yaml` + `.github/workflows/nightly.yml` (03:00 IST cron) committed; README covers env setup, Atlas setup, deploy, bootstrap, and how to add a track.
