-- Weekly League Recap — initial schema
-- Run this in the Supabase SQL editor (or via `supabase db push`)

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- user_leagues: each row is a Sleeper league a signed-in user has saved
-- ---------------------------------------------------------------------------
create table if not exists public.user_leagues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  sleeper_league_id text not null,
  league_name text,
  season text,
  created_at timestamptz default now(),
  unique (user_id, sleeper_league_id)
);

create index if not exists user_leagues_user_id_idx on public.user_leagues(user_id);

-- ---------------------------------------------------------------------------
-- recaps: one row per generated recap (only persisted for signed-in users)
-- ---------------------------------------------------------------------------
create table if not exists public.recaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  sleeper_league_id text not null,
  season text not null,
  week int not null,
  content_markdown text not null,
  content_json jsonb,
  generated_at timestamptz default now()
);

create index if not exists recaps_user_league_idx
  on public.recaps(user_id, sleeper_league_id, season, week desc);

-- ---------------------------------------------------------------------------
-- Row-level security: users only see their own rows
-- ---------------------------------------------------------------------------
alter table public.user_leagues enable row level security;
alter table public.recaps enable row level security;

drop policy if exists "own leagues select" on public.user_leagues;
drop policy if exists "own leagues insert" on public.user_leagues;
drop policy if exists "own leagues update" on public.user_leagues;
drop policy if exists "own leagues delete" on public.user_leagues;

create policy "own leagues select" on public.user_leagues
  for select using (auth.uid() = user_id);
create policy "own leagues insert" on public.user_leagues
  for insert with check (auth.uid() = user_id);
create policy "own leagues update" on public.user_leagues
  for update using (auth.uid() = user_id);
create policy "own leagues delete" on public.user_leagues
  for delete using (auth.uid() = user_id);

drop policy if exists "own recaps select" on public.recaps;
drop policy if exists "own recaps insert" on public.recaps;
drop policy if exists "own recaps update" on public.recaps;
drop policy if exists "own recaps delete" on public.recaps;

create policy "own recaps select" on public.recaps
  for select using (auth.uid() = user_id);
create policy "own recaps insert" on public.recaps
  for insert with check (auth.uid() = user_id);
create policy "own recaps update" on public.recaps
  for update using (auth.uid() = user_id);
create policy "own recaps delete" on public.recaps
  for delete using (auth.uid() = user_id);
