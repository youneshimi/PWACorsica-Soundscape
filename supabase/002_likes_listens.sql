-- À exécuter après 001_profiles.sql.
begin;
create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  sound_id uuid not null references public.sounds(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (sound_id, profile_id)
);
create table if not exists public.listens (
  id uuid primary key default gen_random_uuid(),
  sound_id uuid not null references public.sounds(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  listened_at timestamptz not null default now()
);
create index if not exists listens_sound_id_idx on public.listens(sound_id);
create or replace view public.sound_stats as
select s.id as sound_id,
  (select count(*) from public.likes l where l.sound_id = s.id) as likes_count,
  (select count(*) from public.listens n where n.sound_id = s.id) as listens_count
from public.sounds s;
alter table public.likes enable row level security;
alter table public.listens enable row level security;
revoke all on public.likes, public.listens from anon, authenticated;
grant select, insert, delete on public.likes to service_role;
grant select, insert on public.listens to service_role;
revoke all on public.sound_stats from anon, authenticated;
grant select on public.sound_stats to service_role;
commit;
