import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { build, createServer, preview } from 'vite';
import { seoPlugin } from '../build/seo.js';
import { serviceWorkerPlugin } from '../build/service-worker.js';

test('le contenu public et les URL SEO restent cohérents dans le build servi sans JavaScript', async () => {
  const root = await mkdtemp(join(tmpdir(), 'soundscape-seo-test-'));
  const previousSiteUrl = process.env.SITE_URL;
  let server;
  let dev;
  try {
    delete process.env.SITE_URL;
    await cp(new URL('../public/', import.meta.url), join(root, 'public'), { recursive: true });
    const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    await writeFile(join(root, 'index.html'), source.replace('/src/main.jsx', '/entry.js'));
    await writeFile(join(root, 'entry.js'), 'console.log("Soundscape");');

    async function compile(siteUrl) {
      await build({ root, configFile: false, logLevel: 'silent', plugins: [seoPlugin({ siteUrl }), serviceWorkerPlugin()] });
      return readFile(join(root, 'dist', 'index.html'), 'utf8');
    }

    const local = await compile('');
    assert.doesNotMatch(local, /rel="canonical"|property="og:(url|image)"/);
    assert.doesNotMatch(await readFile(join(root, 'dist', 'robots.txt'), 'utf8'), /^Sitemap:/m);
    assert.doesNotMatch(await readFile(join(root, 'dist', 'sitemap.xml'), 'utf8'), /<loc>/);

    // Vérifie aussi la lecture de la configuration utilisée au déploiement.
    await writeFile(join(root, '.env.production.local'), 'SITE_URL=https://soundscape.test\n');
    const html = await compile();
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
    assert.match(html, /rel="canonical" href="https:\/\/soundscape.test\/"/);
    assert.match(html, /property="og:url" content="https:\/\/soundscape.test\/"/);
    assert.match(html, /property="og:image" content="https:\/\/soundscape.test\/img\/icon-512.png"/);
    const structured = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(structured.url, 'https://soundscape.test/');
    assert.equal(structured['@type'], 'WebApplication');
    const sw = await readFile(join(root, 'dist', 'sw.js'), 'utf8');
    const assets = JSON.parse(sw.match(/const CACHE_ASSETS = (\[[\s\S]*?\]);/)[1]);
    assert.ok(assets.includes('/soundscape.md'));
    assert.ok(!assets.includes('/robots.txt'));
    assert.ok(!assets.includes('/sitemap.xml'));

    server = await preview({ root, appType: 'mpa', configFile: false, logLevel: 'silent', plugins: [seoPlugin({ siteUrl: '' })], preview: { host: '127.0.0.1', port: 0 } });
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    const homepage = await fetch(`${base}/`, { headers: { 'User-Agent': 'GPTBot', Accept: 'text/markdown' } });
    assert.equal(homepage.status, 200);
    assert.match(homepage.headers.get('Content-Type'), /text\/html/);
    const publicHtml = await homepage.text();
    assert.match(publicHtml, /<h1>Corsica Soundscape<\/h1>/);
    assert.match(publicHtml, /<main class="public-content">/);
    assert.match(publicHtml, /<details class="public-info" open>/, 'La présentation doit être visible dès l’ouverture, avec et sans JavaScript');
    assert.match(publicHtml, /<ol>[\s\S]*Choisissez un point sur la carte/);
    assert.doesNotMatch(publicHtml, /<noscript>|Sons populaires/);
    assert.match(publicHtml, /rel="alternate" type="text\/markdown" href="\/soundscape.md"/);

    const markdown = await fetch(`${base}/soundscape.md`, { headers: { 'User-Agent': 'ClaudeBot' } });
    assert.equal(markdown.status, 200);
    assert.match(markdown.headers.get('Content-Type'), /^text\/markdown; charset=utf-8$/);
    assert.equal(markdown.headers.get('X-Robots-Tag'), 'noindex');
    const text = await markdown.text();
    assert.match(text, /^# Corsica Soundscape/);
    assert.match(text, /Ces exemples sont des idées d’enregistrement/);
    // Chaque texte public doit aussi être disponible dans la version Markdown.
    const main = publicHtml.match(/<main class="public-content">([\s\S]*?)<\/main>/)[1];
    for (const [, content] of main.matchAll(/<(?:p|li|h[12])>([^<]+)<\/(?:p|li|h[12])>/g)) {
      assert.ok(text.includes(content), `Texte absent du Markdown : ${content}`);
    }
    const head = await fetch(`${base}/soundscape.md`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.match(head.headers.get('Content-Type'), /text\/markdown/);
    assert.equal(await head.text(), '');

    const robots = await fetch(`${base}/robots.txt`);
    assert.equal(robots.status, 200);
    const rules = await robots.text();
    assert.match(rules, /^Sitemap: https:\/\/soundscape.test\/sitemap.xml$/m);
    for (const agent of ['Googlebot', 'GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'CCBot', 'Google-Extended']) {
      const group = rules.split(/\n\s*\n/).find((block) => block.includes(`User-agent: ${agent}\n`));
      assert.ok(group, `Groupe explicite absent : ${agent}`);
      assert.match(group, /^# .+\nUser-agent:/);
      assert.match(group, /^Allow: \/$/m);
      assert.match(group, /^Disallow: \/api\/$/m);
      assert.match(group, /^Disallow: \/uploads\/$/m);
    }
    const sitemap = await fetch(`${base}/sitemap.xml`);
    assert.equal(sitemap.status, 200);
    const xml = await sitemap.text();
    assert.match(xml, /<loc>https:\/\/soundscape.test\/<\/loc>/);
    const date = xml.match(/<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/)?.[1];
    assert.ok(date);
    assert.ok(date <= new Date().toISOString().slice(0, 10), 'La date du sitemap ne doit pas être dans le futur');
    assert.doesNotMatch(xml, /vercel.app/);
    const missing = await fetch(`${base}/une-page-qui-n-existe-pas`, { headers: { Accept: 'text/html' } });
    assert.equal(missing.status, 404);
    const llms = await fetch(`${base}/llms.txt`);
    assert.equal(llms.status, 200);
    assert.match(await llms.text(), /\]\(https:\/\/soundscape.test\/soundscape.md\)/);
    const image = await fetch(`${base}/img/icon-512.png`);
    assert.equal(image.status, 200);
    assert.match(image.headers.get('Content-Type'), /image\/png/);
    const png = new DataView(await image.arrayBuffer());
    assert.equal(png.getUint32(16), 512);
    assert.equal(png.getUint32(20), 512);

    dev = await createServer({ root, appType: 'mpa', configFile: false, logLevel: 'silent', plugins: [seoPlugin({ siteUrl: 'https://soundscape.test/' })], server: { host: '127.0.0.1', port: 0 } });
    await dev.listen();
    const devBase = `http://127.0.0.1:${dev.httpServer.address().port}`;
    const devHome = await fetch(`${devBase}/?action=record`, { headers: { Accept: 'text/markdown' } });
    assert.equal(devHome.status, 200);
    assert.match(devHome.headers.get('Content-Type'), /text\/html/);
    const devMarkdown = await fetch(`${devBase}/soundscape.md`);
    assert.match(devMarkdown.headers.get('Content-Type'), /text\/markdown/);
    const devRobots = await fetch(`${devBase}/robots.txt`);
    assert.match(await devRobots.text(), /^Sitemap: https:\/\/soundscape.test\/sitemap.xml$/m);
    assert.equal((await fetch(`${devBase}/une-page-qui-n-existe-pas`, { headers: { Accept: 'text/html' } })).status, 404);
  } finally {
    if (previousSiteUrl === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = previousSiteUrl;
    if (dev) await dev.close();
    if (server) await server.close();
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('soundscape-seo-test-'));
    await rm(root, { recursive: true, force: true });
  }
});

test('un domaine non HTTPS ou avec un sous-chemin est refusé avant de produire des URL incorrectes', async () => {
  for (const siteUrl of ['http://soundscape.test', 'https://soundscape.test/app', 'https://soundscape.test/?test=1']) {
    await assert.rejects(build({ configFile: false, logLevel: 'silent', plugins: [seoPlugin({ siteUrl })] }), /SITE_URL doit/);
  }
});
