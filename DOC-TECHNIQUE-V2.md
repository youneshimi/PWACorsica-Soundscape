# Corsica Soundscape V2 — Document technique

**Branche** : `main`. **Version** : 2.0.0.

**PWA** : https://pwacorsica-soundscape.ounesshimi.workers.dev/

**Dépôt** : https://github.com/youneshimi/PWACorsica-Soundscape

**Statut** : ajout préparé et testé localement ; déploiement des notifications et réception réelle à valider. Le lien héberge déjà la V1.

## 1. Résumé

La V2 ajoute un abonnement volontaire aux nouveaux sons. Elle met à jour l'application existante au même lien, en conservant les sons, l'installation, le cache audio et IndexedDB.

## 2. Architecture

React/Vite, Leaflet, IndexedDB et le Service Worker sont conservés. Le Worker Cloudflare `pwacorsica-soundscape` utilise la table `sounds` et le bucket privé `sounds` existants. Le SQL ajoute `push_subscriptions_v2` et la fonction `register_push_subscription_v2`. Les ressources de sons séparées créées par la première version du SQL restent inutilisées ; aucun transfert n'est nécessaire.

## 3. Cache et mise à jour

Le shell est précaché et versionné. L'API des sons utilise Network First avec secours en cache ; les audios téléchargés restent disponibles. Les captures sont conservées dans IndexedDB. Les tuiles OSM ne sont pas précachées en masse. La configuration push utilise directement le réseau et une réponse `no-store`.

Le nouveau Service Worker attend l'acceptation de « Mettre à jour ». `SKIP_WAITING` et `controllerchange` appliquent la nouvelle interface. Le même domaine conserve les données locales et l'installation existante. Le clic push retrouve une fenêtre via `OPEN_SOUND`, sans imposer un rechargement à un enregistrement en cours.

## 4. Synchronisation

La transaction IndexedDB conserve le son et son entrée d'outbox. Le `clientId` stable devient `Idempotency-Key`, avec contrainte unique dans `sounds`. Les relances de l'app et Background Sync reprennent les envois. Seule une insertion fraîche déclenche un push ; une relance idempotente ne renvoie pas la notification. L'édition concurrente et la réconciliation de conflits ne sont pas ajoutées.

## 5. Permissions et notifications

Le micro et le GPS restent demandés après les clics correspondants ; le lieu peut être choisi manuellement. Le bouton « Recevoir les nouveaux sons » appelle `pushManager.subscribe` avec `userVisibleOnly` et la clé publique VAPID. Aucune permission de notification n'est demandée au chargement. Un refus laisse l'app utilisable.

Le navigateur fournit l'endpoint et les clés de chiffrement. `/api/push/subscribe` inscrit ces données dans une table privée, avec une empreinte du jeton local de gestion. La désactivation retire la ligne et l'abonnement navigateur.

« Tester une notification » utilise `/api/push/test` et cible uniquement l'abonnement protégé par le jeton de cet appareil. Le résultat distingue un envoi accepté, un abonnement absent ou expiré et un refus du fournisseur. La configuration vérifie désormais la correspondance des clés VAPID ; les logs Cloudflare sont activés explicitement et indiquent les statuts HTTP sans données d'abonnement.

Le serveur utilise `@block65/webcrypto-web-push` : VAPID et `aes128gcm`. `waitUntil` prolonge l'envoi après la sauvegarde. Seuls les services push connus sont acceptés, les redirections sont refusées et les abonnements expirés sont retirés. Le Service Worker affiche la notification et ouvre ou retrouve le son au clic. La lecture audio reste une action de l'utilisateur.

## 6. Visibilité et sécurité

Le HTML public et sa version Markdown, robots, sitemap avec `lastmod`, Open Graph et JSON-LD sont conservés. `SITE_URL` reste le domaine public existant. Les URL inexistantes renvoient 404.

Les clés privées Supabase et VAPID restent dans les secrets Cloudflare. La clé publique VAPID est accessible au navigateur. RLS protège les tables ; le bucket audio reste privé. Les endpoints et clés d'abonnement ne sont pas exposés par l'API publique. Les sons publiés restent accessibles aux visiteurs. Il n'y a ni comptes, ni modération, ni limitation par utilisateur de la contribution.

## 7. Validation

78 tests couvrent la sauvegarde, le hors connexion, la reprise sans doublon, la conservation d'un son publié avant la mise à jour, les abonnements, la signature VAPID et le déchiffrement par un destinataire simulé, la réception et le clic dans le Service Worker, les clés incohérentes et le test limité à son appareil. Le chiffrement et la validation VAPID ont aussi été vérifiés dans le moteur Cloudflare local avec un destinataire fictif. Le build et la préparation Wrangler sont vérifiés localement. Le linter natif est bloqué par la politique Windows.

Le bouton a aussi été vérifié dans Chrome avec un serveur d'abonnement simulé : activation, désactivation, refus et absence d'abonnement au chargement. Ces contrôles ne remplacent pas une réception réelle sur téléphone. Compléter la date, les appareils, navigateurs et résultats après le parcours de [V2-NOTIFICATIONS.md](./V2-NOTIFICATIONS.md). Le bonus push reste à démontrer sur le site déployé.

## 8. Limites

20 abonnés maximum, cinq envois simultanés. La livraison dépend du fournisseur, du navigateur et du système. Il n'existe pas de file serveur persistante de reprise des notifications. Un échec du push ne remet pas en cause la sauvegarde du son.

Sur iPhone, utiliser une PWA ajoutée à l'écran d'accueil avec iOS 16.4 ou ultérieur. Les limites de stockage navigateur et les quotas Cloudflare/Supabase restent applicables.
