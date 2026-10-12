-- Ajout des notifications à l'application existante.
-- La table des sons et le bucket audio existants sont conservés.
begin;

grant usage on schema public to service_role;

create table if not exists public.push_subscriptions_v2 (
  endpoint text primary key check (char_length(endpoint) between 1 and 2048),
  p256dh text not null check (char_length(p256dh) = 87),
  auth text not null check (char_length(auth) = 22),
  token_hash text not null check (char_length(token_hash) = 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.push_subscriptions_v2 enable row level security;
revoke all on public.push_subscriptions_v2 from anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions_v2 to service_role;

-- Protéger l'inscription par un jeton local et limiter cette démo à 20 appareils.
create or replace function public.register_push_subscription_v2(
  p_endpoint text, p_p256dh text, p_auth text, p_token_hash text
) returns boolean
language plpgsql security invoker set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('corsica-soundscape-push-v2'));
  if exists (select 1 from public.push_subscriptions_v2 where endpoint = p_endpoint and token_hash <> p_token_hash) then
    return false;
  end if;
  if not exists (select 1 from public.push_subscriptions_v2 where endpoint = p_endpoint)
     and (select count(*) from public.push_subscriptions_v2) >= 20 then
    return false;
  end if;
  insert into public.push_subscriptions_v2 (endpoint, p256dh, auth, token_hash)
  values (p_endpoint, p_p256dh, p_auth, p_token_hash)
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, updated_at = now();
  return true;
end;
$$;
revoke all on function public.register_push_subscription_v2(text, text, text, text) from public, anon, authenticated;
grant execute on function public.register_push_subscription_v2(text, text, text, text) to service_role;

commit;
