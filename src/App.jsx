import React from 'react';
import { Routes, Route, NavLink, useLocation, Navigate, Link } from 'react-router-dom';
import { MDXProvider } from '@mdx-js/react';
import { mdxComponents } from './mintlify.jsx';
import docsConfig from '../content/docs.json';

// Compiled components + raw markdown (for the "Copy for AI" button).
const modules = import.meta.glob('../content/**/*.mdx', { eager: true });
const rawModules = import.meta.glob('../content/**/*.mdx', { query: '?raw', import: 'default', eager: true });
const keyOf = (p) => p.replace(/^.*\/content\//, '').replace(/\.mdx$/, '');

const pages = {};
for (const [p, mod] of Object.entries(modules)) {
  pages[keyOf(p)] = { Component: mod.default, meta: mod.frontmatter || {}, raw: '' };
}
for (const [p, raw] of Object.entries(rawModules)) {
  if (pages[keyOf(p)]) pages[keyOf(p)].raw = raw;
}

const prettify = (key) => (key.split('/').pop() || key).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const titleFor = (key) => pages[key]?.meta?.title || prettify(key);
const tabs = docsConfig?.navigation?.tabs || [];

// Flattened ordered list across all tabs (for breadcrumb + prev/next).
const flat = [];
for (const t of tabs) for (const g of t.groups || []) for (const pg of g.pages || []) {
  if (typeof pg === 'string' && pages[pg]) flat.push({ key: pg, group: g.group });
}
const groupOf = (key) => flat.find((f) => f.key === key)?.group;
const stripFrontmatter = (raw) => (raw || '').replace(/^---[\s\S]*?---\s*/, '');

function CopyPageButton({ pageKey }) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    const entry = pages[pageKey];
    if (!entry) return;
    const md = `# ${entry.meta?.title || prettify(pageKey)}\n\n${stripFrontmatter(entry.raw)}`.trim();
    navigator.clipboard?.writeText(md).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  return (
    <button className={`btn ${copied ? 'copied' : ''}`} onClick={copy}
      title="Copy this page as Markdown to paste into ChatGPT / Claude / DeepSeek">
      {copied ? '✓ Copied' : '⧉ Copy for AI'}
    </button>
  );
}

function Toc({ pathKey }) {
  const [items, setItems] = React.useState([]);
  React.useEffect(() => {
    const art = document.querySelector('.content');
    if (!art) return;
    const hs = Array.from(art.querySelectorAll('h2[id], h3[id]'));
    setItems(hs.map((h) => ({ id: h.id, text: (h.textContent || '').replace(/#$/, '').trim(), level: h.tagName === 'H3' ? 3 : 2 })));
  }, [pathKey]);
  return (
    <aside className="toc">
      {items.length > 0 && <>
        <div className="toc-title">On this page</div>
        {items.map((it) => <a key={it.id} href={`#${it.id}`} className={it.level === 3 ? 'h3' : ''}>{it.text}</a>)}
      </>}
    </aside>
  );
}

function Sidebar({ tab, setTab, onNavigate }) {
  return (
    <aside className="sidebar">
      <Link to="/introduction" className="brand" onClick={onNavigate}><span className="brand-dot" /> Peeap Docs</Link>
      {tabs.length > 1 && (
        <div className="tab-switch">
          {tabs.map((t, i) => (
            <button key={i} className={i === tab ? 'active' : ''} onClick={() => setTab(i)}>{t.tab}</button>
          ))}
        </div>
      )}
      <nav>
        {(tabs[tab]?.groups || []).map((g, gi) => (
          <div key={gi} className="nav-group">
            <div className="nav-group-title">{g.group}</div>
            {(g.pages || []).map((pg) =>
              typeof pg === 'string' && pages[pg] ? (
                <NavLink key={pg} to={'/' + pg} onClick={onNavigate}
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                  {titleFor(pg)}
                </NavLink>
              ) : null
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
}

function Page() {
  const loc = useLocation();
  const key = loc.pathname.replace(/^\//, '').replace(/\/$/, '') || 'introduction';
  const entry = pages[key];
  if (!entry) {
    return <div className="page-wrap"><article className="content">
      <h1>Page not found</h1><p>Nothing at <code>{key}</code>. Back to <Link to="/introduction">Introduction</Link>.</p>
    </article><aside className="toc" /></div>;
  }
  const C = entry.Component;
  const idx = flat.findIndex((f) => f.key === key);
  const prev = idx > 0 ? flat[idx - 1] : null;
  const next = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null;
  return (
    <div className="page-wrap">
      <article className="content">
        {entry.meta?.title && <h1 className="page-title">{entry.meta.title}</h1>}
        {entry.meta?.description && <p className="page-desc">{entry.meta.description}</p>}
        <MDXProvider components={mdxComponents}><C /></MDXProvider>
        <div className="page-nav">
          {prev ? <Link to={'/' + prev.key}><div className="lbl">← Previous</div><div className="ttl">{titleFor(prev.key)}</div></Link> : <span style={{ flex: 1 }} />}
          {next ? <Link to={'/' + next.key} style={{ textAlign: 'right' }}><div className="lbl">Next →</div><div className="ttl">{titleFor(next.key)}</div></Link> : <span style={{ flex: 1 }} />}
        </div>
      </article>
      <Toc pathKey={key} />
    </div>
  );
}

export function App() {
  const [tab, setTab] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const loc = useLocation();
  const key = loc.pathname.replace(/^\//, '').replace(/\/$/, '') || 'introduction';
  React.useEffect(() => {
    const entry = pages[key];
    const title = entry?.meta?.title || titleFor(key);
    document.title = `${title} · Peeap Docs`;
    const desc = entry?.meta?.description || 'Peeap developer documentation — payments, wallets, cards, and the phone Verification API.';
    let m = document.querySelector('meta[name="description"]');
    if (!m) { m = document.createElement('meta'); m.setAttribute('name', 'description'); document.head.appendChild(m); }
    m.setAttribute('content', desc);
    window.scrollTo(0, 0);
  }, [key]);
  return (
    <div className={`layout ${open ? 'nav-open' : ''}`}>
      <button className="menu-btn" onClick={() => setOpen((o) => !o)} aria-label="Menu">☰</button>
      <Sidebar tab={tab} setTab={setTab} onNavigate={() => setOpen(false)} />
      <div className="main">
        <div className="topbar">
          <div className="crumb">
            {groupOf(key) && <>{groupOf(key)} <span style={{ opacity: .4 }}>/</span> </>}
            <b>{titleFor(key)}</b>
          </div>
          <div className="topbar-actions"><CopyPageButton pageKey={key} /></div>
        </div>
        <Routes>
          <Route path="/" element={<Navigate to="/introduction" replace />} />
          <Route path="*" element={<Page />} />
        </Routes>
      </div>
    </div>
  );
}
