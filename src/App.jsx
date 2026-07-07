import React from 'react';
import { Routes, Route, NavLink, useLocation, Navigate, Link } from 'react-router-dom';
import { MDXProvider } from '@mdx-js/react';
import { mdxComponents } from './mintlify.jsx';
import docsConfig from '../content/docs.json';

// Eager-load all MDX pages (59 pages — fine for a docs SPA).
const modules = import.meta.glob('../content/**/*.mdx', { eager: true });
const keyOf = (p) => p.replace(/^.*\/content\//, '').replace(/\.mdx$/, '');
const pages = {};
for (const [p, mod] of Object.entries(modules)) {
  pages[keyOf(p)] = { Component: mod.default, meta: mod.frontmatter || {} };
}

const prettify = (key) =>
  (key.split('/').pop() || key).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const titleFor = (key) => pages[key]?.meta?.title || prettify(key);

const tabs = docsConfig?.navigation?.tabs || [];

function Sidebar({ tab, setTab, onNavigate }) {
  return (
    <aside className="sidebar">
      <Link to="/introduction" className="brand" onClick={onNavigate}>
        <span className="brand-dot" /> Peeap Docs
      </Link>
      {tabs.length > 1 && (
        <div className="tab-switch">
          {tabs.map((t, i) => (
            <button key={i} className={i === tab ? 'active' : ''} onClick={() => setTab(i)}>
              {t.tab}
            </button>
          ))}
        </div>
      )}
      <nav>
        {(tabs[tab]?.groups || []).map((g, gi) => (
          <div key={gi} className="nav-group">
            <div className="nav-group-title">{g.group}</div>
            {(g.pages || []).map((pg) =>
              typeof pg === 'string' && pages[pg] ? (
                <NavLink
                  key={pg}
                  to={'/' + pg}
                  onClick={onNavigate}
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                >
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
    return (
      <article className="content">
        <h1>Page not found</h1>
        <p>Nothing at <code>{key}</code>. Head back to <Link to="/introduction">Introduction</Link>.</p>
      </article>
    );
  }
  const C = entry.Component;
  return (
    <article className="content">
      {entry.meta?.title && <h1 className="page-title">{entry.meta.title}</h1>}
      {entry.meta?.description && <p className="page-desc">{entry.meta.description}</p>}
      <MDXProvider components={mdxComponents}>
        <C />
      </MDXProvider>
    </article>
  );
}

export function App() {
  const [tab, setTab] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  return (
    <div className={`layout ${open ? 'nav-open' : ''}`}>
      <button className="menu-btn" onClick={() => setOpen((o) => !o)} aria-label="Menu">☰</button>
      <Sidebar tab={tab} setTab={setTab} onNavigate={() => setOpen(false)} />
      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/introduction" replace />} />
          <Route path="*" element={<Page />} />
        </Routes>
      </main>
    </div>
  );
}
