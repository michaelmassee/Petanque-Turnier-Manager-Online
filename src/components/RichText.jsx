import { parseRichText } from '../lib/rich-text.js';

function InlineText({ node }) {
  let content = node.text;
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
  if (!document) return <p data-i18n-skip>{value}</p>;

  return (
    <div className="rich-text" data-i18n-skip>
      {document.content.map((node, index) => <RichTextNode key={index} node={node} />)}
    </div>
  );
}
