import { parseRichText } from '../lib/rich-text.js';

const URL_PATTERN = /(https?:\/\/[^\s<>"]+)/g;
// Satzzeichen am Ende ("… siehe https://example.org.") gehört nicht zur Adresse.
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;

// Macht http(s)-Adressen im Text anklickbar; andere Schemata (javascript: etc.) bleiben reiner Text.
export function LinkifiedText({ text }) {
  return String(text).split(URL_PATTERN).map((part, index) => {
    if (index % 2 === 0) return part;
    const trailing = part.match(TRAILING_PUNCTUATION)?.[0] || '';
    const url = trailing ? part.slice(0, -trailing.length) : part;
    return (
      <span key={index}>
        <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>{trailing}
      </span>
    );
  });
}

function InlineText({ node }) {
  let content = <LinkifiedText text={node.text} />;
  for (const mark of node.marks || []) {
    if (mark.type === 'bold') content = <strong>{content}</strong>;
    if (mark.type === 'italic') content = <em>{content}</em>;
    if (mark.type === 'underline') content = <u>{content}</u>;
    if (mark.type === 'strike') content = <s>{content}</s>;
  }
  return content;
}

function Textblock({ node }) {
  const content = (node.content || []).map((child, index) => <InlineText key={index} node={child} />);
  return node.type === 'heading' ? <h2>{content}</h2> : <p>{content}</p>;
}

function RichTextNode({ node }) {
  if (node.type === 'paragraph' || node.type === 'heading') return <Textblock node={node} />;
  const List = node.type === 'orderedList' ? 'ol' : 'ul';
  return (
    <List start={node.type === 'orderedList' && node.attrs?.start > 1 ? node.attrs.start : undefined}>
      {node.content.map((item, itemIndex) => (
        <li key={itemIndex}>{item.content.map((child, childIndex) => <RichTextNode key={childIndex} node={child} />)}</li>
      ))}
    </List>
  );
}

export function RichText({ value }) {
  const document = parseRichText(value);
  if (!document) return <p data-i18n-skip><LinkifiedText text={value} /></p>;

  return (
    <div className="rich-text" data-i18n-skip>
      {document.content.map((node, index) => <RichTextNode key={index} node={node} />)}
    </div>
  );
}
