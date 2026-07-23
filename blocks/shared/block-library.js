import { daFetch, fetchDaConfigs, getFirstSheet } from './utils.js';

// Editor-agnostic block-library loader. Reads the site's library config, fetches
// block/variant HTML and parses it into plain DOM (never ProseMirror nodes, so it
// carries no schema dependency and works from any editor context). Shared by the
// canvas tool panels and the edit prose plugins (e.g. image focal point).

const ref = new URLSearchParams(window.location.search).get('ref') || 'main';
const AEM_ORIGINS = ['hlx.page', 'hlx.live', 'aem.page', 'aem.live'];
const OOTB_PLUGINS = new Set(['blocks', 'templates', 'icons', 'placeholders']);

// ---------------------------------------------------------------------------
// Block HTML parsing
// ---------------------------------------------------------------------------

function isHeading(el) {
  return ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(el?.nodeName);
}

function getBlockName(className) {
  const [name, ...rest] = (className || '').split(' ');
  return { name, variants: rest.length ? rest.join(', ') : undefined };
}

function getBlockTableHtml(block) {
  const { name, variants } = getBlockName(block.className);
  const rows = [...block.children];
  const maxCols = rows.reduce((n, row) => Math.max(n, row.children.length), 0) || 1;

  const table = document.createElement('table');
  table.setAttribute('border', '1');

  const headerRow = document.createElement('tr');
  const th = document.createElement('td');
  th.setAttribute('colspan', String(maxCols));
  th.textContent = variants ? `${name} (${variants})` : name;
  headerRow.append(th);
  table.append(headerRow);

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    [...row.children].forEach((col) => {
      const td = document.createElement('td');
      if (row.children.length < maxCols) td.setAttribute('colspan', String(maxCols));
      td.innerHTML = col.innerHTML;
      tr.append(td);
    });
    table.append(tr);
  });

  return table;
}

function decorateImages(element, path) {
  try {
    const { origin } = new URL(path);
    element.querySelectorAll('img').forEach((img) => {
      if (img.getAttribute('src')?.startsWith('./')) {
        img.src = `${origin}/${img.src.split('/').pop()}`;
      }
      const ratio = img.width > 200 ? 200 / img.width : 1;
      img.width = Math.round(img.width * ratio);
      img.height = Math.round(img.height * ratio);
    });
  } catch { /* leave images as-is */ }
}

async function fetchAndParseHtml(path, isAemHosted) {
  try {
    const resp = await daFetch(`${path}${isAemHosted ? '.plain.html' : ''}`, { noRedirect: true });
    if (!resp.ok) return null;
    return new window.DOMParser().parseFromString(await resp.text(), 'text/html');
  } catch { return null; }
}

function getSectionsAndBlocks(doc) {
  return [...doc.querySelectorAll('body > div, main > div')].reduce((acc, section) => {
    const hr = document.createElement('hr');
    hr.dataset.issection = 'true';
    acc.push(hr, ...section.querySelectorAll(':scope > *'));
    return acc;
  }, []);
}

function processGroupBlock(block) {
  const container = document.createElement('div');
  [...block.children].forEach((child) => {
    container.append(child.tagName === 'DIV' ? getBlockTableHtml(child) : child.cloneNode(true));
  });
  return container;
}

function groupBlocks(elements) {
  return elements.reduce((state, el) => {
    if (el.classList?.contains('library-container-start')) {
      const blockGroup = document.createElement('div');
      blockGroup.dataset.isgroup = 'true';
      if (isHeading(el.previousElementSibling)) {
        blockGroup.dataset.groupheading = el.previousElementSibling.textContent;
      }
      state.currentGroup = { blockGroup };
    } else if (el.classList?.contains('library-container-end') && state.currentGroup) {
      const { blockGroup } = state.currentGroup;
      if (el.nextElementSibling?.classList.contains('library-metadata')) {
        blockGroup.append(el.nextElementSibling.cloneNode(true));
      }
      state.blocks.push(blockGroup);
      state.currentGroup = null;
    } else if (state.currentGroup) {
      state.currentGroup.blockGroup.append(el.cloneNode(true));
    } else if (
      el.nodeName === 'DIV'
      && !el.dataset?.issection
      && !el.classList?.contains('library-metadata')
    ) {
      state.blocks.push(el);
    }
    return state;
  }, { blocks: [], currentGroup: null }).blocks;
}

function getLibraryMetadata(el) {
  return [...el.childNodes].reduce((acc, row) => {
    if (row.children) {
      const key = row.children[0]?.textContent.trim().toLowerCase();
      const val = row.children[1]?.textContent.trim();
      if (key && val) acc[key] = val;
    }
    return acc;
  }, {});
}

function transformBlock(block) {
  const prevSib = block.previousElementSibling;
  let item;
  if (block.dataset.groupheading) {
    item = { name: block.dataset.groupheading };
  } else if (isHeading(prevSib) && prevSib.textContent) {
    item = { name: prevSib.textContent };
  } else {
    item = getBlockName(block.className || '');
  }
  item.dom = block.dataset?.isgroup ? processGroupBlock(block) : getBlockTableHtml(block);

  const metaEl = block.nextElementSibling?.classList.contains('library-metadata')
    ? block.nextElementSibling
    : block.querySelector('.library-metadata');
  if (metaEl) {
    const md = getLibraryMetadata(metaEl);
    if (md.searchtags) item.tags = md.searchtags;
    if (md.description) item.description = md.description;
  }
  return item;
}

export async function getBlockVariants(path) {
  let isAemHosted = false;
  try {
    isAemHosted = AEM_ORIGINS.some((o) => new URL(path).origin.endsWith(o));
  } catch { /* relative path */ }

  const doc = await fetchAndParseHtml(path, isAemHosted);
  if (!doc) return [];

  decorateImages(doc.body, path);
  return groupBlocks(getSectionsAndBlocks(doc)).map(transformBlock);
}

// ---------------------------------------------------------------------------
// Extension config
// ---------------------------------------------------------------------------

function getIsPluginAllowed(plugRef) {
  const pluginRef = plugRef || 'main';
  if (pluginRef === 'main') return true;
  if (ref === 'local') return true;
  return pluginRef === ref;
}

function calculateSources(org, site, sheetPath) {
  return sheetPath.split(',').map((p) => {
    const trimmed = p.trim();
    if (!trimmed.startsWith('/')) return trimmed;
    if (ref === 'local') return `http://localhost:3000${trimmed}`;
    return `https://${ref}--${site}--${org}.aem.live${trimmed}`;
  });
}

// Parses the library config rows into extension descriptors. The AEM Assets
// plugin is a canvas panel concern and is layered on top by the caller.
export async function fetchExtensions(org, site) {
  const configs = await Promise.all(fetchDaConfigs({ org, site }));
  const validConfigs = configs.filter((conf) => !conf?.error).reverse();
  if (!validConfigs.length) return [];

  const rows = validConfigs.flatMap((conf) => conf?.library?.data || []);
  if (!rows.length) return [];

  const seen = new Set();
  return rows.reduce((acc, row) => {
    if (!row.title || !getIsPluginAllowed(row.ref)) return acc;
    const name = row.title.trim().toLowerCase().replaceAll(' ', '-');
    if (seen.has(name)) return acc;
    seen.add(name);
    acc.push({
      name,
      title: row.title.trim(),
      sources: calculateSources(org, site, row.path),
      experience: row.experience || 'inline',
      format: row.format || '',
      icon: row.icon || '',
      ootb: OOTB_PLUGINS.has(name),
    });
    return acc;
  }, []);
}

/** Resolve the configured "blocks" library extension for an org/site, or null. */
export async function getBlocksExtension(org, site) {
  if (!org || !site) return null;
  const extensions = await fetchExtensions(org, site);
  return extensions?.find((ext) => ext.name === 'blocks') || null;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

export async function fetchBlocks(sources) {
  const blocks = [];
  for (const url of sources) {
    try {
      const resp = await daFetch(url, { noRedirect: true });
      if (resp.ok) {
        const json = await resp.json();
        const data = getFirstSheet(json) ?? (Array.isArray(json) ? json : []);
        data.forEach((row) => {
          if (row.name && row.path) {
            blocks.push({ ...row, loadVariants: getBlockVariants(row.path) });
          }
        });
      }
    } catch { /* skip failed source */ }
  }
  return blocks;
}

const blockLibraryCache = new Map();

/**
 * Load — and memoize per org/site — the configured blocks library: the resolved
 * "blocks" extension plus its fetched blocks (each carrying a lazy `loadVariants`
 * promise). Shared by the slash-menu prefetch and the block-library modal so the
 * library (and every variant's HTML) is fetched and parsed at most once.
 * Resolves to `{ ext: null, blocks: [] }` when no library is configured.
 */
export function loadBlockLibrary(org, site) {
  if (!org || !site) return Promise.resolve({ ext: null, blocks: [] });
  const key = `${org}/${site}`;
  if (!blockLibraryCache.has(key)) {
    const pending = (async () => {
      const ext = await getBlocksExtension(org, site);
      if (!ext) return { ext: null, blocks: [] };
      const blocks = await fetchBlocks(ext.sources);
      return { ext, blocks };
    })().catch((err) => {
      // Don't cache transient failures — allow a later retry.
      blockLibraryCache.delete(key);
      throw err;
    });
    blockLibraryCache.set(key, pending);
  }
  return blockLibraryCache.get(key);
}

export function resetBlockLibraryCache() {
  blockLibraryCache.clear();
}
