import {
  getLeague,
  getLeagueUsers,
  getRosters,
  getMatchups,
  getTransactions,
} from "./sleeper";
import { getPlayersDict } from "./playersCache";
import { enrichWeek, type EnrichedWeek } from "./enrich";
import { generateNarrative, generateAudioScript, type Tone } from "./narrative";
import { synthesizeSpeech, DEFAULT_VOICE, isValidVoice } from "./tts";

export type RecapInput = {
  leagueId: string;
  season: string;
  week: number;
  tone?: Tone;
  useEmojis?: boolean;
  trashTalk?: boolean;
};

export type RecapResult = {
  leagueId: string;
  season: string;
  week: number;
  leagueName: string;
  markdown: string;
  structured: EnrichedWeek;
  modelId: string;
  tone: Tone;
  useEmojis: boolean;
  trashTalk: boolean;
};

export type AudioRecapInput = RecapInput & { voice?: string };

export type AudioRecapResult = {
  leagueId: string;
  season: string;
  week: number;
  leagueName: string;
  script: string;
  audio: Buffer;
  mimeType: "audio/wav";
  voice: string;
  structured: EnrichedWeek;
  modelId: string;
};

/**
 * Shared first half of every recap: fetch the league + enrich the week.
 * Throws on a missing league or an unplayed week.
 */
async function enrichRecapWeek(
  input: RecapInput,
): Promise<{ leagueName: string; enriched: EnrichedWeek }> {
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

  return { leagueName: league.name, enriched };
}

export async function generateRecap(input: RecapInput): Promise<RecapResult> {
  const { leagueId, season, week, tone, useEmojis, trashTalk } = input;
  const { leagueName, enriched } = await enrichRecapWeek(input);

  const narrative = await generateNarrative(enriched, { tone, useEmojis, trashTalk });

  return {
    leagueId,
    season,
    week,
    leagueName,
    markdown: narrative.markdown,
    structured: enriched,
    modelId: narrative.modelId,
    tone: narrative.tone,
    useEmojis: narrative.useEmojis,
    trashTalk: narrative.trashTalk,
  };
}

export async function generateAudioRecap(input: AudioRecapInput): Promise<AudioRecapResult> {
  const { leagueId, season, week, tone, trashTalk } = input;
  const voice = isValidVoice(input.voice) ? input.voice : DEFAULT_VOICE;

  const { leagueName, enriched } = await enrichRecapWeek(input);

  const { script, modelId } = await generateAudioScript(enriched, { tone, trashTalk });
  const { audio, mimeType } = await synthesizeSpeech(script, voice);

  return {
    leagueId,
    season,
    week,
    leagueName,
    script,
    audio,
    mimeType,
    voice,
    structured: enriched,
    modelId,
  };
}
