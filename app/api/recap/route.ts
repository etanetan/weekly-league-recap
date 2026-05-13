import { NextRequest } from "next/server";
import { z } from "zod";
import { generateRecap } from "@/lib/recap";
import { getSupabaseServer } from "@/lib/supabase/server";
import { checkAnonRateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z
  .object({
    leagueId: z.string().min(5).max(64),
    season: z.string().regex(/^\d{4}$/),
    week: z.number().int().min(1).max(22).optional(),
    fromWeek: z.number().int().min(1).max(22).optional(),
    toWeek: z.number().int().min(1).max(22).optional(),
    tone: z.enum(["beat-reporter", "broadcaster", "hype"]).optional(),
    useEmojis: z.boolean().optional(),
    trashTalk: z.boolean().optional(),
  })
  .refine(
    (b) => (b.week != null) !== (b.fromWeek != null && b.toWeek != null),
    "Provide either { week } or { fromWeek, toWeek } (not both).",
  )
  .refine(
    (b) => b.fromWeek == null || b.toWeek == null || b.fromWeek <= b.toWeek,
    "fromWeek must be <= toWeek.",
  );

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
  const { leagueId, season, week, fromWeek, toWeek, tone, useEmojis, trashTalk } = parsed.data;

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

  let result;
  try {
    result =
      week != null
        ? await generateRecap({ mode: "week", leagueId, season, week, tone, useEmojis, trashTalk })
        : await generateRecap({
            mode: "range",
            leagueId,
            season,
            fromWeek: fromWeek!,
            toWeek: toWeek!,
            tone,
            useEmojis,
            trashTalk,
          });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "recap_failed", message }, { status: 502 });
  }

  // For range recaps, persist with week = toWeek so the row still satisfies
  // the schema; the structured json carries the from/to range info.
  const persistWeek = result.mode === "week" ? result.week : result.toWeek;

  const baseResponse = {
    leagueName: result.leagueName,
    season: result.season,
    markdown: result.markdown,
    structured: result.structured,
    modelId: result.modelId,
    mode: result.mode,
    week: result.mode === "week" ? result.week : result.toWeek,
    fromWeek: result.mode === "range" ? result.fromWeek : null,
    toWeek: result.mode === "range" ? result.toWeek : null,
  };

  if (user) {
    const { data: saved, error } = await supabase
      .from("recaps")
      .insert({
        user_id: user.id,
        sleeper_league_id: leagueId,
        season,
        week: persistWeek,
        content_markdown: result.markdown,
        content_json: result.structured,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to persist recap:", error);
    }

    return Response.json({ id: saved?.id ?? null, persisted: !!saved, ...baseResponse });
  }

  return Response.json({ id: null, persisted: false, ...baseResponse });
}
