# Contrat HTTP actuel pour un client Android

Base de production : `https://pwacorsica-soundscape.ounesshimi.workers.dev`. En local, `wrangler dev` sert le Worker sur `http://localhost:8798` ; un émulateur Android utilise normalement `10.0.2.2` pour joindre le port de l'hôte. Valider cette adresse et la politique HTTP Android dans le projet natif avant test. Les réponses JSON du Worker utilisent `Cache-Control: no-store`.

## Représentation d'un son

```json
{
  "id": "uuid-serveur",
  "clientId": "local-uuid-client",
  "title": "Vagues à Ajaccio",
  "description": "Ambiance du matin",
  "latitude": 41.9192,
  "longitude": 8.7386,
  "category": "mer",
  "audioUrl": "/uploads/uuid-fichier.webm",
  "createdAt": "2026-10-12T10:00:00Z",
  "version": 1,
  "synced": true
}
```

L'exemple montre la forme et non un identifiant réel. Les chemins `audioUrl` sont relatifs à la base du Worker. `createdAt` est une date ISO 8601. `version` vaut toujours 1 dans le Worker actuel ; aucune route d'édition V2 ne l'exploite.

| Route | Entrée | Succès | Notes |
| --- | --- | --- | --- |
| `GET /api/sounds` | aucune | `200` tableau de sons | Tri `created_at` décroissant puis `id` croissant ; en-tête `X-Soundscape-Source: network` |
| `POST /api/sounds` | `multipart/form-data` et `Idempotency-Key` | `201` création, `200` répétition de la même clé | Aucun JSON de création ; audio obligatoire |
| `GET /uploads/<uuid>.<extension>` | aucune | `200`, `206` si `Range` | Audio du bucket privé servi par le Worker |
| `HEAD /uploads/<uuid>.<extension>` | aucune | `200` ou `206` | Métadonnées audio |
| `GET /api/push/config` | aucune | `200` `{enabled, publicKey, error?}` | Configuration Web Push pour la PWA |
| `POST /api/push/subscribe` | JSON abonnement + token | `201` `{ok:true}` | Inscription Web Push, pas FCM natif |
| `DELETE /api/push/subscribe` | JSON endpoint + token | `200` `{ok:true}` | Désinscription Web Push |
| `POST /api/push/test` | JSON endpoint + token | `200` `{ok:true}` | Diagnostic technique ; pas de bouton dans l'interface actuelle |

### Création

Champs multipart : `title` (1 à 80 caractères après trim), `description` (0 à 300), `latitude` (nombre de -90 à 90), `longitude` (nombre de -180 à 180), `category` (une des sept valeurs ci-dessus), `audio` (fichier non vide, au plus 10 Mio). MIME autorisés : `audio/webm`, `audio/mp4`, `audio/ogg`, `audio/mpeg`, `audio/wav`, `audio/aac`. Le corps complet est limité à 10 Mio + 64 Kio. Le nom de fichier serveur est généré indépendamment du nom transmis.

`Idempotency-Key` est obligatoire : 1 à 128 caractères parmi lettres ASCII, chiffres, `_ . : -`. Générer une valeur stable une fois par enregistrement et la conserver avec la file locale. En cas de timeout après upload, **réessayer avec la même clé**. Le Worker cherche d'abord un son existant, puis téléverse l'audio et insère la ligne ; il relit la clé après un échec d'insertion possible et nettoie le fichier temporaire quand il peut le faire sans risque. Le contrat ne garantit pas une transaction atomique entre Storage et PostgreSQL.

Exemple de requête :

```sh
curl -X POST "https://pwacorsica-soundscape.ounesshimi.workers.dev/api/sounds" \
  -H "Idempotency-Key: local-123e4567-e89b-42d3-a456-426614174000" \
  -F "title=Vagues à Ajaccio" -F "description=Ambiance du matin" \
  -F "latitude=41.9192" -F "longitude=8.7386" -F "category=mer" \
  -F "audio=@recording.m4a;type=audio/mp4"
```

### Erreurs

Format général : `{"error":"message lisible"}`. Principaux statuts : `400` données ou clé invalides ; `413` corps/audio trop grand ; `415` formulaire non multipart ; `404` route ou audio inconnu ; `405` méthode non autorisée ; `502` Supabase ou service audio indisponible ; `503` configuration serveur manquante. Une erreur réseau/timeout ne donne aucun statut HTTP : laisser l'entrée en attente et réessayer. Ne pas relancer automatiquement et sans fin un `400`, `413` ou `415` ; signaler à l'utilisateur une action corrective.

### Audio et cache

La route `/uploads/` accepte `Range` et transmet notamment `Content-Type`, `Content-Length`, `Content-Range`, `Accept-Ranges`, `ETag`. Une réponse complète ou partielle peut être conservée (`Cache-Control: public, max-age=86400, immutable`). Un client Android peut jouer ce flux en ligne et conserver un fichier local pour le hors ligne, avec une politique de cache et de suppression explicite.

### Notifications : frontière entre Web Push et Android

Le contrat `/api/push/*` enregistre des abonnements **Web Push** avec endpoint, `p256dh`, `auth` et token local de 64 caractères hexadécimaux. Il ne sait pas enregistrer un token Firebase Cloud Messaging natif. Le Worker valide l'origine lorsqu'un en-tête `Origin` est présent, les services push autorisés et les clés VAPID. Pour une app Kotlin native, concevoir un nouveau contrat backend de notification (token FCM, consentement, renouvellement, désinscription, sécurité et nettoyage) avant de promettre la parité push. Réutiliser directement `/api/push/subscribe` avec un token FCM serait incorrect.

## Compatibilité à préserver

Le futur client doit continuer d'utiliser le Worker comme unique porte d'entrée, conserver les valeurs des catégories et la clé d'idempotence, et traiter `200` comme succès d'une répétition. Une évolution du backend (pagination, authentification, FCM, modération) devrait être versionnée ou introduite de façon compatible avec la PWA existante.
