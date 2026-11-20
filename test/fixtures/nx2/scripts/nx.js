// Test fixture mirroring the getConfig export of nx2/scripts/nx.js.
export const getConfig = () => ({ codeBase: window.location.origin });

let blocks = {};
export const setBlockMocks = (mocks) => { blocks = mocks; };

export async function loadBlock(block) {
  const name = block.classList[0];
  return blocks[name](block);
}
