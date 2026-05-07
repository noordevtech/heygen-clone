# AI Reels Studio

A HeyGen-style web app for generating short social-media videos (TikTok / Reels /
Feed) from a script. Built with Next.js 15 + TypeScript + Tailwind, with a
durable Postgres job store and a BullMQ/Redis worker pool for video generation.

**Pipeline per job**

1. **Voiceover** — script → **ElevenLabs** TTS, uploaded to Cloudflare R2.
2. **Video** — auto-derived (or user-provided) visual prompt is submitted to
   **OpenRouter Video Generation** (`POST /api/v1/videos`) with
   `bytedance/seedance-2.0` or `google/veo-3.1`. The worker polls
   `GET /api/v1/videos/{id}` until completion, then mirrors the resulting video
   to R2.
3. **Multi-aspect masters** — the same prompt is rendered in `9:16`, `1:1` and
   `16:9` so you have one master per platform.
4. **Avatar mode** — when enabled, `generate_audio: true` is set so models
   that support native audio (Veo 3.1, Seedance 1.5 Pro) produce a lip-synced
   talking head. For stricter lip-sync wire a dedicated provider in
   `src/lib/openrouter.ts`.

## Architecture

Two long-running services share Postgres + Redis:

```
[ web (Next.js) ]  ── enqueue ──▶  [ Redis (BullMQ) ]  ──▶  [ worker ]
        │                                                        │
        └──────────── reads/writes ──────────────────────────────┘
                                  ▼
                            [ Postgres ]
                                  │
                              R2 storage
```

- `src/app/api/jobs` (POST) inserts a row, enqueues a BullMQ job, returns 202.
- `src/worker/index.ts` consumes the queue and runs `runPipeline()`, updating
  the row's `status`/`progress` so the UI polling sees live progress.
- The browser polls `/api/jobs/[id]` every 2s until `status` is `done`/`error`.

## Repo layout

```
src/
  app/                    # Next.js App Router (UI + API routes)
    api/voices            # GET ElevenLabs voices
    api/jobs              # POST -> create+enqueue, GET -> list
    api/jobs/[id]         # GET single job
  components/StudioForm.tsx
  db/
    schema.ts             # drizzle-orm schema
    client.ts             # lazy postgres-js + drizzle client
    migrate.ts            # tiny SQL migration runner
  drizzle/
    0001_init.sql         # initial migration
  lib/
    env.ts
    elevenlabs.ts         # voices + TTS
    openrouter.ts         # createVideo + waitForVideo (async /api/v1/videos)
    r2.ts                 # S3-compatible client for Cloudflare R2
    jobs.ts               # Postgres-backed job store
    queue.ts              # BullMQ queue
    pipeline.ts           # TTS -> video -> R2 orchestration
  worker/index.ts         # BullMQ worker entry point
```

## Quickstart (local)

```bash
cp .env.example .env
# fill in OPENROUTER_API_KEY, ELEVENLABS_API_KEY, R2_*, DATABASE_URL, REDIS_URL

# bring up Postgres + Redis (one option):
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=reels postgres:16
docker run -d -p 6379:6379 redis:7

npm install
npm run migrate          # creates tables
npm run dev              # web on http://localhost:3000
npm run worker:dev       # worker (separate terminal)
```

## Required environment variables

| Var | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | Calls `/api/v1/videos` |
| `OPENROUTER_SEEDANCE_MODEL` | Override Seedance slug (default `bytedance/seedance-2.0`) |
| `OPENROUTER_VEO_MODEL` | Override Veo slug (default `google/veo-3.1`) |
| `ELEVENLABS_API_KEY` | Voice listing + TTS |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | Cloudflare R2 |
| `R2_PUBLIC_BASE_URL` | (Optional) Public CDN/custom domain for R2 |
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection string for BullMQ |
| `WORKER_CONCURRENCY` | (Optional) Concurrent jobs per worker (default 2) |

## Deploying on Railway

You need **three Railway services** in one project:

1. **Postgres** — Railway → New → Database → Postgres. Copy `DATABASE_URL`.
2. **Redis** — Railway → New → Database → Redis. Copy `REDIS_URL`.
3. **Web** — deploy from this repo. Railway picks up `railway.json`
   (`npm ci && npm run build`, then `npm run migrate && npm run start`).
4. **Worker** — add a *second* service from the **same repo**, then in the
   service's *Settings → Config-as-Code Path* point it to
   `railway.worker.json` (or override the start command to `npm run worker`).

Set the env vars on **both** services. Reference Postgres/Redis via Railway's
shared variables (`${{Postgres.DATABASE_URL}}`, `${{Redis.REDIS_URL}}`).

> **Why not Cloudflare Pages?** Pages/Workers can't host a long-running BullMQ
> worker, can't keep persistent connections to Postgres easily, and have CPU
> limits that don't fit the upload+poll loop. R2 is still used for storage.

## Available scripts

```
npm run dev          # Next.js dev server
npm run worker:dev   # BullMQ worker w/ tsx --watch
npm run build        # Next.js production build
npm run start        # Next.js production server
npm run worker       # BullMQ worker (production)
npm run migrate      # Apply ./drizzle/*.sql migrations
npm run db:generate  # drizzle-kit generate (when you change schema.ts)
npm run typecheck    # tsc --noEmit
```

## Notes & next steps

- **Direct publishing to FB / IG / TikTok** isn't included — wire up the Meta
  Graph API and TikTok Content Posting API after adding OAuth.
- **Stricter lip-sync** for avatar mode (Hedra / SadTalker / Synthesia-style):
  add a dedicated provider in `src/lib/openrouter.ts` and branch on
  `req.avatar` in `pipeline.ts`.
- **Seedance 1.5 Pro** generates audio + lip-sync natively — set
  `OPENROUTER_SEEDANCE_MODEL=bytedance/seedance-1-5-pro` to use it.
- **Auth** isn't wired. Add NextAuth + per-user job ownership before going
  public so people don't burn your API credits.
