export const TOURNAMENT_DESCRIPTION_PREFIX = 'ptm-richtext:v1:';

function validMark(mark) {
  return mark && typeof mark === 'object' && Object.keys(mark).length === 1 && (mark.type === 'bold' || mark.type === 'italic');
}

function validTextNode(node) {
  return node && typeof node === 'object'
    && Object.keys(node).every((key) => key === 'type' || key === 'text' || key === 'marks')
    && node.type === 'text'
    && typeof node.text === 'string'
    && (!node.marks || (Array.isArray(node.marks) && node.marks.every(validMark)));
}

export function isTournamentDescriptionDocument(document) {
  return document && typeof document === 'object'
    && Object.keys(document).every((key) => key === 'type' || key === 'content')
    && document.type === 'doc'
    && Array.isArray(document.content)
    && document.content.every((paragraph) => (
      paragraph && typeof paragraph === 'object'
      && Object.keys(paragraph).every((key) => key === 'type' || key === 'content')
      && paragraph.type === 'paragraph'
      && (!paragraph.content || (Array.isArray(paragraph.content) && paragraph.content.every(validTextNode)))
    ));
}

export function parseTournamentDescription(value) {
  if (typeof value !== 'string' || !value.startsWith(TOURNAMENT_DESCRIPTION_PREFIX)) return null;
  try {
    const document = JSON.parse(value.slice(TOURNAMENT_DESCRIPTION_PREFIX.length));
    return isTournamentDescriptionDocument(document) ? document : null;
  } catch {
    return null;
  }
}

export function tournamentDescriptionDocument(value) {
  const storedDocument = parseTournamentDescription(value);
  if (storedDocument) return storedDocument;
  const lines = String(value || '').split('\n');
  return {
    type: 'doc',
    content: lines.map((line) => ({ type: 'paragraph', ...(line ? { content: [{ type: 'text', text: line }] } : {}) })),
  };
}

export function serializeTournamentDescription(document) {
  const hasText = (document?.content || []).some((paragraph) => (paragraph.content || []).some((node) => node.text.length > 0));
  if (!hasText) return '';
  return `${TOURNAMENT_DESCRIPTION_PREFIX}${JSON.stringify(document)}`;
}
