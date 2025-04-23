import { daFetch, getSheetByIndex } from '../../../../shared/utils.js';

function insertAutocompleteText(state, dispatch, text) {
  const { $cursor } = state.selection;

  if (!$cursor) return;
  const tr = state.tr.insert($cursor.pos, state.schema.text(text));
  dispatch(tr);
}

export function processKeyData(data) {
  const blockMap = new Map();

  data?.forEach((item) => {
    const itemBlocks = item.blocks.toLowerCase().trim();
    const blocks = itemBlocks.split(',').map((block) => block.trim());

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
      blockMap.get(block).set(item.key, values);
    });
  });

  // values of "all" block are available (thus copied) in all other blocks, if not explicitly set
  const allBlocks = blockMap.get('all');
  blockMap.forEach((block, blockName) => {
    if (blockName === 'all') return;
    allBlocks?.forEach((values, key) => {
      if (!block.has(key)) {
        block.set(key, values);
      }
    });
  });

  // the "all" block is also returned as fallback if no values are configured for the queried block
  const originalGet = blockMap.get.bind(blockMap);
  blockMap.get = (blockName) => {
    if (blockMap.has(blockName)) {
      return originalGet(blockName);
    }

    return originalGet('all');
  };

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
  const keyMap = processKeyData(getSheetByIndex(json, 1));
  setKeyAutocomplete(keyMap);
}
