// Prerenders every docs route to static HTML after `vite build`.
//
// Why: this is a client-rendered SPA, so without this step every URL served the
// same empty <div id="root"></div> with one hardcoded canonical pointing at the
// homepage — which tells search engines the whole site is duplicates of one page.
// Each route now ships real content, its own <title>/description, and a
// self-referencing canonical.
//
// Requires `vite build --ssr src/entry-server.jsx --outDir dist-ssr` to have run.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve('.');
const CONTENT = path.join(ROOT, 'content');
const DIST = path.join(ROOT, 'dist');
const BASE = (process.env.DOCS_BASE_URL || 'https://docs.peeap.com').replace(/\/$/, '');

const SITE = 'Peeap Documentation';
const FALLBACK_DESC =
  'Peeap developer documentation — payments, wallets, cards, school fees, and the phone Verification API.';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function frontmatter(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  const fm = {};
  if (m) {
    for (const line of m[1].split('\n')) {
      const mm = line.match(/^(\w+):\s*(.*)$/);
      if (mm) fm[mm[1]] = mm[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return fm;
}

const prettify = (key) =>
  (key.split('/').pop() || key).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Same walk as gen-llms.mjs: docs.json is the source of truth for which pages exist.
const docs = JSON.parse(fs.readFileSync(path.join(CONTENT, 'docs.json'), 'utf8'));
const routes = [];
for (const tab of docs.navigation?.tabs || []) {
  for (const group of tab.groups || []) {
    for (const pg of group.pages || []) {
      if (typeof pg !== 'string') continue;
      const file = path.join(CONTENT, pg + '.mdx');
      if (!fs.existsSync(file)) continue;
      const fm = frontmatter(file);
      routes.push({
        key: pg,
        title: fm.title || prettify(pg),
        description: fm.description || FALLBACK_DESC,
      });
    }
  }
}

if (!routes.length) {
  console.error('prerender: no routes found in content/docs.json — refusing to overwrite dist.');
  process.exit(1);
}

const template = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
for (const marker of ['<!--seo-start-->', '<!--seo-end-->', '<!--app-->']) {
  if (!template.includes(marker)) {
    console.error(`prerender: build output is missing the ${marker} marker — index.html changed?`);
    process.exit(1);
  }
}

const SEO_BLOCK = /<!--seo-start-->[\s\S]*?<!--seo-end-->/;

function head({ title, description, url, index = true }) {
  const t = `${title} · Peeap Docs`;
  return [
    `<title>${esc(t)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta name="robots" content="${index ? 'index, follow' : 'noindex, follow'}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="${esc(SITE)}" />`,
    `<meta property="og:title" content="${esc(t)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(t)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
  ].join('\n    ');
}

const { render } = await import(pathToFileURL(path.join(ROOT, 'dist-ssr', 'entry-server.js')).href);

for (const r of routes) {
  const url = `${BASE}/${r.key}`;
  const app = render('/' + r.key);
  const html = template
    .replace(SEO_BLOCK, head({ title: r.title, description: r.description, url }))
    .replace('<!--app-->', app);

  // Flat `<key>.html`, not `<key>/index.html`: with cleanUrls, Vercel serves
  // guide/webhooks.html at /guide/webhooks. A nested index.html is not reliably
  // resolved ahead of the SPA rewrite fallback.
  const out = path.join(DIST, r.key + '.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
}

// dist/index.html is no longer the homepage — "/" 308-redirects to /introduction
// (see vercel.json). It survives only as the SPA fallback for URLs that don't
// exist, so it must not be indexed and must not claim a canonical.
fs.writeFileSync(
  path.join(DIST, 'index.html'),
  template.replace(
    SEO_BLOCK,
    head({ title: 'Not found', description: FALLBACK_DESC, url: `${BASE}/introduction`, index: false })
  )
);

console.log(`prerender: ${routes.length} routes → static HTML (canonical base ${BASE})`);
