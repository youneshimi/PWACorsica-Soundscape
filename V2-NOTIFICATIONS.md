# Ajouter et tester les notifications sur le site actuel

La version 2.0.0 se publie depuis `main` sur le Worker existant `pwacorsica-soundscape`. Le lien reste https://pwacorsica-soundscape.ounesshimi.workers.dev/ et les enregistrements restent dans la table `sounds` et le bucket privé `sounds`.

La branche locale `v1-avant-notifications` garde un repère de la version précédente. Les changements de notifications sont préparés sur `main`, sans commit ni push automatique.

## 1. Supabase : le SQL est déjà exécuté

Vérifier dans **Table Editor** que `push_subscriptions_v2` existe. Elle contient les abonnements des appareils, pas les sons. La fonction `register_push_subscription_v2` permet au serveur d'inscrire un appareil avec son jeton de gestion.

L'ancien SQL V2 créait aussi `sounds_v2` et le bucket `sounds-v2`. Ils ne sont plus utilisés par cette version. Les laisser en place ; aucune migration des sons n'est nécessaire. Le fichier [supabase/v2.sql](./supabase/v2.sql) ajoute désormais seulement les abonnements. Si la première exécution a réussi, il n'est pas nécessaire de refaire cette étape.

## 2. Préparer les clés VAPID

Depuis PowerShell dans le projet :

```powershell
npm.cmd run push:keys
notepad .dev.vars.v2
```

Les clés sont déjà générées dans `.dev.vars.v2`, ignoré par Git. Le script conserve une paire existante. VAPID identifie le serveur qui envoie les notifications : sa clé publique est donnée au navigateur, sa clé privée reste sur le serveur. Copier les valeurs sans le nom ni le signe `=`. Ne pas changer cette paire après inscription des appareils, ni partager la clé privée.

## 3. Configurer le Worker actuel

Ouvrir **Cloudflare → Workers & Pages → pwacorsica-soundscape → Settings → Variables and Secrets**. Ajouter :

| Type | Nom | Valeur |
|---|---|---|
| Text | `VAPID_PUBLIC_KEY` | Valeur correspondante dans `.dev.vars.v2` |
| Secret | `VAPID_PRIVATE_KEY` | Valeur correspondante dans `.dev.vars.v2` |

Le secret `SUPABASE_SECRET_KEY` est déjà présent et reste nécessaire. Garder sa valeur actuelle. `SUPABASE_URL` et `VAPID_SUBJECT` sont définis dans `wrangler.jsonc`. `keep_vars: true` conserve la clé publique ajoutée dans le tableau de bord lors des déploiements Git. Appliquer les réglages avec **Save / Deploy**, selon le bouton affiché. Voir la [documentation Cloudflare des secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

Dans les réglages de build du même Worker, conserver :

- Branche de production : `main`
- Build : `npm run build`
- Deploy : `npx wrangler deploy`
- Racine : `/`
- Variable de build `SITE_URL` : `https://pwacorsica-soundscape.ounesshimi.workers.dev`

Aucun nouveau Worker n'est nécessaire. Les deux clés VAPID sont des réglages du Worker pendant les requêtes ; ne pas les placer dans des variables `VITE_*` ni dans Git.

## 4. Faire ton commit et ton push

Les changements sont déjà sur `main`. Vérifier, puis sélectionner les fichiers :

```powershell
git branch --show-current
git status --short
git add .gitignore .dev.vars.v2.example package.json package-lock.json wrangler.jsonc vite.config.js scripts/generate-vapid.js supabase/v2.sql worker/index.js worker/push.js src/App.jsx src/components/SoundPanel.jsx src/components/PushButton.jsx src/components/PushButton.css src/utils/push.js public/sw.js public/manifest.json index.html public/soundscape.md test/cloudflare-api.test.js test/service-worker.test.js test/push.test.js README.md DEPLOIEMENT.md DOC-TECHNIQUE.md V2-NOTIFICATIONS.md DOC-TECHNIQUE-V2.md
git diff --cached --stat
git commit -m "Ajoute les notifications push aux nouveaux sons"
git push origin main
```

`.dev.vars.v2` reste ignoré. Seul `.dev.vars.v2.example`, sans clés, est sélectionné. Attendre le succès du nouveau build Cloudflare. Le push sur `main` déclenche le déploiement ; **Retry build** est utile si le build a échoué ou si les réglages de build ont ensuite été corrigés.

## 5. Vérifier le déploiement

Ouvrir ces adresses dans de nouveaux onglets :

- https://pwacorsica-soundscape.ounesshimi.workers.dev/api/sounds : les sons existants doivent toujours être présents.
- https://pwacorsica-soundscape.ounesshimi.workers.dev/api/push/config : doit retourner `"enabled":true` et une clé publique, jamais la clé privée.

`enabled:true` vérifie la présence des réglages et que la clé privée VAPID correspond à la clé publique, par signature et vérification locales. L'inscription et la réception confirment ensuite que le service push et l'appareil fonctionnent ensemble. Une paire incohérente retourne `enabled:false` avec une explication, sans exposer la clé privée.

Si la configuration retourne `enabled:false`, vérifier les noms exacts des deux clés VAPID, leur type et le secret Supabase dans le bon Worker. Une réponse 404 signale généralement que le nouveau code n'est pas encore déployé.

Sur la PWA déjà ouverte, recharger en ligne et accepter **Mettre à jour** si la bannière apparaît. La carte affiche le repère **V2**. Aucune désinstallation ni suppression des données du navigateur n'est nécessaire. Dans DevTools → Application → Service workers, **Update** peut demander une vérification du nouveau `sw.js`. Ne pas utiliser **Clear storage** pendant cet essai.

Refermer « À propos ». Sur mobile, ouvrir la liste des sons. Le bouton **Recevoir les nouveaux sons** apparaît si le navigateur supporte les notifications et si la configuration est active.

## 6. Tester une vraie notification serveur

1. Sur l'appareil A, ouvrir la PWA en ligne, cliquer **Recevoir les nouveaux sons**, puis **Autoriser**.
2. Dans Supabase → Table Editor → `push_subscriptions_v2`, vérifier qu'une ligne est apparue. Ne pas publier une capture avec ses valeurs.
3. Mettre la PWA en arrière-plan sur A, en laissant le navigateur et le système disponibles pour recevoir les notifications.
4. Depuis un appareil B ou un autre profil de navigateur, ouvrir le même lien et enregistrer un nouveau son avec un titre reconnaissable, par exemple « Démonstration push ».
5. Attendre la fin de la synchronisation sur B. A doit recevoir **Un nouveau son en Corse**, avec le titre publié.
6. Cliquer la notification sur A : la PWA s'ouvre ou retrouve sa fenêtre, et le son est sélectionné sur la carte. La lecture reste déclenchée par le bouton de lecture.
7. Sur A, cliquer **Désactiver les notifications**. La ligne d'abonnement est retirée. Publier un autre son depuis B : A ne doit plus recevoir de notification.

Seuls les nouveaux sons synchronisés déclenchent un push. Une visite de la page, la liste des anciens sons et une relance du même envoi ne déclenchent rien. Un son enregistré hors connexion déclenche le push lors de son insertion au retour du réseau.

Sur iPhone/iPad, utiliser la PWA ajoutée à l'écran d'accueil avec iOS/iPadOS 16.4 ou ultérieur. L'autorisation doit venir du clic. Voir [WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

Le bouton **Push** de DevTools simule une réception locale : il sert à vérifier l'affichage mais ne prouve pas l'envoi serveur. Cocher le bonus du cours après réussite du parcours réel ci-dessus. Le lien de la fiche reste le même.

## Si aucune notification n'arrive

- Le mode HTTP d'envoi doit être `redirect: 'manual'` dans `worker/push.js`. Cloudflare rejette `redirect: 'error'` avant le départ de la requête, avec `Invalid redirect value` ; les simulations Node seules ne détectaient pas cette incompatibilité. Une redirection 3xx est traitée comme un échec et n'est jamais suivie. Le test `test/push-runtime.test.js` vérifie désormais les options réelles dans le moteur Cloudflare local, sans envoi à Apple.
- Après déploiement de l'ajout du test, recharger et accepter la mise à jour. Sur l'appareil déjà abonné, cliquer **Tester une notification**. Ce bouton envoie réellement un message serveur à cet appareil uniquement, après vérification de son jeton.
- Un message de succès signifie que le fournisseur a accepté l'envoi. Vérifier ensuite le centre de notifications et les réglages du système. Un abonnement absent ou expiré demande de désactiver puis réactiver les notifications. Un refus 401/403 demande de vérifier les clés et, si elles ont changé, de se réabonner.
- Vérifier `enabled:true`, le bouton activé et la présence de l'abonnement dans Supabase.
- Vérifier les autorisations de notification du navigateur et du système, ainsi que le mode « Ne pas déranger ».
- Vérifier que B a publié un nouveau son, visible dans `/api/sounds` après synchronisation.
- Dans les logs du Worker, chercher `[Push V2]` : `sent` compte les envois acceptés par le fournisseur, `expired` les abonnements retirés, `failed` les échecs. Un envoi accepté ne garantit pas l'affichage immédiat sur l'appareil.
- Ouvrir **Workers & Pages → pwacorsica-soundscape → Observability**, sélectionner une période récente et refaire le test. Le fichier Wrangler active explicitement la conservation des logs. Les nouveaux messages donnent le statut HTTP du fournisseur ou l'étape de l'échec, sans afficher les endpoints, jetons ou clés. Les événements antérieurs ne sont pas recréés. Voir [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).
- Après correction d'une paire VAPID erronée, se désabonner puis se réabonner avec les nouvelles clés.

## Tester en local

Renseigner le secret Supabase dans `.dev.vars.v2`, puis :

```powershell
$env:SITE_URL = 'https://pwacorsica-soundscape.ounesshimi.workers.dev'
npm.cmd run build
npm.cmd run preview:v2
```

Ouvrir `http://localhost:8798`. Le mode `--env v2` sert ici à charger `.dev.vars.v2` pour les essais locaux ; le déploiement public utilise la commande habituelle sans `--env`. Le backend local appelle les mêmes ressources Supabase que le site public : un son publié localement est donc visible en production et peut notifier les abonnés réels.

Pour React, garder le Worker local lancé et utiliser `npm run dev` sur `http://localhost:5174`. La preview Vite utilise le port 4183 et le même proxy. Le bouton push est réservé au build de production.

## Fonctionnement et limites

Les abonnements sont privés, protégés par un jeton local dont seule l'empreinte est conservée en base, et limités à 20 appareils. Le Worker chiffre en `aes128gcm`, signe avec VAPID et utilise `waitUntil`. Il refuse les endpoints arbitraires et les redirections ; les abonnements expirés (404/410) sont retirés. Un échec temporaire garde l'abonnement.

`POST /api/push/test` filtre l'abonnement par endpoint et empreinte du jeton avant l'envoi. Il ne permet pas de tester les abonnements d'autres appareils. La désactivation reste disponible même si les clés VAPID doivent être corrigées.

La sauvegarde du son reste réussie si le push échoue. Il n'existe pas de file serveur persistante ni de relance automatique des notifications. La livraison dépend du fournisseur, du navigateur et du système. Une réponse perdue après insertion peut empêcher le push sans perdre le son.

Références : [bibliothèque Web Push](https://github.com/block65/webcrypto-web-push), [configuration Wrangler](https://developers.cloudflare.com/workers/wrangler/configuration/).
