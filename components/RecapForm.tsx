"use client";

import { useRef, useState } from "react";

export type Tone = "beat-reporter" | "broadcaster" | "hype";

const TONE_OPTIONS: { value: Tone; label: string; description: string }[] = [
  { value: "broadcaster", label: "Broadcaster", description: "Animated TV anchor energy" },
  { value: "beat-reporter", label: "Beat reporter", description: "Schefter-style news flashes" },
  { value: "hype", label: "Hype", description: "Sports Twitter, full volume" },
];

// Mirrors VOICE_OPTIONS in lib/tts.ts (value/label only — the server maps the
// value to a Gemini voice and validates it).
const VOICE_OPTIONS: { value: string; label: string; description: string }[] = [
  { value: "announcer", label: "Announcer", description: "Deep, broadcast-booth delivery" },
  { value: "energetic", label: "Energetic", description: "Upbeat, lively pace" },
  { value: "confident", label: "Confident", description: "Firm, anchor-desk steady" },
  { value: "smooth", label: "Smooth", description: "Easy, breezy podcast tone" },
  { value: "hype", label: "Hype", description: "Bold, big-game excitement" },
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

export type TextRecapResponse = {
  format: "text";
  id: string | null;
  leagueName: string;
  season: string;
  week: number;
  markdown: string;
  modelId: string;
  persisted: boolean;
};

export type AudioRecapResponse = {
  format: "audio";
  leagueName: string;
  season: string;
  week: number;
  voice: string;
  audioUrl: string;
  shareUrl: string | null;
  persisted: boolean;
};

export type RecapResponse = TextRecapResponse | AudioRecapResponse;

type OutputFormat = "text" | "audio";

const currentYear = new Date().getFullYear();
const SEASONS = Array.from({ length: currentYear - 2019 }, (_, i) => String(currentYear - i));
const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);

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

  const [manualMode, setManualMode] = useState(false);
  const [leagueId, setLeagueId] = useState(initialLeagueId);
  const [season, setSeason] = useState(initialSeason);
  const [week, setWeek] = useState<number>(defaultWeek);
  const [format, setFormat] = useState<OutputFormat>("text");
  const [tone, setTone] = useState<Tone>("broadcaster");
  const [voice, setVoice] = useState<string>("announcer");
  const [useEmojis, setUseEmojis] = useState(true);
  const [trashTalk, setTrashTalk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecapResponse | null>(null);

  // Track the current audio object URL so we can revoke it on the next run.
  const audioUrlRef = useRef<string | null>(null);

  const showDropdown = hasSaved && !manualMode;

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

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }

    try {
      const res = await fetch("/api/recap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leagueId: leagueId.trim(), season, week, format, tone, useEmojis, trashTalk, voice }),
      });

      const contentType = res.headers.get("content-type") ?? "";

      // Audio recaps come back as a raw WAV body with metadata in headers.
      if (res.ok && contentType.includes("audio/")) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;
        const audioResult: AudioRecapResponse = {
          format: "audio",
          leagueName: decodeURIComponent(res.headers.get("x-recap-league") ?? ""),
          season: res.headers.get("x-recap-season") ?? season,
          week: Number(res.headers.get("x-recap-week") ?? week),
          voice: res.headers.get("x-recap-voice") ?? voice,
          audioUrl: url,
          shareUrl: res.headers.get("x-recap-share-url"),
          persisted: res.headers.get("x-recap-persisted") === "true",
        };
        setResult(audioResult);
        onResult?.(audioResult);
        return;
      }

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

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Output</span>
          <div className="flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700">
            {(["text", "audio"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                disabled={submitting}
                aria-pressed={format === f}
                className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  format === f
                    ? "bg-emerald-600 text-white"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                {f === "text" ? "Tweet thread" : "Audio recap"}
              </button>
            ))}
          </div>
        </div>

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

        {format === "audio" && (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Voice</span>
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              disabled={submitting}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {VOICE_OPTIONS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label} — {v.description}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {format === "text" && (
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
          )}

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
          {submitting
            ? format === "audio"
              ? "Generating audio…"
              : "Generating recap…"
            : format === "audio"
              ? "Generate audio recap"
              : "Generate recap"}
        </button>

        {error && (
          <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}
      </form>

      {result && result.format === "text" && <RecapDisplay result={result} />}
      {result && result.format === "audio" && <AudioRecapDisplay result={result} />}
    </div>
  );
}

function RecapDisplay({ result }: { result: TextRecapResponse }) {
  const tweets = parseTweets(result.markdown);
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

function safeFileName(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "recap";
}

function AudioRecapDisplay({ result }: { result: AudioRecapResponse }) {
  const [shareNote, setShareNote] = useState<string | null>(null);
  const fileName = `${safeFileName(result.leagueName)}-${result.season}-wk${result.week}.wav`;

  async function handleShare() {
    if (!result.shareUrl) return;
    const shareData = {
      title: `${result.leagueName} — ${result.season} Week ${result.week} recap`,
      url: result.shareUrl,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(result.shareUrl);
      setShareNote("Link copied to clipboard");
      setTimeout(() => setShareNote(null), 3000);
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  }

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

      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <audio controls src={result.audioUrl} className="w-full" />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <a
            href={result.audioUrl}
            download={fileName}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Download
          </a>

          {result.shareUrl ? (
            <button
              type="button"
              onClick={handleShare}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Share
            </button>
          ) : (
            <span className="text-xs text-zinc-500">Sign in to save and share recaps.</span>
          )}

          {shareNote && <span className="text-xs text-emerald-700 dark:text-emerald-400">{shareNote}</span>}
        </div>
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
