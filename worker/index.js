import { handlePush, notifyNewSound, pushConfigured } from './push.js';

const MAX_AUDIO_SIZE = 10 * 1024 * 1024;
const MAX_BODY_SIZE = MAX_AUDIO_SIZE + 64 * 1024;
const CATEGORIES = new Set(['mer', 'nature', 'village', 'animal', 'musique', 'marche', 'autre']);
const EXTENSIONS = {
  'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/aac': 'aac',
};
const AUDIO_PATH = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(webm|m4a|ogg|mp3|wav|aac)$/;
const COLUMNS = 'id,client_id,title,description,latitude,longitude,category,audio_path,created_at';

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

function toSound(row) {
  return {
    id: row.id, clientId: row.client_id,
    title: row.title, description: row.description,
    latitude: row.latitude, longitude: row.longitude, category: row.category,
    audioUrl: `/uploads/${row.audio_path}`, createdAt: row.created_at,
    version: 1, synced: true,
  };
}

function createStorage(env, fetcher) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY?.startsWith('sb_secret_')) {
    throw new ApiError(503, 'Configurez Supabase dans les secrets du Worker.');
  }
  const base = new URL(env.SUPABASE_URL);
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new ApiError(503, 'URL Supabase invalide.');
  }

  async function call(path, options = {}) {
    const headers = new Headers(options.headers);
    headers.set('apikey', env.SUPABASE_SECRET_KEY);
    headers.set('User-Agent', 'Corsica-Soundscape-Worker');
    // Une clé sb_secret n'est pas un JWT : elle se transmet dans apikey.
    return fetcher(new URL(path, base), { ...options, headers, signal: AbortSignal.timeout(10000) });
  }

  async function rows(filters = {}) {
    const query = new URLSearchParams({ select: COLUMNS, ...filters });
    const response = await call(`/rest/v1/sounds?${query}`);
    if (!response.ok) throw new ApiError(502, 'La base de sons est indisponible.');
    const result = await response.json();
    if (!Array.isArray(result)) throw new ApiError(502, 'Réponse Supabase invalide.');
    return result;
  }

  return {
    call, rows,
    async find(clientId) {
      return (await rows({ client_id: `eq.${clientId}`, limit: '1' }))[0];
    },
    async remove(path) {
      const response = await call('/storage/v1/object/sounds', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [path] }),
      });
      if (!response.ok) throw new ApiError(502, 'Nettoyage du fichier impossible.');
    },
  };
}

async function readForm(request) {
  if (!request.headers.get('Content-Type')?.startsWith('multipart/form-data')) {
    throw new ApiError(415, 'Un formulaire multipart est requis.');
  }
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_SIZE) {
    throw new ApiError(413, 'Le fichier audio dépasse 10 Mo.');
  }
  // Vérifier aussi les envois sans Content-Length avant de parser le formulaire.
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'Formulaire manquant.');
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_SIZE) {
      await reader.cancel();
      throw new ApiError(413, 'Le fichier audio dépasse 10 Mo.');
    }
    chunks.push(value);
  }
  try {
    return await new Response(new Blob(chunks), { headers: { 'Content-Type': request.headers.get('Content-Type') } }).formData();
  } catch {
    throw new ApiError(400, 'Formulaire invalide.');
  }
}

function metadata(form) {
  const title = form.get('title');
  const description = form.get('description') ?? '';
  const category = form.get('category') || 'autre';
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 80 || typeof description !== 'string' || description.length > 300) {
    throw new ApiError(400, 'Titre (80 caractères maximum) ou description (300 maximum) invalide.');
  }
  const coordinates = ['latitude', 'longitude'].map((key) => {
    const value = form.get(key);
    if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Number(value))) {
      throw new ApiError(400, 'La position est requise.');
    }
    return Number(value);
  });
  const [latitude, longitude] = coordinates;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || !CATEGORIES.has(category)) {
    throw new ApiError(400, 'Position ou catégorie invalide.');
  }
  const audio = form.get('audio');
  const type = audio instanceof Blob ? audio.type.split(';')[0].toLowerCase() : '';
  if (!EXTENSIONS[type] || !audio.size) throw new ApiError(400, 'Un fichier audio valide est requis.');
  if (audio.size > MAX_AUDIO_SIZE) throw new ApiError(413, 'Le fichier audio dépasse 10 Mo.');
  return { fields: { title: title.trim(), description, latitude, longitude, category }, audio, type };
}

async function saveSound(request, storage) {
  const clientId = request.headers.get('Idempotency-Key');
  if (!clientId || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(clientId)) {
    throw new ApiError(400, 'Identifiant d’envoi invalide.');
  }
  const existing = await storage.find(clientId);
  if (existing) return json(toSound(existing));

  const { fields, audio, type } = metadata(await readForm(request));
  const path = `${crypto.randomUUID()}.${EXTENSIONS[type]}`;
  const uploaded = await storage.call(`/storage/v1/object/sounds/${path}`, {
    method: 'POST', headers: { 'Content-Type': type, 'x-upsert': 'false' }, body: audio,
  });
  if (!uploaded.ok) throw new ApiError(502, 'Le fichier audio n’a pas pu être sauvegardé.');

  let inserted;
  try {
    inserted = await storage.call('/rest/v1/sounds', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ ...fields, client_id: clientId, audio_path: path }),
    });
    if (inserted.ok) {
      const [row] = await inserted.json();
      if (row?.id) return json(toSound(row), 201);
    }
  } catch {
    // La réponse peut être perdue après une insertion réussie.
    // Relire avant de supprimer un fichier qui pourrait déjà être référencé.
  }

  const winner = await storage.find(clientId);
  if ((winner && winner.audio_path !== path) || (!winner && inserted && !inserted.ok)) {
    try {
      await storage.remove(path);
    } catch {
      console.warn('Un fichier audio non référencé reste à nettoyer dans Storage.');
    }
  }
  if (winner) return json(toSound(winner));
  throw new ApiError(502, 'La sauvegarde est à réessayer. Le son reste dans la file locale.');
}

async function serveAudio(request, storage, path) {
  if (!AUDIO_PATH.test(path)) throw new ApiError(404, 'Son non trouvé.');
  if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Méthode non autorisée.' }, 405, { Allow: 'GET, HEAD' });
  const headers = new Headers();
  if (request.headers.has('Range')) headers.set('Range', request.headers.get('Range'));
  const response = await storage.call(`/storage/v1/object/authenticated/sounds/${path}`, { method: request.method, headers });
  if (![200, 206, 416].includes(response.status)) {
    // Storage retourne parfois 400 avec statusCode 404 dans le corps.
    const error = await response.json().catch(() => ({}));
    if (response.status === 404 || String(error.statusCode) === '404') throw new ApiError(404, 'Son non trouvé.');
    throw new ApiError(502, 'Le fichier audio est indisponible.');
  }
  const outputHeaders = new Headers({ 'Cache-Control': response.status === 416 ? 'no-store' : 'public, max-age=86400, immutable' });
  for (const key of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag']) {
    if (response.headers.has(key)) outputHeaders.set(key, response.headers.get(key));
  }
  return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers: outputHeaders });
}

export async function handleRequest(request, env, fetcher = fetch, context) {
  const url = new URL(request.url);
  const isApi = url.pathname === '/api' || url.pathname.startsWith('/api/');
  const isAudio = url.pathname === '/uploads' || url.pathname.startsWith('/uploads/');
  if (!isApi && !isAudio) return env.ASSETS.fetch(request);
  try {
    if (url.pathname.startsWith('/api/push/')) {
      const storage = url.pathname === '/api/push/config' ? null : createStorage(env, fetcher);
      return await handlePush(request, env, storage, fetcher);
    }
    if (isApi && url.pathname !== '/api/sounds') throw new ApiError(404, 'Route API inconnue.');
    const storage = createStorage(env, fetcher);
    if (isAudio) return await serveAudio(request, storage, url.pathname.slice('/uploads/'.length));
    if (request.method === 'POST') {
      const response = await saveSound(request, storage);
      if (response.status === 201 && pushConfigured(env)) {
        const sound = await response.clone().json();
        const delivery = notifyNewSound(storage, env, sound, fetcher)
          .catch(() => console.warn('[Push V2] Envoi indisponible ; le son est sauvegardé.'));
        if (context?.waitUntil) context.waitUntil(delivery);
        else await delivery;
      }
      return response;
    }
    if (request.method === 'GET') {
      const sounds = [];
      // PostgREST limite chaque réponse : charger les pages successives.
      let offset = 0;
      while (true) {
        const page = await storage.rows({ order: 'created_at.desc,id.asc', limit: '1000', offset: String(offset) });
        sounds.push(...page.map(toSound));
        if (page.length < 1000) break;
        offset += page.length;
      }
      return json(sounds, 200, { 'X-Soundscape-Source': 'network' });
    }
    return json({ error: 'Méthode non autorisée.' }, 405, { Allow: 'GET, POST' });
  } catch (error) {
    return json({ error: error instanceof ApiError ? error.message : 'Le service de sons est momentanément indisponible.' }, error instanceof ApiError ? error.status : 502);
  }
}

export default {
  fetch(request, env, context) {
    return handleRequest(request, env, fetch, context);
  },
};
