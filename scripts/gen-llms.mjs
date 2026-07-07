// Generates AI/SEO discovery files from the docs content at build time:
//   public/llms.txt       — the llms.txt standard (index + one-line descriptions)
//   public/llms-full.txt  — every page's full markdown, concatenated (for LLM ingest)
//   public/sitemap.xml     — for search engines
// Run before `vite build` (see package.json).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const CONTENT = path.join(ROOT, 'content');
const PUBLIC = path.join(ROOT, 'public');
const BASE = process.env.DOCS_BASE_URL || 'https://docs.peeap.com';
const SUMMARY =
  'Peeap is a payment platform for Sierra Leone — wallets, cards, checkout, school fee payments, ' +
  'and a dial-to-verify phone Verification API. This documentation covers the developer APIs and integration guides.';

const docs = JSON.parse(fs.readFileSync(path.join(CONTENT, 'docs.json'), 'utf8'));

function parse(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  const fm = {};
  if (m) {
    for (const line of m[1].split('\n')) {
      const mm = line.match(/^(\w+):\s*(.*)$/);
      if (mm) fm[mm[1]] = mm[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  const body = raw.replace(/^---\n[\s\S]*?\n---\s*/, '').trim();
  return { fm, body };
}

const tabs = docs.navigation?.tabs || [];
let llms = `# ${docs.name || 'Peeap Documentation'}\n\n> ${SUMMARY}\n\n`;
let full = `# ${docs.name || 'Peeap Documentation'}\n\n> ${SUMMARY}\n`;
const urls = [];

for (const tab of tabs) {
  for (const group of tab.groups || []) {
    let groupLines = '';
    for (const pg of group.pages || []) {
      if (typeof pg !== 'string') continue;
      const file = path.join(CONTENT, pg + '.mdx');
      if (!fs.existsSync(file)) continue;
      const { fm, body } = parse(file);
      const title = fm.title || pg.split('/').pop();
      const desc = fm.description || '';
      const url = `${BASE}/${pg}`;
      urls.push(url);
      groupLines += `- [${title}](${url})${desc ? ': ' + desc : ''}\n`;
      full += `\n\n---\n\n# ${title}\n\nURL: ${url}\n${desc ? '\n' + desc + '\n' : ''}\n${body}\n`;
    }
    if (groupLines) llms += `## ${group.group}\n${groupLines}\n`;
  }
}

fs.mkdirSync(PUBLIC, { recursive: true });
fs.writeFileSync(path.join(PUBLIC, 'llms.txt'), llms);
fs.writeFileSync(path.join(PUBLIC, 'llms-full.txt'), full);

const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n') +
  `\n</urlset>\n`;
fs.writeFileSync(path.join(PUBLIC, 'sitemap.xml'), sitemap);

const robots = `User-agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n# AI docs index: ${BASE}/llms.txt\n`;
fs.writeFileSync(path.join(PUBLIC, 'robots.txt'), robots);

console.log(`gen-llms: ${urls.length} pages → llms.txt (${llms.length}b), llms-full.txt (${full.length}b), sitemap.xml, robots.txt`);
