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
