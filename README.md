# Weekly League Recap

AI-narrated weekly recaps for Sleeper fantasy football leagues. Drop a league ID, pick a week, get a punchy tweet-thread recap (top scores, blowouts, trades, waivers, standings).

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS
- **Supabase** — Postgres + auth (Google OAuth + email/password)
- **Google Gemini 2.0 Flash** — generates the recap narrative (free tier)
- **Upstash Redis** — rate-limits the anonymous trial page
- Deploys to **Vercel**

## Local setup

1. Install deps:
   ```sh
   npm install
   ```
2. Create a Supabase project, then in the SQL editor run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
3. Enable an auth provider in Supabase → Authentication → Providers. Email is on by default; for Google, set up an OAuth client and add `http://localhost:3000/auth/callback` (and your production URL) as a redirect URL.
4. (Optional) Create an Upstash Redis database for anonymous rate limiting.
5. Copy `.env.local.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY` (from https://aistudio.google.com/)
   - `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (optional)
6. Run the dev server:
   ```sh
   npm run dev
   ```
7. Open http://localhost:3000 and try the trial form with a real Sleeper league ID.

## How it works

- `lib/sleeper.ts` — thin typed client for the public Sleeper API.
- `lib/playersCache.ts` — caches the ~5MB players dictionary in memory + `/tmp`.
- `lib/enrich.ts` — joins matchups + rosters + users + transactions into per-team objects + league-wide notables (top score, blowout, player of the week, trades, waiver winners, standings).
- `lib/narrative.ts` — sends the enriched data to Gemini 2.0 Flash, returns a numbered tweet thread.
- `lib/recap.ts` — orchestrator. Public entrypoint.
- `app/api/recap/route.ts` — anonymous (rate-limited) and authenticated (persisted) recap endpoint.
- `app/api/leagues/*` — CRUD for saved leagues (auth required).
- `app/page.tsx` — public trial page.
- `app/dashboard/page.tsx` + `app/leagues/[leagueId]/page.tsx` — signed-in flow: save leagues, manually run recaps, view history.

## Deploy to Vercel

1. Push to GitHub.
2. Import into Vercel.
3. Set the same env vars as `.env.local` in the Vercel project settings.
4. Add your production URL to Supabase auth redirect URLs (e.g. `https://your-app.vercel.app/auth/callback`).
5. Deploy.

## Roadmap

- **v1 (now):** manual-run web app + history.
- **v2:** Tuesday 8:30am Central cron via Vercel Cron, iterating saved leagues.
- **v3:** podcast (TTS) and video script output formats.

## Notes

- Sleeper's API does **not** expose league chat or DMs, so recaps can't include trash-talk from the in-app chat. Everything else (scores, trades, waivers, FAAB) is fully public and free.
- League IDs are per-season on Sleeper — to recap a prior season, use that season's specific league ID, not the current one.
