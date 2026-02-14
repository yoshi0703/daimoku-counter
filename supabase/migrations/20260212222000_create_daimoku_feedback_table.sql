-- Feedback form submissions from in-app settings
create extension if not exists pgcrypto;

create table if not exists public.daimoku_feedback (
  id uuid primary key default gen_random_uuid(),
  feedback_type text not null check (feedback_type in ('improvement', 'bug', 'inquiry')),
  summary text,
  details text not null,
  contact text,
  app_version text,
  platform text,
  created_at timestamptz not null default now()
);

alter table public.daimoku_feedback enable row level security;

drop policy if exists "Allow anonymous insert daimoku feedback" on public.daimoku_feedback;
create policy "Allow anonymous insert daimoku feedback"
  on public.daimoku_feedback
  for insert
  to anon, authenticated
  with check (true);
