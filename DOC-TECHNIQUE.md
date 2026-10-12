# Corsica Soundscape — Document technique

**Projet** : carte sonore collaborative de la Corse — M2 Informatique, Università di Corsica.

**PWA** : https://pwacorsica-soundscape.ounesshimi.workers.dev/

**Dépôt** : https://github.com/youneshimi/PWACorsica-Soundscape

**Version du code** : 2.0.0, branche `main`.

**Portée** : ce document présente l'application complète. Les guides de déploiement, de notifications et de nettoyage donnent les étapes pratiques en complément.

**Statut au 12 octobre 2026** : application et API déployées ; enregistrement et synchronisation testés. La version 2.0.0 ajoute les notifications push au même lien ; la réception réelle est confirmée sur PC et iPhone. Les références complètes des appareils et la démonstration de mise à jour restent à consigner.

## 1. Résumé du projet

La PWA permet d'enregistrer et d'écouter des sons placés sur une carte de la Corse. Elle sauvegarde d'abord les enregistrements dans IndexedDB, puis les envoie au serveur. Une file d'envoi et un identifiant stable permettent de reprendre une synchronisation interrompue sans créer de doublon.

Elle propose une installation sur ordinateur et téléphone, l'enregistrement avec le microphone, la géolocalisation ou le choix manuel du lieu, la lecture hors connexion des sons déjà conservés et un abonnement aux notifications des nouvelles contributions.

## 2. Contexte et objectifs

Sujet libre : partager des ambiances de mer, de nature, de village ou de musique. L'utilisateur donne un titre, une description, une catégorie et une position à son enregistrement. La liste et la carte permettent de retrouver les sons. L'application est installable et reste utilisable après une première visite en ligne, même sans réseau. L'édition audio, les comptes et la modération ne sont pas inclus.

La liste se filtre par catégorie : mer, nature, village, animal, musique, marché ou autre. Chaque fiche affiche le titre, la description et la date, avec un bouton de lecture ou de pause. Le choix d'un son centre la carte sur sa position. Le panneau s'ouvre et se ferme sur mobile. Le compteur, les messages hors connexion et le nombre d'envois en attente indiquent l'état de l'application.

## 3. Architecture

React et Vite gèrent l'interface ; Leaflet affiche la carte. IndexedDB conserve les données locales. Le Service Worker est écrit directement, sans Workbox.

Les pictogrammes de l'interface viennent de Lucide. Le logo, les icônes de l'application et le favicon sont exportés depuis les images fournies dans `image/`.

Cloudflare sert `dist` et exécute `worker/index.js` pour l'API. Le Worker appelle PostgreSQL et Storage Supabase. Le navigateur utilise la même origine pour `GET`/`POST /api/sounds` et `GET`/`HEAD /uploads/<fichier>`. La table et le bucket `sounds` existants sont conservés. Le développement utilise désormais le Worker local sur le port 8798 ; Express reste disponible pour l'ancien parcours local.

Le push sur `main` déclenche le build Cloudflare (`npm run build`), puis `npx wrangler deploy`. `wrangler.jsonc` définit les routes et l'URL Supabase. `DEPLOIEMENT.md` décrit la création de la table, du bucket et du secret.

| Élément | Rôle |
|---|---|
| Service Worker du navigateur, `public/sw.js` | Cache, fonctionnement hors ligne, Background Sync et réception des notifications |
| Worker Cloudflare, `worker/index.js` et `worker/push.js` | API des sons, accès Supabase et envoi des notifications |
| Supabase | Métadonnées dans PostgreSQL, fichiers audio dans Storage et abonnements push |

Le Worker Cloudflare et le Service Worker du navigateur sont deux programmes distincts.

## 4. Cache et hors ligne

| Ressource | Stratégie et stockage |
|---|---|
| Accueil, JS, CSS, icônes, favicon, page de secours | Précache, puis Cache First dans `soundscape-<hash>` |
| Manifest et présentation Markdown | Cache puis actualisation en arrière-plan |
| API des sons | Network First, secours en cache après panne ou erreur serveur |
| Configuration et gestion des notifications | Réseau, sans interception par le Service Worker |
| Audio téléchargé | Cache persistant `soundscape-data-v1`, lecture des plages HTTP Range |
| Nouveaux enregistrements | Blob dans IndexedDB, disponible avant l'envoi |

L'accueil et `/?action=record` utilisent le même HTML précaché. Une navigation inconnue peut recevoir `offline.html`. Les tuiles OpenStreetMap utilisent uniquement le cache HTTP du navigateur : le fond de carte complet n'est pas garanti hors connexion. Aucun téléchargement groupé n'est effectué.

Une première visite en ligne est nécessaire pour conserver l'interface. Un son distant doit avoir été téléchargé pour être écouté hors connexion ; les nouveaux enregistrements locaux possèdent déjà leur Blob audio. Les requêtes POST ne sont pas mises en cache.

## 5. Installation, icônes et mise à jour

Le manifest définit le nom complet « Corsica Soundscape — Carte sonore de la Corse », le nom court « Soundscape », l'ouverture en mode `standalone`, la langue française, le vert `#3f604e` et le fond crème `#f6f3ed`. Il propose aussi le raccourci « Enregistrer un son », qui ouvre `/?action=record`.

Sur Chrome, le bouton d'installation apparaît lorsque le navigateur fournit `beforeinstallprompt`. Le clic lance la demande d'installation. Sur iPhone, l'ajout se fait depuis le menu de partage Safari, avec « Sur l'écran d'accueil ». La détection du mode installé utilise `display-mode: standalone` et `navigator.standalone` sur iOS.

Les icônes PNG de la PWA existent en 192 et 512 pixels. Une version `maskable` de 512 pixels garde une marge autour du logo pour les découpes Android. L'icône Apple fait 180 pixels ; les favicons PNG font 16 et 32 pixels, et le fichier ICO contient les tailles 16, 32 et 48. `npm run icons` refait les exports avec Sharp depuis `image/Pic1.png`, `Pic2.png` et `Pic3.png`. Les fichiers sont déclarés dans le HTML ou le manifest et précachés. Les notifications utilisent aussi l'icône 192.

Le build calcule la version du cache à partir du Service Worker et des fichiers précachés. Un changement produit un nouveau `sw.js`. Après installation, le nouveau Worker attend ; la bannière propose « Plus tard » ou « Mettre à jour ».

Le bouton envoie `SKIP_WAITING`. L'activation déclenche `controllerchange`, puis un rechargement. Le premier contrôle ne recharge pas la page. Les données et audios du cache persistant sont conservés. Cette stratégie laisse l'utilisateur terminer son enregistrement avant de changer de version.

## 6. Données et synchronisation

IndexedDB `corsica-soundscape`, version 1, contient `sounds` (clé `id`, index de catégorie, date et position) et `outbox` (clé auto-incrémentée). Les entrées associent métadonnées, Blob, `localId` et `clientId`.

La sauvegarde écrit le son et sa demande d'envoi dans une transaction commune. Le formulaire attend cette écriture avant de fermer. L'envoi transmet le fichier en multipart et `clientId` dans `Idempotency-Key`. Après succès, une transaction remplace la copie locale par celle du serveur et retire la demande. Une erreur conserve la file.

Background Sync utilise le tag `sync-outbox` lorsqu'il est disponible. L'application relance aussi au démarrage, au retour du réseau, au focus et toutes les 30 secondes si une demande reste en attente. La contrainte unique Supabase sur `client_id` protège contre les envois concurrents et les réponses perdues.

Après une réponse fraîche du serveur, le rafraîchissement retire les sons synchronisés qui ont été supprimés de la base, ainsi que leurs audios du cache local. Il conserve les captures en attente et les sons envoyés pendant la requête. Une liste reçue en secours depuis le cache ne déclenche pas de suppression locale.

La suppression administrative se fait dans Supabase : la ligne dans `sounds`, puis le fichier dans Storage. Aucun bouton de suppression publique n'est ajouté. [NETTOYAGE-SONS.md](./NETTOYAGE-SONS.md) et le SQL ciblé décrivent le retrait des six sons de test.

Il n'existe pas de réconciliation de modifications concurrentes dans l'interface. Le `PUT` avec `If-Match` d'Express n'est pas déployé sur Cloudflare et ne constitue pas un bonus démontré.

## 7. Permissions et capacités de l'appareil

Le microphone est demandé au clic sur « Enregistrer ». Un refus affiche un message ; la lecture reste accessible. Le format dépend du navigateur : WebM, MP4 ou Ogg notamment. Le type réel est conservé lors de l'envoi. La fermeture arrête les pistes du micro, y compris après une autorisation reçue tardivement.

Le GPS est demandé au clic sur « Obtenir ma position ». En cas de refus, l'utilisateur choisit le lieu sur une petite carte ou saisit les coordonnées. Aucun placement aléatoire n'est utilisé. La sauvegarde exige une position valide.

## 8. Notifications

La V2 propose « Recevoir les nouveaux sons ». La permission est demandée après ce clic. Le navigateur crée un abonnement ; `/api/push/subscribe` l'inscrit dans la table privée `push_subscriptions_v2`, avec une empreinte du jeton local de gestion. Le bouton permet aussi de se désabonner.

La Push API fournit l'adresse de réception et les clés de l'appareil. Le serveur utilise `@block65/webcrypto-web-push` pour signer avec VAPID et chiffrer en `aes128gcm`. La clé publique VAPID est transmise au navigateur ; la clé privée reste dans Cloudflare. Sur iPhone, l'abonnement se fait depuis la PWA ajoutée à l'écran d'accueil.

Le bouton de test a été retiré après validation sur PC et iPhone. L'API de diagnostic reste limitée à l'appareil protégé par son jeton. Le serveur vérifie la correspondance des clés VAPID et signale les abonnements absents, expirés ou les refus du fournisseur. Les logs Cloudflare sont activés explicitement ; ils n'affichent ni clés ni données d'abonnement.

Après une nouvelle insertion de son, le Worker chiffre et signe le message avec Web Push et VAPID, puis l'envoie via `waitUntil`. Les relances idempotentes ne renvoient pas le push. Le Service Worker affiche la notification et retrouve le son au clic. Les secrets privés restent dans Cloudflare. La configuration `/api/push/config` est servie sans cache.

La réception utilise l'événement `push` et `showNotification()`. Le clic utilise `notificationclick` : il retrouve une fenêtre existante ou ouvre l'application sur le son concerné. La lecture audio reste déclenchée par l'utilisateur. L'envoi HTTP utilise `redirect: 'manual'`, compatible avec Cloudflare, et refuse les réponses de redirection. Les abonnements expirés sont retirés après un statut 404 ou 410 du fournisseur.

Le SQL ajoute uniquement les ressources d'abonnement ; les sons existants sont conservés. Cette démo accepte 20 abonnés et n'a pas de file persistante de reprise des notifications. Un échec du push ne fait pas échouer la sauvegarde. [V2-NOTIFICATIONS.md](./V2-NOTIFICATIONS.md) décrit les essais et [DOC-TECHNIQUE-V2.md](./DOC-TECHNIQUE-V2.md) décrit l'ajout.

## 9. Visibilité : SEO et agents IA

La présentation « À propos » est dans le HTML initial, hors de React. Elle est ouverte par défaut avec et sans JavaScript, et reste repliable. `soundscape.md` reprend ce contenu et est précaché. Le HTML référence cette version et `llms.txt` la signale.

`SITE_URL` configure au build la canonical, `og:url`, `og:image`, le JSON-LD et les URL de `robots.txt`, `sitemap.xml` et `llms.txt`. Le sitemap contient l'accueil et la date de dernière modification du contenu issue de Git (date de build sans historique). Chaque robot du contrôle a une règle explicite et un commentaire. Les adresses inconnues renvoient une vraie 404. Les sons chargés depuis l'API ne sont pas rendus dans le HTML initial. Le Markdown est servi en `text/markdown` avec `X-Robots-Tag: noindex`.

## 10. Sécurité et vie privée

HTTPS protège les échanges. Le micro et le GPS nécessitent une action volontaire. Audio, description et coordonnées peuvent contenir des informations personnelles ; les sons envoyés sont accessibles aux visiteurs.

Le secret Supabase reste dans le Worker. La table utilise RLS et le bucket est privé ; les accès passent par l'API. Les envois sont limités à 10 Mo et les métadonnées sont validées. Sans compte, modération ni limitation par utilisateur, les contributions peuvent consommer les quotas gratuits.

`SUPABASE_SECRET_KEY` et `VAPID_PRIVATE_KEY` sont des secrets Cloudflare. Ils ne sont pas intégrés à React. Les fichiers locaux `.dev.vars*` sont ignorés par Git, sauf les exemples sans secrets. Les endpoints et clés d'abonnement restent dans une table privée ; le jeton local protège l'inscription, la désinscription et le diagnostic de cet appareil. L'API limite les endpoints aux fournisseurs push connus.

## 11. Mesures et vérifications

- Vérification locale actuelle : 83 tests réussis, build réussi. Ils couvrent notamment les formats audio, la sauvegarde atomique, le hors connexion, les relances sans doublon, le nettoyage local, les permissions et les notifications. Un test utilise le moteur Cloudflare pour vérifier la construction de la requête push.
- Vérification publique : l'API retourne « Vagues douces Ajaccio » et « Forêt de vizzavona », avec leur URL audio et `synced: true`.
- Test hors connexion : « Sempre QUI » apparaît avec « Non synchronisé » et « 1 en attente ». L'auteur a confirmé la lecture et l'envoi au retour du réseau.
- Installation visible sur ordinateur dans la capture de l'application autonome. Modèle de téléphone, navigateur, tests de refus et application d'une nouvelle version : résultats détaillés à consigner.
- Aucun score Lighthouse ou chiffre de performance n'est annoncé sans rapport.
- Notifications : réception réelle visible dans la capture iPhone et confirmée par l'auteur sur PC et téléphone le 12 octobre 2026. Le linter actuel est bloqué par la politique Windows qui empêche le chargement du module natif.
- Interface après nettoyage : vérification dans Chrome avec données simulées, passage de neuf à trois sons, conservation de l'abonnement et retrait du bouton de test et du repère « V2 ».
- Icônes : dimensions PNG, fonds opaques Apple et Android, contenu du favicon ICO, accès HTTP et présence dans le précache vérifiés localement.
- Analyse SEO du Hub reçue le 12 octobre 2026 : 79/100. Les corrections du contenu visible, des règles de robots, de `lastmod` et de la réponse 404 sont intégrées au code ; le nouveau score reste à mesurer sur le site publié. Ce score indicatif est distinct de la note du TP.

## 12. Limites connues et suite

Le stockage local dépend de l'espace et de la conservation des données par le navigateur. La synchronisation en arrière-plan dépend du support disponible ; garder l'application ouverte permet les relances de secours. Sur iPhone, l'installation se fait depuis le partage Safari.

Les offres gratuites ont des quotas. Une interruption au résultat inconnu peut laisser un fichier non référencé dans Storage ; aucun nettoyage différé automatique n'est prévu. Les sons d'Express ne sont pas importés automatiquement.

Les notifications ont une limite de 20 abonnés et cinq envois simultanés dans cette démo. L'acceptation d'un message par le fournisseur ne garantit pas son affichage immédiat : les permissions, le système et la connectivité de l'appareil interviennent aussi. Les résultats détaillés du clic sur une notification, des mises à jour et d'un audit Lighthouse restent à consigner.

Les prochaines améliorations seraient la modération, la limitation des envois, les comptes et l'édition audio. Les deux capacités proposées pour le bonus sont le microphone et la géolocalisation.
