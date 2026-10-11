# Déploiement Cloudflare et Supabase

Site : https://pwacorsica-soundscape.ounesshimi.workers.dev

Cloudflare sert l'interface et l'API. Supabase conserve les métadonnées dans PostgreSQL et les fichiers audio dans Storage. Le navigateur continue d'utiliser `/api/sounds` et `/uploads/` sur le domaine du site ; aucune clé Supabase n'est nécessaire dans React.

## 1. Préparer Supabase

Dans le projet `corsica-soundscape` :

1. Ouvrir **SQL Editor**, puis **New query**.
2. Copier tout le contenu de [supabase/setup.sql](./supabase/setup.sql), puis cliquer **Run**.
3. Vérifier dans **Table Editor** que `sounds` existe. Une table vide est normale au départ.
4. Vérifier dans **Storage** que le bucket `sounds` existe et reste **privé**. Il accepte les fichiers audio de 10 Mo maximum.
5. Ouvrir **Settings → API Keys**. Créer si nécessaire une clé secrète pour le Worker et copier sa valeur, qui commence par `sb_secret_`.

Cette clé reste côté serveur : ne pas la mettre sur GitHub, dans une variable `VITE_*`, ni dans un message ou une capture d'écran. L'URL du projet est déjà renseignée dans `wrangler.jsonc`. Ne pas connecter GitHub à Supabase pour cette étape : le déploiement Git est déjà géré par Cloudflare.

## 2. Configurer Cloudflare

Ouvrir **Workers & Pages → pwacorsica-soundscape → Settings → Variables and Secrets**. Ajouter :

| Type | Nom | Valeur |
|---|---|---|
| Secret | `SUPABASE_SECRET_KEY` | La clé `sb_secret_...` copiée dans Supabase |

Enregistrer/appliquer la configuration. Il s'agit d'un secret utilisé pendant les requêtes par le Worker, pas d'une variable de build.

Conserver séparément **Build → Variables and secrets → `SITE_URL`** avec `https://pwacorsica-soundscape.ounesshimi.workers.dev`. Ce réglage de build sert aux URL SEO.

Conserver les commandes de déploiement :

- Build : `npm run build`
- Deploy : `npx wrangler deploy`
- Dossier racine : `/`

Le fichier `wrangler.jsonc` fixe désormais le script de l'API et le dossier `dist`. Il évite une configuration Vite créée automatiquement uniquement dans l'environnement de build Cloudflare. Les routes `/api/*` et `/uploads/*` passent par le Worker ; les autres ressources sont servies depuis `dist`.

## 3. Commit et push

Depuis PowerShell dans `D:\PWASoundscape` :

```powershell
git add .gitignore .dev.vars.example wrangler.jsonc package.json package-lock.json worker/index.js supabase/setup.sql public/_headers build/service-worker.js test/cloudflare-api.test.js test/pwa-build.test.js README.md DEPLOIEMENT.md
git diff --cached --stat
git commit -m "Ajoute l'API Cloudflare et le stockage Supabase"
git push origin main
```

Ces commandes sélectionnent les fichiers de cette étape. Les données et enregistrements du serveur local ne font pas partie de ce commit.

Attendre le succès du nouveau déploiement Cloudflare.

## 4. Vérifier en ligne

Ouvrir https://pwacorsica-soundscape.ounesshimi.workers.dev/api/sounds directement dans un nouvel onglet. Une base vide doit répondre `[]` en JSON, et non avec le HTML de l'accueil.

Dans PowerShell :

```powershell
curl.exe -i https://pwacorsica-soundscape.ounesshimi.workers.dev/api/sounds
curl.exe -I https://pwacorsica-soundscape.ounesshimi.workers.dev/soundscape.md
```

- `503` : la clé manque ou n'est pas une clé secrète `sb_secret_`.
- `502` : vérifier le projet Supabase, l'exécution du SQL et la clé du bon projet. Une panne réseau du fournisseur produit aussi ce statut.
- `200` avec du HTML : l'ancien déploiement est encore servi ; vérifier le dernier build et la présence du fichier `wrangler.jsonc` dans le commit.

Puis effectuer un vrai enregistrement court :

1. Ouvrir le site, accepter la mise à jour proposée et enregistrer quelques secondes de son.
2. Choisir le lieu, donner un titre, sauvegarder et attendre la synchronisation.
3. Vérifier la nouvelle ligne dans **Table Editor → sounds** et le fichier dans **Storage → sounds**.
4. Ouvrir le site dans une fenêtre privée ou sur un autre appareil : le son doit apparaître et se lire. Cela vérifie la conservation sur le serveur.
5. Écouter le son en ligne, passer hors connexion et vérifier sa lecture.
6. Créer un autre son hors connexion, revenir en ligne et vérifier qu'il est envoyé une seule fois.

Les sons déjà sauvegardés par Express dans `server/data` et `server/uploads` ne sont pas importés automatiquement. Pour la démonstration publique, créer de nouveaux sons depuis le site après la connexion de Supabase.

## Tester le Worker en local

Le développement habituel reste `npm run dev` avec Express. Pour essayer le backend Cloudflare à la place :

```powershell
Copy-Item .dev.vars.example .dev.vars
# Renseigner la clé dans .dev.vars avec un éditeur, pas dans une commande partagée.
npm.cmd run build
npx.cmd wrangler dev --local
```

Attention : `--local` exécute le Worker sur l'ordinateur, mais ses appels Supabase utilisent le vrai projet indiqué dans la configuration. Les enregistrements de cet essai y seront donc conservés.

## Limites

Le site permet de lire et créer des sons sans compte utilisateur. La table et le bucket sont fermés aux clés publiques Supabase, mais les contributions restent ouvertes via l'API. Le Worker valide les métadonnées, les formats et la taille ; il ne fournit pas de modération ni de limitation par utilisateur.

Une contrainte unique sur `client_id` évite les doublons lors des reprises d'envoi. Les fichiers supplémentaires d'une concurrence ou d'un échec confirmé de la base sont supprimés. Après une interruption réseau dont le résultat est inconnu, un fichier non référencé peut rester dans Storage : il est conservé pour éviter d'effacer l'audio d'une insertion potentiellement réussie. Aucun nettoyage automatique différé n'est prévu.

L'API Cloudflare fournit `GET` et `POST /api/sounds`, ainsi que `GET`/`HEAD /uploads/<fichier>`. L'édition `PUT` et `If-Match` du serveur Express local ne sont pas disponibles sur ce backend public et ne sont pas utilisées par l'interface.

Les offres gratuites ont des quotas de stockage, de trafic et de requêtes. Vérifier leur consommation dans les tableaux de bord. L'installation, les permissions et les formats audio restent à valider sur un vrai téléphone ; les tests locaux ne prouvent pas ces résultats.

Références : [clés Supabase](https://supabase.com/docs/guides/getting-started/api-keys), [bucket privé](https://supabase.com/docs/guides/storage/serving/downloads), [routage Worker et fichiers statiques](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/).
