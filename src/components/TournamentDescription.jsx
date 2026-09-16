import { parseTournamentDescription } from '../lib/tournament-description.js';

function InlineText({ node }) {
  let content = node.text;
  for (const mark of node.marks || []) {
    content = mark.type === 'bold' ? <strong>{content}</strong> : <em>{content}</em>;
  }
  return content;
}

export function TournamentDescription({ description }) {
  const document = parseTournamentDescription(description);
  if (!document) return <p>{description}</p>;

  return (
    <div className="tournament-description">
      {document.content.map((paragraph, paragraphIndex) => (
        <p key={paragraphIndex}>
          {(paragraph.content || []).map((node, nodeIndex) => <InlineText key={nodeIndex} node={node} />)}
        </p>
      ))}
    </div>
  );
}
