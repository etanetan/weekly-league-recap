import {
  getLeague,
  getLeagueUsers,
  getRosters,
  getMatchups,
  getTransactions,
  getWinnersBracket,
  type BracketMatch,
} from "./sleeper";
import { getPlayersDict } from "./playersCache";
import {
  enrichWeek,
  enrichRange,
  summarizePlayoffs,
  type EnrichedWeek,
  type EnrichedRange,
  type TradeSummary,
  type WaiverSummary,
} from "./enrich";
import {
  generateNarrative,
  generateRangeNarrative,
  type Tone,
} from "./narrative";

export type RecapInput = {
  leagueId: string;
  season: string;
  tone?: Tone;
  useEmojis?: boolean;
  trashTalk?: boolean;
  customInstructions?: string;
} & (
  | { mode?: "week"; week: number }
  | { mode: "range"; fromWeek: number; toWeek: number }
);

export type RecapResult = {
  leagueId: string;
  season: string;
  leagueName: string;
  markdown: string;
  modelId: string;
  tone: Tone;
  useEmojis: boolean;
  trashTalk: boolean;
} & (
  | { mode: "week"; week: number; structured: EnrichedWeek }
  | { mode: "range"; fromWeek: number; toWeek: number; structured: EnrichedRange }
);

// The bracket endpoint returns 200 with [] when a league has no bracket yet,
// so a thrown error usually means the league or network is genuinely broken.
// We still defang it to null so a temporarily-flaky bracket call can't take
// down the whole recap.
async function safeGetBracket(leagueId: string): Promise<BracketMatch[] | null> {
  try {
    const data = await getWinnersBracket(leagueId);
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

export async function generateRecap(input: RecapInput): Promise<RecapResult> {
  const { leagueId, season, tone, useEmojis, trashTalk, customInstructions } = input;
  const isRange = input.mode === "range";

  if (isRange) {
    const { fromWeek, toWeek } = input;
    if (fromWeek > toWeek) {
      throw new Error("fromWeek must be <= toWeek");
    }
    if (toWeek - fromWeek + 1 > 18) {
      throw new Error("Range too large (max 18 weeks)");
    }

    const weekNums = Array.from({ length: toWeek - fromWeek + 1 }, (_, i) => fromWeek + i);

    const [league, users, rosters, players, winnersBracket, ...weekData] = await Promise.all([
      getLeague(leagueId),
      getLeagueUsers(leagueId),
      getRosters(leagueId),
      getPlayersDict(),
      safeGetBracket(leagueId),
      ...weekNums.flatMap((w) => [getMatchups(leagueId, w), getTransactions(leagueId, w)]),
    ]);

    if (!league) throw new Error(`League ${leagueId} not found`);

    const enrichedWeeks: EnrichedWeek[] = [];
    const allTrades: TradeSummary[] = [];
    const allWaivers: WaiverSummary[] = [];
    const seenTradeIds = new Set<string>();

    for (let i = 0; i < weekNums.length; i++) {
      const week = weekNums[i];
      const matchups = weekData[i * 2] as Awaited<ReturnType<typeof getMatchups>>;
      const transactions = (weekData[i * 2 + 1] as Awaited<ReturnType<typeof getTransactions>>) ?? [];
      if (!matchups || matchups.length === 0) continue;

      const enriched = enrichWeek({
        league,
        users,
        rosters,
        matchups,
        transactions,
        players,
        week,
        winnersBracket,
      });
      enrichedWeeks.push(enriched);
      for (const t of enriched.trades) {
        if (seenTradeIds.has(t.id)) continue;
        seenTradeIds.add(t.id);
        allTrades.push(t);
      }
      for (const w of enriched.waivers) allWaivers.push(w);
    }

    if (enrichedWeeks.length === 0) {
      throw new Error(
        `No matchups found for weeks ${fromWeek}-${toWeek} (season ${season}). The range may not have been played yet.`,
      );
    }

    // Only attach playoff results when the range actually reaches into the
    // playoff window — avoids the prompt mentioning a championship in a
    // mid-regular-season catch-up.
    const playoffStart = league.playoff_week_start ?? null;
    const rangeTouchesPlayoffs = playoffStart != null && toWeek >= playoffStart;
    const playoffResults = rangeTouchesPlayoffs
      ? summarizePlayoffs(winnersBracket, rosters, users, league)
      : null;

    const enriched = enrichRange({
      league,
      weeks: enrichedWeeks,
      trades: allTrades,
      waivers: allWaivers,
      fromWeek,
      toWeek,
      playoffResults,
    });

    const narrative = await generateRangeNarrative(enriched, {
      tone,
      useEmojis,
      trashTalk,
      customInstructions,
    });

    return {
      mode: "range",
      leagueId,
      season,
      fromWeek,
      toWeek,
      leagueName: league.name,
      markdown: narrative.markdown,
      structured: enriched,
      modelId: narrative.modelId,
      tone: narrative.tone,
      useEmojis: narrative.useEmojis,
      trashTalk: narrative.trashTalk,
    };
  }

  const { week } = input;

  const [league, users, rosters, matchups, transactions, players, winnersBracket] = await Promise.all([
    getLeague(leagueId),
    getLeagueUsers(leagueId),
    getRosters(leagueId),
    getMatchups(leagueId, week),
    getTransactions(leagueId, week),
    getPlayersDict(),
    safeGetBracket(leagueId),
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
    winnersBracket,
  });

  const narrative = await generateNarrative(enriched, {
    tone,
    useEmojis,
    trashTalk,
    customInstructions,
  });

  return {
    mode: "week",
    leagueId,
    season,
    week,
    leagueName: league.name,
    markdown: narrative.markdown,
    structured: enriched,
    modelId: narrative.modelId,
    tone: narrative.tone,
    useEmojis: narrative.useEmojis,
    trashTalk: narrative.trashTalk,
  };
}
