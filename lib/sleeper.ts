const BASE = "https://api.sleeper.app/v1";

export type League = {
  league_id: string;
  name: string;
  season: string;
  season_type: string;
  status: string;
  total_rosters: number;
  playoff_week_start?: number;
  scoring_settings?: Record<string, number>;
  settings?: Record<string, unknown>;
};

export type LeagueUser = {
  user_id: string;
  display_name: string | null;
  avatar?: string | null;
  metadata?: { team_name?: string | null } | null;
};

export type RosterSettings = {
  wins?: number;
  losses?: number;
  ties?: number;
  fpts?: number;
  fpts_decimal?: number;
  fpts_against?: number;
  fpts_against_decimal?: number;
  waiver_budget_used?: number;
  waiver_position?: number;
};

export type Roster = {
  roster_id: number;
  owner_id: string | null;
  starters: string[] | null;
  players: string[] | null;
  settings?: RosterSettings | null;
};

export type Matchup = {
  roster_id: number;
  matchup_id: number | null;
  points: number;
  players: string[] | null;
  starters: string[] | null;
  players_points?: Record<string, number> | null;
  starters_points?: number[] | null;
  custom_points?: number | null;
};

export type DraftPickRef = {
  season: string;
  round: number;
  roster_id: number;
  previous_owner_id?: number;
  owner_id?: number;
};

export type Transaction = {
  type: "trade" | "waiver" | "free_agent" | string;
  transaction_id: string;
  status: string;
  status_updated?: number;
  created?: number;
  roster_ids: number[];
  consenter_ids?: number[];
  adds?: Record<string, number> | null;
  drops?: Record<string, number> | null;
  draft_picks?: DraftPickRef[];
  waiver_budget?: { sender: number; receiver: number; amount: number }[];
  settings?: { waiver_bid?: number } | null;
  leg?: number;
};

export type LeagueInfo = {
  leagueId: string;
  name: string;
  season: string;
  seasonType: string;
  status: string;
  totalRosters: number;
  playoffWeekStart: number | null;
};

export type NflState = {
  week: number;
  season: string;
  season_type: string;
  leg: number;
  display_week?: number;
};

export type Player = {
  player_id: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  position?: string | null;
  team?: string | null;
  status?: string | null;
  injury_status?: string | null;
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { accept: "application/json" },
    next: { revalidate: 30 },
  });
  if (!res.ok) {
    throw new Error(`Sleeper ${path} -> ${res.status}`);
  }
  return (await res.json()) as T;
}

export function getLeague(id: string) {
  return get<League | null>(`/league/${id}`);
}
export function getLeagueUsers(id: string) {
  return get<LeagueUser[]>(`/league/${id}/users`);
}
export function getRosters(id: string) {
  return get<Roster[]>(`/league/${id}/rosters`);
}
export function getMatchups(id: string, week: number) {
  return get<Matchup[]>(`/league/${id}/matchups/${week}`);
}
export function getTransactions(id: string, week: number) {
  return get<Transaction[]>(`/league/${id}/transactions/${week}`);
}
export function getTradedPicks(id: string) {
  return get<DraftPickRef[]>(`/league/${id}/traded_picks`);
}
export function getNflState() {
  return get<NflState>(`/state/nfl`);
}
export function getAllPlayers() {
  return get<Record<string, Player>>(`/players/nfl`);
}

export function rosterFpts(r: Roster): number {
  const s = r.settings ?? {};
  const whole = s.fpts ?? 0;
  const dec = (s.fpts_decimal ?? 0) / 100;
  return whole + dec;
}

export function rosterFptsAgainst(r: Roster): number {
  const s = r.settings ?? {};
  const whole = s.fpts_against ?? 0;
  const dec = (s.fpts_against_decimal ?? 0) / 100;
  return whole + dec;
}
