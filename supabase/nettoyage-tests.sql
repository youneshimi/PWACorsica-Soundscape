-- Nettoyage ponctuel des six sons de test indiqués par l'auteur.
-- À exécuter dans SQL Editor du projet corsica-soundscape.
-- Les fichiers audio sont ensuite à supprimer dans Storage > sounds.
begin;

with targets (id, audio_path) as (
  values
    ('3bfcd3aa-8a7e-4c37-a559-5aada102d0d2'::uuid, '0b7e2956-5542-4c95-8b82-881107ba85f6.webm'),
    ('d4a1c603-4547-4c33-b47d-f49419220c5c'::uuid, '46c6e432-a0cc-4dab-9d42-2e68c49ca052.webm'),
    ('05dfa5be-dddf-41cc-b8bb-5ebf7401e9af'::uuid, '4e28aecb-1748-4b96-8af2-518addf51aa0.webm'),
    ('b12faed8-8dc5-4a61-8026-6699fb320d2f'::uuid, '15bf5657-8a2e-4dfe-9171-8984cb85e173.webm'),
    ('4aca89e5-eb8a-43f6-8e53-73cdf1655037'::uuid, 'a1c1ffc0-cc24-4a96-b24b-1e5aa35a8a9d.webm'),
    ('765b3cfb-9928-4fcc-a092-66915684d5ff'::uuid, 'a4ca8a2a-f4f4-40b8-a694-011bebaa6e6e.webm')
)
delete from public.sounds as sound
using targets
where sound.id = targets.id and sound.audio_path = targets.audio_path
returning sound.id, sound.title, sound.audio_path;

commit;
