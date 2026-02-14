-- Storage bucket for anonymous audio contributions
insert into storage.buckets (id, name, public)
values ('audio-contributions', 'audio-contributions', false)
on conflict (id) do nothing;

-- RLS: allow anonymous uploads only (no read/update/delete)
create policy "Allow anonymous upload audio contributions"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'audio-contributions');

-- Metadata table for audio contributions (no user identifiers)
create table if not exists public.audio_contributions (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  duration_seconds integer not null,
  daimoku_count integer not null,
  recognition_mode text,
  platform text,
  app_version text,
  created_at timestamptz not null default now()
);

alter table public.audio_contributions enable row level security;

create policy "Allow anonymous insert audio contributions"
  on public.audio_contributions
  for insert
  to anon, authenticated
  with check (true);
