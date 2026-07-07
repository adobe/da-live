const BLOCK_ICON = 'tableadd';

export function buildBlockEntries(resolvedBlocks) {
  const entries = [];
  (resolvedBlocks || []).forEach((block) => {
    (block.variants || []).forEach((variant) => {
      entries.push({
        id: `block:${entries.length}`,
        blockName: block.name,
        variantName: variant.name,
        variants: variant.variants,
        tags: variant.tags,
        description: variant.description,
        dom: variant.dom,
      });
    });
  });
  return entries;
}

// Split an entry into a display label + variant subtitle so rows look consistent
// regardless of how the library expresses variants:
// - class-modifier variants carry an explicit `variants` string (e.g. "small, blue")
// - heading-named variants encode the variant in a trailing parenthetical
//   (e.g. "Banner (blue)" -> label "Banner", subtitle "blue")
function deriveDisplay(entry) {
  const name = entry.variantName || entry.blockName || '';
  if (entry.variants) return { label: name, subtitle: entry.variants };
  const match = name.match(/^(.*\S)\s*\(([^)]+)\)\s*$/);
  if (match) return { label: match[1].trim(), subtitle: match[2].trim() };
  return { label: name, subtitle: undefined };
}

export function matchBlockEntries(entries, query) {
  const terms = (query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];

  return (entries || [])
    .map((entry, index) => {
      const { label, subtitle } = deriveDisplay(entry);
      const haystack = [entry.blockName, entry.variantName, entry.variants, entry.tags]
        .filter(Boolean).join(' ').toLowerCase();
      if (!terms.every((term) => haystack.includes(term))) return null;
      const rank = label.toLowerCase().startsWith(terms[0]) ? 0 : 1;
      return { entry, label, subtitle, index, rank };
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ entry, label, subtitle }) => ({
      id: entry.id,
      label,
      subtitle: subtitle || undefined,
      icon: BLOCK_ICON,
    }));
}

const store = {
  entries: [],
  state: 'idle', // 'idle' | 'loading' | 'ready' | 'empty'
  hasLibrary: false,
  key: null,
};

export function getState() {
  return store.state;
}

export function hasLibrary() {
  return store.hasLibrary;
}

export function blockItemsForQuery(query) {
  return matchBlockEntries(store.entries, query);
}

export function resetBlockLibrary() {
  store.entries = [];
  store.state = 'idle';
  store.hasLibrary = false;
  store.key = null;
}

export async function ingestBlocks(blocks) {
  const resolved = await Promise.all(
    (blocks || []).map(async (block) => ({
      name: block.name,
      variants: (await block.loadVariants) || [],
    })),
  );
  store.entries = buildBlockEntries(resolved);
  store.state = store.entries.length ? 'ready' : 'empty';
  store.hasLibrary = true;
  return store.entries;
}

export async function insertBlockItem(view, id) {
  const entry = store.entries.find((e) => e.id === id);
  if (!entry) return;
  const { insertBlock } = await import('../ew-panel-extensions/helpers.js');
  insertBlock(view, entry.dom);
}

export async function prefetchBlockLibrary({ org, site } = {}) {
  if (!org || !site) return;
  const key = `${org}/${site}`;
  if (store.key === key && store.state !== 'idle') return;
  store.key = key;
  store.state = 'loading';
  try {
    const { fetchExtensions, fetchBlocks } = await import('../ew-panel-extensions/helpers.js');
    const extensions = await fetchExtensions(org, site);
    const ext = extensions?.find((e) => e.name === 'blocks');
    if (!ext) {
      store.entries = [];
      store.hasLibrary = false;
      store.state = 'empty';
      return;
    }
    // hasLibrary reflects a configured blocks extension; the library modal fetches independently,
    // so keep it true even if prefetch of block data fails.
    store.hasLibrary = true;
    const blocks = await fetchBlocks(ext.sources);
    await ingestBlocks(blocks);
  } catch {
    store.state = 'empty';
  }
}
