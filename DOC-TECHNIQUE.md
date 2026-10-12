# Corsica Soundscape — Document technique

**Projet** : carte sonore collaborative de la Corse — M2 Informatique, Università di Corsica.

**PWA** : https://pwacorsica-soundscape.ounesshimi.workers.dev/

**Dépôt** : https://github.com/youneshimi/PWACorsica-Soundscape

**Statut au 12 octobre 2026** : application et API déployées ; enregistrement et synchronisation testés. Les références du téléphone de test et la démonstration de mise à jour restent à consigner.

## 1. TL;DR

La PWA permet d'enregistrer et d'écouter des sons placés sur une carte de la Corse. Elle sauvegarde d'abord les enregistrements dans IndexedDB, puis les envoie au serveur. Une file d'envoi et un identifiant stable permettent de reprendre une synchronisation interrompue sans créer de doublon.

## 2. Contexte et objectifs

Sujet libre : partager des ambiances de mer, de nature, de village ou de musique. L'utilisateur donne un titre, une description, une catégorie et une position à son enregistrement. La liste et la carte permettent de retrouver les sons. L'application est installable et reste utilisable après une première visite en ligne, même sans réseau. L'édition audio, les comptes et la modération ne sont pas inclus.

## 3. Architecture

React et Vite gèrent l'interface ; Leaflet affiche la carte. IndexedDB conserve les données locales. Le Service Worker est écrit directement, sans Workbox.

Cloudflare sert `dist` et exécute `worker/index.js` pour l'API. Le Worker appelle PostgreSQL et Storage Supabase. Le navigateur utilise la même origine pour `GET`/`POST /api/sounds` et `GET`/`HEAD /uploads/<fichier>`. Express reste le backend de développement local.

Le push sur `main` déclenche le build Cloudflare (`npm run build`), puis `npx wrangler deploy`. `wrangler.jsonc` définit les routes et l'URL Supabase. `DEPLOIEMENT.md` décrit la création de la table, du bucket et du secret.

## 4. Cache et hors ligne

| Ressource | Stratégie et stockage |
|---|---|
| Accueil, JS, CSS, icônes, page de secours | Précache, puis Cache First dans `soundscape-<hash>` |
| Manifest et présentation Markdown | Cache puis actualisation en arrière-plan |
| API | Network First, secours en cache après panne ou erreur serveur |
| Audio téléchargé | Cache persistant `soundscape-data-v1`, lecture des plages HTTP Range |
| Nouveaux enregistrements | Blob dans IndexedDB, disponible avant l'envoi |

L'accueil et `/?action=record` utilisent le même HTML précaché. Une navigation inconnue peut recevoir `offline.html`. Les tuiles OpenStreetMap utilisent uniquement le cache HTTP du navigateur : le fond de carte complet n'est pas garanti hors connexion. Aucun téléchargement groupé n'est effectué.

## 5. Mise à jour

Le build calcule la version du cache à partir du Service Worker et des fichiers précachés. Un changement produit un nouveau `sw.js`. Après installation, le nouveau Worker attend ; la bannière propose « Plus tard » ou « Mettre à jour ».

Le bouton envoie `SKIP_WAITING`. L'activation déclenche `controllerchange`, puis un rechargement. Le premier contrôle ne recharge pas la page. Les données et audios du cache persistant sont conservés. Cette stratégie laisse l'utilisateur terminer son enregistrement avant de changer de version.

## 6. Données et synchronisation

IndexedDB `corsica-soundscape`, version 1, contient `sounds` (clé `id`, index de catégorie, date et position) et `outbox` (clé auto-incrémentée). Les entrées associent métadonnées, Blob, `localId` et `clientId`.

La sauvegarde écrit le son et sa demande d'envoi dans une transaction commune. Le formulaire attend cette écriture avant de fermer. L'envoi transmet le fichier en multipart et `clientId` dans `Idempotency-Key`. Après succès, une transaction remplace la copie locale par celle du serveur et retire la demande. Une erreur conserve la file.

Background Sync utilise le tag `sync-outbox` lorsqu'il est disponible. L'application relance aussi au démarrage, au retour du réseau, au focus et toutes les 30 secondes si une demande reste en attente. La contrainte unique Supabase sur `client_id` protège contre les envois concurrents et les réponses perdues.

Il n'existe pas de réconciliation de modifications concurrentes dans l'interface. Le `PUT` avec `If-Match` d'Express n'est pas déployé sur Cloudflare et ne constitue pas un bonus démontré.

## 7. Permissions et capacités de l'appareil

Le microphone est demandé au clic sur « Enregistrer ». Un refus affiche un message ; la lecture reste accessible. Le format dépend du navigateur : WebM, MP4 ou Ogg notamment. Le type réel est conservé lors de l'envoi. La fermeture arrête les pistes du micro, y compris après une autorisation reçue tardivement.

Le GPS est demandé au clic sur « Obtenir ma position ». En cas de refus, l'utilisateur choisit le lieu sur une petite carte ou saisit les coordonnées. Aucun placement aléatoire n'est utilisé. La sauvegarde exige une position valide.

## 8. Notifications

Aucune demande de permission ni notification push n'est branchée dans le parcours utilisateur. L'état de synchronisation est affiché dans l'interface. Le gestionnaire `notificationclick` du Service Worker ne suffit pas à fournir une fonctionnalité push.

## 9. Visibilité : SEO et agents IA

La présentation « À propos » est dans le HTML initial, hors de React. Elle est ouverte par défaut avec et sans JavaScript, et reste repliable. `soundscape.md` reprend ce contenu et est précaché. Le HTML référence cette version et `llms.txt` la signale.

`SITE_URL` configure au build la canonical, `og:url`, `og:image`, le JSON-LD et les URL de `robots.txt`, `sitemap.xml` et `llms.txt`. Le sitemap contient l'accueil et la date de dernière modification du contenu issue de Git (date de build sans historique). Chaque robot du contrôle a une règle explicite et un commentaire. Les adresses inconnues renvoient une vraie 404. Les sons chargés depuis l'API ne sont pas rendus dans le HTML initial. Le Markdown est servi en `text/markdown` avec `X-Robots-Tag: noindex`.

## 10. Sécurité et vie privée

HTTPS protège les échanges. Le micro et le GPS nécessitent une action volontaire. Audio, description et coordonnées peuvent contenir des informations personnelles ; les sons envoyés sont accessibles aux visiteurs.

Le secret Supabase reste dans le Worker. La table utilise RLS et le bucket est privé ; les accès passent par l'API. Les envois sont limités à 10 Mo et les métadonnées sont validées. Sans compte, modération ni limitation par utilisateur, les contributions peuvent consommer les quotas gratuits.

## 11. Mesures et vérifications

- Préparation locale de l'API : 63 tests réussis, lint et build réussis ; préparation Wrangler validée sans publication.
- Vérification publique : l'API retourne « Vagues douces Ajaccio » et « Forêt de vizzavona », avec leur URL audio et `synced: true`.
- Test hors connexion : « Sempre QUI » apparaît avec « Non synchronisé » et « 1 en attente ». L'auteur a confirmé la lecture et l'envoi au retour du réseau.
- Installation visible sur ordinateur dans la capture de l'application autonome. Modèle de téléphone, navigateur, tests de refus et application d'une nouvelle version : résultats détaillés à consigner.
- Aucun score Lighthouse ou chiffre de performance n'est annoncé sans rapport.
- Analyse SEO du Hub reçue le 12 octobre 2026 : 79/100. Les corrections du contenu visible, des règles de robots, de `lastmod` et de la réponse 404 sont préparées ; le score doit être remesuré après déploiement. Ce score indicatif est distinct de la note du TP.

## 12. Limites connues et suite

Le stockage local dépend de l'espace et de la conservation des données par le navigateur. La synchronisation en arrière-plan dépend du support disponible ; garder l'application ouverte permet les relances de secours. Sur iPhone, l'installation se fait depuis le partage Safari.

Les offres gratuites ont des quotas. Une interruption au résultat inconnu peut laisser un fichier non référencé dans Storage ; aucun nettoyage différé automatique n'est prévu. Les sons d'Express ne sont pas importés automatiquement.

Les prochaines améliorations seraient la modération, la limitation des envois, les comptes et l'édition audio. Les deux capacités proposées pour le bonus sont le microphone et la géolocalisation.
