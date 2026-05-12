import { NextRequest } from "next/server";
import { z } from "zod";
import { generateRecap } from "@/lib/recap";
import { getSupabaseServer } from "@/lib/supabase/server";
import { checkAnonRateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  leagueId: z.string().min(5).max(64),
  season: z.string().regex(/^\d{4}$/),
  week: z.number().int().min(1).max(22),
  tone: z.enum(["beat-reporter", "broadcaster", "hype"]).optional(),
  useEmojis: z.boolean().optional(),
  trashTalk: z.boolean().optional(),
});

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
  const { leagueId, season, week, tone, useEmojis, trashTalk } = parsed.data;

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
    result = await generateRecap({ leagueId, season, week, tone, useEmojis, trashTalk });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "recap_failed", message }, { status: 502 });
  }

  if (user) {
    const { data: saved, error } = await supabase
      .from("recaps")
      .insert({
        user_id: user.id,
        sleeper_league_id: leagueId,
        season,
        week,
        content_markdown: result.markdown,
        content_json: result.structured,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to persist recap:", error);
    }

    return Response.json({
      id: saved?.id ?? null,
      leagueName: result.leagueName,
      season: result.season,
      week: result.week,
      markdown: result.markdown,
      structured: result.structured,
      modelId: result.modelId,
      persisted: !!saved,
    });
  }

  return Response.json({
    id: null,
    leagueName: result.leagueName,
    season: result.season,
    week: result.week,
    markdown: result.markdown,
    structured: result.structured,
    modelId: result.modelId,
    persisted: false,
  });
}
