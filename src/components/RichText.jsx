import { parseRichText } from '../lib/rich-text.js';

const URL_PATTERN = /(https?:\/\/[^\s<>"]+)/g;
// Satzzeichen am Ende ("… siehe https://example.org.") gehört nicht zur Adresse.
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;
// Eigene Adressen (z. B. der Turnierlink aus "Nachricht an Team") bleiben im selben Fenster. ptmonline.org zählt
// immer dazu, weil der Worker Links mit der Produktions-Domain erzeugt, auch wenn die App lokal läuft.
const OWN_HOSTS = new Set(['ptmonline.org', 'www.ptmonline.org']);

function ownAppPath(url) {
  try {
    const target = new URL(url);
    if (target.host !== window.location.host && !OWN_HOSTS.has(target.host)) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

// Normaler Linksklick auf einen eigenen Link geht über das App-Routing (onNavigate), damit die App nicht neu lädt.
// Strg-/Cmd-/Mittelklick bleibt Browser-Verhalten (neuer Tab).
export function handleOwnLinkClick(event, path, onNavigate) {
  if (!onNavigate || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  onNavigate(path);
}

// Macht http(s)-Adressen im Text anklickbar; andere Schemata (javascript: etc.) bleiben reiner Text.
export function LinkifiedText({ text, onNavigate }) {
  return String(text).split(URL_PATTERN).map((part, index) => {
    if (index % 2 === 0) return part;
    const trailing = part.match(TRAILING_PUNCTUATION)?.[0] || '';
    const url = trailing ? part.slice(0, -trailing.length) : part;
    const ownPath = ownAppPath(url);
    return (
      <span key={index}>
        {ownPath
          ? <a href={ownPath} onClick={(event) => handleOwnLinkClick(event, ownPath, onNavigate)}>{url}</a>
          : <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>}
        {trailing}
      </span>
    );
  });
}

function InlineText({ node, onNavigate }) {
  let content = <LinkifiedText text={node.text} onNavigate={onNavigate} />;
  for (const mark of node.marks || []) {
    if (mark.type === 'bold') content = <strong>{content}</strong>;
    if (mark.type === 'italic') content = <em>{content}</em>;
    if (mark.type === 'underline') content = <u>{content}</u>;
    if (mark.type === 'strike') content = <s>{content}</s>;
  }
  return content;
}

function Textblock({ node, onNavigate }) {
  const content = (node.content || []).map((child, index) => <InlineText key={index} node={child} onNavigate={onNavigate} />);
  return node.type === 'heading' ? <h2>{content}</h2> : <p>{content}</p>;
}

function RichTextNode({ node, onNavigate }) {
  if (node.type === 'paragraph' || node.type === 'heading') return <Textblock node={node} onNavigate={onNavigate} />;
  const List = node.type === 'orderedList' ? 'ol' : 'ul';
  return (
    <List start={node.type === 'orderedList' && node.attrs?.start > 1 ? node.attrs.start : undefined}>
      {node.content.map((item, itemIndex) => (
        <li key={itemIndex}>{item.content.map((child, childIndex) => <RichTextNode key={childIndex} node={child} onNavigate={onNavigate} />)}</li>
      ))}
    </List>
  );
}

export function RichText({ value, onNavigate }) {
  const document = parseRichText(value);
  if (!document) return <p data-i18n-skip><LinkifiedText text={value} onNavigate={onNavigate} /></p>;

  return (
    <div className="rich-text" data-i18n-skip>
      {document.content.map((node, index) => <RichTextNode key={index} node={node} onNavigate={onNavigate} />)}
    </div>
  );
}
