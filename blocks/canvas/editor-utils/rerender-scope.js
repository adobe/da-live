// Mirrored in da-nx nx/blocks/quick-edit-portal/src/rerender-scope.js; keep the two in sync.
const PAGE_SCOPE = Object.freeze({ type: 'page' });
const METADATA_TABLES = new Set(['metadata', 'section-metadata']);
const UNRENDERED_TABLES = new Set([...METADATA_TABLES, 'library-metadata']);

const isSectionBreak = (node) => node.type.name === 'horizontal_rule';

// prose2aem's block class normalization: `Section Metadata (x)` -> `section-metadata`.
export function getTableName(node) {
  if (node?.type.name !== 'table') return undefined;
  const label = node.firstChild?.firstChild?.textContent ?? '';
  const idx = label.lastIndexOf('(');
  return (idx >= 0 ? label.substring(0, idx) : label)
    .toLowerCase()
    .replace(/[^0-9a-z]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

const isRenderedBlock = (node) => {
  const name = getTableName(node);
  return name !== undefined && !UNRENDERED_TABLES.has(name);
};

const topLevel = (doc) => {
  const nodes = [];
  doc.forEach((node) => nodes.push(node));
  return nodes;
};

export function diffTopLevel(previousDoc, doc) {
  const before = topLevel(previousDoc);
  const after = topLevel(doc);
  const max = Math.min(before.length, after.length);
  let start = 0;
  while (start < max && before[start].eq(after[start])) start += 1;
  if (start === before.length && start === after.length) return undefined;
  let end = 0;
  while (end < max - start && before[before.length - 1 - end].eq(after[after.length - 1 - end])) {
    end += 1;
  }
  return {
    before,
    after,
    start,
    removed: before.slice(start, before.length - end),
    added: after.slice(start, after.length - end),
  };
}

const changedNodes = (diff) => [...diff.removed, ...diff.added];

export function touchesMetadata(diff) {
  return !!diff && changedNodes(diff).some((node) => METADATA_TABLES.has(getTableName(node)));
}

export function touchesUnrendered(diff) {
  return !!diff && changedNodes(diff).some((node) => UNRENDERED_TABLES.has(getTableName(node)));
}

function splitSections(nodes) {
  return nodes.reduce((sections, node) => {
    if (isSectionBreak(node)) sections.push([]);
    else sections[sections.length - 1].push(node);
    return sections;
  }, [[]]);
}

const sameSection = (a, b) => a.length === b.length && a.every((node, i) => node.eq(b[i]));

// Index of the one section in `longer` whose removal makes it equal to `shorter`, else -1.
function findExtraSection(longer, shorter) {
  if (longer.length !== shorter.length + 1) return -1;
  let index = 0;
  while (index < shorter.length && sameSection(longer[index], shorter[index])) index += 1;
  const rest = shorter.slice(index)
    .every((section, i) => sameSection(longer[index + 1 + i], section));
  return rest ? index : -1;
}

function getSectionCountScope({ before, after }) {
  const previous = splitSections(before);
  const next = splitSections(after);
  const added = findExtraSection(next, previous);
  if (added !== -1) return { type: 'section-added', sectionIndex: added };
  const removed = findExtraSection(previous, next);
  if (removed !== -1) return { type: 'section-removed', sectionIndex: removed };
  return PAGE_SCOPE;
}

function countRendered(body) {
  const main = new DOMParser().parseFromString(body, 'text/html').querySelector('main');
  const sections = main ? [...main.querySelectorAll(':scope > div')] : [];
  const blocks = sections
    .reduce((count, section) => count + section.querySelectorAll(':scope > div[data-block-index]').length, 0);
  return { sections: sections.length, blocks };
}

// Falls back to the page whenever `doc` and the rendered `body` disagree on sections/blocks.
export function getRerenderScope({ previousDoc, doc, body }) {
  if (!previousDoc || !doc || !body) return PAGE_SCOPE;
  const diff = diffTopLevel(previousDoc, doc);
  if (!diff) return PAGE_SCOPE;
  if (changedNodes(diff).some((node) => getTableName(node) === 'metadata')) return PAGE_SCOPE;

  const rendered = countRendered(body);
  if (rendered.sections !== diff.after.filter(isSectionBreak).length + 1) return PAGE_SCOPE;
  if (changedNodes(diff).some(isSectionBreak)) return getSectionCountScope(diff);

  const preceding = diff.after.slice(0, diff.start);
  const sectionIndex = preceding.filter(isSectionBreak).length;
  const isSingleBlock = diff.removed.length === 1 && diff.added.length === 1
    && isRenderedBlock(diff.removed[0]) && isRenderedBlock(diff.added[0]);
  if (isSingleBlock && rendered.blocks === diff.after.filter(isRenderedBlock).length) {
    return { type: 'block', sectionIndex, blockIndex: preceding.filter(isRenderedBlock).length };
  }
  return { type: 'section', sectionIndex };
}
