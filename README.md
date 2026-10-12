# Corsica Soundscape — V2 notifications

La version 2.0.0 ajoute les notifications push sur `main`, au même lien public : https://pwacorsica-soundscape.ounesshimi.workers.dev/. Elle conserve le Worker, les sons et les fichiers audio existants. Suivre [V2-NOTIFICATIONS.md](./V2-NOTIFICATIONS.md) pour ajouter les clés Cloudflare, publier et tester une vraie notification.

Carte sonore collaborative de la Corse — PWA installable, offline-first.

Enregistrez des sons géolocalisés (vagues, vent du maquis, clochers, marchés) et explorez les ambiances de l'île de Beauté sur une carte interactive.

## Lancer en local

### Frontend (React + Vite)

```bash
npm install
npm run dev
```

L'app V2 tourne sur `http://localhost:5174`. Son proxy utilise le Worker local sur le port 8798. Pour les essais push, suivre `npm run preview:v2` dans [le guide V2](./V2-NOTIFICATIONS.md).

### Backend Express (archive V1)

```bash
cd server
npm install
npm start
```

L'API tourne sur `http://localhost:3001`

> La V2 utilise le Worker Cloudflare local sur le port 8798. Express conserve le fonctionnement local historique de la V1 et n'est pas utilisé par le proxy V2.

### Vérifier le mode hors connexion

Le Service Worker est désactivé avec `npm run dev` pour éviter de mettre les modules de développement en cache. Pour tester la PWA, lancez le Worker V2 et utilisez, depuis la racine du projet :

```bash
npm run build
npm run preview
```

Ouvrez l'adresse affichée par Vite, ici `http://localhost:4183`. Le proxy vise le Worker V2 pour `/api` et `/uploads`. Pour le parcours complet push, `npm run preview:v2` sert directement la PWA sur `http://localhost:8798`.

1. Chargez la page en ligne et attendez que le Service Worker soit actif dans les outils du navigateur, onglet Application.
2. Écoutez un son pour qu'il soit mis en cache.
3. Dans l'onglet Network, passez sur Offline puis rechargez la page.
4. Vérifiez la liste des sons, la lecture du son déjà écouté et l'ouverture de `/?action=record`.
5. Enregistrez un son, puis rétablissez le réseau et vérifiez son envoi.

Le build ajoute automatiquement les fichiers JavaScript et CSS au précache. Le HTML et ses bundles restent associés à une même version. Le manifeste est servi depuis le cache puis actualisé en arrière-plan ; les données API utilisent le réseau avec un secours en cache. Les fichiers audio téléchargés restent disponibles après une mise à jour de l'interface. Les tuiles OpenStreetMap utilisent le cache HTTP normal du navigateur : le fond de carte complet n'est pas garanti hors connexion. Aucun téléchargement groupé de tuiles n'est prévu, conformément à la [politique du serveur OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/).

Pour vérifier la bannière de mise à jour, gardez la preview ouverte, modifiez un fichier de l'interface et relancez `npm run build` dans un autre terminal. Rechargez la page en ligne : une nouvelle version doit être proposée. Le bouton de mise à jour active le nouveau worker et recharge l'application.

### Vérifier l’enregistrement et les permissions

- Ouvrez le formulaire : aucune permission ne doit être demandée avant un clic sur « Enregistrer » ou « Obtenir ma position ».
- Refusez le micro : un message doit apparaître, et vous devez pouvoir fermer le formulaire.
- Autorisez le micro puis fermez pendant l’enregistrement : l’indicateur du microphone doit disparaître. Vérifiez aussi la fermeture pendant une demande de permission.
- Refusez la position : utilisez « Choisir le lieu », puis cliquez sur la petite carte ou saisissez la latitude et la longitude. La sauvegarde reste désactivée sans position valide.
- En mode Offline, la saisie des coordonnées reste disponible même si le fond de carte ne charge pas.
- Après Stop, écoutez le son et sauvegardez-le. Le formulaire se ferme après l’écriture locale ; l’envoi au serveur se poursuit en arrière-plan. En cas d’échec de l’écriture locale, le formulaire garde le son et affiche une erreur.
- Sur téléphone, vérifiez l’enregistrement, la lecture et l’envoi : le format choisi dépend du navigateur (WebM, MP4 ou Ogg).

### Vérifier l’installation mobile

Une fois l’application déployée en HTTPS, ouvrez son URL sur un téléphone :

- **Android / Chrome** : utilisez « Installer l’app » quand le navigateur propose l’installation, puis lancez Soundscape depuis l’écran d’accueil.
- **iPhone / Safari** : ouvrez le menu de partage, choisissez « Sur l’écran d’accueil », activez « Ouvrir comme app web » si cette option est proposée, puis ajoutez l’app. Le [guide Apple](https://support.apple.com/fr-fr/guide/iphone/iphea86e5236/ios) détaille les étapes. Safari utilise ce menu, sans afficher le bouton d’installation personnalisé de Chrome.
- Vérifiez l’icône, le nom « Soundscape V2 », l’ouverture en mode autonome et l’absence du bouton d’installation dans ce mode. Fermez puis relancez l’app depuis son icône.
- Dans DevTools → Application → Manifest, vérifiez les icônes 192 et 512, le mode `standalone`, la couleur verte `#3f604e` et le fond crème `#f6f3ed`.

La détection utilise `display-mode: standalone` ainsi que `navigator.standalone` sur iOS. Le test sur un vrai téléphone reste à effectuer après le déploiement.

### Vérifier le contenu public et le SEO

La présentation de l’accueil est dans le HTML initial, sous « À propos ». Elle est ouverte par défaut, avec et sans JavaScript, et peut être repliée pour explorer la carte. [public/soundscape.md](./public/soundscape.md) reprend ce contenu en Markdown ; gardez les deux versions cohérentes si vous changez le texte. Ce fichier est précaché, y compris lors de son ouverture depuis un lien hors connexion. Le HTML référence cette version avec `rel="alternate"`, et `llms.txt` la signale aussi.

La PWA conserve `https://pwacorsica-soundscape.ounesshimi.workers.dev`. Garder `SITE_URL=https://pwacorsica-soundscape.ounesshimi.workers.dev` dans les variables de build Cloudflare. Pour le build local, définir la même variable avant `npm run build`.

Le build ajoute automatiquement la canonical, `og:url`, `og:image` (l’icône 512 existante) et l’URL du `WebApplication` JSON-LD dans `dist/index.html`. Il utilise le même domaine pour `dist/robots.txt`, `dist/sitemap.xml` et les liens de `dist/llms.txt`. Sans `SITE_URL`, ces URL restent absentes et le sitemap reste vide : aucune adresse de déploiement fictive n’est publiée. La configuration suppose que l’application est servie à la racine du domaine.

Le sitemap contient aussi `lastmod`, calculé depuis la date du dernier commit qui touche le contenu HTML, Markdown ou l’interface. Une archive sans historique Git utilise la date du build. Un simple redéploiement dans un dépôt complet ne change pas cette date : elle représente la dernière modification significative, conformément aux [recommandations Google](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

Chaque robot du contrôle du Hub a un groupe explicite et une raison en commentaire dans `robots.txt`. Les règles gardent l’accueil accessible et excluent `/api/` et `/uploads/`. Cloudflare utilise `404-page` avec `public/404.html` : une adresse inconnue renvoie une vraie erreur 404. La page d’accueil et le raccourci `/?action=record` continuent de fonctionner. La preview Vite utilise également une réponse 404 pour les adresses inconnues.

Avec `npm run preview`, vérifiez depuis PowerShell :

```powershell
curl.exe -A "GPTBot" http://localhost:4183/
curl.exe -A "ClaudeBot" http://localhost:4183/soundscape.md
curl.exe -I http://localhost:4183/soundscape.md
curl.exe -H "Accept: text/markdown" http://localhost:4183/
curl.exe http://localhost:4183/robots.txt
curl.exe http://localhost:4183/sitemap.xml
curl.exe http://localhost:4183/llms.txt
curl.exe -I http://localhost:4183/une-page-qui-n-existe-pas
```

L’accueil doit contenir le titre, la présentation et les listes sans exécuter JavaScript ; il reste en HTML même avec `Accept: text/markdown`. Le Markdown doit être servi avec `Content-Type: text/markdown; charset=utf-8`. Vite ajoute aussi `X-Robots-Tag: noindex` à cette version pour privilégier l’accueil HTML dans les résultats de recherche.

Après déploiement, refaites ces vérifications avec le domaine réel, configurez les en-têtes du Markdown sur l’hébergeur et vérifiez que l’image de partage est accessible. Le score Lighthouse SEO et les données structurées restent à vérifier sur l’URL publique.

Dans la fiche du cours, utiliser « Relancer l’analyse » après le nouveau déploiement. Le rapport reçu le 12 octobre indiquait 79/100 ; les modifications suivantes corrigent ses points signalés : présentation repliée, décisions explicites pour les robots, commentaires, date du sitemap et réponse 404. Le nouveau score reste à mesurer avec le même analyseur.

## Stack

- **Frontend** : React 19 + Vite
- **Carte** : Leaflet / react-leaflet
- **Stockage local** : IndexedDB (idb)
- **Backend public** : Cloudflare Worker + PostgreSQL et Storage Supabase
- **Backend local** : Express.js avec JSON et fichiers sur disque
- **Service Worker** : manuel (Cache First + Network First)

## Document technique

Voir [DOC-TECHNIQUE.md](./DOC-TECHNIQUE.md) pour l'application complète et [DOC-TECHNIQUE-V2.md](./DOC-TECHNIQUE-V2.md) pour l'ajout des notifications.

## Hébergement Cloudflare et Supabase

Pour les notifications, suivre [V2-NOTIFICATIONS.md](./V2-NOTIFICATIONS.md) : configuration du Worker existant, commit sur `main`, déploiement et test de réception. [DEPLOIEMENT.md](./DEPLOIEMENT.md) décrit la configuration initiale. La réception push réelle reste à valider après publication.

## Licence

Projet universitaire — M2 Informatique, Università di Corsica, 2026.
