-- À exécuter après 003_comments.sql.
begin;
create table if not exists public.trails (
  id uuid primary key default gen_random_uuid(),
  title varchar(80) not null check (char_length(btrim(title)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.trail_sounds (
  id uuid primary key default gen_random_uuid(),
  trail_id uuid not null references public.trails(id) on delete cascade,
  sound_id uuid not null references public.sounds(id) on delete cascade,
  position integer not null check (position >= 1),
  note text not null default '' check (char_length(note) <= 300),
  unique (trail_id, position),
  unique (trail_id, sound_id)
);
create index if not exists trails_created_at_idx on public.trails(created_at desc);
create index if not exists trail_sounds_trail_position_idx on public.trail_sounds(trail_id, position);
alter table public.trails enable row level security;
alter table public.trail_sounds enable row level security;
revoke all on public.trails, public.trail_sounds from anon, authenticated;
grant select, insert on public.trails, public.trail_sounds to service_role;
create or replace function public.create_trail(p_profile_id uuid, p_title text, p_description text, p_sounds jsonb)
returns uuid language plpgsql set search_path = public as $$
declare new_id uuid; item jsonb; idx integer := 0;
begin
  if not exists (select 1 from public.profiles where id = p_profile_id) then raise exception 'profile missing'; end if;
  if char_length(btrim(p_title)) not between 1 and 80 or char_length(p_description) > 500 or jsonb_typeof(p_sounds) <> 'array' or jsonb_array_length(p_sounds) not between 1 and 30 then raise exception 'invalid trail'; end if;
  insert into public.trails(title, description, profile_id) values (btrim(p_title), p_description, p_profile_id) returning id into new_id;
  for item in select value from jsonb_array_elements(p_sounds) loop
    idx := idx + 1;
    insert into public.trail_sounds(trail_id, sound_id, position, note)
    values (new_id, (item->>'soundId')::uuid, idx, coalesce(item->>'note', ''));
  end loop;
  return new_id;
end $$;
revoke all on function public.create_trail(uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.create_trail(uuid,text,text,jsonb) to service_role;
commit;
