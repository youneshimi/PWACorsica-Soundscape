# Corsica Soundscape — Document Technique

**Auteur** · M2 Informatique, Università di Corsica · Octobre 2026  
**URL** · https://corsica-soundscape.vercel.app  
**Dépôt** · https://github.com/xxx/corsica-soundscape  
**Statut** · final

---

## 1. TL;DR

Corsica Soundscape est une carte sonore collaborative de la Corse. Les utilisateurs enregistrent des sons géolocalisés (mer, maquis, clochers, marchés) et les partagent sur une carte interactive. Le choix technique le plus important est l'architecture **offline-first avec outbox + Background Sync** : l'app fonctionne en mode avion, stocke les enregistrements localement, et les synchronise automatiquement au retour du réseau.

## 2. Contexte et objectifs

- **Problème** : la Corse possède un patrimoine sonore riche (polyphonies, nature, vie de village) qui n'est documenté nulle part de façon géolocalisée et collaborative. Cette PWA permet à quiconque de capturer et partager ces sons.
- **Sujet Hub** : libre — « carte sonore collaborative » (manipulation de données utilisateur + contenu public visible).

### Goals (v1)
- Enregistrer un son avec le micro, le géolocaliser automatiquement, le catégoriser et le sauvegarder
- Afficher les sons sur une carte Leaflet interactive avec filtrage par catégorie
- Fonctionner hors connexion : enregistrement, écoute des sons en cache, synchronisation au retour du réseau
- S'installer sur un téléphone comme une app native

### Non-goals
- Pas de compte utilisateur / authentification (v2)
- Pas d'édition audio (couper, mixer) — on capture le son brut
- Pas de streaming en temps réel

## 3. Architecture

### Stack
| Couche | Technologie | Pourquoi |
|---|---|---|
| Frontend | **React 19 + Vite** | DX rapide (HMR), écosystème riche, composants réutilisables |
| Carte | **Leaflet + react-leaflet** | Libre, léger (40 ko), tuiles offline possibles |
| Stockage local | **IndexedDB via `idb`** | Stocke des blobs audio (impossible en localStorage), API Promise |
| Service Worker | **Manuel** (pas Workbox) | Compréhension fine des stratégies de cache, contrôle total |
| Backend | **Express.js** | Simple, permet le bonus If-Match/412 pour les conflits |
| Hébergement | **Vercel** (front) + **Render/Railway** (API) | HTTPS auto, déploiement Git push |

### Arborescence

```
Navigateur
  ├── React App (SPA)
  │     ├── SoundMap (Leaflet)
  │     ├── SoundPanel (liste + player)
  │     ├── RecordModal (MediaRecorder + Geolocation)
  │     └── OfflineBanner / UpdateBanner / InstallButton
  │
  ├── Service Worker (sw.js)
  │     ├── Cache "soundscape-v1" (App Shell)
  │     ├── Stratégie Cache First (assets)
  │     ├── Stratégie Network First (API)
  │     └── Background Sync → flush outbox
  │
  └── IndexedDB "corsica-soundscape"
        ├── Store "sounds" (données affichées)
        └── Store "outbox" (actions en attente)

            │ fetch /api/sounds
            ▼
  Serveur Express.js
        ├── GET  /api/sounds
        ├── POST /api/sounds (multipart)
        ├── PUT  /api/sounds/:id (If-Match / 412)
        └── /uploads/ (fichiers audio)
```

### Pipeline de déploiement
1. `git push` → Vercel build automatique (front React)
2. Le serveur Express est déployé sur Render/Railway (Git push aussi)
3. Les variables d'environnement configurent l'URL de l'API

## 4. Cache et hors ligne

| Ressource | Stratégie | Stockage | Pourquoi |
|---|---|---|---|
| HTML / CSS / JS | **Cache First** | Cache API (`soundscape-v1`) | Assets versionnés par Vite (hash dans le nom), chargement instantané |
| Données API (`/api/sounds`) | **Network First** | Cache API (fallback) | On veut la donnée fraîche, mais le cache sert hors ligne |
| Sons audio (blobs) | Stockage local | IndexedDB | Les blobs > 5 Mo ne tiennent pas en cache standard ; IDB gère |
| Images carte (tuiles) | Cache First dynamique | Cache API | Les tuiles visitées sont mises en cache au fil de la navigation |

### Expérience hors ligne
- **Ce qui marche** : l'app s'ouvre, la carte affiche les tuiles déjà visitées, la liste des sons locaux est visible, on peut écouter les sons en cache, on peut enregistrer un nouveau son (sauvé dans l'outbox)
- **Ce qui est désactivé** : un badge ⏳ indique les sons en attente de sync, la bannière "Hors connexion" s'affiche en bas
- **Page de secours** : `offline.html` — affichée si une navigation échoue sans cache (rare : App Shell pré-caché)

## 5. Mise à jour

- **Stratégie** : nouvelle version **proposée à l'utilisateur** (bannière "Mettre à jour")
- **Pourquoi pas d'office** : l'utilisateur peut être en train d'enregistrer un son. Un rechargement forcé perdrait l'enregistrement en cours. La bannière laisse le choix.
- **Mécanisme** :
  1. Le SW est versionné (`CACHE_NAME = 'soundscape-v1'`, v2, v3…)
  2. Au `updatefound`, si un nouveau SW est `installed` et qu'il y a déjà un controller → on affiche `<UpdateBanner>`
  3. Au clic "Mettre à jour" → `postMessage({ type: 'SKIP_WAITING' })` au SW en attente
  4. Le SW appelle `self.skipWaiting()` → `controllerchange` → la page se recharge

## 6. Données et synchronisation

### Modèle de données (IndexedDB)

**Store `sounds`** :
| Champ | Type | Index |
|---|---|---|
| `id` (keyPath) | string (UUID) | — |
| `title` | string | — |
| `description` | string | — |
| `latitude` | number | `by-location` (compound) |
| `longitude` | number | `by-location` (compound) |
| `category` | string | `by-category` |
| `audioBlob` | Blob | — |
| `audioUrl` | string | — |
| `createdAt` | string (ISO) | `by-date` |
| `synced` | boolean | — |

**Store `outbox`** :
| Champ | Type |
|---|---|
| `id` (autoIncrement) | number |
| `title`, `description`, `latitude`, `longitude`, `category` | mêmes que sounds |
| `audioBlob` | Blob |
| `createdAt` | string |
| `status` | `'pending'` |

### Outbox pattern
1. L'utilisateur enregistre un son → sauvé dans `sounds` (affichage immédiat) ET dans `outbox`
2. Si **en ligne** → `fetch POST /api/sounds` immédiat → suppression de l'outbox
3. Si **hors ligne** → reste dans l'outbox :
   - **Chrome** : `registration.sync.register('sync-outbox')` → le SW reçoit l'événement `sync` au retour du réseau et flush l'outbox
   - **Firefox/Safari** (pas de Background Sync) : fallback `window.addEventListener('online', flushOutbox)` → flush à la reconnexion
4. **Échec** : l'entrée reste dans l'outbox, sera re-tentée au prochain sync/online

### Conflits (bonus)
- **Stratégie** : `If-Match` / `412 Precondition Failed`
- Le serveur maintient un champ `version` (incrémenté à chaque PUT)
- Le client envoie `If-Match: "<version>"` dans le PUT
- Si la version serveur a changé → 412 avec la version courante → le client peut merger ou écraser
- **Acceptable ici** : les sons sont rarement modifiés par deux personnes (l'auteur modifie son propre son)

## 7. Permissions et capacités de l'appareil

| Capacité / API | Déclenchée quand | Pourquoi à ce moment | Si refus |
|---|---|---|---|
| **Microphone** (MediaRecorder) | Clic sur "Enregistrer" dans la modal | L'utilisateur comprend qu'il a besoin du micro pour capturer un son | Message : "Autorisez le micro dans les paramètres". L'app reste fonctionnelle (écoute seule). |
| **Géolocalisation** | Clic sur "Obtenir ma position" ou début d'enregistrement | L'utilisateur veut placer son son sur la carte | Message : "Position refusée, vous pouvez placer le son manuellement". Le son est placé aléatoirement en Corse. |
| **Notifications** | Après le premier enregistrement réussi | L'utilisateur a prouvé son intérêt pour l'app | Les notifications sont désactivées. Aucune dégradation fonctionnelle. |

## 8. Notifications

- **Type** : notifications **locales** (depuis le Service Worker)
- **Moment de la demande** : après la première action réussie (enregistrement), pas au chargement
- **Contenu** :
  - Confirmation de synchronisation : "Son synchronisé ! — Vagues à Palombaggia a été envoyé."
  - Nouveau son dans la zone (si l'API push est activée en v2)
- **Au clic** : ouvre l'app / focus sur la fenêtre existante
- Push notifications via Firebase : prévu pour la v2 (nécessite un compte utilisateur)

## 9. Visibilité : SEO et agents IA

### Dans le HTML initial
- `<title>` et `<meta description>` descriptifs
- Contenu `<noscript>` : titre, description, liste de sons populaires (les crawlers voient du contenu sans JS)
- Open Graph (`og:title`, `og:description`, `og:type`, `og:locale`)
- JSON-LD `WebApplication` avec `contentLocation` (Corse, coordonnées GPS)

### Pas dans le HTML initial
- Les sons dynamiques (chargés via API) → parce que c'est du contenu généré par les utilisateurs, pas du contenu éditorial. Le SSR serait la solution pour la v2.

### Fichiers de découverte

| Fichier | Décision | Raison |
|---|---|---|
| `robots.txt` | `Allow: /` pour tous, `Disallow: /api/` et `/uploads/` | Le contenu public est la page, pas l'API brute ni les fichiers audio |
| `sitemap.xml` | 1 URL (la page d'accueil) | SPA mono-page, pas de routes multiples |
| `llms.txt` | Présent : description, fonctionnalités, stack, API | Permet aux agents IA de comprendre le projet |
| `robots.txt` crawlers IA | `GPTBot Allow`, `ClaudeBot Allow`, `Google-Extended Allow` | Contenu éducatif, pas de raison de bloquer |

## 10. Sécurité et vie privée

- **Données sur l'appareil** : sons audio (blobs), métadonnées (titre, position, catégorie) dans IndexedDB. Pas de données personnelles sensibles.
- **Ce qui part au serveur** : fichier audio + métadonnées (titre, description, position, catégorie). Pas de nom, pas d'email, pas de cookie de tracking.
- **Secrets** : aucun côté client. Pas de clé API exposée. Les tuiles Leaflet sont publiques (CARTO/OSM).
- **En-têtes de sécurité** : à configurer sur le CDN de déploiement (Vercel headers) :
  - `Content-Security-Policy` : restreindre aux sources connues
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`

## 11. Mesures

- **Lighthouse PWA** : objectif score > 90 sur les 4 catégories
- **Core Web Vitals** :
  - LCP < 2.5s (carte Leaflet chargée)
  - FID < 100ms (pas de JS lourd bloquant)
  - CLS < 0.1 (layout stable, hauteur carte fixée en CSS)
- **Vérifications curl** :
  - `curl -s https://corsica-soundscape.vercel.app/ | grep "<title>"` → titre présent
  - `curl -s https://corsica-soundscape.vercel.app/robots.txt` → robots.txt répond
  - `curl -s https://corsica-soundscape.vercel.app/sitemap.xml` → sitemap répond
  - `curl -s https://corsica-soundscape.vercel.app/llms.txt` → llms.txt répond
- **Lighthouse SEO** : objectif > 90

## 12. Limites connues et suite

### Limites v1
- **iOS Safari** : Background Sync non supporté → fallback `online` event fonctionne, mais pas garanti si l'app est tuée par l'OS
- **iOS Safari** : `beforeinstallprompt` non supporté → l'utilisateur doit ajouter manuellement via "Ajouter à l'écran d'accueil"
- **Pas de SSR** : les sons dynamiques ne sont pas dans le HTML initial (SEO limité au contenu statique noscript)
- **Pas d'authentification** : n'importe qui peut poster un son (modération manuelle en v2)
- **Taille des fichiers audio** : limitée à 10 Mo par le serveur (suffisant pour ~3 min en WebM/Opus)

### v2
- Comptes utilisateurs (OAuth Google / GitHub)
- Push notifications via Firebase (nouveaux sons dans votre zone)
- SSR (Next.js) pour le SEO des sons individuels
- Modération communautaire (signalement, vote)
- Tuiles carte hors ligne pré-cachées pour la Corse
- Édition audio basique (couper début/fin)
