import { NextRequest } from "next/server";
import { getLeague, type LeagueInfo } from "@/lib/sleeper";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id || id.length < 5 || id.length > 64 || !/^\d+$/.test(id)) {
    return Response.json({ error: "invalid_league_id" }, { status: 400 });
  }

  let league;
  try {
    league = await getLeague(id);
  } catch {
    return Response.json(
      { error: "sleeper_unreachable", message: "Could not reach Sleeper." },
      { status: 502 },
    );
  }
  if (!league) {
    return Response.json(
      { error: "league_not_found", message: "No Sleeper league with that ID." },
      { status: 404 },
    );
  }

  const body: LeagueInfo = {
    leagueId: league.league_id,
    name: league.name,
    season: league.season,
    seasonType: league.season_type,
    status: league.status,
    totalRosters: league.total_rosters,
    playoffWeekStart: league.playoff_week_start ?? null,
  };
  return Response.json(body);
}
