# Migrations sociales

Exécuter ces fichiers dans le SQL Editor du projet Supabase, dans cet ordre :

1. `001_profiles.sql`
2. `002_likes_listens.sql`
3. `003_comments.sql`
4. `004_popular.sql` (aucun changement de schéma)
5. `005_trails.sql`

Les tables sont accessibles uniquement via la clé serveur du Worker. Les sons déjà présents gardent `profile_id = NULL` ; leurs auteurs s'affichent sans pseudo.
