-- À exécuter après 002_likes_listens.sql.
begin;
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  sound_id uuid not null references public.sounds(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  text varchar(500) not null check (char_length(btrim(text)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists comments_sound_created_idx on public.comments(sound_id, created_at desc);
alter table public.comments enable row level security;
revoke all on public.comments from anon, authenticated;
grant select, insert on public.comments to service_role;
commit;
