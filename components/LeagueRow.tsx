"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Props = {
  id: string;
  sleeperLeagueId: string;
  leagueName: string | null;
  season: string | null;
};

export default function LeagueRow({ id, sleeperLeagueId, leagueName, season }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`Remove ${leagueName ?? sleeperLeagueId} from your saved leagues?`)) return;
    setDeleting(true);
    const res = await fetch(`/api/leagues/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.refresh();
    } else {
      setDeleting(false);
      alert("Could not remove league.");
    }
  }

  return (
    <li className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <Link href={`/leagues/${sleeperLeagueId}`} className="flex-1">
        <div className="text-base font-medium text-zinc-900 dark:text-zinc-100">
          {leagueName ?? sleeperLeagueId}
        </div>
        <div className="text-sm text-zinc-500">
          {season ? `${season} • ` : ""}ID {sleeperLeagueId}
        </div>
      </Link>
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="ml-4 text-sm text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
      >
        {deleting ? "…" : "Remove"}
      </button>
    </li>
  );
}
