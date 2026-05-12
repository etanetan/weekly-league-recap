import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import AddLeagueForm from "@/components/AddLeagueForm";
import LeagueRow from "@/components/LeagueRow";
import SignOutButton from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard");

  const { data: leagues } = await supabase
    .from("user_leagues")
    .select("id, sleeper_league_id, league_name, season, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            🏈 Weekly League Recap
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-zinc-500">{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
        <section>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Your leagues</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Save a Sleeper league ID once and generate recaps for any week.
          </p>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <AddLeagueForm />
        </section>

        {leagues && leagues.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {leagues.map((l) => (
              <LeagueRow
                key={l.id}
                id={l.id}
                sleeperLeagueId={l.sleeper_league_id}
                leagueName={l.league_name}
                season={l.season}
              />
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
            No leagues yet. Paste a Sleeper league ID above to get started.
          </p>
        )}
      </main>
    </div>
  );
}
