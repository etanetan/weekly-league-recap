import {
  getLeague,
  getLeagueUsers,
  getRosters,
  getMatchups,
  getTransactions,
} from "./sleeper";
import { getPlayersDict } from "./playersCache";
import { enrichWeek, type EnrichedWeek } from "./enrich";
import { generateNarrative } from "./narrative";

export type RecapInput = {
  leagueId: string;
  season: string;
  week: number;
};

export type RecapResult = {
  leagueId: string;
  season: string;
  week: number;
  leagueName: string;
  markdown: string;
  structured: EnrichedWeek;
  modelId: string;
};

export async function generateRecap(input: RecapInput): Promise<RecapResult> {
  const { leagueId, season, week } = input;

  const [league, users, rosters, matchups, transactions, players] = await Promise.all([
    getLeague(leagueId),
    getLeagueUsers(leagueId),
    getRosters(leagueId),
    getMatchups(leagueId, week),
    getTransactions(leagueId, week),
    getPlayersDict(),
  ]);

  if (!league) {
    throw new Error(`League ${leagueId} not found`);
  }
  if (league.season !== season) {
    // sleeper /league returns the CURRENT season — for prior seasons the
    // caller should supply a league_id from that season. Warn and continue.
    console.warn(
      `League ${leagueId} reports season ${league.season} but caller asked for ${season}. Sleeper league IDs are per-season; results may not match expectations.`,
    );
  }
  if (!matchups || matchups.length === 0) {
    throw new Error(`No matchups found for week ${week} (season ${season}). The week may not have been played yet.`);
  }

  const enriched = enrichWeek({
    league,
    users,
    rosters,
    matchups,
    transactions: transactions ?? [],
    players,
    week,
  });

  const { markdown, modelId } = await generateNarrative(enriched);

  return {
    leagueId,
    season,
    week,
    leagueName: league.name,
    markdown,
    structured: enriched,
    modelId,
  };
}
