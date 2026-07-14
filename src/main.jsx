import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import 'highlight.js/styles/github-dark.css';
import './styles.css';
import { App } from './App.jsx';

const container = document.getElementById('root');
const app = (
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// Content routes are prerendered to static HTML (scripts/prerender.mjs), so hydrate
// them in place. The SPA fallback shell ships an empty root — mount fresh there.
if (container.firstChild) hydrateRoot(container, app);
else createRoot(container).render(app);
