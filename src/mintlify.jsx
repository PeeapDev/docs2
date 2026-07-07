import React from 'react';

// ── Mintlify-flavored component shims ─────────────────────────────────────────
// The existing .mdx uses Mintlify components (<Info>, <Steps>, <CodeGroup>…).
// We provide React implementations so the content renders as-is, plus a Proxy
// fallback so ANY unshimmed component renders its children instead of crashing.

const Callout = (kind, icon) => ({ children }) => (
  <div className={`callout callout-${kind}`}>
    <span className="callout-icon" aria-hidden>{icon}</span>
    <div className="callout-body">{children}</div>
  </div>
);

export const Info = Callout('info', 'ℹ');
export const Note = Callout('note', '✎');
export const Tip = Callout('tip', '💡');
export const Warning = Callout('warning', '⚠');
export const Check = Callout('check', '✓');

export const Card = ({ title, href, children }) => {
  const inner = (
    <div className="card">
      {title && <div className="card-title">{title}</div>}
      <div className="card-body">{children}</div>
    </div>
  );
  return href ? <a className="card-link" href={href}>{inner}</a> : inner;
};
export const CardGroup = ({ children }) => <div className="card-group">{children}</div>;
export const Columns = CardGroup;

export const Steps = ({ children }) => <div className="steps">{children}</div>;
export const Step = ({ title, children }) => (
  <div className="step">
    <div className="step-title">{title}</div>
    <div className="step-body">{children}</div>
  </div>
);

export const Tabs = ({ children }) => <div className="tabs">{children}</div>;
export const Tab = ({ title, children }) => (
  <div className="tab"><div className="tab-title">{title}</div>{children}</div>
);

export const Accordion = ({ title, children }) => (
  <details className="accordion"><summary>{title}</summary><div className="accordion-body">{children}</div></details>
);
export const AccordionGroup = ({ children }) => <div className="accordion-group">{children}</div>;

export const CodeGroup = ({ children }) => <div className="code-group">{children}</div>;
export const Frame = ({ children, caption }) => (
  <figure className="frame">{children}{caption && <figcaption>{caption}</figcaption>}</figure>
);

export const Icon = () => null;
export const Tooltip = ({ children }) => <span className="tooltip">{children}</span>;

export const ParamField = ({ path, query, body, type, required, children }) => (
  <div className="field">
    <div className="field-head">
      <code>{path || query || body}</code>
      {type && <span className="field-type">{type}</span>}
      {required && <span className="field-req">required</span>}
    </div>
    <div className="field-body">{children}</div>
  </div>
);
export const ResponseField = ParamField;
export const Expandable = ({ title, children }) => (
  <details className="expandable"><summary>{title}</summary><div>{children}</div></details>
);
export const RequestExample = ({ children }) => <div className="example">{children}</div>;
export const ResponseExample = ({ children }) => <div className="example">{children}</div>;
export const Snippet = ({ children }) => <>{children}</>;

// Code block with a copy button (overrides the default <pre>).
export function Pre(props) {
  const ref = React.useRef(null);
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    const text = ref.current?.innerText || '';
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="code-block">
      <button className={`code-copy ${copied ? 'copied' : ''}`} onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      <pre ref={ref} {...props} />
    </div>
  );
}

export const Table = (props) => <div className="table-wrap"><table {...props} /></div>;

// "Try it here" — a live API request widget. Usage in MDX:
//   <TryIt method="POST" url="/verify/create" body={`{ "phone": "077601707" }`} />
// Auto-rendered on every API-reference page from its `api: METHOD /path` frontmatter.
const API_BASE = 'https://api.peeap.com';

export function TryIt({ method = 'POST', url = '', body = '', auth = true }) {
  const m = String(method).toUpperCase();
  const needsBody = m !== 'GET' && m !== 'DELETE' && m !== 'HEAD';
  const [u, setU] = React.useState(url);
  const [input, setInput] = React.useState(typeof body === 'string' ? body : JSON.stringify(body || {}, null, 2));
  const [token, setToken] = React.useState('');
  const [resp, setResp] = React.useState(null);
  const [status, setStatus] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const send = async () => {
    setLoading(true); setResp(null); setStatus(null);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token.trim()) headers['Authorization'] = token.trim().toLowerCase().startsWith('bearer') || token.trim().toLowerCase().startsWith('session') ? token.trim() : `Bearer ${token.trim()}`;
      const opts = { method: m, headers };
      if (needsBody && input.trim()) opts.body = input;
      const full = u.startsWith('http') ? u : `${API_BASE}${u.startsWith('/') ? '' : '/'}${u}`;
      const r = await fetch(full, opts);
      setStatus(r.status);
      const t = await r.text();
      try { setResp(JSON.stringify(JSON.parse(t), null, 2)); } catch { setResp(t); }
    } catch (e) { setStatus('ERR'); setResp(String(e?.message || e)); }
    finally { setLoading(false); }
  };
  return (
    <div className="tryit">
      <div className="tryit-head">
        <span className={`tryit-method ${m.toLowerCase()}`}>{m}</span>
        <input className="tryit-url-input" value={u} onChange={(e) => setU(e.target.value)} spellCheck={false} aria-label="URL" />
        <button className="btn primary" onClick={send} disabled={loading}>{loading ? 'Sending…' : 'Send'}</button>
      </div>
      <div className="tryit-body">
        {auth && (
          <input className="tryit-token" value={token} onChange={(e) => setToken(e.target.value)} spellCheck={false}
            placeholder="Bearer token — paste your access token for authenticated endpoints (optional)" />
        )}
        {needsBody && (
          <textarea value={input} onChange={(e) => setInput(e.target.value)} spellCheck={false} placeholder="Request body (JSON)" />
        )}
        {status !== null && (
          <div className="tryit-resp">
            <div className={`tryit-status ${typeof status === 'number' && status < 400 ? 'ok' : 'err'}`}>Status: {status}</div>
            <pre>{resp}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

const known = {
  Info, Note, Tip, Warning, Check, Card, CardGroup, Columns, Steps, Step,
  Tabs, Tab, Accordion, AccordionGroup, CodeGroup, Frame, Icon, Tooltip,
  ParamField, ResponseField, Expandable, RequestExample, ResponseExample, Snippet,
  TryIt, pre: Pre, table: Table,
};

const Passthrough = ({ children }) => <>{children}</>;

// Any Capitalized component not shimmed → render its children (never crash).
export const mdxComponents = new Proxy(known, {
  get(target, prop) {
    if (typeof prop === 'string' && /^[A-Z]/.test(prop) && !(prop in target)) return Passthrough;
    return Reflect.get(target, prop);
  },
  has(target, prop) {
    if (typeof prop === 'string' && /^[A-Z]/.test(prop)) return true;
    return Reflect.has(target, prop);
  },
});
