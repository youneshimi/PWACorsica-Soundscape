import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';
import { execFileSync } from 'node:child_process';

function contentModifiedDate(root) {
  const today = new Date().toISOString().slice(0, 10);
  try {
    // Date du dernier changement de contenu ; un simple rebuild ne la renouvelle pas.
    const date = execFileSync('git', ['log', '-1', '--format=%cs', '--', 'index.html', 'public/soundscape.md', 'src'],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today) return date;
  } catch {
    // Une archive sans historique Git utilise la date de sa construction.
  }
  return today;
}

export function seoPlugin(options = {}) {
  let config;
  let siteUrl;
  let lastModified;

  async function publicDocument(name) {
    const source = await readFile(resolve(config.publicDir, name), 'utf8');
    if (!siteUrl) return source;
    if (name === 'robots.txt') return `${source.trimEnd()}\n\nSitemap: ${siteUrl}sitemap.xml\n`;
    if (name === 'sitemap.xml') {
      return source.replace('</urlset>', `  <url>\n    <loc>${siteUrl}</loc>\n    <lastmod>${lastModified}</lastmod>\n  </url>\n</urlset>`);
    }
    return source.replace('](/)', `](${siteUrl})`).replace('](/soundscape.md)', `](${siteUrl}soundscape.md)`);
  }

  function documentsMiddleware(preview = false) {
    return async (request, response, next) => {
      const url = new URL(request.url, 'http://localhost');
      const pathname = url.pathname;
      // L’accueil reste en HTML, même avec Accept: text/markdown.
      if (pathname === '/' && ['GET', 'HEAD'].includes(request.method)) {
        request.url = `/index.html${url.search}`;
        return next();
      }
      const markdown = pathname === '/soundscape.md';
      const document = ['/robots.txt', '/sitemap.xml', '/llms.txt'].includes(pathname);
      if (!['GET', 'HEAD'].includes(request.method) || (!markdown && (!document || preview))) return next();
      try {
        const name = pathname.slice(1);
        const content = markdown
          ? await readFile(resolve(preview ? resolve(config.root, config.build.outDir) : config.publicDir, name), 'utf8')
          : await publicDocument(name);
        response.setHeader('Content-Type', markdown ? 'text/markdown; charset=utf-8'
          : pathname.endsWith('.xml') ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8');
        if (markdown) response.setHeader('X-Robots-Tag', 'noindex');
        response.statusCode = 200;
        response.end(request.method === 'HEAD' ? undefined : content);
      } catch (error) {
        next(error);
      }
    };
  }

  return {
    name: 'soundscape-seo',
    configResolved(resolved) {
      config = resolved;
      lastModified = contentModifiedDate(config.root);
      const value = (options.siteUrl ?? loadEnv(config.mode, config.envDir, '').SITE_URL ?? '').trim();
      if (value) {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
          throw new Error('SITE_URL doit être le domaine HTTPS de l’application, sans sous-chemin, paramètres ou identifiants.');
        }
        siteUrl = `${url.origin}/`;
      } else if (config.command === 'build') {
        config.logger.warn('SITE_URL non renseignée : les URL SEO seront ajoutées lorsque le domaine public sera connu.');
      }
    },
    transformIndexHtml(html) {
      if (!siteUrl) return html;
      const content = html.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/, (_, open, json, close) => {
        return `${open}\n${JSON.stringify({ ...JSON.parse(json), url: siteUrl }, null, 2)}\n${close}`;
      });
      return {
        html: content,
        tags: [
          { tag: 'link', attrs: { rel: 'canonical', href: siteUrl } },
          { tag: 'meta', attrs: { property: 'og:url', content: siteUrl } },
          { tag: 'meta', attrs: { property: 'og:image', content: `${siteUrl}img/icon-512.png` } },
          { tag: 'meta', attrs: { property: 'og:image:width', content: '512' } },
          { tag: 'meta', attrs: { property: 'og:image:height', content: '512' } },
          { tag: 'meta', attrs: { property: 'og:image:alt', content: 'Icône de Corsica Soundscape' } },
        ],
      };
    },
    configureServer(server) {
      server.middlewares.use(documentsMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(documentsMiddleware(true));
    },
    async writeBundle() {
      const output = resolve(config.root, config.build.outDir);
      for (const name of ['robots.txt', 'sitemap.xml', 'llms.txt']) {
        await writeFile(resolve(output, name), await publicDocument(name));
      }
    },
  };
}
