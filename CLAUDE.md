# CLAUDE.md

Guidance for any AI assistant (or returning human) working on this repo. Keep this file updated as the project evolves.

## What this project is

`heygen-clone` is a HeyGen-style web app for generating AI social-media + YouTube videos. The app has grown into six discrete flows, each with its own page:

- **Studio (`/`)** — short-form reels (TikTok / IG Reels / Shorts). One script → voiceover + AI video clip(s) in 9:16, 1:1, 16:9, optional cover image, optional background music.
- **YouTube (`/youtube`)** — long-form slideshow videos via a 4-step wizard (Script → Template → Customization → Review). **Plan with Claude** splits the script into scenes; per-scene images come from Pexels OR AI generators (Kie.ai Nano Banana, FLUX, etc.). Final composite is 1920×1080 MP4 with Ken Burns + optional Suno music + per-scene silence padding.
- **ViMax (`/vimax`)** — "idea in, short video out". Single short prompt → Claude plans a 30-60s 9:16 story (scene texts + image keywords) → renders with the same long-form pipeline shape.
- **Agent (`/agent`)** — port of the [youtube-automation-agent](https://github.com/darkzOGx/youtube-automation-agent) flow. Four sequential Claude steps: brainstorm topics → full script → SEO metadata → thumbnail. Thumbnail can come from OpenRouter (Gemini Image / FLUX) or direct OpenAI (`gpt-image-1`). Result hands off to the YouTube wizard via `sessionStorage`.
- **Tasks (`/tasks`)** — channel CRUD: name, niche, schedule (Daily/Weekly/Monthly), run time (HH:MM, **server timezone — UTC on Railway**), target length, style. Each channel auto-fires at its `runTime` via a 60s scheduler tick inside the worker process; the **Fire now** button is the same entry point on demand. The full pipeline: brainstorm 5 ideas → Claude picks best → write script → plan scenes → Pexels → longform render (no title card) → SEO + OpenRouter thumbnail (Gemini Image / FLUX) → upload to the connected YouTube account (Education category, `en` default + audio language) → SRT captions in English. The latest video URL + status is shown per-row.

Plus `/jobs` (history) and `/settings` (provider keys + model defaults).

## Stack

- **Next.js 15 + App Router + TypeScript** (single app for UI, API routes, and the worker entry point).
- **Tailwind v3** for styling. **Light theme** — white background, ink primary text, muted secondary, accent gradient (`#5a3cf6 → #0db8e6`).
- **Postgres** (job store, settings, channels) via **drizzle-orm + postgres-js**.
- **Redis + BullMQ** for the job queue.
- **Cloudflare R2** (S3-compatible) for generated assets.
- **ffmpeg** for long-form compositing (provisioned by `nixpacks.toml`).

External providers, all swappable from `/settings`:

| Provider | Used for | Where |
| --- | --- | --- |
| ElevenLabs | TTS narration | `src/lib/elevenlabs.ts` |
| OpenRouter | Veo 3.1 / Seedance 2.0 video (async `/api/v1/videos`), image-gen (Gemini Image / FLUX via `/chat/completions` `modalities:["image","text"]`) | `src/lib/openrouter.ts`, `src/lib/agent-thumbnail.ts` |
| Kie.ai (common API) | Seedance/Kling/Nano Banana via `/jobs/createTask` | `src/lib/kie.ts` |
| Kie.ai (Suno) | Background music via dedicated `/api/v1/generate` | `src/lib/kie-suno.ts` |
| Pexels | Free stock B-roll for the YouTube + Agent flows | `src/lib/stock.ts` |
| Unsplash | Stock photos (additional source for YouTube scenes) | `src/lib/stock.ts` |
| Anthropic | "Plan with Claude" — scene planner, full-script writer, brainstorm, SEO metadata, ViMax story plan, refine script. Default model `claude-opus-4-7`. | `src/lib/anthropic.ts`, `src/lib/agent.ts` |
| OpenAI (direct) | Alternative thumbnail/image path using `gpt-image-1` | `src/lib/openai-image.ts` |

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
                └────┬────┘  │ settings │
                     │       │+channels)│
                     │       └────▲─────┘
                     ▼            │
              ┌─────────────┐     │
              │   Worker    │─────┘  (also writes asset URLs)
              │ on Railway  │
              │  (ffmpeg)   │
              └──────┬──────┘
                     │
                     ▼
                ┌────────┐
                │   R2   │  (audio.mp3, video.mp4, image.jpg, music.mp3, thumbnails/*)
                └────────┘
```

**Two long-running processes** share Postgres + Redis:

- `web` → `npm run start` (`next start`). Serves the UI and API. Runs `npm run migrate` first via `railway.json` start command.
- `worker` → `npm run worker` (`tsx src/worker/index.ts`). Reads from BullMQ, dispatches by `request.kind`, writes asset URLs back to Postgres. `lockDuration: 45 min` (long-form ffmpeg can take a while).

## Repo layout

```
src/
  app/
    page.tsx                       Studio (short-form reels)
    youtube/page.tsx               Long-form YouTube wizard
    vimax/page.tsx                 ViMax (idea → short video)
    agent/page.tsx                 Agent (brainstorm → script → SEO → thumbnail)
    tasks/page.tsx                 Tasks (channels CRUD + fire-now)
    settings/page.tsx              Provider keys + model defaults
    jobs/page.tsx                  Job history (all kinds)
    layout.tsx                     Top-nav (Studio / YouTube / ViMax / Agent / Tasks / Jobs / Settings)
    api/
      voices/route.ts              GET ElevenLabs voices
      jobs/route.ts                POST/GET reel jobs
      jobs/[id]/route.ts           GET single job
      youtube/jobs/route.ts        POST long-form jobs
      youtube/plan/route.ts        POST: Claude scene planner (no images — just text + keywords)
      youtube/image/route.ts       POST: per-scene image render (Pexels OR AI) called from the client
      youtube/refine/route.ts      POST: Claude tightens an existing script for length/tone
      vimax/plan/route.ts          POST: Claude plans a short vertical story from an idea
      vimax/image/route.ts         POST: per-scene image for ViMax
      agent/brainstorm/route.ts    POST: Claude generates topic ideas
      agent/script/route.ts        POST: Claude writes the full script
      agent/seo/route.ts           POST: Claude writes SEO title/description/tags
      agent/thumbnail/route.ts     POST: thumbnail via OpenRouter OR direct OpenAI
      channels/route.ts            GET (list) + POST (create) channels
      channels/[id]/route.ts       DELETE channel
      channels/[id]/fire/route.ts  POST: run Agent pipeline now + enqueue longform job
      stock/search/route.ts        GET /api/stock/search?q=… (Pexels/Unsplash proxy)
      settings/route.ts            GET (masked) / POST settings
      health/route.ts              Diagnostics: queue counts + worker count
  components/
    StudioForm.tsx                 Reels editor (client)
    YouTubeStudio.tsx              Legacy long-form editor (kept for reference)
    YouTubeWizard.tsx              4-step long-form wizard (active)
    ViMaxStudio.tsx                ViMax UI
    AgentWorkflow.tsx              Agent UI (4 sequential steps + provider toggle)
    TasksTable.tsx                 Channels CRUD + Fire-now
    SettingsForm.tsx               Settings UI
    StylePicker.tsx                Reusable visual-style preset picker
  db/
    client.ts                      Lazy drizzle proxy (so `next build` works
                                     without DATABASE_URL)
    schema.ts                      jobs + app_settings + channels tables
    migrate.ts                     SQL-file migration runner (tracked in _migrations)
  drizzle/
    0001_init.sql                  jobs table + indexes
    0002_settings.sql              app_settings key/value table
    0003_image_music.sql           music_url column + image/music statuses
    0004_channels.sql              channels table (id, name, niche, created_at)
    0005_channels_schedule.sql     channels.schedule (text, default 'daily') +
                                     channels.run_time (text, default '09:00')
  lib/
    env.ts                         Typed env access
    settings.ts                    DB-first / env-fallback resolver, 60s cache
    types.ts                       AnyJobRequest discriminated union
                                     (reel | longform)
    catalog.ts                     Curated model dropdowns + STYLE_PRESETS
    jobs.ts                        Postgres-backed job store
    channels.ts                    Postgres-backed channels store
    queue.ts                       BullMQ queue (single 'video-generation' queue)
    pipeline.ts                    Reel pipeline (TTS → video → image → music)
    longform.ts                    Long-form pipeline (per-scene TTS → ffmpeg)
                                     — Suno music is non-fatal; failure becomes
                                     a warning appended to the final message
    scenes.ts                      Offline script-to-scenes splitter (fallback
                                     when the user clicks "Parse offline")
    ffmpeg.ts                      Spawns ffmpeg/ffprobe directly. Ken Burns
                                     zoompan + per-scene `apad=pad_dur=N`
                                     trailing silence for breath between scenes.
    stock.ts                       Pexels + Unsplash search wrappers
    openrouter.ts                  OpenRouter video API + authed download helper
    kie.ts                         Kie.ai common task API
    kie-suno.ts                    Kie.ai Suno music dedicated endpoint
    elevenlabs.ts                  ElevenLabs TTS + voice listing
    anthropic.ts                   planLongformScenes, planVimaxStory, refineScript
                                     — forced tool-use, adaptive thinking,
                                     ephemeral cache on system prompts
    agent.ts                       brainstormTopics, writeFullScript, generateSeoMetadata
                                     — Agent-page Claude helpers, same pattern
    agent-thumbnail.ts             OpenRouter image-gen (Gemini Image / FLUX)
                                     via /chat/completions modalities, mirrors to R2
    openai-image.ts                Direct OpenAI gpt-image-1 thumbnail path
    r2.ts                          S3 client for Cloudflare R2
  worker/
    index.ts                       BullMQ worker; dispatches by request.kind
                                     (reel | longform). 45-min lock.
nixpacks.toml                      Adds ffmpeg to the build image
railway.json                       Web service config (migrate + next start)
railway.worker.json                Worker service config (npm run worker)
```

## Job model

Reel and long-form jobs share the `jobs` table. Discriminated by `request.kind`:

- `kind === "reel"` (or undefined for legacy rows) → `GenerateRequest` shape, runs `runPipeline`.
- `kind === "longform"` → `LongformRequest` shape, runs `runLongformPipeline`.

Status enum: `queued | tts | video | image | music | compositing | uploading | done | error`.

Output columns:
- `audio_url` — voiceover (always set after TTS for reel/longform)
- `video_url` — primary video; for reels it's the chosen-aspect master, for long-form it's the final composited MP4
- `thumbnail_url` — optional cover image (reels) / generated thumbnail (Agent)
- `music_url` — optional background music
- `variants` — jsonb map of aspect → URL (reels only)

## Channels model

`channels` table is independent of `jobs`. Columns:

- `id` uuid PK
- `name` text — display name (e.g. "Quiet Money")
- `niche` text — short description the agent grounds the script in
- `schedule` text — `daily` | `weekly` | `monthly` (validated at API/Zod layer; text in DB so we can add cadences without migrating)
- `run_time` text — `HH:MM` 24h
- `created_at` timestamptz

`POST /api/channels/:id/fire` is the on-demand entry point. The same `runChannelAgentAndQueue` helper (`src/lib/channel-runner.ts`) is invoked by the in-process scheduler tick that runs inside the worker (`src/worker/index.ts`) every 60s. The scheduler computes due channels via `getDueChannels(now)` — cadence + `lastRunAt` + today's `runTime`. Set `SCHEDULER_DISABLED=1` to disable the tick on ad-hoc workers. After the longform job finishes, the worker's post-publish hook calls `runChannelAutoPublish`, which generates SEO with Claude and uploads to the connected YouTube account; the resulting watch URL is written back to the channel row (`last_youtube_url`).

## Settings system

Each provider key is stored in the `app_settings` table (`src/lib/settings.ts`). `resolved.*` getters read DB → env → throw with a pointer to `/settings`. Cached in-process for 60s, so the worker picks up UI edits within a minute without a restart.

Secrets are never returned to the browser. `GET /api/settings` masks them as `••••<last4>`.

Recognized keys (all editable on `/settings`):

| Key | Notes |
| --- | --- |
| `openrouter_api_key`, `openrouter_seedance_model`, `openrouter_veo_model`, `openrouter_thumbnail_model` | OpenRouter videos + Agent thumbnail (default `google/gemini-2.5-flash-image-preview`) |
| `elevenlabs_api_key`, `elevenlabs_default_model` | ElevenLabs TTS |
| `kie_api_key`, `kie_default_video_model`, `kie_default_image_model`, `kie_default_music_model` | Kie.ai |
| `pexels_api_key`, `unsplash_api_key` | Stock photos |
| `anthropic_api_key`, `anthropic_default_model` | Claude (default `claude-opus-4-7`) |
| `openai_api_key` | Direct OpenAI for `gpt-image-1` thumbnails |
| `google_api_key` | Reserved for Google direct |

## Provider quirks worth knowing

These are real bugs hit during development. Don't repeat them.

1. **OpenRouter video URLs are auth-gated.** `unsigned_urls[0]` looks like `https://openrouter.ai/api/v1/videos/{id}/content?index=0`. A plain `fetch` 401s. Use `downloadVideo()` in `src/lib/openrouter.ts`, which adds the Bearer header.

2. **Kie.ai has two API surfaces.** Don't conflate them:
   - **Common task API** (`POST /jobs/createTask` → poll `/jobs/recordInfo`). Slugs use slash form: `bytedance/seedance-2`, `kling-3.0/video`, `google/nano-banana-pro`. Body fields are camelCase (`aspectRatio`, `generateAudio`).
   - **Dedicated APIs** for Veo (`/veo3-api/*`), Suno music (`/api/v1/generate`), Flux Kontext (`/flux-kontext-api/*`). Different endpoints, different schemas. We only support Suno today; Veo via Kie is a TODO. For Veo, fall back to the OpenRouter route in the catalog.

3. **Suno model tokens use underscores.** `V5`, `V4_5PLUS`, `V4_5`, `V4`, `V3_5` — not `suno-v5`. When the user provides a music prompt, set `customMode: true` and route the prompt to `style`. Suno failure is **non-fatal** in `longform.ts`: the job still finishes; a warning is appended to the final message.

4. **ElevenLabs free tier blocks data-center IPs** with a `detected_unusual_activity` 401. The user must be on the $5 Starter plan or higher when running on Railway. There's nothing technical to fix.

5. **OpenRouter video result extraction.** The walker in `src/lib/openrouter.ts` (`extractVideoUrl` / `unsigned_urls[0]`) is conservative — it expects `unsigned_urls`. If a future model returns a different shape, adjust there.

6. **Anthropic SDK's `zodOutputFormat` requires Zod 4.** The helper at `@anthropic-ai/sdk/helpers/zod` imports from `zod/v4` and reads `.def` on the schema. Our project pins Zod 3 (`._def`), so the helper crashes at runtime with `Cannot read properties of undefined (reading 'def')`. We avoid it entirely — `src/lib/anthropic.ts` + `src/lib/agent.ts` use **forced tool-use** (hand-written JSON schemas for tools like `submit_scene_plan`, `submit_topic_ideas`, `submit_full_script`, `submit_seo_metadata`, `submit_vimax_story`, `submit_refined_script`) for structured output. Don't try to "simplify" by switching back to `zodOutputFormat` without first upgrading Zod project-wide.

7. **Anthropic: `thinking` is incompatible with forced `tool_choice`.** Both `tool_choice: {type: "tool", name: ...}` and `tool_choice: {type: "any"}` count as "forces tool use" and the API returns `400 Thinking may not be enabled when tool_choice forces tool use`. To keep adaptive thinking on, use `tool_choice: {type: "auto"}` and rely on the system prompt to make tool use reliable. As a safety net, every Claude helper falls back to scanning text blocks for a JSON object if Claude returns text instead of calling the tool.

8. **Long-form jobs that look "stuck on compositing" are usually waiting on Suno.** Background music generation can take 1–3 min and `runLongformPipeline` `await`s it before ffmpeg starts. `longform.ts` sets status to `"music" / "Waiting for background music…"` during that phase. If a job genuinely hangs, check `/api/health` — `workers: 0` means the worker isn't connected to Redis.

9. **OpenRouter does NOT proxy OpenAI DALL-E.** Their image-gen surface is Gemini Image (Nano Banana) and FLUX only. If you want DALL-E-grade thumbnails, use the direct-OpenAI path in `src/lib/openai-image.ts`.

10. **OpenAI fully retired DALL-E 3 on the standard images endpoint.** The migration to `gpt-image-1` was a three-step error cascade — record them so the next person doesn't repeat:
    - `400 Unknown parameter: 'style'` → `gpt-image-1` doesn't accept `style`. Remove.
    - `400 Unknown parameter: 'response_format'` → `gpt-image-1` returns base64 by default in `data[0].b64_json`. Remove the field; accept either `b64_json` or `url` in the response handler.
    - `400 The model 'dall-e-3' does not exist` → swap model to `gpt-image-1`. Size enum changes too: `1536x1024` (16:9) / `1024x1024` (1:1) / `1024x1536` (9:16) — *not* `1792x1024`. Quality is `"high"` / `"medium"` / `"low"` — *not* `"hd"`.

11. **Per-scene image rendering must not block the API route.** A 25-scene script run inline through `/api/youtube/plan` will blow past Railway's serverless timeout for AI image-gen (or even slow Pexels CDN edges). The pattern: `/plan` returns scenes with text + keywords only; the client fires `/api/youtube/image` per scene with **bounded concurrency** (4 for AI, 8 for Pexels) and shows per-scene retry buttons. Same split applies to ViMax.

12. **Don't ever `Promise.all` more than ~10 provider calls.** Use a small concurrency limiter (`pLimit`-style, or a simple worker loop) instead. The serverless timeout / provider rate limit will bite you long before `Promise.all` settles.

13. **Zod `scenes.max(80)` was too low.** Long-form schemas now allow up to 300 scenes. When wizard-side validation fails, surface the Zod issue (path + message) — not a bare "Invalid request" — so the user can tell which field is over-limit.

## Local development

```bash
cp .env.example .env   # fill in OPENROUTER, ELEVENLABS, KIE, PEXELS, UNSPLASH, ANTHROPIC, OPENAI, R2, DATABASE_URL, REDIS_URL
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

Provider keys (OpenRouter / ElevenLabs / Kie / Pexels / Unsplash / Anthropic / OpenAI) can be set as env vars OR pasted into `/settings` after first deploy. The Settings page wins over env.

**Diagnose with `GET /api/health`** — returns BullMQ queue counts + connected worker count + a human-readable hint. If `workers: 0`, the worker service isn't running or its `REDIS_URL` is wrong.

## Gotchas that wasted time during the build

Pre-emptively avoid these in future work:

- **`tsx` and `typescript` must live in `dependencies`, not `devDependencies`.** Railway deploys with `NPM_CONFIG_PRODUCTION=true` which omits dev deps; the worker (`tsx src/worker/index.ts`) and the migrator (`tsx src/db/migrate.ts`) need them at runtime.
- **Don't double-run `npm ci`.** Nixpacks already runs it in the install phase. `railway.json` had `buildCommand: "npm ci && npm run build"`, which raced the cached `node_modules/.cache` mount and EBUSY'd. `buildCommand` should just be `npm run build`.
- **Pin Node 20+** via `engines.node` in `package.json` and `.nvmrc`. AWS SDK v3 requires Node 20.
- **Drizzle `db` client must be lazy.** `next build` collects route metadata, which imports the DB module. If that module reads `DATABASE_URL` eagerly, the build crashes in CI. Use the `Proxy` in `src/db/client.ts`.
- **Don't bypass Railway's security scanner.** Critical/High CVEs (Next.js, drizzle-orm) block deploys. Bump versions in `package.json` and let `npm install` regenerate the lockfile.
- **ffmpeg installs via `nixpacks.toml`** — `aptPkgs = ["ffmpeg"]`. The default Nixpacks Node provider is preserved.
- **Node 20 `fetch` has no default timeout.** Long-form B-roll downloads used to hang indefinitely on a slow Pexels CDN edge. `longform.ts/downloadToFile` wraps every `fetch` in a `Promise.race` against a 30 s wall-clock timeout that aborts the controller AND rejects the outer promise — using only `AbortController` isn't enough because Node's fetch occasionally hangs on `arrayBuffer()` after the abort signal fires.

## Conventions

- Lazy provider auth. `authHeaders()` is async and reads from `resolved.*` so DB settings take effect.
- Per-job R2 prefixes: `audio/{jobId}.mp3`, `video/{jobId}/9x16.mp4`, `image/{jobId}/cover.jpg`, `music/{jobId}/track.mp3`, `longform/{jobId}/final.mp4`, `thumbnails/agent-{slug}.png`.
- Job status updates flow through `setStatus(jobId, status, progress, message)` so the UI can poll `/api/jobs/[id]` and show progress without server-sent events.
- Tailwind utility classes only; reusable patterns live in `globals.css` (`.card`, `.input`, `.btn-primary`, `.chip`, `.label`, `.select`). Theme tokens are `ink` / `muted` / `soft` / `border` / `accent` / `accent2` / `success` / `danger` — defined in `tailwind.config.ts`. Don't hard-code dark hex codes.
- Errors propagated as exceptions inside the pipeline; `failJob(jobId, err)` is the only place that catches them. Don't try/catch inside individual provider helpers — let the orchestrator surface them.
- **Anthropic API**: default to `claude-opus-4-7` with adaptive thinking + `effort: "high"` and `cache_control: { type: "ephemeral" }` on the system prompt. Use forced tool-use (`tool_choice: {type: "auto"}` plus a single tool that the model is instructed to call) for structured output — never fall back to JSON-mode-via-prefill (deprecated on 4.6+ and returns 400). Always include a text-block-JSON fallback for robustness.
- **Split plan from render.** API routes that emit `N` provider calls should return early with a structural plan; the client then fans out per-item render calls with bounded concurrency and surfaces per-item retry. This is how `/api/youtube/plan` + `/api/youtube/image` and `/api/vimax/plan` + `/api/vimax/image` avoid serverless timeouts.
- **Cross-page hand-off via `sessionStorage`.** The Agent page writes `sessionStorage.youtubeWizardPrefill` before navigating to `/youtube`; the wizard reads + clears it on mount. Keep keys namespaced (`<feature>WizardPrefill`).

## Open follow-ups (good first tasks)

Roughly ordered by user value × cost.

1. **Auth.** Wrap the app in NextAuth before exposing publicly so visitors can't burn the API budget. Store user_id on jobs/channels and scope queries by it.
2. **Per-channel timezone for `runTime`.** The scheduler ticks against the server's local clock (UTC on Railway). Add a `timezone` column on `channels` and resolve the HH:MM in that zone so daily runs land at the user's intended local time.
3. **Per-channel agent defaults.** Voice ID, music prompt, image source (Pexels vs AI), thumbnail provider, privacy status. Today `runChannelAgentAndQueue` hard-codes "first ElevenLabs voice, Pexels landscape, no music, no title card, public on upload".
4. **Channel run history.** Today only the most-recent run snapshot lives on `channels.last_*`. Add a `channel_runs` table for the full audit trail (jobs link via `jobs.channel_id`).
4. **Subtitle burn-in for long-form.** Pass the per-scene narration text to ffmpeg as ASS/SRT and apply the `subtitles=` filter during the per-scene render.
5. **Direct publish to YouTube / FB / IG / TikTok.** OAuth + each platform's Content Posting API. Build it as a post-job action ("publish to YouTube") and a `published_at` column on jobs.
6. **Replace polling with SSE.** Right now the UI polls `/api/jobs/[id]` every 2–3 seconds. SSE or websockets would be cleaner.
7. **Veo via Kie.ai dedicated endpoint.** Today Veo on Kie returns "model not supported" through the common API. Build a tiny client for `/veo3-api/generate` and route Veo entries in `catalog.ts` through it.
8. **Promote the in-memory settings cache to Redis pub/sub.** A 60-second TTL is fine, but Redis would let key changes propagate immediately to the worker.
9. **Multi-region R2 / signed-URL helpers.** Currently public R2 bucket; for stricter privacy use the presigned-URL fallback in `r2.ts publicUrl()`.
10. **Upgrade Zod 3 → Zod 4** so we can use `@anthropic-ai/sdk/helpers/zod`'s `zodOutputFormat` and `messages.parse()` instead of hand-written JSON schema for structured output. Audit `z.*` usage first — most of our code is `z.object`/`z.string`/`z.enum`, all stable across the major bump.

## When in doubt

- For a deploy issue: hit `/api/health` first.
- For a "stuck job" issue: the worker isn't running, or its `REDIS_URL` doesn't match the web's. If the worker IS connected and the job sits at `compositing`, it's almost certainly waiting on Suno music — Suno failure is non-fatal now, so check the final job message for a music warning.
- For a "model not supported" Kie.ai 422: the slug in `catalog.ts` doesn't match the actual marketplace name. Check `https://docs.kie.ai/market/<provider>/<model>`.
- For a 401 fetching an OpenRouter content URL: you need the auth header. Use `downloadVideo()`.
- For a `Cannot read properties of undefined (reading 'def')` from Anthropic: don't reach for `zodOutputFormat`. The project is on Zod 3; use forced tool-use (existing pattern in `src/lib/anthropic.ts` / `src/lib/agent.ts`).
- For a `400 Thinking may not be enabled when tool_choice forces tool use`: change `tool_choice` to `{type: "auto"}`. `any` and `tool` both count as "forced".
- For an OpenAI `400 Unknown parameter` or `400 The model 'dall-e-3' does not exist`: see provider-quirk #10. The repo is already migrated to `gpt-image-1`; if you re-introduce `dall-e-3` it will fail.
- For "Step 4 in the YouTube wizard didn't render all images" / "ViMax shows no image": per-scene render is fan-out from the client. Check the browser network tab — Pexels CDN edges occasionally 502; click the per-scene retry button or lower the concurrency. Do not fold image-gen back into the `/plan` route.
- For "Tasks Fire-now took too long / timed out": the route is synchronous through Claude script + Claude plan + N Pexels searches, ~30-60s on a 5-min script. If you need it faster, cap `lengthMin`, or refactor to enqueue a single "agent run" job and let the worker do the Claude calls. Today's flow is dead-simple by design.
