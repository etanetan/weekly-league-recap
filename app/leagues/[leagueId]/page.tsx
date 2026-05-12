import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import RecapForm from "@/components/RecapForm";
import SignOutButton from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function LeagueDetailPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/leagues/${leagueId}`);

  const { data: league } = await supabase
    .from("user_leagues")
    .select("id, sleeper_league_id, league_name, season")
    .eq("sleeper_league_id", leagueId)
    .single();

  if (!league) notFound();

  const { data: recaps } = await supabase
    .from("recaps")
    .select("id, season, week, generated_at, content_markdown")
    .eq("sleeper_league_id", leagueId)
    .order("generated_at", { ascending: false })
    .limit(20);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            🏈 Weekly League Recap
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="text-zinc-700 hover:underline dark:text-zinc-300">
              Dashboard
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
        <section>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {league.league_name ?? leagueId}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {league.season ? `${league.season} season • ` : ""}League ID {leagueId}
          </p>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="mb-4 text-lg font-medium text-zinc-900 dark:text-zinc-100">
            Generate a recap
          </h2>
          <RecapForm defaultLeagueId={leagueId} lockLeagueId defaultSeason={league.season ?? undefined} />
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium text-zinc-900 dark:text-zinc-100">History</h2>
          {recaps && recaps.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {recaps.map((r) => (
                <li
                  key={r.id}
                  className="rounded-md border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex items-baseline justify-between">
                    <div className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                      {r.season} Week {r.week}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {new Date(r.generated_at).toLocaleString()}
                    </div>
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-emerald-700 hover:underline dark:text-emerald-400">
                      View recap
                    </summary>
                    <pre className="mt-3 whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200">
                      {r.content_markdown}
                    </pre>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-md border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
              No recaps yet. Generate one above.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
