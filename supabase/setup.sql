-- À exécuter dans SQL Editor du projet Supabase.
-- Les appels passent par l'API Cloudflare, avec une clé serveur.
begin;

create table if not exists public.sounds (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique check (char_length(client_id) between 1 and 128),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  category text not null check (category in ('mer', 'nature', 'village', 'animal', 'musique', 'marche', 'autre')),
  audio_path text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists sounds_created_at_idx on public.sounds (created_at desc, id);
alter table public.sounds enable row level security;
revoke all on public.sounds from anon, authenticated;
grant usage on schema public to service_role;
grant select, insert on public.sounds to service_role;

-- Le bucket est privé. Le Worker sert les fichiers via /uploads/.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sounds', 'sounds', false, 10485760,
  array['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/aac']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
