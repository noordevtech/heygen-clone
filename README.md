# AI Reels Studio

A HeyGen-style web app for generating short social-media videos (TikTok / Reels /
Feed) from a script. Built with Next.js 15 (App Router) + TypeScript + Tailwind.

**Pipeline per job**

1. **Voiceover** — script is sent to **ElevenLabs** TTS.
2. **Video** — a visual prompt (auto-derived from the script or user-overridden)
   is sent to **Seedance 2** or **Veo 3** via **OpenRouter**. When the
   *talking-head avatar* option is enabled, the voiceover URL is also passed so
   the model can lip-sync.
3. **Multi-aspect masters** — the same prompt is rendered in `9:16`, `1:1` and
   `16:9` so you have one master per platform.
4. **Storage** — every asset (audio + video variants) is uploaded to a
   **Cloudflare R2** bucket. Either configure a public URL prefix
   (`R2_PUBLIC_BASE_URL`) or rely on the auto-generated 7-day presigned URLs.

## Quickstart

```bash
cp .env.example .env
# fill in OPENROUTER_API_KEY, ELEVENLABS_API_KEY, R2_* creds
npm install
npm run dev
# open http://localhost:3000
```

## Required environment variables

| Var | Why |
| --- | --- |
| `OPENROUTER_API_KEY` | Calls Seedance 2 / Veo 3 |
| `OPENROUTER_SEEDANCE_MODEL` | Override the Seedance slug (default `bytedance/seedance-1-pro`) |
| `OPENROUTER_VEO_MODEL` | Override the Veo slug (default `google/veo-3`) |
| `ELEVENLABS_API_KEY` | Voice listing + TTS |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | Cloudflare R2 |
| `R2_PUBLIC_BASE_URL` | (Optional) Public CDN/custom domain for R2 |

## Deploying on Railway

1. Push this repo and create a new Railway project from it.
2. Railway picks up `railway.json` and runs `npm ci && npm run build`, then
   `npm run start`. The app binds to `$PORT`.
3. Add the env vars above in the Railway **Variables** tab. The app will read
   them at runtime.

> **Why Railway and not Cloudflare Pages?** Video generation is long-running
> and R2 uploads use the AWS SDK which needs a Node runtime. Pages/Workers can
> still serve the marketing site or a static frontend, but the API routes need
> a real Node host (Railway, Fly, Render, or Vercel with a longer timeout).

## Architecture

```
src/
  app/
    page.tsx                   # Studio (form + live job preview)
    jobs/page.tsx              # Job history
    api/
      voices/route.ts          # GET ElevenLabs voices
      jobs/route.ts            # POST -> create job, GET -> list
      jobs/[id]/route.ts       # GET single job
  components/
    StudioForm.tsx             # Script + voice + model + aspect picker
  lib/
    env.ts                     # Typed env access
    types.ts                   # Job + Request types
    elevenlabs.ts              # voices + TTS
    openrouter.ts              # Seedance / Veo wrapper
    r2.ts                      # S3-compatible client for Cloudflare R2
    jobs.ts                    # In-memory job store
    pipeline.ts                # TTS -> video -> upload orchestration
```

## Notes & next steps

- **Job store is in-memory.** Promote to Postgres + Redis (BullMQ) before any
  multi-instance deployment so jobs survive restarts and can be processed by
  workers.
- **OpenRouter video response shape varies per provider.** `extractVideoUrl()`
  in `src/lib/openrouter.ts` greedily finds the first `https://…mp4` URL in
  the response. If your provider returns base64 or a different shape, adjust
  there.
- **Direct publishing to FB / IG / TikTok** isn't included yet — wire up the
  Meta Graph API and TikTok Content Posting API once OAuth is added.
- **Avatar lip-sync** is delegated to the video model via `audioUrl`. Veo 3
  handles native audio; for stricter lip-sync (Hedra / SadTalker / Synthesia
  style) add a dedicated provider in `src/lib/openrouter.ts`.
