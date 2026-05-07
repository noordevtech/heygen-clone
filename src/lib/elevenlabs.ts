import { resolved } from "./settings";
import type { Voice } from "./types";

const BASE = "https://api.elevenlabs.io/v1";

async function authHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  return {
    "xi-api-key": await resolved.elevenlabsApiKey(),
    ...extra,
  };
}

export async function listVoices(): Promise<Voice[]> {
  const res = await fetch(`${BASE}/voices`, { headers: await authHeaders(), cache: "no-store" });
  if (!res.ok) throw new Error(`ElevenLabs voices failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { voices: Array<Voice & { voice_id: string }> };
  return json.voices.map((v) => ({
    id: v.voice_id,
    name: v.name,
    category: v.category,
    preview_url: v.preview_url,
    labels: v.labels,
  }));
}

export type TtsOptions = {
  voiceId: string;
  text: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
};

export async function generateTts(opts: TtsOptions): Promise<{ audio: Buffer; contentType: string }> {
  const url = `${BASE}/text-to-speech/${encodeURIComponent(opts.voiceId)}?output_format=mp3_44100_128`;
  const body = {
    text: opts.text,
    model_id: opts.modelId ?? (await resolved.elevenlabsDefaultModel()),
    voice_settings: {
      stability: opts.stability ?? 0.45,
      similarity_boost: opts.similarityBoost ?? 0.8,
      style: opts.style ?? 0.0,
      use_speaker_boost: true,
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: await authHeaders({ "content-type": "application/json", accept: "audio/mpeg" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ElevenLabs TTS failed: ${res.status} ${await res.text()}`);
  const audio = Buffer.from(await res.arrayBuffer());
  return { audio, contentType: res.headers.get("content-type") ?? "audio/mpeg" };
}
