-- À exécuter dans le SQL Editor Supabase avant de déployer le code du profil.
begin;
create table if not exists public.profiles (
  id uuid primary key,
  nickname varchar(30) not null check (char_length(btrim(nickname)) between 1 and 30),
  avatar_url text,
  created_at timestamptz not null default now()
);
alter table public.sounds add column if not exists profile_id uuid references public.profiles(id) on delete set null;
create index if not exists sounds_profile_id_idx on public.sounds(profile_id);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select, insert on public.profiles to service_role;
grant select, insert on public.sounds to service_role;
commit;
