import { NextRequest } from "next/server";
import { z } from "zod";
import { generateRecap, generateAudioRecap } from "@/lib/recap";
import { getSupabaseServer } from "@/lib/supabase/server";
import { checkAnonRateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

const SHARE_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

const BodySchema = z.object({
  leagueId: z.string().min(5).max(64),
  season: z.string().regex(/^\d{4}$/),
  week: z.number().int().min(1).max(22),
  format: z.enum(["text", "audio"]).optional(),
  tone: z.enum(["beat-reporter", "broadcaster", "hype"]).optional(),
  useEmojis: z.boolean().optional(),
  trashTalk: z.boolean().optional(),
  voice: z.string().optional(),
});

type Supabase = Awaited<ReturnType<typeof getSupabaseServer>>;
type User = NonNullable<Awaited<ReturnType<Supabase["auth"]["getUser"]>>["data"]["user"]>;

/**
 * Map a recap-generation failure to an HTTP response. A Gemini quota error
 * (free tier is only a few requests/minute) becomes a friendly 429 instead of
 * a raw 502 so the form can tell the user to retry shortly.
 */
function recapErrorResponse(err: unknown): Response {
  const message = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number })?.status;
  const quotaHit =
    status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(message);
  if (quotaHit) {
    return Response.json(
      {
        error: "ai_busy",
        message:
          "Recaps are at capacity right now (AI free-tier limit). Please try again in a minute.",
      },
      { status: 429 },
    );
  }
  return Response.json({ error: "recap_failed", message }, { status: 502 });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { leagueId, season, week, format, tone, useEmojis, trashTalk, voice } = parsed.data;

  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const ip = getClientIp(req);
    const limit = await checkAnonRateLimit(ip);
    if (!limit.success) {
      return Response.json(
        {
          error: "rate_limited",
          message: "You've used all 3 free recaps for today. Sign up for unlimited recaps.",
          reset: limit.reset,
        },
        { status: 429 },
      );
    }
  }

  if (format === "audio") {
    return handleAudioRecap({ supabase, user, leagueId, season, week, tone, trashTalk, voice });
  }

  return handleTextRecap({ supabase, user, leagueId, season, week, tone, useEmojis, trashTalk });
}

// ---------------------------------------------------------------------------
// Text recap — JSON response, persisted (best-effort) for signed-in users.
// ---------------------------------------------------------------------------
async function handleTextRecap(args: {
  supabase: Supabase;
  user: User | null;
  leagueId: string;
  season: string;
  week: number;
  tone?: "beat-reporter" | "broadcaster" | "hype";
  useEmojis?: boolean;
  trashTalk?: boolean;
}) {
  const { supabase, user, leagueId, season, week, tone, useEmojis, trashTalk } = args;

  let result;
  try {
    result = await generateRecap({ leagueId, season, week, tone, useEmojis, trashTalk });
  } catch (err) {
    return recapErrorResponse(err);
  }

  let savedId: string | null = null;
  if (user) {
    const { data: saved, error } = await supabase
      .from("recaps")
      .insert({
        user_id: user.id,
        sleeper_league_id: leagueId,
        season,
        week,
        format: "text",
        content_markdown: result.markdown,
        content_json: result.structured,
      })
      .select("id")
      .single();
    if (error) console.error("Failed to persist recap:", error);
    savedId = saved?.id ?? null;
  }

  return Response.json({
    format: "text",
    id: savedId,
    leagueName: result.leagueName,
    season: result.season,
    week: result.week,
    markdown: result.markdown,
    structured: result.structured,
    modelId: result.modelId,
    persisted: !!savedId,
  });
}

// ---------------------------------------------------------------------------
// Audio recap — the response body is the raw WAV binary; metadata rides in
// X-Recap-* headers. For signed-in users the file is persisted to a private
// bucket with an atomic, retry-safe write (row first, deterministic key,
// rollback on upload failure).
// ---------------------------------------------------------------------------
async function handleAudioRecap(args: {
  supabase: Supabase;
  user: User | null;
  leagueId: string;
  season: string;
  week: number;
  tone?: "beat-reporter" | "broadcaster" | "hype";
  trashTalk?: boolean;
  voice?: string;
}) {
  const { supabase, user, leagueId, season, week, tone, trashTalk, voice } = args;

  let recap;
  try {
    recap = await generateAudioRecap({ leagueId, season, week, tone, trashTalk, voice });
  } catch (err) {
    return recapErrorResponse(err);
  }

  const headers = new Headers({
    "content-type": "audio/wav",
    "cache-control": "no-store",
    "x-recap-league": encodeURIComponent(recap.leagueName),
    "x-recap-season": recap.season,
    "x-recap-week": String(recap.week),
    "x-recap-voice": recap.voice,
    "x-recap-persisted": "false",
  });

  const audioResponse = () => new Response(new Uint8Array(recap.audio), { headers });

  if (!user) {
    return audioResponse();
  }

  // 1. Insert the recap row first so the storage key can be derived from its id.
  const { data: row, error: insertErr } = await supabase
    .from("recaps")
    .insert({
      user_id: user.id,
      sleeper_league_id: leagueId,
      season,
      week,
      format: "audio",
      audio_voice: recap.voice,
      content_markdown: recap.script,
      content_json: recap.structured,
    })
    .select("id")
    .single();

  if (insertErr || !row) {
    // Persistence failed — still hand back playable audio, just not saved.
    console.error("Failed to insert audio recap row:", insertErr);
    return audioResponse();
  }

  // 2. Upload to a deterministic key — a retry overwrites instead of orphaning.
  const path = `${user.id}/${row.id}.wav`;
  const { error: uploadErr } = await supabase.storage
    .from("recap-audio")
    .upload(path, recap.audio, { contentType: "audio/wav", upsert: true });

  if (uploadErr) {
    // 3a. Roll the row back so no half-saved recap lingers in history.
    console.error("Audio upload failed, rolling back recap row:", uploadErr);
    await supabase.from("recaps").delete().eq("id", row.id);
    return audioResponse();
  }

  // 3b. Finalize the row and mint an expiring signed URL for sharing.
  await supabase.from("recaps").update({ audio_path: path }).eq("id", row.id);
  const { data: signed } = await supabase.storage
    .from("recap-audio")
    .createSignedUrl(path, SHARE_URL_TTL_SECONDS);

  headers.set("x-recap-persisted", "true");
  headers.set("x-recap-id", row.id);
  if (signed?.signedUrl) headers.set("x-recap-share-url", signed.signedUrl);

  return audioResponse();
}
