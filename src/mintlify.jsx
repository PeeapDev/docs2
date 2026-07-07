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

const known = {
  Info, Note, Tip, Warning, Check, Card, CardGroup, Columns, Steps, Step,
  Tabs, Tab, Accordion, AccordionGroup, CodeGroup, Frame, Icon, Tooltip,
  ParamField, ResponseField, Expandable, RequestExample, ResponseExample, Snippet,
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
