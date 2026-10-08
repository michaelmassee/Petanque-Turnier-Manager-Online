// Nur für Tests: satori-Typesetter mit den Schriftdateien aus node_modules, der die gesetzten Knoten mitschreibt.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createFlyerTypesetter } from './flyer-text.js';

const require = createRequire(import.meta.url);
const typeset = createFlyerTypesetter(
  async (subset, weight, style) => readFileSync(require.resolve(`@fontsource/noto-sans/files/noto-sans-${subset}-${weight}-${style}.woff`)),
  // In Node kann der Standard-Build sein eingebettetes WASM selbst laden.
  () => import('satori').then((module) => module.default),
);

export function recordingTypesetter() {
  const nodes = [];
  const record = (node, width) => {
    nodes.push(node);
    return typeset(node, width);
  };
  record.nodes = nodes;
  return record;
}

/** Erster Knoten, dessen Kinder genau `text` sind. */
export function findTextNode(nodes, text) {
  const visit = (node) => {
    if (!node || typeof node !== 'object') return null;
    if (node.props?.children === text) return node;
    for (const child of [].concat(node.props?.children ?? [])) {
      const found = visit(child);
      if (found) return found;
    }
    return null;
  };
  for (const node of nodes) {
    const found = visit(node);
    if (found) return found;
  }
  return null;
}
