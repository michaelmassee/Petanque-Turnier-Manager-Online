export const TOURNAMENT_DESCRIPTION_PREFIX = 'ptm-richtext:v1:';

function validMark(mark) {
  return mark && typeof mark === 'object' && Object.keys(mark).length === 1
    && ['bold', 'italic', 'underline', 'strike'].includes(mark.type);
}

function validTextNode(node) {
  return node && typeof node === 'object'
    && Object.keys(node).every((key) => key === 'type' || key === 'text' || key === 'marks')
    && node.type === 'text'
    && typeof node.text === 'string'
    && (!node.marks || (Array.isArray(node.marks) && node.marks.every(validMark)));
}

function validTextblock(node) {
  if (!node || typeof node !== 'object' || (node.content !== undefined && (!Array.isArray(node.content) || !node.content.every(validTextNode)))) return false;
  if (node.type === 'paragraph') return Object.keys(node).every((key) => key === 'type' || key === 'content');
  return node.type === 'heading'
    && Object.keys(node).every((key) => key === 'type' || key === 'content' || key === 'attrs')
    && node.attrs && Object.keys(node.attrs).length === 1 && node.attrs.level === 2;
}

function validList(node, depth) {
  if (!node || typeof node !== 'object' || !Array.isArray(node.content) || !node.content.length || !node.content.every((item) => validListItem(item, depth + 1))) return false;
  if (node.type === 'bulletList') return Object.keys(node).every((key) => key === 'type' || key === 'content');
  return node.type === 'orderedList'
    && Object.keys(node).every((key) => key === 'type' || key === 'content' || key === 'attrs')
    && (!node.attrs || (Object.keys(node.attrs).every((key) => key === 'start' || key === 'type')
      && (node.attrs.start === undefined || (Number.isInteger(node.attrs.start) && node.attrs.start > 0))
      && (node.attrs.type === null || node.attrs.type === undefined)));
}

function validListItem(node, depth) {
  return depth <= 4 && node && typeof node === 'object' && node.type === 'listItem'
    && Object.keys(node).every((key) => key === 'type' || key === 'content')
    && Array.isArray(node.content) && node.content.length > 0
    && node.content.every((child) => validTextblock(child) || validList(child, depth));
}

export function isTournamentDescriptionDocument(document) {
  return document && typeof document === 'object'
    && Object.keys(document).every((key) => key === 'type' || key === 'content')
    && document.type === 'doc'
    && Array.isArray(document.content)
    && document.content.every((node) => validTextblock(node) || validList(node, 0));
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
