-- À exécuter après 005_trails.sql pour activer DELETE /api/sounds/:id.
begin;
grant delete on public.sounds to service_role;
grant delete on public.likes, public.comments, public.listens to service_role;
commit;
