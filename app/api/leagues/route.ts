import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getLeague } from "@/lib/sleeper";

export const runtime = "nodejs";

const PostBodySchema = z.object({
  leagueId: z.string().min(5).max(64),
});

export async function GET() {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("user_leagues")
    .select("id, sleeper_league_id, league_name, season, created_at")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ leagues: data });
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { leagueId } = parsed.data;

  let league;
  try {
    league = await getLeague(leagueId);
  } catch {
    return Response.json(
      { error: "sleeper_unreachable", message: "Could not reach Sleeper to verify the league." },
      { status: 502 },
    );
  }
  if (!league) {
    return Response.json(
      { error: "league_not_found", message: "No Sleeper league with that ID." },
      { status: 404 },
    );
  }

  const { data, error } = await supabase
    .from("user_leagues")
    .upsert(
      {
        user_id: user.id,
        sleeper_league_id: leagueId,
        league_name: league.name,
        season: league.season,
      },
      { onConflict: "user_id,sleeper_league_id" },
    )
    .select("id, sleeper_league_id, league_name, season, created_at")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ league: data });
}
