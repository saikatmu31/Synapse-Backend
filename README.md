# Synapse Backend

Misconception-driven quiz learning API + content pipeline. Node 20 / Express / MongoDB / Gemini.

## Environment setup

Copy `.env.example` to `.env` and fill in all values:

| Variable | How to get it |
|---|---|
| `MONGODB_URI` | Atlas → Connect → Drivers → copy the connection string |
| `APP_TOKEN` | `openssl rand -hex 32` |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `TELEGRAM_BOT_TOKEN` | Message @BotFather → `/newbot` |
| `TELEGRAM_CHAT_ID` | Message your bot, then `GET https://api.telegram.org/bot<TOKEN>/getUpdates` → find `chat.id` |

## MongoDB Atlas setup

1. Create a free M0 cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Database name: `synapse`
3. Network Access → Add IP Address → Allow from anywhere (or your Render IP)
4. Create a DB user and paste the URI into `.env`

## First run

```bash
npm install

# Seed the 6 tracks and default user state
npm run seed-tracks

# Build the starting question pool (~400 questions, takes 1–2 hours)
npm run bootstrap -- --verbose

# Start the API server
npm run dev
```

## Adding a new track

```bash
# Via the API (server must be running):
curl -X POST http://localhost:3000/v1/tracks \
  -H "Authorization: Bearer $APP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "dbt",
    "name": "dbt Core",
    "kind": "skill",
    "intensity": 2,
    "custom_instructions": "Focus on ref(), source(), and incremental model strategies.",
    "sources": ["https://docs.getdbt.com/docs/introduction"]
  }'

# Then run bootstrap for just that track:
npm run bootstrap -- --tracks=dbt --budget=60 --verbose
```

## Deploy to Render

1. Push this repo to GitHub
2. New Web Service → connect repo → Render auto-detects `render.yaml`
3. Add all env vars in the Render dashboard (Environment tab)
4. First deploy: Render builds and starts the server

## GitHub Actions — nightly pipeline

The workflow runs at 03:00 IST (21:30 UTC) every night.

Add these **repository secrets** in GitHub → Settings → Secrets:
`MONGODB_URI`, `APP_TOKEN`, `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

To run bootstrap via GitHub Actions manually:
- Actions → Nightly Pipeline → Run workflow → check "Run bootstrap" → Run

## iOS re-sign (7-day ritual)

The app is installed via free Xcode provisioning. Every 7 days:
1. Open the Xcode project
2. Product → Archive → Distribute (Ad Hoc or Development)
3. All local SQLite state survives — the API token is the same

## Project structure

```
src/
  api/           Express app, routes, middleware
  models/        Mongoose schemas (source of truth: architecture.md §3)
  services/      Quiz assembly, FSRS, mastery, rewards
  pipeline/      Ingest → generate → gates → publish
  prompts/       Gemini prompt template functions
  lib/           Gemini client, Telegram, chunker, hash, DB
scripts/         seed-tracks, bootstrap, run-nightly
test/            Vitest unit tests
.github/
  workflows/     nightly.yml
```

## Running tests

```bash
npm test
```

Tests cover: gate 1 evidence check (including hallucinated quotes), FSRS transitions, Daily-10 assembly rules, streak edge cases, and attempt idempotency.
