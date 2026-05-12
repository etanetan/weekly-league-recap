"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddLeagueForm() {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/leagues", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leagueId: leagueId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? data.error ?? "Could not add league.");
        return;
      }
      setLeagueId("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <input
        type="text"
        inputMode="numeric"
        placeholder="Sleeper league ID"
        value={leagueId}
        onChange={(e) => setLeagueId(e.target.value)}
        required
        disabled={submitting}
        className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      <button
        type="submit"
        disabled={submitting || !leagueId.trim()}
        className="rounded-md bg-emerald-600 px-4 py-2 text-base font-medium text-white hover:bg-emerald-700 disabled:bg-zinc-400"
      >
        {submitting ? "Adding…" : "Add league"}
      </button>
      {error && (
        <p className="basis-full rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
    </form>
  );
}
