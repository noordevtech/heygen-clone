# CLAUDE.md

Guidance for any AI assistant (or returning human) working on this repo. Keep this file updated as the project evolves.

## What this project is

`heygen-clone` is a HeyGen-style web app for generating AI social-media videos. Two separate flows:

- **Studio (`/`)** — short-form reels (TikTok / IG Reels / Shorts). One script → voiceover + AI video clip(s) in 9:16, 1:1, 16:9, optional cover image, optional background music.
- **YouTube (`/youtube`)** — long-form slideshow videos. One long script → split into scenes → per-scene Pexels B-roll + per-scene narration → ffmpeg-composited 1920×1080 MP4 with optional background music.

## Stack

- **Next.js 15 + App Router + TypeScript** (single app for UI, API routes, and the worker entry point).
- **Tailwind v3** for styling. Dark UI with accent gradient.
- **Postgres** (job store, settings) via **drizzle-orm + postgres-js**.
- **Redis + BullMQ** for the job queue.
- **Cloudflare R2** (S3-compatible) for generated assets.
- **ffmpeg** for long-form compositing (provisioned by `nixpacks.toml`).

External providers, all swappable from `/settings`:

| Provider | Used for | Where |
| --- | --- | --- |
| ElevenLabs | TTS narration | `src/lib/elevenlabs.ts` |
| OpenRouter | Veo 3.1 / Seedance 2.0 video (async `/api/v1/videos`) | `src/lib/openrouter.ts` |
| Kie.ai (common API) | Seedance/Kling/Nano Banana via `/jobs/createTask` | `src/lib/kie.ts` |
| Kie.ai (Suno) | Background music via dedicated `/api/v1/generate` | `src/lib/kie-suno.ts` |
| Pexels | Free stock B-roll for the YouTube page | `src/lib/stock.ts` |

## Architecture

```
                 ┌─────────────────┐
   browser ───▶  │  Next.js (web)  │  ← serves UI + API routes
                 │   on Railway    │
                 └─────┬───────┬───┘
                       │       │
                  enqueue   read/write
                       │       │
                       ▼       ▼
                ┌─────────┐  ┌──────────┐
                │  Redis  │  │ Postgres │
                │(BullMQ) │  │ (jobs +  │
                └────┬────┘  │ settings)│
                     │       └────▲─────┘
                     │            │
                     ▼            │
              ┌─────────────┐     │
              │   Worker    │─────┘  (also writes asset URLs)
              │ on Railway  │
              │  (ffmpeg)   │
              └──────┬──────┘
                     │
                     ▼
                ┌────────┐
                │   R2   │  (audio.mp3, video.mp4, image.jpg, music.mp3)
                └────────┘
```

**Two long-running processes** share Postgres + Redis:

- `web` → `npm run start` (`next start`). Serves the UI and API. Runs `npm run migrate` first via `railway.json` start command.
- `worker` → `npm run worker` (`tsx src/worker/index.ts`). Reads from BullMQ, dispatches by `request.kind`, writes asset URLs back to Postgres.

## Repo layout

```
src/
  app/
    page.tsx                       Studio (short-form reels)
    youtube/page.tsx               Long-form YouTube editor
    settings/page.tsx              Provider keys + model defaults
    jobs/page.tsx                  Job history (both kinds)
    api/
      voices/route.ts              GET ElevenLabs voices
      jobs/route.ts                POST/GET reel jobs
      jobs/[id]/route.ts           GET single job
      youtube/jobs/route.ts        POST long-form jobs
      stock/search/route.ts        GET /api/stock/search?q=… (Pexels proxy)
      settings/route.ts            GET (masked) / POST settings
      health/route.ts              Diagnostics: queue counts + worker count
  components/
    StudioForm.tsx                 Reels editor (client)
    YouTubeStudio.tsx              Long-form editor with scene cards
    SettingsForm.tsx               Settings UI
  db/
    client.ts                      Lazy drizzle proxy (so `next build` works
                                     without DATABASE_URL)
    schema.ts                      jobs + app_settings tables
    migrate.ts                     SQL-file migration runner
  drizzle/
    0001_init.sql                  jobs table + indexes
    0002_settings.sql              app_settings key/value table
    0003_image_music.sql           music_url column + image/music statuses
  lib/
    env.ts                         Typed env access
    settings.ts                    DB-first / env-fallback resolver, 60s cache
    types.ts                       AnyJobRequest = GenerateRequest | LongformRequest
    catalog.ts                     Curated model dropdowns (video/image/music)
    jobs.ts                        Postgres-backed job store
    queue.ts                       BullMQ queue (single 'video-generation' queue)
    pipeline.ts                    Reel pipeline (TTS → video → image → music)
    longform.ts                    Long-form pipeline (per-scene TTS → ffmpeg)
    scenes.ts                      Script-to-scenes splitter + keyword extractor
    ffmpeg.ts                      Spawns ffmpeg/ffprobe directly (no fluent-ffmpeg)
    stock.ts                       Pexels search wrapper
    openrouter.ts                  OpenRouter video API + authed download helper
    kie.ts                         Kie.ai common task API
    kie-suno.ts                    Kie.ai Suno music dedicated endpoint
    elevenlabs.ts                  ElevenLabs TTS + voice listing
    r2.ts                          S3 client for Cloudflare R2
  worker/
    index.ts                       BullMQ worker; dispatches by request.kind
nixpacks.toml                      Adds ffmpeg to the build image
railway.json                       Web service config (migrate + next start)
railway.worker.json                Worker service config (npm run worker)
```

## Job model

Both reel and long-form jobs live in the same `jobs` table. Discriminated by `request.kind`:

- `kind === "reel"` (or undefined for legacy rows) → `GenerateRequest` shape, runs `runPipeline`.
- `kind === "longform"` → `LongformRequest` shape, runs `runLongformPipeline`.

Status enum: `queued | tts | video | image | music | compositing | uploading | done | error`.

Output columns:
- `audio_url` — voiceover (always set after TTS)
- `video_url` — primary video; for reels it's the chosen-aspect master, for long-form it's the final composited MP4
- `thumbnail_url` — optional cover image (reels only currently)
- `music_url` — optional background music
- `variants` — jsonb map of aspect → URL (reels only)

## Settings system

Each provider key is stored in the `app_settings` table (`src/lib/settings.ts`). `resolved.*` getters read DB → env → throw with a pointer to `/settings`. Cached in-process for 60s, so the worker picks up UI edits within a minute without a restart.

Secrets are never returned to the browser. `GET /api/settings` masks them as `••••<last4>`.

## Provider quirks worth knowing

These are real bugs I hit during development. Don't repeat them.

1. **OpenRouter video URLs are auth-gated.** `unsigned_urls[0]` looks like `https://openrouter.ai/api/v1/videos/{id}/content?index=0`. A plain `fetch` 401s. Use `downloadVideo()` in `src/lib/openrouter.ts`, which adds the Bearer header.

2. **Kie.ai has two API surfaces.** Don't conflate them:
   - **Common task API** (`POST /jobs/createTask` → poll `/jobs/recordInfo`). Slugs use slash form: `bytedance/seedance-2`, `kling-3.0/video`, `google/nano-banana-pro`. Body fields are camelCase (`aspectRatio`, `generateAudio`).
   - **Dedicated APIs** for Veo (`/veo3-api/*`), Suno music (`/api/v1/generate`), Flux Kontext (`/flux-kontext-api/*`). Different endpoints, different schemas. We only support Suno today; Veo via Kie is a TODO. For Veo, fall back to the OpenRouter route in the catalog.

3. **Suno model tokens use underscores.** `V5`, `V4_5PLUS`, `V4_5`, `V4`, `V3_5` — not `suno-v5`.

4. **ElevenLabs free tier blocks data-center IPs** with a `detected_unusual_activity` 401. The user must be on the $5 Starter plan or higher when running on Railway. There's nothing technical to fix.

5. **OpenRouter video result extraction.** The walker in `src/lib/openrouter.ts` (`extractVideoUrl` / `unsigned_urls[0]`) is conservative — it expects `unsigned_urls`. If a future model returns a different shape, adjust there.

## Local development

```bash
cp .env.example .env   # fill in OPENROUTER, ELEVENLABS, KIE, PEXELS, R2, DATABASE_URL, REDIS_URL
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=reels postgres:16
docker run -d -p 6379:6379 redis:7
npm install
npm run migrate
npm run dev          # web on http://localhost:3000
npm run worker:dev   # worker, separate terminal (uses --env-file=.env)
```

For ffmpeg (long-form) you need `ffmpeg` in your local PATH: `brew install ffmpeg` / `apt install ffmpeg`.

## Deployment (Railway)

Four services in one Railway project:

1. **Postgres** (Railway plugin)
2. **Redis** (Railway plugin)
3. **web** — GitHub repo → uses `railway.json` → start command `npm run migrate && npm run start`
4. **worker** — same GitHub repo → must have **Custom Start Command** = `npm run worker` (or **Config-as-Code Path** = `railway.worker.json`). If this isn't configured, the service silently runs the web start command and BullMQ has no consumers.

**Same env vars on web and worker:**

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=...
R2_PUBLIC_BASE_URL=https://pub-...r2.dev
```

Provider keys (OpenRouter / ElevenLabs / Kie / Pexels) can be set as env vars OR pasted into `/settings` after first deploy. The Settings page wins over env.

**Diagnose with `GET /api/health`** — returns BullMQ queue counts + connected worker count + a human-readable hint. If `workers: 0`, the worker service isn't running or its `REDIS_URL` is wrong.

## Gotchas that wasted time during the first build

Pre-emptively avoid these in future work:

- **`tsx` and `typescript` must live in `dependencies`, not `devDependencies`.** Railway deploys with `NPM_CONFIG_PRODUCTION=true` which omits dev deps; the worker (`tsx src/worker/index.ts`) and the migrator (`tsx src/db/migrate.ts`) need them at runtime.
- **Don't double-run `npm ci`.** Nixpacks already runs it in the install phase. `railway.json` had `buildCommand: "npm ci && npm run build"`, which raced the cached `node_modules/.cache` mount and EBUSY'd. `buildCommand` should just be `npm run build`.
- **Pin Node 20+** via `engines.node` in `package.json` and `.nvmrc`. AWS SDK v3 requires Node 20.
- **Drizzle `db` client must be lazy.** `next build` collects route metadata, which imports the DB module. If that module reads `DATABASE_URL` eagerly, the build crashes in CI. Use the `Proxy` in `src/db/client.ts`.
- **Don't bypass Railway's security scanner.** Critical/High CVEs (Next.js, drizzle-orm) block deploys. Bump versions in `package.json` and let `npm install` regenerate the lockfile.
- **ffmpeg installs via `nixpacks.toml`** — `aptPkgs = ["ffmpeg"]`. The default Nixpacks Node provider is preserved.

## Conventions

- Lazy provider auth. `authHeaders()` is async and reads from `resolved.*` so DB settings take effect.
- Per-job R2 prefixes: `audio/{jobId}.mp3`, `video/{jobId}/9x16.mp4`, `image/{jobId}/cover.jpg`, `music/{jobId}/track.mp3`, `longform/{jobId}/final.mp4`.
- Job status updates flow through `setStatus(jobId, status, progress, message)` so the UI can poll `/api/jobs/[id]` and show progress without server-sent events.
- Tailwind utility classes only; reusable patterns live in `globals.css` (`.card`, `.input`, `.btn-primary`, `.chip`, `.label`).
- Errors propagated as exceptions inside the pipeline; `failJob(jobId, err)` is the only place that catches them. Don't try/catch inside individual provider helpers — let the orchestrator surface them.

## Open follow-ups (good first tasks)

Roughly ordered by user value × cost:

1. **Auth.** Wrap the app in NextAuth before exposing publicly so visitors can't burn the API budget. Store user_id on jobs and scope queries by it.
2. **Subtitle burn-in for long-form.** Pass the per-scene narration text to ffmpeg as ASS/SRT and apply the `subtitles=` filter during the per-scene render.
3. **Direct publish to FB / IG / TikTok.** OAuth + Meta Graph API + TikTok Content Posting API. Significant scope — build it as a post-job action ("publish to TikTok").
4. **Replace polling with SSE.** Right now the UI polls `/api/jobs/[id]` every 2–3 seconds. SSE or websockets would be cleaner.
5. **Per-scene AI image / video on the YouTube page.** Today only Pexels is wired in. Add a "Generate AI image" toggle per scene that hits Kie.ai instead.
6. **Veo via Kie.ai dedicated endpoint.** Today Veo on Kie returns "model not supported" through the common API. Build a tiny client for `/veo3-api/generate` and route Veo entries in `catalog.ts` through it.
7. **Promote the in-memory settings cache to Redis pub/sub.** A 60-second TTL is fine, but Redis would let key changes propagate immediately to the worker.
8. **Multi-region R2 / signed-URL helpers.** Currently public R2 bucket; for stricter privacy use the presigned-URL fallback in `r2.ts publicUrl()`.

## When in doubt

- For a deploy issue: hit `/api/health` first.
- For a "stuck job" issue: the worker isn't running, or its `REDIS_URL` doesn't match the web's. The web's queue insert is fine; that's why `health` shows the answer.
- For a "model not supported" Kie.ai 422: the slug in `catalog.ts` doesn't match the actual marketplace name. Check `https://docs.kie.ai/market/<provider>/<model>`.
- For a 401 fetching an OpenRouter content URL: you need the auth header. Use `downloadVideo()`.
