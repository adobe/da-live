/* eslint-disable import/no-unresolved -- importmap */
import { goToNextCell } from 'da-y-wrapper';
import { loadBlockOptions } from '../../ew-panel-extensions/helpers.js';
import { getTableInfo } from '../../editor-utils/blocks.js';

/**
 * "Block options" — per-block key/value autocomplete for a block's body cells,
 * sourced from the block library's `options` sheet (columns: blocks, key, values).
 * Ported from the legacy edit block's slash-menu keyAutocomplete, adapted to the
 * canvas slash menu (nx-menu id-based selection).
 */

export function normalizeForSlashMenu(str) {
  return str?.toLowerCase().trim().replace(/\s+/g, '-');
}

function buildBlockMap(data) {
  const blockMap = new Map();
  data?.forEach((item) => {
    const blocks = item.blocks?.toLowerCase().trim().split(',').map((b) => normalizeForSlashMenu(b));
    if (!blocks || !item.key || !item.values) return;
    const values = item.values.split('|').map((v) => {
      const [label, val] = v.split('=').map((s) => s.trim());
      return { title: label, value: val || label };
    });
    blocks.forEach((block) => {
      if (!blockMap.has(block)) blockMap.set(block, new Map());
      blockMap.get(block).set(normalizeForSlashMenu(item.key), values);
    });
  });
  return blockMap;
}

function copyAllBlocksToOthers(blockMap) {
  const allBlocks = blockMap.get('all');
  if (!allBlocks) return;
  blockMap.forEach((block, blockName) => {
    if (blockName === 'all') return;
    allBlocks.forEach((values, key) => {
      if (!block.has(key)) block.set(key, values);
    });
  });
}

function addFallbackBehavior(blockMap) {
  const originalGet = blockMap.get.bind(blockMap);
  blockMap.get = (blockName) => {
    if (blockMap.has(blockName)) return originalGet(blockName);
    const normalized = normalizeForSlashMenu(blockName);
    if (blockMap.has(normalized)) return originalGet(normalized);
    return originalGet('all');
  };
}

export function processBlockOptions(data) {
  const blockMap = buildBlockMap(data);
  copyAllBlocksToOthers(blockMap);
  addFallbackBehavior(blockMap);
  return blockMap;
}

const store = { blockMap: null, key: null, state: 'idle' };

export function resetBlockOptions() {
  store.blockMap = null;
  store.key = null;
  store.state = 'idle';
}

/**
 * Load the block options for an org/site on demand (cached). Returns the in-flight
 * load promise the first time, or null when there's nothing new to wait on.
 */
export function ensureBlockOptions({ org, site } = {}) {
  const key = org && site ? `${org}/${site}` : null;
  if (store.key === key && store.state !== 'idle') return null;
  store.key = key;
  if (!key) {
    store.blockMap = null;
    store.state = 'empty';
    return null;
  }
  store.state = 'loading';
  return (async () => {
    try {
      const data = await loadBlockOptions(org, site);
      store.blockMap = processBlockOptions(data);
      store.state = 'ready';
    } catch {
      store.state = 'empty';
    }
  })();
}

// Resolved actions for the currently-rendered menu, keyed by item id.
let actions = new Map();

/**
 * Menu items for the block-options autocomplete at the current cursor, filtered by
 * `query`. Returns null when the cursor isn't in an options-bearing block cell.
 */
export function blockOptionItems(state, query, blockMap = store.blockMap) {
  if (!blockMap) return null;
  const info = getTableInfo(state, state.selection.from);
  if (!info) return null;
  const keyData = blockMap.get(info.tableName);
  if (!keyData) return null;

  const q = (query || '').toLowerCase();
  actions = new Map();
  const items = [];

  if (info.isFirstColumn && info.columnsInRow === 2) {
    let i = 0;
    for (const key of keyData.keys()) {
      if (!q || key.toLowerCase().includes(q)) {
        const id = `blockopt-key:${i}`;
        actions.set(id, { text: key, moveNext: true });
        items.push({ id, label: key });
      }
      i += 1;
    }
  } else {
    const values = keyData.get(normalizeForSlashMenu(info.keyValue));
    if (!values) return null;
    values.forEach((v, i) => {
      if (!q || v.title.toLowerCase().includes(q)) {
        const id = `blockopt-val:${i}`;
        actions.set(id, { text: v.value, moveNext: false });
        items.push({ id, label: v.title });
      }
    });
  }

  if (!items.length) return null;
  return [{ section: 'Block options' }, ...items];
}

export function isBlockOption(id) {
  return typeof id === 'string' && id.startsWith('blockopt-');
}

/** Insert the selected key/value text; for keys, advance to the value cell. */
export function applyBlockOption(view, id) {
  const action = actions.get(id);
  if (!action) return;
  const { state } = view;
  const { $cursor } = state.selection;
  if (!$cursor) return;
  view.dispatch(state.tr.insert($cursor.pos, state.schema.text(action.text)));
  if (action.moveNext) goToNextCell(1)(view.state, view.dispatch);
}
