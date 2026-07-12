# Synapse Backend — Handoff Document

**Date:** 2026-07-04  
**Phase:** 1 (Backend + Content Pipeline) — Complete  
**Phase 2:** React Native mobile app (separate repo, not started)

---

## 1. What Was Built

A production-grade backend for **Synapse**, a misconception-driven quiz learning system. Two deliverables in one repo:

| Deliverable | Description |
|---|---|
| **API Server** | Node 20 + Express + Mongoose, all `/v1` endpoints, bearer auth, FSRS scheduling, rewards engine |
| **Content Pipeline** | Ingest docs → generate questions (Gemini) → 3 automated gates → publish to pool. Runs nightly via GitHub Actions. Includes a bootstrap mode to seed 300+ questions before first use. |

---

## 2. Repository Layout

```
synapse-backend/
├── src/
│   ├── api/
│   │   ├── app.ts                  # Express app factory (no listen)
│   │   ├── server.ts               # Entry point — connects DB, starts server
│   │   ├── middleware/
│   │   │   ├── auth.ts             # Bearer token auth (constant-time compare)
│   │   │   └── errorHandler.ts     # Global error handler + AppError class
│   │   └── routes/
│   │       ├── quiz.routes.ts      # GET /quiz
│   │       ├── attempts.routes.ts  # POST /attempts (batch grading + FSRS)
│   │       ├── sync.routes.ts      # GET /sync/batch (offline bundle)
│   │       ├── content.routes.ts   # /concepts, /misconceptions, /disputes
│   │       ├── tracks.routes.ts    # CRUD /tracks + /tracks/:key/topics
│   │       ├── map.routes.ts       # GET /map (Neural Map payload)
│   │       ├── stats.routes.ts     # GET /stats/overview + /weekly-report
│   │       ├── user.routes.ts      # GET/PATCH /user
│   │       └── generate.routes.ts  # POST /generate/adhoc (SSE)
│   ├── models/
│   │   ├── Track.ts
│   │   ├── Topic.ts
│   │   ├── SourceChunk.ts
│   │   ├── Question.ts
│   │   ├── Misconception.ts
│   │   ├── ConceptDoc.ts
│   │   ├── Attempt.ts
│   │   ├── Mastery.ts
│   │   ├── Dispute.ts
│   │   ├── GenerationRun.ts
│   │   ├── UserState.ts
│   │   └── index.ts                # Barrel re-export
│   ├── services/
│   │   ├── fsrs.service.ts         # FSRS scheduling on misconceptions
│   │   ├── mastery.service.ts      # Topic strength rollup + cert readiness
│   │   ├── quiz.service.ts         # Quiz assembly for all 5 modes
│   │   └── rewards.service.ts      # XP, levels, streaks, insight cards
│   ├── pipeline/
│   │   ├── ingest.ts               # Fetch → extract → chunk → upsert source_chunks
│   │   ├── generate.ts             # Gemini generation + all 3 gates
│   │   ├── publish.ts              # Save survivors, upsert misconceptions/docs, Telegram
│   │   ├── freshness.ts            # Re-verify disputed questions
│   │   ├── bootstrap.ts            # Manual bootstrap + adhoc SSE generation
│   │   └── gates/
│   │       ├── gate1-evidence.ts   # Pure code: evidence_quote substring check
│   │       ├── gate2-solver.ts     # Gemini blind solver (shuffled options)
│   │       └── gate3-form.ts       # Gemini rubric: well-formedness checks
│   ├── prompts/
│   │   ├── generation.ts           # Prompt G template + JSON schema
│   │   ├── gate2-solver.ts         # Solver prompt template + schema
│   │   ├── gate3-form.ts           # Form rubric prompt + schema
│   │   ├── dispute-reverify.ts     # Stricter re-verification prompt
│   │   ├── adhoc-generation.ts     # Ad-hoc quiz generation prompt
│   │   └── index.ts
│   └── lib/
│       ├── env.ts                  # Env var validation (throws on startup if missing)
│       ├── db.ts                   # Mongoose singleton connect/disconnect
│       ├── gemini.ts               # Gemini 2.5 Flash client: JSON schema enforcement, retry, rate limit
│       ├── telegram.ts             # Telegram notification (no-op if unconfigured)
│       ├── chunker.ts              # Text chunker: 500–1500 tokens, heading-aware
│       ├── hash.ts                 # sha256 + normalizeWhitespace
│       └── index.ts
├── scripts/
│   ├── seed-tracks.ts              # Upsert 6 tracks + UserState singleton (idempotent)
│   ├── bootstrap.ts                # CLI runner: --budget, --tracks, --verbose
│   └── run-nightly.ts              # Full nightly: ingest → generate → re-verify
├── test/
│   ├── gate1-evidence.test.ts      # 9 tests: verbatim, whitespace, hallucinated quotes
│   ├── fsrs-transitions.test.ts    # 8 tests: Again/Good/Easy ratings, strength derivation
│   ├── daily-assembly.test.ts      # 6 tests: consecutive-track guard, shortfall, no-leak
│   ├── streak.test.ts              # 7 tests: consecutive, freeze tokens, reset, TZ-safe
│   └── idempotency.test.ts         # 4 tests: duplicate key suppression
├── .github/
│   └── workflows/
│       └── nightly.yml             # Cron 03:00 IST + manual bootstrap trigger
├── .env                            # Real secrets — gitignored
├── .env.example                    # Template with placeholder values
├── render.yaml                     # Render free tier deployment spec
├── vitest.config.ts
├── tsconfig.json
├── eslint.config.js
└── package.json
```

---

## 3. Environment Variables

All secrets live in `.env` (gitignored). Never commit real values to `.env.example`.

| Variable | Status | How to get |
|---|---|---|
| `MONGODB_URI` | ✅ Set | Atlas → Connect → Drivers |
| `APP_TOKEN` | ✅ Set | `openssl rand -hex 32` |
| `GEMINI_API_KEY` | ✅ Set | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `TELEGRAM_BOT_TOKEN` | ✅ Set | @BotFather → `/newbot` |
| `TELEGRAM_CHAT_ID` | ⚠️ Needs fixing | See note below |
| `PORT` | ✅ Default 3000 | — |
| `NODE_ENV` | ✅ development | Set to `production` on Render |

**Telegram Chat ID fix required:** The current value is a bot username, not a numeric ID. To get the correct value:
1. Send any message to your bot in Telegram
2. Open in browser: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
3. Find `"chat":{"id": -123456789}` — that number is your `TELEGRAM_CHAT_ID`
4. Update `.env` and the GitHub Actions secret

---

## 4. Data Model (MongoDB — Atlas M0)

Database name: `synapse`

| Collection | Purpose | Key fields |
|---|---|---|
| `tracks` | Learning subjects / certifications | `_id` = slug key (e.g. `"dea-c01"`), `intensity` (0–3), `sources[]`, `blueprint[]` |
| `topics` | Topic tree under tracks | `track_key`, `parent_id`, `path` (e.g. `"aws/s3/consistency"`) |
| `source_chunks` | Ingested doc excerpts (ground truth) | `url`, `chunk_index`, `hash`, `status: active|stale` |
| `questions` | The question pool | `status: staged|verified|rejected|disputed|retired`, `gate_results`, `options[].misconception_id` |
| `misconceptions` | Named learning gaps | `_id` = kebab slug, `description`, `concept_doc_id` |
| `concept_docs` | Teaching cards (≤400 word markdown) | `title`, `body_md`, `source_url` |
| `attempts` | All user answers | `idempotency_key` (unique), `correct`, `mode`, `synced` |
| `mastery` | FSRS state per misconception/topic | `subject_type`, `subject_id`, `fsrs.*`, `strength` (0–1), `consecutive_distinct_correct` |
| `disputes` | User-flagged bad questions | `question_id`, `reason_tag`, `resolution: pending|fixed|retired` |
| `generation_runs` | Pipeline observability | `status: running|done|failed`, per-gate rejection counts |
| `user_state` | Singleton (`_id: "me"`) | `streak`, `xp`, `level`, `timezone`, `freeze_tokens` |

**Indexes:**
- `questions`: `{status, track_key, topic_path}` + `{"options.misconception_id"}`
- `attempts`: `{ts}` + `{idempotency_key}` unique
- `mastery`: `{subject_type, "fsrs.due"}` + `{subject_type, subject_id}` unique
- `source_chunks`: `{url, chunk_index}` unique + `{hash}`

---

## 5. API Endpoints

All routes require `Authorization: Bearer <APP_TOKEN>`. Base: `/v1`.

### Quiz & Learning

| Method | Path | Description |
|---|---|---|
| `GET` | `/quiz` | Assemble quiz. Query: `mode=daily\|drill\|topic\|exam\|adhoc`, `track`, `topic`, `count` |
| `POST` | `/attempts` | Batch attempt submission. Grades server-side, runs FSRS, returns rewards. |
| `GET` | `/sync/batch` | Offline bundle: tomorrow's daily + drill reserve + all concept docs + user state + map |
| `GET` | `/concepts/:id` | Fetch a concept doc by ID |
| `GET` | `/misconceptions` | List misconceptions. Query: `?status=active\|squashed` |
| `POST` | `/disputes` | Flag a question. Body: `{ question_id, reason_tag, note? }` |
| `GET` | `/disputes` | List all disputes |

### Structure & Progress

| Method | Path | Description |
|---|---|---|
| `GET` | `/tracks` | All tracks with cert readiness scores |
| `POST` | `/tracks` | Create a new track |
| `PATCH` | `/tracks/:key` | Update `intensity`, `custom_instructions`, `sources` |
| `GET` | `/tracks/:key/topics` | Topic tree for a track |
| `GET` | `/map` | Neural Map payload: `{ nodes[], edges[] }` |
| `GET` | `/stats/overview` | Totals: questions, attempts, misconceptions, streak, XP |
| `GET` | `/stats/weekly-report` | Last 7 days: accuracy, squashed, weakest domain, by-day breakdown |
| `GET` | `/user` | User state singleton |
| `PATCH` | `/user` | Update `daily_goal`, `notification_hour`, `timezone`, `settings` |
| `POST` | `/generate/adhoc` | SSE stream. Body: `{ prompt, count }`. Pool-first, then live generation. |

### Quiz Mode Assembly Rules

| Mode | Logic |
|---|---|
| `daily` | 40% due misconception reviews + 40% weak-topic + 20% new material. ≤2 consecutive from one track. 1 boss question if any due. |
| `drill` | Only due/weak misconceptions. Always a different question than last seen for that misconception. |
| `topic` | Filter by topic path prefix. Difficulty ladder ascending. |
| `exam` | Blueprint-weighted domain sampling. Timed by caller. |
| `adhoc` | Pool-first keyword match; falls back to live Gemini generation through all 3 gates (SSE). |

**Security:** Quiz payloads never leak `correct`, `explanation`, `misconception_id`, or `thought_process`. Grading is always server-side.

---

## 6. Content Pipeline

```
Nightly (GitHub Actions, 03:00 IST):

Stage 0  Budget allocation — 40 questions/night across active tracks
         proportional to intensity, +50% bias toward tracks with most due misconceptions

Stage 1  Ingest — Fetch source URLs → extract text (Readability/pdf-parse)
         → chunk 500–1500 tokens → upsert source_chunks
         Hash change → mark chunk stale → dispute all questions from that chunk (freshness guard)

Stage 2  Generate — Per chunk: call Gemini 2.5 Flash with Prompt G
         (grounded on chunk, reuses existing misconception slugs)

Stage 3  Gate 1 — Evidence check (pure code, no LLM)
         evidence_quote must be verbatim substring of chunk (normalized whitespace, case-insensitive)
         Hallucinated quotes → reject

Stage 4  Gate 2 — Blind solver (separate Gemini call)
         Shuffled options sent WITHOUT the answer key
         Must pick correct, no multiple defensible answers, confidence ≥ 0.8
         Failure → reject

Stage 5  Gate 3 — Well-formedness rubric (Gemini)
         Checks: single clear ask, parallel options, no all/none, no answer leak, distractors plausible
         Any failure → reject with checks recorded

Stage 6  Publish — Survivors → status: verified
         New misconceptions + concept docs upserted
         GenerationRun stats written
         Telegram summary posted

Stage 7  Re-verify disputed — Questions flagged by user:
         Re-run gates 2+3 with dispute reason injected
         Pass → restored to verified | Fail or 2nd dispute → retired
```

**Bootstrap mode** (`npm run bootstrap`): Same pipeline, budget ~400, runs all tracks sequentially. Takes 1–2 hours on the Gemini free tier. Must be run before first app use.

---

## 7. FSRS Scheduling

FSRS-4.5 (`ts-fsrs` package) is keyed on **misconceptions**, not questions.

| Event | FSRS Rating |
|---|---|
| Wrong answer | `Again` (short interval) |
| Correct on a new distinct question | `Good` (normal interval growth) |
| `consecutive_distinct_correct` reaches 3 | `Easy` (long interval — "squashed") |

- **Strength** (0–1): `stability / (stability + 9)` — feeds Neural Map colors and readiness gauges
- **Topic strength**: mean of all misconception strengths under that topic
- **Cert readiness**: blueprint-weighted mean of domain strengths

Squash at cdc=3 means the learner must answer 3 **different** questions tagged with the same misconception correctly in sequence. Duplicate question IDs don't count.

---

## 8. Engagement System

| Feature | Mechanic |
|---|---|
| **Streak** | Advances only on daily goal completion. Timezone-safe (IANA tz in user_state). 2 freeze tokens/month auto-spent on missed days. |
| **XP & Level** | XP = `difficulty × 10` per correct; boss questions ×3. Level = `floor(sqrt(xp/100)) + 1`. Never decreases. |
| **Momentum** | In-session consecutive correct counter. Events at combo_3, combo_5, boss_bonus. Resets per session. |
| **Squash / Bounties** | cdc reaches 3 → `squashed: misconception_id` in response → app triggers celebration + lights Neural Map. |
| **Insight Cards** | ~15% chance on correct answer → random ConceptDoc ID returned. App displays as collectible. |

---

## 9. Seeded Tracks

| Key | Name | Kind | Intensity |
|---|---|---|---|
| `dea-c01` | AWS Data Engineer Associate | certification | 3 |
| `saa-c03` | AWS Solutions Architect Associate | certification | 2 |
| `spark` | Apache Spark | skill | 2 |
| `sql` | SQL & Query Engines | skill | 2 |
| `airflow` | Apache Airflow | skill | 2 |
| `devops` | DevOps & CI/CD | skill | 1 |

Intensity 0 = paused, 3 = heavy. Drives nightly budget allocation and Daily 10 mix.

---

## 10. Running Locally

```bash
# 1. Install deps
npm install

# 2. Copy and fill env
cp .env.example .env
# Fill in all values — especially TELEGRAM_CHAT_ID (must be numeric)

# 3. Seed tracks and default user state
npm run seed-tracks

# 4. Build the question pool (1–2 hrs)
npm run bootstrap -- --verbose

# 5. Start dev server
npm run dev
# → http://localhost:3000

# 6. Test an endpoint
curl http://localhost:3000/v1/quiz?mode=daily \
  -H "Authorization: Bearer <APP_TOKEN>"
```

**Run only one track's bootstrap** (faster for testing):
```bash
npm run bootstrap -- --tracks=sql --budget=30 --verbose
```

---

## 11. Deployment — Render Free Tier

1. Push repo to GitHub (don't commit `.env` — it's gitignored)
2. [render.com](https://render.com) → New Web Service → connect the repo
3. Render detects `render.yaml` automatically (build: `npm install && npm run build`, start: `node dist/api/server.js`)
4. Add **Environment Variables** in Render dashboard:
   - `MONGODB_URI`
   - `APP_TOKEN`
   - `GEMINI_API_KEY`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `NODE_ENV=production`
5. Deploy

> **Cold starts:** Render free tier sleeps after 15 min of inactivity. Cold start takes ~30s. The mobile app's offline-first design (SQLite + sync/batch) masks this completely — daily quiz is pre-downloaded.

---

## 12. GitHub Actions — Nightly Pipeline

File: `.github/workflows/nightly.yml`

**Schedule:** `30 21 * * *` UTC = 03:00 IST daily

**Add these repository secrets** (GitHub → Settings → Secrets and variables → Actions):
- `MONGODB_URI`
- `APP_TOKEN`
- `GEMINI_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

**Manual bootstrap trigger:**
- Actions tab → "Nightly Pipeline" → Run workflow → check "Run bootstrap instead of nightly" → optionally set budget → Run

After each nightly run, a Telegram message is posted:
> `Nightly: 22 published / 9 rejected (1 evidence, 5 solver, 3 form) / 1 freshness re-check`

---

## 13. Adding a New Track

```bash
# Via API (server running):
curl -X POST http://localhost:3000/v1/tracks \
  -H "Authorization: Bearer <APP_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "dbt",
    "name": "dbt Core",
    "kind": "skill",
    "intensity": 2,
    "custom_instructions": "Focus on ref(), source(), and incremental model strategies.",
    "sources": [
      "https://docs.getdbt.com/docs/introduction",
      "https://docs.getdbt.com/docs/core/dbt-core-about"
    ]
  }'

# Then bootstrap just that track:
npm run bootstrap -- --tracks=dbt --budget=60 --verbose
```

---

## 14. Tests

```bash
npm test
```

**34 tests, 5 files — all passing:**

| File | Tests | What's covered |
|---|---|---|
| `gate1-evidence.test.ts` | 9 | Verbatim match, whitespace normalization, hallucinated quotes, empty quote rejection |
| `fsrs-transitions.test.ts` | 8 | Again/Good/Easy rating effects, stability growth, squash at cdc=3, distinct-question guard |
| `daily-assembly.test.ts` | 6 | ≤2 consecutive track guard, shortfall detection, no answer leak in quiz payload |
| `streak.test.ts` | 7 | Consecutive day, freeze token spend, reset on expired streak, TZ-safe day boundary, first use |
| `idempotency.test.ts` | 4 | Duplicate `idempotency_key` suppression, batch with mixed new/duplicate keys |

---

## 15. Key Design Decisions

| Decision | Rationale |
|---|---|
| FSRS keyed on misconceptions, not questions | A question can be retired/replaced; the learner's memory gap persists. FSRS state survives question churn. |
| Gate 1 is pure code, not LLM | Kills hallucinated evidence quotes structurally, deterministically, for free. |
| Gate 2 shuffles options before sending | Prevents position bias — the LLM solver can't guess correct by option position. |
| Idempotency key on attempts | Safe for offline sync: the same attempt batch can be POST-ed multiple times without double XP or double FSRS updates. |
| Grading is always server-side | The quiz payload never exposes the correct answer. The client is untrusted. |
| Pipeline runs sequentially (not parallel) | Gemini free tier has strict rate limits. Sequential chunk processing stays within quota. |
| Bootstrap produces ~400 questions | Day 1 feels like a real product, not an empty app. Must be run once before first use. |
| Single-user bearer token | Eliminates all auth complexity. Token lives only in env vars — never in the app binary. |

---

## 16. Known Gaps / Phase 2 Handoff Notes

| Item | Status | Notes |
|---|---|---|
| Telegram Chat ID | ⚠️ Fix needed | Must be numeric (from `getUpdates`), not a username |
| Ad-hoc SSE full integration | 🔧 Partial | `generate.routes.ts` calls `generateAdhoc` from `bootstrap.ts`; path works but SSE progress granularity can be improved |
| Exam simulation timer | 📱 App-side | The API returns exam questions; timing and domain score report are computed client-side |
| Weekly report caching | 💡 Future | Currently computed on-demand; add Monday-computed cache to `user_state` if it becomes slow |
| Freshness re-check for PDFs | 💡 Future | PDF sources are fetched but hash diffing may be noisy if PDF rendering varies — monitor in `generation_runs` |
| Phase 2 — Mobile App | 🔜 Not started | React Native + Expo, separate repo. All screens defined in `architecture.md §8`. |

---

## 17. File Quick Reference

| Need to... | Look at |
|---|---|
| Change how questions are assembled for daily quiz | `src/services/quiz.service.ts` → `assembleDaily()` |
| Tune the generation prompt | `src/prompts/generation.ts` → `buildGenerationPrompt()` |
| Change gate thresholds (e.g. confidence cutoff) | `src/pipeline/gates/gate2-solver.ts` |
| Add a new API endpoint | Add route file in `src/api/routes/`, mount in `src/api/app.ts` |
| Change XP formula | `src/services/rewards.service.ts` → `processRewards()` |
| Change streak logic | `src/services/rewards.service.ts` → `checkAndAdvanceStreak()` |
| Add a new track (code-side) | `scripts/seed-tracks.ts` → add to the `tracks` array |
| Debug a nightly run | Query `generation_runs` collection in Atlas, or check Telegram message |
| See gate rejection breakdown | `generation_runs.rejected_gate1/2/3` fields |
