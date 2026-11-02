// Content side of the blocks import: find blocks and examples in pages, and build block docs.
// Ported from config-console.

// Block tables that aren't library blocks.
const NOT_BLOCKS = new Set(['header', 'footer', 'fragment', 'metadata', 'section-metadata']);

// EDS block and variant names: lowercase words joined by hyphens. Anything else (from a page's
// classes or a repository's folder names) is skipped, so it never reaches a generated document.
export const isBlockName = (name) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);

// Parsed into an inert document: scripts don't run and resources don't load.
const parse = (html) => new DOMParser().parseFromString(html, 'text/html');

// Block tables in a DA page: `main > section div > block div`, named by their first class.
function blockElements(doc) {
  return [...doc.querySelectorAll('main > div > div[class]')]
    .filter((el) => isBlockName(el.classList[0]) && !NOT_BLOCKS.has(el.classList[0]));
}

const variantOf = (el) => [...el.classList].slice(1).filter(isBlockName).join(' ');

// Block names used in a page, with the variants seen: Map<name, Set<variant>>.
export function findBlocks(html, found = new Map()) {
  blockElements(parse(html)).forEach((el) => {
    const name = el.classList[0];
    if (!found.has(name)) found.set(name, new Set());
    const variant = variantOf(el);
    if (variant) found.get(name).add(variant);
  });
  return found;
}

// Every instance of a block in a page: [{ variant, html }].
export function blockExamples(html, name) {
  return blockElements(parse(html))
    .filter((el) => el.classList[0] === name)
    .map((el) => ({ variant: variantOf(el), html: el.innerHTML.trim() }));
}

function placeholderRows({ rows = 1, columns = 1 } = {}) {
  const cell = (c) => `<div><p>Column ${c + 1} content</p></div>`;
  const row = `<div>${Array.from({ length: columns }, (_, c) => cell(c)).join('')}</div>`;
  return Array(rows).fill(row).join('');
}

// A block document: one section per variant, each holding the first example found for it, or a
// placeholder shaped like the block's code expects (`analysis` from the GitHub import).
export function blockDoc(name, { examples = [], analysis = null } = {}) {
  const variants = new Set(examples.map((e) => e.variant));
  (analysis?.variants ?? []).forEach((v) => variants.add(v));
  if (!variants.size) variants.add('');
  const sections = [...variants].map((variant) => {
    const example = examples.find((e) => e.variant === variant);
    const cls = variant ? `${name} ${variant}` : name;
    return `<div><div class="${cls}">${example?.html ?? placeholderRows(analysis ?? undefined)}</div></div>`;
  });
  return `<body><header></header><main>${sections.join('')}</main><footer></footer></body>`;
}

// "hero-banner" → "Hero Banner"
export const displayName = (name) => name.split('-')
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

// Adds imported { name, path } rows to a blocks list: a row with the same path or name is
// updated in place (keeping its other columns), others are appended.
export function mergeBlockRows(rows, imported) {
  const next = rows.map((row) => ({ ...row }));
  imported.forEach((row) => {
    const same = next.find((r) => r.path === row.path
      || r.name?.toLowerCase() === row.name.toLowerCase());
    if (same) Object.assign(same, row);
    else next.push(row);
  });
  return next;
}
