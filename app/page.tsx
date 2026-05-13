import Link from "next/link";
import RecapForm from "@/components/RecapForm";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getNflState } from "@/lib/sleeper";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const [savedLeagues, nflState] = await Promise.all([
    user
      ? supabase
          .from("user_leagues")
          .select("sleeper_league_id, league_name, season")
          .order("created_at", { ascending: false })
          .then((res) =>
            res.data?.map((l) => ({
              sleeperLeagueId: l.sleeper_league_id,
              leagueName: l.league_name,
              season: l.season,
            })) ?? [],
          )
      : Promise.resolve([]),
    getNflState().catch(() => null),
  ]);

  const defaultWeek = nflState?.display_week ?? nflState?.week ?? 1;
  const defaultSeason = nflState?.season;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            🏈 Weekly League Recap
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            {user ? (
              <Link href="/dashboard" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-zinc-700 hover:underline dark:text-zinc-300">
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="rounded-md bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-700"
                >
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
        <section>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Get an AI-narrated recap of your fantasy football week
          </h1>
          <p className="mt-3 text-base leading-7 text-zinc-600 dark:text-zinc-400">
            Drop your Sleeper league ID, pick a week, and get a punchy tweet-thread recap of the
            biggest stories — top scores, blowouts, trades, waivers, and standings.
          </p>
          {!user && (
            <p className="mt-2 text-sm text-zinc-500">
              Free for 3 recaps per day.{" "}
              <Link href="/signup" className="text-emerald-700 hover:underline dark:text-emerald-400">
                Sign up
              </Link>{" "}
              to save leagues and get unlimited recaps.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <RecapForm
            savedLeagues={savedLeagues}
            defaultWeek={defaultWeek}
            defaultSeason={defaultSeason}
          />
        </section>

        <section className="text-sm text-zinc-500 dark:text-zinc-400">
          <p>
            <strong className="text-zinc-700 dark:text-zinc-300">Where do I find my league ID?</strong>{" "}
            On <a href="https://sleeper.com" className="underline">sleeper.com</a>, open your league —
            the long numeric string in the URL after <code>/leagues/</code> is the ID.
          </p>
        </section>
      </main>
    </div>
  );
}
