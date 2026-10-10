// ============================================================
// Backend Express.js — Corsica Soundscape
// ============================================================
// API minimaliste :
//   GET  /api/sounds     → liste tous les sons
//   POST /api/sounds     → créer un son (multipart: audio + metadata)
//   GET  /api/sounds/:id → un son spécifique
//   PUT  /api/sounds/:id → modifier (bonus: If-Match / 412)
//
// Stockage : JSON + fichiers audio sur disque.
// Pourquoi Express et pas un BaaS ? Le TP valorise la compréhension
// de chaque couche. Express permet aussi le bonus If-Match/412.
// ============================================================

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const app = express();
const PORT = process.env.PORT || 3001;

// -- Config ---------------------------------------------------
app.use(cors());
app.use(express.json());

// Dossier pour les fichiers audio
const UPLOADS_DIR = process.env.SOUNDS_UPLOADS_DIR || join(__dirname, 'uploads');
if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

// Dossier pour la "base de données" JSON
const DB_FILE = join(process.env.SOUNDS_DATA_DIR || join(__dirname, 'data'), 'sounds.json');
const DB_DIR = dirname(DB_FILE);
if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });

// Servir les fichiers audio
app.use('/uploads', express.static(UPLOADS_DIR));

// -- Multer (upload audio) ------------------------------------
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = file.originalname.split('.').pop() || 'webm';
    cb(null, `${randomUUID()}.${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 Mo max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers audio sont acceptés'));
    }
  },
});

// -- Helpers DB -----------------------------------------------
function readDB() {
  if (!existsSync(DB_FILE)) return [];
  try {
    return JSON.parse(readFileSync(DB_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeDB(data) {
  writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// -- ROUTES ---------------------------------------------------

// GET /api/sounds — Liste tous les sons
app.get('/api/sounds', (req, res) => {
  const sounds = readDB();
  res.json(sounds);
});

// GET /api/sounds/:id — Un son spécifique
app.get('/api/sounds/:id', (req, res) => {
  const sounds = readDB();
  const sound = sounds.find((s) => s.id === req.params.id);
  if (!sound) return res.status(404).json({ error: 'Son non trouvé' });

  // Bonus : envoyer l'ETag pour If-Match
  res.set('ETag', `"${sound.version || 1}"`);
  res.json(sound);
});

// POST /api/sounds — Créer un nouveau son
app.post('/api/sounds', (req, res, next) => {
  const clientId = req.get('Idempotency-Key');
  if (clientId && clientId.length > 128) {
    return res.status(400).json({ error: 'Identifiant d’envoi invalide' });
  }
  const existing = clientId && readDB().find((sound) => sound.clientId === clientId);
  if (existing) return res.json(existing);
  next();
}, upload.single('audio'), (req, res) => {
  const { title, description, latitude, longitude, category } = req.body;
  const clientId = req.get('Idempotency-Key');
  const sounds = readDB();

  // Une autre requête peut avoir terminé pendant le transfert du fichier.
  const existing = clientId && sounds.find((sound) => sound.clientId === clientId);
  if (existing) {
    if (req.file) unlinkSync(req.file.path);
    return res.json(existing);
  }

  if (!title || !latitude || !longitude) {
    return res.status(400).json({ error: 'Titre, latitude et longitude requis' });
  }

  const sound = {
    id: randomUUID(),
    ...(clientId ? { clientId } : {}),
    title,
    description: description || '',
    latitude: parseFloat(latitude),
    longitude: parseFloat(longitude),
    category: category || 'autre',
    audioUrl: req.file ? `/uploads/${req.file.filename}` : null,
    createdAt: new Date().toISOString(),
    version: 1, // Pour le bonus If-Match
    synced: true,
  };

  sounds.unshift(sound); // Plus récent en premier
  writeDB(sounds);

  res.status(201).json(sound);
});

// PUT /api/sounds/:id — Modifier un son (bonus If-Match / 412)
// ============================================================
// Bonus : réconciliation de conflits avec If-Match / ETag.
// Le client envoie If-Match: "<version>" dans le header.
// Si la version serveur a changé entre-temps → 412 Precondition Failed.
// Le client doit alors re-fetch et réappliquer ses modifications.
// ============================================================
app.put('/api/sounds/:id', (req, res) => {
  const sounds = readDB();
  const index = sounds.findIndex((s) => s.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Son non trouvé' });

  const current = sounds[index];

  // Bonus : vérification If-Match
  const ifMatch = req.headers['if-match'];
  if (ifMatch) {
    const clientVersion = ifMatch.replace(/"/g, '');
    if (String(current.version || 1) !== clientVersion) {
      // 412 Precondition Failed — conflit !
      return res.status(412).json({
        error: 'Conflit : le son a été modifié par quelqu\'un d\'autre',
        current, // Renvoyer la version serveur pour que le client puisse merger
      });
    }
  }

  // Appliquer les modifications
  const updated = {
    ...current,
    ...req.body,
    id: current.id, // Protéger l'ID
    version: (current.version || 1) + 1, // Incrémenter la version
    updatedAt: new Date().toISOString(),
  };

  sounds[index] = updated;
  writeDB(sounds);

  res.set('ETag', `"${updated.version}"`);
  res.json(updated);
});

// -- Démarrage ------------------------------------------------
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`🎧 Corsica Soundscape API → http://localhost:${PORT}`);
    console.log('   Endpoints :');
    console.log('   GET  /api/sounds');
    console.log('   POST /api/sounds');
    console.log('   GET  /api/sounds/:id');
    console.log('   PUT  /api/sounds/:id (bonus If-Match)');
  });
}
