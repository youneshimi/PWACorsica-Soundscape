# Retirer les sons de test

Les notifications sont validées sur PC et iPhone. Le bouton de test et le repère « V2 » sont retirés de l'interface ; le compteur et l'abonnement aux nouveaux sons restent disponibles.

## Publier le nettoyage de l'interface

Faire le commit et le push des changements sur `main`, puis attendre le déploiement Cloudflare. Recharger la PWA en ligne et accepter « Mettre à jour ».

## Supprimer les six lignes dans Supabase

Ouvrir **SQL Editor → New query**, copier [supabase/nettoyage-tests.sql](./supabase/nettoyage-tests.sql), puis **Run**. Le script cible les six identifiants et fichiers exacts fournis ; il retourne les sons effectivement supprimés. Une seconde exécution ne supprime rien de plus.

Conserver « Sempre QUI », « Forêt de vizzavona » et « Vagues douces Ajaccio ». Les abonnements aux notifications sont conservés.

## Supprimer leurs fichiers audio

Dans **Storage → sounds**, sélectionner et supprimer uniquement les fichiers suivants :

| Son | Fichier |
|---|---|
| oooo | `0b7e2956-5542-4c95-8b82-881107ba85f6.webm` |
| ddd | `46c6e432-a0cc-4dab-9d42-2e68c49ca052.webm` |
| ddddddddddd | `4e28aecb-1748-4b96-8af2-518addf51aa0.webm` |
| Testttttt | `15bf5657-8a2e-4dfe-9171-8984cb85e173.webm` |
| Test pop | `a1c1ffc0-cc24-4a96-b24b-1e5aa35a8a9d.webm` |
| Test de Notif | `a4ca8a2a-f4f4-40b8-a694-011bebaa6e6e.webm` |

La suppression des fichiers passe par Storage, conformément à la [documentation Supabase](https://supabase.com/docs/guides/storage/management/delete-objects). Un `DELETE` SQL dans `storage.objects` ne supprime pas le fichier réel.

## Vérifier le résultat

Ouvrir https://pwacorsica-soundscape.ounesshimi.workers.dev/api/sounds : il doit rester les trois sons conservés, sauf nouvelles contributions ajoutées depuis.

Recharger en ligne la PWA sur PC et iPhone. Une liste fraîche du serveur retire désormais les anciens sons synchronisés d'IndexedDB et leurs audios du cache. Les captures non synchronisées et les sons envoyés pendant la requête sont conservés. Une réponse de secours provenant du cache ne déclenche pas de suppression locale. L'interface peut montrer brièvement sa liste locale avant le rafraîchissement réseau.

Le compteur doit afficher « 3 sons » avec le filtre « Tous », si aucune autre contribution n'a été ajoutée. Aucun effacement global des données du navigateur n'est nécessaire.
