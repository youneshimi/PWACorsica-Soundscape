# Corsica Soundscape — documentation technique

Documentation établie à partir du code de `main` (version `2.0.0`, novembre 2026). Elle distingue le comportement implémenté de l'architecture Android proposée.

| Document | Objet |
| --- | --- |
| [Architecture actuelle](architecture-actuelle.md) | Composants, données, parcours, hors ligne, sécurité et exploitation de la PWA |
| [Contrat API](contrat-api.md) | Routes du Worker, formats, validations et erreurs utiles à un client Android |
| [Migration Android Kotlin](migration-android-kotlin.md) | Architecture native cible, correspondance des fonctions et plan de réalisation |

## Point de départ

La PWA actuelle est un client React/Vite. En production, elle appelle **le Worker Cloudflare**, qui accède à Supabase PostgreSQL et à un bucket Storage privé. Le dossier `server/` est une ancienne API Express locale ; ce n'est pas le backend du client V2. L'application Android peut réutiliser le Worker et le contrat HTTP sans intégrer React, le service worker ou les clés Supabase dans l'APK.

Pour lancer le projet : `npm install`, puis `npm run preview:v2` pour le Worker local et `npm run dev` pour Vite. Pour vérifier : `npm test`, `npm run lint`, `npm run build`. La preview Vite après build est disponible via `npm run preview`. Les variables d'environnement sont décrites dans les fichiers `.dev.vars.example` et `.dev.vars.v2.example` ainsi que dans [DEPLOIEMENT.md](../DEPLOIEMENT.md).

Les documents historiques à la racine restent utiles pour les décisions de déploiement et les notifications : [DOC-TECHNIQUE.md](../DOC-TECHNIQUE.md), [DOC-TECHNIQUE-V2.md](../DOC-TECHNIQUE-V2.md) et [V2-NOTIFICATIONS.md](../V2-NOTIFICATIONS.md). Le code est la référence lorsque ces textes diffèrent.
