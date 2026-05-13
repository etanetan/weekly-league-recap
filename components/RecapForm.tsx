"use client";

import { useEffect, useState } from "react";
import type { LeagueInfo } from "@/lib/sleeper";

export type Tone = "beat-reporter" | "broadcaster" | "hype";

const TONE_OPTIONS: { value: Tone; label: string; description: string }[] = [
  { value: "broadcaster", label: "Broadcaster", description: "Animated TV anchor energy" },
  { value: "beat-reporter", label: "Beat reporter", description: "Schefter-style news flashes" },
  { value: "hype", label: "Hype", description: "Sports Twitter, full volume" },
];

export type SavedLeague = {
  sleeperLeagueId: string;
  leagueName: string | null;
  season: string | null;
};

type Props = {
  defaultLeagueId?: string;
  lockLeagueId?: boolean;
  defaultSeason?: string;
  defaultWeek?: number;
  savedLeagues?: SavedLeague[];
  onResult?: (result: RecapResponse) => void;
};

export type RecapResponse = {
  id: string | null;
  leagueName: string;
  season: string;
  mode: "week" | "range";
  week: number;
  fromWeek: number | null;
  toWeek: number | null;
  markdown: string;
  modelId: string;
  persisted: boolean;
};

const currentYear = new Date().getFullYear();
const SEASONS = Array.from({ length: currentYear - 2019 }, (_, i) => String(currentYear - i));
const ALL_WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);

const SEASON_TYPE_LABEL: Record<string, string> = {
  regular: "Regular season",
  post: "Postseason",
  off: "Offseason",
  pre: "Preseason",
};

const STATUS_LABEL: Record<string, string> = {
  in_season: "In season",
  complete: "Season complete",
  drafting: "Drafting",
  pre_draft: "Pre-draft",
};

function isValidLeagueIdFormat(id: string): boolean {
  return /^\d{5,64}$/.test(id);
}

function weekLabel(week: number, playoffStart: number | null): string {
  // Abbreviated "Wk" keeps the option text readable inside narrow 3-column
  // mobile dropdowns. The playoff suffix is short on purpose.
  if (playoffStart != null && week >= playoffStart) {
    return `Wk ${week} · Playoffs`;
  }
  return `Wk ${week}`;
}

function clampWeek(w: number): number {
  if (!Number.isFinite(w) || w < 1) return 1;
  if (w > 18) return 18;
  return Math.floor(w);
}

export default function RecapForm({
  defaultLeagueId = "",
  lockLeagueId = false,
  defaultSeason,
  defaultWeek = 1,
  savedLeagues = [],
  onResult,
}: Props) {
  const hasSaved = savedLeagues.length > 0 && !lockLeagueId;
  const initialLeagueId = defaultLeagueId || (hasSaved ? savedLeagues[0].sleeperLeagueId : "");
  const initialSeason =
    defaultSeason ||
    (hasSaved ? savedLeagues[0].season ?? SEASONS[1] ?? SEASONS[0] : SEASONS[1] ?? SEASONS[0]);

  // Clamp the incoming default to [1, 18]; an out-of-range value (e.g.
  // offseason week=0 from Sleeper) would otherwise leave the dropdown
  // showing nothing because no <option> matches.
  const initialWeek = clampWeek(defaultWeek);

  const [manualMode, setManualMode] = useState(false);
  const [leagueId, setLeagueId] = useState(initialLeagueId);
  const [season, setSeason] = useState(initialSeason);
  const [week, setWeek] = useState<number>(initialWeek);

  const [recapMode, setRecapMode] = useState<"week" | "range">("week");
  const [fromWeek, setFromWeek] = useState<number>(clampWeek(initialWeek - 3));
  const [toWeek, setToWeek] = useState<number>(initialWeek);

  const [tone, setTone] = useState<Tone>("broadcaster");
  const [useEmojis, setUseEmojis] = useState(true);
  const [trashTalk, setTrashTalk] = useState(false);
  const [format, setFormat] = useState<"text" | "audio" | "video">("text");
  const [customInstructions, setCustomInstructions] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecapResponse | null>(null);

  type Lookup = {
    forId: string;
    status: "ok" | "error";
    info: LeagueInfo | null;
    error: string | null;
  };
  const [lookup, setLookup] = useState<Lookup | null>(null);

  const trimmedLeagueId = leagueId.trim();
  const leagueIdIsValid = isValidLeagueIdFormat(trimmedLeagueId);
  const lookupForCurrent =
    lookup && lookup.forId === trimmedLeagueId ? lookup : null;

  const showDropdown = hasSaved && !manualMode;

  // Fetch league info (debounced) whenever the ID is valid.
  // setState calls are inside a deferred async callback (not the effect body)
  // so they do not trigger cascading-render warnings.
  useEffect(() => {
    if (!leagueIdIsValid) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/sleeper/league/${trimmedLeagueId}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as
          | LeagueInfo
          | { error: string; message?: string };
        if (!res.ok) {
          setLookup({
            forId: trimmedLeagueId,
            status: "error",
            info: null,
            error:
              "message" in data && data.message ? data.message : "League not found.",
          });
        } else {
          const info = data as LeagueInfo;
          setLookup({ forId: trimmedLeagueId, status: "ok", info, error: null });
          // Sleeper league IDs are per-season; sync the season field.
          if (info.season) setSeason(info.season);
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        setLookup({
          forId: trimmedLeagueId,
          status: "error",
          info: null,
          error: "Could not reach Sleeper.",
        });
      }
    }, 350);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [leagueIdIsValid, trimmedLeagueId]);

  function handleDropdownChange(newLeagueId: string) {
    setLeagueId(newLeagueId);
    const match = savedLeagues.find((l) => l.sleeperLeagueId === newLeagueId);
    if (match?.season) setSeason(match.season);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const trimmedInstructions = customInstructions.trim().slice(0, 600);
      const shared = {
        leagueId: leagueId.trim(),
        season,
        tone,
        useEmojis,
        trashTalk,
        format,
        ...(trimmedInstructions ? { customInstructions: trimmedInstructions } : {}),
      };
      const body =
        recapMode === "week"
          ? { ...shared, week }
          : { ...shared, fromWeek, toWeek };
      const res = await fetch("/api/recap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? data.error ?? "Something went wrong.");
        return;
      }
      setResult(data);
      onResult?.(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  const playoffStart = lookupForCurrent?.info?.playoffWeekStart ?? null;

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {showDropdown ? "Your leagues" : "League ID"}
            </span>
            {hasSaved && (
              <button
                type="button"
                onClick={() => setManualMode((m) => !m)}
                className="text-xs text-emerald-700 hover:underline dark:text-emerald-400"
              >
                {manualMode ? "Use saved league" : "Enter a different ID"}
              </button>
            )}
          </div>

          {showDropdown ? (
            <select
              value={leagueId}
              onChange={(e) => handleDropdownChange(e.target.value)}
              disabled={submitting}
              required
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {savedLeagues.map((l) => (
                <option key={l.sleeperLeagueId} value={l.sleeperLeagueId}>
                  {l.leagueName ?? l.sleeperLeagueId}
                  {l.season ? ` (${l.season})` : ""}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              inputMode="numeric"
              value={leagueId}
              onChange={(e) => setLeagueId(e.target.value)}
              placeholder="e.g. 1312076332460425216"
              disabled={lockLeagueId || submitting}
              required
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:disabled:bg-zinc-800"
            />
          )}

          <LeagueInfoLine
            haveLeagueId={leagueIdIsValid}
            lookup={lookupForCurrent}
          />
        </label>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Recap type</span>
          <div className="inline-flex rounded-md border border-zinc-300 bg-white p-0.5 text-sm dark:border-zinc-700 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => setRecapMode("week")}
              disabled={submitting}
              className={`rounded px-3 py-1 ${
                recapMode === "week"
                  ? "bg-emerald-600 text-white"
                  : "text-zinc-700 dark:text-zinc-300"
              }`}
            >
              Single week
            </button>
            <button
              type="button"
              onClick={() => setRecapMode("range")}
              disabled={submitting}
              className={`rounded px-3 py-1 ${
                recapMode === "range"
                  ? "bg-emerald-600 text-white"
                  : "text-zinc-700 dark:text-zinc-300"
              }`}
            >
              Catch-up (range)
            </button>
          </div>
        </div>

        {recapMode === "week" ? (
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Season</span>
              <select
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                disabled={submitting}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {SEASONS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Week</span>
              <select
                value={week}
                onChange={(e) => setWeek(Number(e.target.value))}
                disabled={submitting}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {ALL_WEEKS.map((w) => (
                  <option key={w} value={w}>
                    {weekLabel(w, playoffStart)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Season</span>
              <select
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                disabled={submitting}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {SEASONS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">From week</span>
              <select
                value={fromWeek}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setFromWeek(v);
                  if (v > toWeek) setToWeek(v);
                }}
                disabled={submitting}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {ALL_WEEKS.map((w) => (
                  <option key={w} value={w}>
                    {weekLabel(w, playoffStart)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">To week</span>
              <select
                value={toWeek}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setToWeek(v);
                  if (v < fromWeek) setFromWeek(v);
                }}
                disabled={submitting}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {ALL_WEEKS.map((w) => (
                  <option key={w} value={w}>
                    {weekLabel(w, playoffStart)}
                  </option>
                ))}
              </select>
            </label>
            <p className="col-span-3 -mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Will recap{" "}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {fromWeek === toWeek
                  ? `Wk ${fromWeek}`
                  : `Wks ${fromWeek}–${toWeek}`}
              </span>
              {playoffStart != null && toWeek >= playoffStart && " (includes playoffs)"}
              .
            </p>
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Recap tone</span>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as Tone)}
            disabled={submitting}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {TONE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label} — {t.description}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Output format
          </span>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as typeof format)}
            disabled={submitting}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="text">Text — tweet thread</option>
            <option value="audio" disabled>Audio — coming soon</option>
            <option value="video" disabled>Video — coming soon</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Custom instructions <span className="text-zinc-400 font-normal">(optional)</span>
            </span>
            <span className="text-xs text-zinc-400">
              {customInstructions.length}/600
            </span>
          </div>
          <textarea
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value.slice(0, 600))}
            placeholder='e.g. "Focus on the rivalry between Team A and Team B" or "Roast my friend Greg for benching his QB"'
            disabled={submitting}
            rows={3}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <span className="text-xs text-zinc-500">
            Extra guidance for this recap. The base rules (tweet format, fact-grounding) always apply.
          </span>
        </label>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={useEmojis}
              onChange={(e) => setUseEmojis(e.target.checked)}
              disabled={submitting}
              className="h-4 w-4 accent-emerald-600"
            />
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Include emojis
            </span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={trashTalk}
              onChange={(e) => setTrashTalk(e.target.checked)}
              disabled={submitting}
              className="h-4 w-4 accent-emerald-600"
            />
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Trash talk the bad teams
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={submitting || !leagueId.trim()}
          className="rounded-md bg-emerald-600 px-4 py-2.5 text-base font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {submitting ? "Generating recap…" : "Generate recap"}
        </button>

        {error && (
          <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}
      </form>

      {result && <RecapDisplay result={result} />}
    </div>
  );
}

function LeagueInfoLine({
  haveLeagueId,
  lookup,
}: {
  haveLeagueId: boolean;
  lookup:
    | { status: "ok" | "error"; info: LeagueInfo | null; error: string | null }
    | null;
}) {
  if (!haveLeagueId) {
    return <span className="mt-1 text-xs text-zinc-400">Enter a numeric Sleeper league ID.</span>;
  }
  if (!lookup) {
    return <span className="mt-1 text-xs text-zinc-500">Looking up league…</span>;
  }
  if (lookup.status === "error") {
    return (
      <span className="mt-1 text-xs text-red-600 dark:text-red-400">
        {lookup.error ?? "League not found."}
      </span>
    );
  }
  const info = lookup.info;
  if (!info) return null;
  const seasonType = SEASON_TYPE_LABEL[info.seasonType] ?? info.seasonType;
  const status = STATUS_LABEL[info.status] ?? info.status;
  return (
    <span className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
      <span className="font-medium text-zinc-800 dark:text-zinc-200">{info.name}</span>
      {" • "}
      {info.season} {seasonType}
      {" • "}
      {info.totalRosters} teams
      {" • "}
      {status}
      {info.playoffWeekStart != null && ` • playoffs start Wk ${info.playoffWeekStart}`}
    </span>
  );
}

function RecapDisplay({ result }: { result: RecapResponse }) {
  const tweets = parseTweets(result.markdown);
  const [copied, setCopied] = useState(false);

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(tweets.join("\n\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  const heading =
    result.mode === "range" && result.fromWeek != null && result.toWeek != null
      ? `${result.leagueName} — ${result.season} Weeks ${result.fromWeek}-${result.toWeek}`
      : `${result.leagueName} — ${result.season} Week ${result.week}`;

  return (
    <div className="mt-8">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{heading}</h2>
        <div className="flex items-center gap-3">
          {result.persisted && (
            <span className="text-xs text-zinc-500">Saved to your history</span>
          )}
          <button
            type="button"
            onClick={copyAll}
            className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {copied ? "Copied!" : "Copy all"}
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {tweets.map((t, i) => (
          <article
            key={i}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-base leading-relaxed text-zinc-900 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {t}
          </article>
        ))}
      </div>
    </div>
  );
}

function parseTweets(md: string): string[] {
  const trimmed = md.trim();

  // Legacy fallback: if the model returned a numbered thread, parse that format.
  if (/^\s*\d+\/\s/m.test(trimmed)) {
    const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
    const tweets: string[] = [];
    let current = "";
    for (const line of lines) {
      if (/^\d+\/\s/.test(line)) {
        if (current) tweets.push(current.trim());
        current = line.replace(/^\d+\/\s*/, "");
      } else if (current) {
        current += " " + line;
      }
    }
    if (current) tweets.push(current.trim());
    return tweets.length > 0 ? tweets : [trimmed];
  }

  // Preferred: split on blank lines.
  const chunks = trimmed
    .split(/\n\s*\n/)
    .map((c) => c.trim().replace(/\s+\n\s*/g, " "))
    .filter(Boolean);
  return chunks.length > 0 ? chunks : [trimmed];
}
