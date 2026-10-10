# 🎧 Corsica Soundscape

Carte sonore collaborative de la Corse — PWA installable, offline-first.

Enregistrez des sons géolocalisés (vagues, vent du maquis, clochers, marchés) et explorez les ambiances de l'île de Beauté sur une carte interactive.

## Lancer en local

### Frontend (React + Vite)

```bash
npm install
npm run dev
```

L'app tourne sur `http://localhost:5173`

### Backend (Express.js)

```bash
cd server
npm install
npm start
```

L'API tourne sur `http://localhost:3001`

> Le proxy Vite redirige automatiquement `/api/*` vers le backend en développement.

### Vérifier le mode hors connexion

Le Service Worker est désactivé avec `npm run dev` pour éviter de mettre les modules de développement en cache. Pour tester la PWA, gardez le backend lancé et utilisez, depuis la racine du projet :

```bash
npm run build
npm run preview
```

Ouvrez l'adresse affichée par Vite, habituellement `http://localhost:4173`. Le proxy fonctionne aussi en preview pour `/api` et `/uploads`.

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

## Stack

- **Frontend** : React 19 + Vite
- **Carte** : Leaflet / react-leaflet
- **Stockage local** : IndexedDB (idb)
- **Backend** : Express.js
- **Service Worker** : manuel (Cache First + Network First)

## Document technique

Voir [DOC-TECHNIQUE.md](./DOC-TECHNIQUE.md)

## Licence

Projet universitaire — M2 Informatique, Università di Corsica, 2026.
