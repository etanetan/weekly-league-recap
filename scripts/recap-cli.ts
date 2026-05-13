// End-to-end recap CLI for local testing — bypasses Supabase entirely.
// Calls generateRecap() directly and prints the markdown to stdout.
//
// Usage (after `npm install`):
//   npm run recap:cli -- <leagueId> <week>          # single week
//   npm run recap:cli -- <leagueId> <from-to>       # range
//
// Examples:
//   npm run recap:cli -- 1234567890123456789 14
//   npm run recap:cli -- 1234567890123456789 11-14
//
// Required env: GEMINI_API_KEY (in .env.local or shell).
// Optional env: SEASON (default = current year), TONE (broadcaster |
// beat-reporter | hype, default broadcaster), USE_EMOJIS=0 to disable
// emojis, TRASH_TALK=1 to enable trash talk.

import { config as loadDotenv } from "dotenv";
import { generateRecap, type RecapInput } from "../lib/recap";
import type { Tone } from "../lib/narrative";

// Load .env.local first (Next.js convention), then .env as fallback.
loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

function usage(msg?: string): never {
  if (msg) console.error(`Error: ${msg}\n`);
  console.error("Usage:");
  console.error("  npm run recap:cli -- <leagueId> <week>          # single week");
  console.error("  npm run recap:cli -- <leagueId> <from-to>       # range");
  console.error("");
  console.error("Examples:");
  console.error("  npm run recap:cli -- 1234567890123456789 14");
  console.error("  npm run recap:cli -- 1234567890123456789 11-14");
  console.error("");
  console.error("Required env: GEMINI_API_KEY");
  console.error("Optional env: SEASON, TONE, USE_EMOJIS=0, TRASH_TALK=1");
  process.exit(1);
}

function parseTone(s: string | undefined): Tone {
  if (s === "beat-reporter" || s === "broadcaster" || s === "hype") return s;
  if (s) console.error(`Warning: unknown TONE "${s}", defaulting to broadcaster`);
  return "broadcaster";
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) usage("missing arguments");
  const [leagueId, weekArg] = args;

  if (!process.env.GEMINI_API_KEY) {
    usage("GEMINI_API_KEY not set (put it in .env.local or export it)");
  }

  const season = process.env.SEASON ?? String(new Date().getFullYear());
  const tone = parseTone(process.env.TONE);
  const useEmojis = process.env.USE_EMOJIS !== "0";
  const trashTalk = process.env.TRASH_TALK === "1";

  let input: RecapInput;
  if (weekArg.includes("-")) {
    const [fromStr, toStr] = weekArg.split("-");
    const fromWeek = Number(fromStr);
    const toWeek = Number(toStr);
    if (!Number.isFinite(fromWeek) || !Number.isFinite(toWeek)) {
      usage(`could not parse range "${weekArg}"`);
    }
    input = {
      mode: "range",
      leagueId,
      season,
      fromWeek,
      toWeek,
      tone,
      useEmojis,
      trashTalk,
    };
  } else {
    const week = Number(weekArg);
    if (!Number.isFinite(week)) usage(`could not parse week "${weekArg}"`);
    input = { mode: "week", leagueId, season, week, tone, useEmojis, trashTalk };
  }

  console.error(`Generating recap for league ${leagueId}…`);
  const t0 = Date.now();
  const result = await generateRecap(input);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // Header / metadata go to stderr so stdout is clean markdown for piping.
  console.error("");
  console.error(`=== ${result.leagueName} (${result.season}) ===`);
  if (result.mode === "range") {
    console.error(`Weeks ${result.fromWeek}-${result.toWeek} • ${result.modelId} • ${elapsed}s`);
    if (result.structured.playoffResults?.isComplete) {
      const pr = result.structured.playoffResults;
      console.error(
        `Champion: ${pr.champion?.teamName ?? "?"} • Runner-up: ${pr.runnerUp?.teamName ?? "?"}`,
      );
    }
  } else {
    console.error(`Week ${result.week} • ${result.modelId} • ${elapsed}s`);
    if (result.structured.league.playoffRound) {
      console.error(`Playoff round: ${result.structured.league.playoffRound}`);
    }
  }
  console.error("");

  process.stdout.write(result.markdown + "\n");
}

main().catch((err) => {
  console.error("\nRecap failed:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
