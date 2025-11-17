import { goToNextCell } from 'da-y-wrapper';
import { daFetch } from '../../../../shared/utils.js';

function insertAutocompleteText(state, dispatch, text) {
  const { $cursor } = state.selection;

  if (!$cursor) return null;
  const tr = state.tr.insert($cursor.pos, state.schema.text(text));
  dispatch(tr);
  return tr;
}

function insertKeyAndMoveToNextCell(state, dispatch, text) {
  const tr = insertAutocompleteText(state, dispatch, text);

  const newState = state.apply(tr);
  goToNextCell(1)(newState, dispatch);
}

export function normalizeForSlashMenu(str) {
  return str?.toLowerCase().trim().replace(/\s+/g, '-');
}

export function createKeyMenuItems(keyData) {
  if (!keyData) return [];

  const keyMenuItems = [];
  for (const key of keyData.keys()) {
    keyMenuItems.push({
      title: key,
      value: key,
      command: (state, dispatch) => insertKeyAndMoveToNextCell(state, dispatch, key),
      class: 'key-autocomplete',
    });
  }

  return keyMenuItems;
}

function buildBlockMap(data) {
  const blockMap = new Map();

  data?.forEach((item) => {
    const itemBlocks = item.blocks?.toLowerCase().trim();
    const blocks = itemBlocks?.split(',').map((block) => normalizeForSlashMenu(block));

    if (!blocks) return;

    const values = item.values.split('|').map((v) => {
      const [label, val] = v.split('=').map((vb) => vb.trim());

      return {
        title: label,
        value: val || label,
        command: (state, dispatch) => insertAutocompleteText(state, dispatch, val || label),
        class: 'key-autocomplete',
      };
    });

    blocks.forEach((block) => {
      if (!blockMap.has(block)) {
        blockMap.set(block, new Map());
      }
      blockMap.get(block).set(normalizeForSlashMenu(item.key), values);
    });
  });

  return blockMap;
}

function copyAllBlocksToOthers(blockMap) {
  const allBlocks = blockMap.get('all');
  blockMap.forEach((block, blockName) => {
    if (blockName === 'all') return;
    allBlocks?.forEach((values, key) => {
      if (!block.has(key)) {
        block.set(key, values);
      }
    });
  });
}

function addFallbackBehavior(blockMap) {
  const originalGet = blockMap.get.bind(blockMap);
  blockMap.get = (blockName) => {
    if (blockMap.has(blockName)) return originalGet(blockName);

    const normalizedBlockName = normalizeForSlashMenu(blockName);
    if (blockMap.has(normalizedBlockName)) return originalGet(normalizedBlockName);

    return originalGet('all');
  };
}

export function processKeyData(data) {
  const blockMap = buildBlockMap(data);
  copyAllBlocksToOthers(blockMap);
  addFallbackBehavior(blockMap);
  return blockMap;
}

// getKeyAutocomplete only resolves once setKeyAutocomplete is called
export const [setKeyAutocomplete, getKeyAutocomplete] = (() => {
  let resolveData;
  const dataPromise = new Promise((resolve) => {
    resolveData = resolve;
  });

  return [
    (keyMap) => {
      resolveData(keyMap);
    },
    async () => dataPromise,
  ];
})();

export async function fetchKeyAutocompleteData(libraryBlockUrl) {
  const resp = await daFetch(libraryBlockUrl);
  const json = await resp.json();
  const keyMap = processKeyData(json?.options?.data);
  setKeyAutocomplete(keyMap);
}
