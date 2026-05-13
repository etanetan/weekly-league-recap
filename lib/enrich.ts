import type {
  League,
  LeagueUser,
  Roster,
  Matchup,
  Transaction,
  Player,
} from "./sleeper";
import { rosterFpts, rosterFptsAgainst } from "./sleeper";
import { playerName } from "./playersCache";

export type TeamSummary = {
  rosterId: number;
  ownerId: string | null;
  teamName: string;
  displayName: string;
  record: { wins: number; losses: number; ties: number };
  seasonFpts: number;
  seasonFptsAgainst: number;
};

export type WeekTeam = {
  rosterId: number;
  teamName: string;
  displayName: string;
  score: number;
  opponentRosterId: number | null;
  opponentTeamName: string | null;
  opponentScore: number | null;
  result: "W" | "L" | "T" | null;
  margin: number | null;
  topStarter: { playerId: string; name: string; position: string; points: number } | null;
  worstStarter: { playerId: string; name: string; position: string; points: number } | null;
};

export type TradeSummary = {
  id: string;
  status: string;
  parties: { rosterId: number; teamName: string }[];
  movement: {
    rosterId: number;
    teamName: string;
    received: { playerId: string; name: string; position: string }[];
    sent: { playerId: string; name: string; position: string }[];
    receivedPicks: string[];
    sentPicks: string[];
    faabReceived: number;
    faabSent: number;
  }[];
};

export type WaiverSummary = {
  id: string;
  status: string;
  rosterId: number;
  teamName: string;
  adds: { playerId: string; name: string; position: string }[];
  drops: { playerId: string; name: string; position: string }[];
  faabBid: number | null;
};

export type WeekNotables = {
  topScore: { teamName: string; score: number } | null;
  lowestScore: { teamName: string; score: number } | null;
  closestGame:
    | { home: string; away: string; margin: number; homeScore: number; awayScore: number }
    | null;
  biggestBlowout:
    | { winner: string; loser: string; margin: number; winnerScore: number; loserScore: number }
    | null;
  playerOfTheWeek:
    | { playerId: string; name: string; position: string; points: number; rosteredBy: string }
    | null;
};

export type EnrichedWeek = {
  league: {
    name: string;
    season: string;
    week: number;
    totalRosters: number;
    isPlayoffWeek: boolean;
  };
  teams: WeekTeam[];
  standings: TeamSummary[];
  notables: WeekNotables;
  trades: TradeSummary[];
  waivers: WaiverSummary[];
};

export type RangeWeekDigest = {
  week: number;
  isPlayoffWeek: boolean;
  notables: WeekNotables;
  results: {
    home: { teamName: string; score: number };
    away: { teamName: string; score: number };
    margin: number;
  }[];
};

export type RangeTeamTotals = {
  rosterId: number;
  teamName: string;
  displayName: string;
  recordInRange: { wins: number; losses: number; ties: number };
  totalScore: number;
  avgScore: number;
  bestWeek: { week: number; score: number } | null;
  worstWeek: { week: number; score: number } | null;
};

export type EnrichedRange = {
  league: {
    name: string;
    season: string;
    fromWeek: number;
    toWeek: number;
    totalRosters: number;
    seasonType: string;
    status: string;
    playoffWeekStart: number | null;
  };
  weeks: RangeWeekDigest[];
  teamTotals: RangeTeamTotals[];
  standings: TeamSummary[];
  trades: TradeSummary[];
  waivers: WaiverSummary[];
};

function teamNameFor(user: LeagueUser | undefined): { team: string; display: string } {
  const display = user?.display_name ?? "Unknown";
  const team = user?.metadata?.team_name?.trim() || display;
  return { team, display };
}

function namePlayer(
  players: Record<string, Player>,
  playerId: string,
): { playerId: string; name: string; position: string } {
  const p = players[playerId];
  return {
    playerId,
    name: playerName(p, playerId),
    position: p?.position ?? "—",
  };
}

function pickLabel(p: { season: string; round: number; roster_id: number }): string {
  return `${p.season} R${p.round} (originally R${p.roster_id})`;
}

export function enrichWeek(input: {
  league: League;
  users: LeagueUser[];
  rosters: Roster[];
  matchups: Matchup[];
  transactions: Transaction[];
  players: Record<string, Player>;
  week: number;
}): EnrichedWeek {
  const { league, users, rosters, matchups, transactions, players, week } = input;

  const usersById = new Map<string, LeagueUser>(users.map((u) => [u.user_id, u]));
  const rostersById = new Map<number, Roster>(rosters.map((r) => [r.roster_id, r]));

  const teamNameForRoster = (rosterId: number) => {
    const r = rostersById.get(rosterId);
    const u = r?.owner_id ? usersById.get(r.owner_id) : undefined;
    return teamNameFor(u);
  };

  // ---- per-team weekly objects ----
  const matchupsByPairId = new Map<number, Matchup[]>();
  for (const m of matchups) {
    if (m.matchup_id == null) continue;
    const arr = matchupsByPairId.get(m.matchup_id) ?? [];
    arr.push(m);
    matchupsByPairId.set(m.matchup_id, arr);
  }

  const teams: WeekTeam[] = matchups.map((m) => {
    const pair = m.matchup_id != null ? matchupsByPairId.get(m.matchup_id) ?? [m] : [m];
    const opp = pair.find((x) => x.roster_id !== m.roster_id) ?? null;
    const { team, display } = teamNameForRoster(m.roster_id);
    const oppNames = opp ? teamNameForRoster(opp.roster_id) : null;

    let result: "W" | "L" | "T" | null = null;
    let margin: number | null = null;
    if (opp) {
      if (m.points > opp.points) {
        result = "W";
        margin = m.points - opp.points;
      } else if (m.points < opp.points) {
        result = "L";
        margin = opp.points - m.points;
      } else {
        result = "T";
        margin = 0;
      }
    }

    let topStarter: WeekTeam["topStarter"] = null;
    let worstStarter: WeekTeam["worstStarter"] = null;
    if (m.starters && m.starters_points) {
      let bestIdx = -1;
      let worstIdx = -1;
      for (let i = 0; i < m.starters.length; i++) {
        const pid = m.starters[i];
        if (!pid || pid === "0") continue;
        const pts = m.starters_points[i] ?? 0;
        if (bestIdx === -1 || pts > (m.starters_points[bestIdx] ?? 0)) bestIdx = i;
        if (worstIdx === -1 || pts < (m.starters_points[worstIdx] ?? 0)) worstIdx = i;
      }
      if (bestIdx >= 0) {
        const np = namePlayer(players, m.starters[bestIdx]);
        topStarter = { ...np, points: m.starters_points[bestIdx] ?? 0 };
      }
      if (worstIdx >= 0 && worstIdx !== bestIdx) {
        const np = namePlayer(players, m.starters[worstIdx]);
        worstStarter = { ...np, points: m.starters_points[worstIdx] ?? 0 };
      }
    }

    return {
      rosterId: m.roster_id,
      teamName: team,
      displayName: display,
      score: m.points ?? 0,
      opponentRosterId: opp?.roster_id ?? null,
      opponentTeamName: oppNames?.team ?? null,
      opponentScore: opp?.points ?? null,
      result,
      margin,
      topStarter,
      worstStarter,
    };
  });

  // ---- standings (from current roster settings) ----
  const standings: TeamSummary[] = rosters
    .map((r) => {
      const u = r.owner_id ? usersById.get(r.owner_id) : undefined;
      const { team, display } = teamNameFor(u);
      const s = r.settings ?? {};
      return {
        rosterId: r.roster_id,
        ownerId: r.owner_id,
        teamName: team,
        displayName: display,
        record: { wins: s.wins ?? 0, losses: s.losses ?? 0, ties: s.ties ?? 0 },
        seasonFpts: rosterFpts(r),
        seasonFptsAgainst: rosterFptsAgainst(r),
      };
    })
    .sort((a, b) => {
      if (b.record.wins !== a.record.wins) return b.record.wins - a.record.wins;
      return b.seasonFpts - a.seasonFpts;
    });

  // ---- notables ----
  let topScore: EnrichedWeek["notables"]["topScore"] = null;
  let lowestScore: EnrichedWeek["notables"]["lowestScore"] = null;
  for (const t of teams) {
    if (!topScore || t.score > topScore.score) topScore = { teamName: t.teamName, score: t.score };
    if (!lowestScore || t.score < lowestScore.score)
      lowestScore = { teamName: t.teamName, score: t.score };
  }

  let closestGame: EnrichedWeek["notables"]["closestGame"] = null;
  let biggestBlowout: EnrichedWeek["notables"]["biggestBlowout"] = null;
  const seenPair = new Set<number>();
  for (const m of matchups) {
    if (m.matchup_id == null || seenPair.has(m.matchup_id)) continue;
    seenPair.add(m.matchup_id);
    const pair = matchupsByPairId.get(m.matchup_id) ?? [];
    if (pair.length !== 2) continue;
    const [a, b] = pair;
    const margin = Math.abs(a.points - b.points);
    const winner = a.points >= b.points ? a : b;
    const loser = a.points >= b.points ? b : a;
    const wNames = teamNameForRoster(winner.roster_id);
    const lNames = teamNameForRoster(loser.roster_id);
    if (!closestGame || margin < closestGame.margin) {
      closestGame = {
        home: wNames.team,
        away: lNames.team,
        margin,
        homeScore: winner.points,
        awayScore: loser.points,
      };
    }
    if (!biggestBlowout || margin > biggestBlowout.margin) {
      biggestBlowout = {
        winner: wNames.team,
        loser: lNames.team,
        margin,
        winnerScore: winner.points,
        loserScore: loser.points,
      };
    }
  }

  let playerOfTheWeek: EnrichedWeek["notables"]["playerOfTheWeek"] = null;
  for (const m of matchups) {
    if (!m.starters || !m.starters_points) continue;
    for (let i = 0; i < m.starters.length; i++) {
      const pid = m.starters[i];
      if (!pid || pid === "0") continue;
      const pts = m.starters_points[i] ?? 0;
      if (!playerOfTheWeek || pts > playerOfTheWeek.points) {
        const np = namePlayer(players, pid);
        const { team } = teamNameForRoster(m.roster_id);
        playerOfTheWeek = { ...np, points: pts, rosteredBy: team };
      }
    }
  }

  // ---- trades & waivers ----
  const trades: TradeSummary[] = [];
  const waivers: WaiverSummary[] = [];

  for (const tx of transactions) {
    if (tx.type === "trade") {
      const movement = tx.roster_ids.map((rid) => {
        const { team } = teamNameForRoster(rid);
        const received = Object.entries(tx.adds ?? {})
          .filter(([, addedToRid]) => addedToRid === rid)
          .map(([pid]) => namePlayer(players, pid));
        const sent = Object.entries(tx.drops ?? {})
          .filter(([, droppedFromRid]) => droppedFromRid === rid)
          .map(([pid]) => namePlayer(players, pid));
        const receivedPicks =
          tx.draft_picks?.filter((p) => p.owner_id === rid).map(pickLabel) ?? [];
        const sentPicks =
          tx.draft_picks?.filter((p) => p.previous_owner_id === rid && p.owner_id !== rid).map(pickLabel) ?? [];
        const faabReceived =
          tx.waiver_budget?.filter((w) => w.receiver === rid).reduce((a, b) => a + b.amount, 0) ?? 0;
        const faabSent =
          tx.waiver_budget?.filter((w) => w.sender === rid).reduce((a, b) => a + b.amount, 0) ?? 0;
        return { rosterId: rid, teamName: team, received, sent, receivedPicks, sentPicks, faabReceived, faabSent };
      });
      trades.push({
        id: tx.transaction_id,
        status: tx.status,
        parties: tx.roster_ids.map((rid) => ({ rosterId: rid, teamName: teamNameForRoster(rid).team })),
        movement,
      });
    } else if (tx.type === "waiver" || tx.type === "free_agent") {
      const rid = tx.roster_ids[0];
      if (rid == null) continue;
      const adds = Object.keys(tx.adds ?? {}).map((pid) => namePlayer(players, pid));
      const drops = Object.keys(tx.drops ?? {}).map((pid) => namePlayer(players, pid));
      waivers.push({
        id: tx.transaction_id,
        status: tx.status,
        rosterId: rid,
        teamName: teamNameForRoster(rid).team,
        adds,
        drops,
        faabBid: tx.settings?.waiver_bid ?? null,
      });
    }
  }

  waivers.sort((a, b) => (b.faabBid ?? 0) - (a.faabBid ?? 0));

  return {
    league: {
      name: league.name,
      season: league.season,
      week,
      totalRosters: league.total_rosters,
      isPlayoffWeek:
        league.playoff_week_start != null && week >= league.playoff_week_start,
    },
    teams,
    standings,
    notables: { topScore, lowestScore, closestGame, biggestBlowout, playerOfTheWeek },
    trades,
    waivers,
  };
}

// Aggregate multiple weekly enrichments into a compact range summary suitable
// for a "catch-up" or offseason recap covering more than one week.
export function enrichRange(input: {
  league: League;
  weeks: EnrichedWeek[];
  trades: TradeSummary[];
  waivers: WaiverSummary[];
  fromWeek: number;
  toWeek: number;
}): EnrichedRange {
  const { league, weeks, trades, waivers, fromWeek, toWeek } = input;

  const weekDigests: RangeWeekDigest[] = weeks.map((w) => {
    const seenPair = new Set<number>();
    const results: RangeWeekDigest["results"] = [];
    for (const t of w.teams) {
      if (t.opponentRosterId == null) continue;
      const pairKey = Math.min(t.rosterId, t.opponentRosterId) * 10_000 + Math.max(t.rosterId, t.opponentRosterId);
      if (seenPair.has(pairKey)) continue;
      seenPair.add(pairKey);
      const opp = w.teams.find((x) => x.rosterId === t.opponentRosterId);
      if (!opp) continue;
      const home = t.score >= (opp.score ?? 0) ? t : opp;
      const away = home === t ? opp : t;
      results.push({
        home: { teamName: home.teamName, score: home.score },
        away: { teamName: away.teamName, score: away.score },
        margin: Math.abs(home.score - away.score),
      });
    }
    return {
      week: w.league.week,
      isPlayoffWeek: w.league.isPlayoffWeek,
      notables: w.notables,
      results,
    };
  });

  // Per-team aggregate over the range
  const totalsByRoster = new Map<number, RangeTeamTotals>();
  for (const w of weeks) {
    for (const t of w.teams) {
      let agg = totalsByRoster.get(t.rosterId);
      if (!agg) {
        agg = {
          rosterId: t.rosterId,
          teamName: t.teamName,
          displayName: t.displayName,
          recordInRange: { wins: 0, losses: 0, ties: 0 },
          totalScore: 0,
          avgScore: 0,
          bestWeek: null,
          worstWeek: null,
        };
        totalsByRoster.set(t.rosterId, agg);
      }
      agg.totalScore += t.score;
      if (t.result === "W") agg.recordInRange.wins += 1;
      else if (t.result === "L") agg.recordInRange.losses += 1;
      else if (t.result === "T") agg.recordInRange.ties += 1;
      if (!agg.bestWeek || t.score > agg.bestWeek.score) {
        agg.bestWeek = { week: w.league.week, score: t.score };
      }
      if (!agg.worstWeek || t.score < agg.worstWeek.score) {
        agg.worstWeek = { week: w.league.week, score: t.score };
      }
    }
  }
  const teamTotals = Array.from(totalsByRoster.values()).map((t) => ({
    ...t,
    avgScore: weeks.length > 0 ? t.totalScore / weeks.length : 0,
  }));

  // Standings: take the most recent week's standings (final-state snapshot from rosters)
  const standings = weeks.length > 0 ? weeks[weeks.length - 1].standings : [];

  return {
    league: {
      name: league.name,
      season: league.season,
      fromWeek,
      toWeek,
      totalRosters: league.total_rosters,
      seasonType: league.season_type,
      status: league.status,
      playoffWeekStart: league.playoff_week_start ?? null,
    },
    weeks: weekDigests,
    teamTotals,
    standings,
    trades,
    waivers,
  };
}
