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

function deriveDisplay(entry) {
  const name = entry.variantName || entry.blockName || '';
  if (entry.variants) return { label: name, description: entry.variants };
  const match = name.match(/^(.*\S)\s*\(([^)]+)\)\s*$/);
  if (match) return { label: match[1].trim(), description: match[2].trim() };
  return { label: name, description: undefined };
}

export function matchBlockEntries(entries, query) {
  const terms = (query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];

  return (entries || [])
    .map((entry, index) => {
      const { label, description } = deriveDisplay(entry);
      const haystack = [entry.blockName, entry.variantName, entry.variants, entry.tags]
        .filter(Boolean).join(' ').toLowerCase();
      if (!terms.every((term) => haystack.includes(term))) return null;
      const rank = label.toLowerCase().startsWith(terms[0]) ? 0 : 1;
      return { entry, label, description, index, rank };
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ entry, label, description }) => ({
      id: entry.id,
      label,
      description: description || undefined,
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

/**
 * Lightweight, load-time check (no block/variant fetching) for whether a "blocks"
 * library is configured for the org/site. Records the result so the slash menu can
 * decide up-front whether to show "Open block library" — avoiding the flicker of
 * showing it and then hiding it once an on-demand load settles. The full library
 * (blocks + variant HTML) is still fetched lazily via ensureBlockLibrary on "/".
 */
export function checkBlockLibraryConfigured({ org, site } = {}) {
  if (!org || !site) {
    store.hasLibrary = false;
    return null;
  }
  return (async () => {
    try {
      const { getBlocksExtension } = await import('../../shared/block-library.js');
      store.hasLibrary = !!(await getBlocksExtension(org, site));
    } catch {
      store.hasLibrary = false;
    }
  })();
}

/**
 * Load the block library on demand — called when the user opens the slash menu.
 * Cached per org/site, so repeated calls while typing don't refetch. Static slash
 * commands render immediately; block results appear once the returned promise
 * settles. Returns the in-flight load promise the first time a load is kicked off
 * (so the caller can re-render when it resolves), or `null` when there's nothing
 * new to wait on (already loading/loaded, or no org/site).
 */
export function ensureBlockLibrary({ org, site } = {}) {
  const key = org && site ? `${org}/${site}` : null;
  if (store.key === key && store.state !== 'idle') return null;
  store.key = key;
  if (!key) {
    store.entries = [];
    store.hasLibrary = false;
    store.state = 'empty';
    return null;
  }
  store.state = 'loading';
  return (async () => {
    try {
      const { loadBlockLibrary } = await import('../../shared/block-library.js');
      const { ext, blocks } = await loadBlockLibrary(org, site);
      if (!ext) {
        store.entries = [];
        store.hasLibrary = false;
        store.state = 'empty';
        return;
      }
      store.hasLibrary = true;
      await ingestBlocks(blocks);
    } catch {
      store.state = 'empty';
    }
  })();
}
