import { daFetch, getSheetByIndex } from '../../../../shared/utils.js';

function insertAutocompleteText(state, dispatch, text) {
  const { $cursor } = state.selection;

  if (!$cursor) return;
  const from = $cursor.before();
  const to = $cursor.pos;
  const tr = state.tr.replaceWith(from, to, state.schema.text(text));
  dispatch(tr);
}

export function processKeyData(data) {
  const blockMap = new Map();

  data?.forEach((item) => {
    const itemBlocks = item.blocks.toLowerCase().trim();
    const blocks = itemBlocks.split(',').map((block) => block.trim());

    const values = item.values.toLowerCase().split(',').map((v) => {
      const val = v.trim();
      return {
        title: val,
        command: (state, dispatch) => insertAutocompleteText(state, dispatch, val),
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
