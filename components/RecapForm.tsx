"use client";

import { useState } from "react";

type Props = {
  defaultLeagueId?: string;
  lockLeagueId?: boolean;
  defaultSeason?: string;
  defaultWeek?: number;
  onResult?: (result: RecapResponse) => void;
};

export type RecapResponse = {
  id: string | null;
  leagueName: string;
  season: string;
  week: number;
  markdown: string;
  modelId: string;
  persisted: boolean;
};

const currentYear = new Date().getFullYear();
const SEASONS = Array.from({ length: currentYear - 2019 }, (_, i) => String(currentYear - i));
const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);

export default function RecapForm({
  defaultLeagueId = "",
  lockLeagueId = false,
  defaultSeason,
  defaultWeek = 1,
  onResult,
}: Props) {
  const [leagueId, setLeagueId] = useState(defaultLeagueId);
  const [season, setSeason] = useState(defaultSeason ?? SEASONS[1] ?? SEASONS[0]);
  const [week, setWeek] = useState<number>(defaultWeek);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecapResponse | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/recap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leagueId: leagueId.trim(), season, week }),
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

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">League ID</span>
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
        </label>

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
              {WEEKS.map((w) => (
                <option key={w} value={w}>Week {w}</option>
              ))}
            </select>
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

function RecapDisplay({ result }: { result: RecapResponse }) {
  const tweets = parseThread(result.markdown);
  return (
    <div className="mt-8">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          {result.leagueName} — {result.season} Week {result.week}
        </h2>
        {result.persisted && (
          <span className="text-xs text-zinc-500">Saved to your history</span>
        )}
      </div>
      <ol className="flex flex-col gap-3">
        {tweets.map((t, i) => (
          <li
            key={i}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-base leading-relaxed text-zinc-900 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {t}
          </li>
        ))}
      </ol>
    </div>
  );
}

function parseThread(md: string): string[] {
  const lines = md.split("\n").map((l) => l.trim()).filter(Boolean);
  const tweets: string[] = [];
  let current = "";
  for (const line of lines) {
    if (/^\d+\//.test(line)) {
      if (current) tweets.push(current.trim());
      current = line;
    } else if (current) {
      current += " " + line;
    }
  }
  if (current) tweets.push(current.trim());
  return tweets.length > 0 ? tweets : [md];
}
