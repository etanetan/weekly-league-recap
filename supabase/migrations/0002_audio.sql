-- Weekly League Recap — audio recaps
-- Run this in the Supabase SQL editor (after 0001_init.sql).

-- ---------------------------------------------------------------------------
-- recaps: track output format + the stored audio file
-- ---------------------------------------------------------------------------
alter table public.recaps add column if not exists format text not null default 'text';
alter table public.recaps add column if not exists audio_path text;
alter table public.recaps add column if not exists audio_voice text;

-- ---------------------------------------------------------------------------
-- recap-audio: PRIVATE storage bucket for generated .wav files.
-- Audio is owner-only; playback and sharing go through signed URLs, so the
-- bucket is NOT public and never exposes recaps by raw URL.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('recap-audio', 'recap-audio', false)
on conflict (id) do nothing;

-- Each user may read/write only inside their own {user_id}/... folder.
drop policy if exists "own recap audio select" on storage.objects;
drop policy if exists "own recap audio insert" on storage.objects;
drop policy if exists "own recap audio update" on storage.objects;
drop policy if exists "own recap audio delete" on storage.objects;

create policy "own recap audio select" on storage.objects
  for select to authenticated using (
    bucket_id = 'recap-audio' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "own recap audio insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'recap-audio' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "own recap audio update" on storage.objects
  for update to authenticated using (
    bucket_id = 'recap-audio' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "own recap audio delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'recap-audio' and (storage.foldername(name))[1] = auth.uid()::text
  );
