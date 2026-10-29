const ASSET_ID = 'ew-local-sample-jpeg';
const IMAGE_URL = new URL('../../browse/da-sites/img/cards/da-1.jpg', import.meta.url);

export function createLocalAssetListing() {
  let file;
  let pending;
  const loadFile = () => {
    pending ??= (async () => {
      const response = await fetch(IMAGE_URL);
      if (!response.ok) throw new Error(`Could not load the local sample image (${response.status}).`);
      const blob = await response.blob();
      if (!blob.size || blob.type !== 'image/jpeg') {
        throw new Error('The local sample image is not a JPEG.');
      }
      file = new File([blob], 'sample-image.jpg', { type: blob.type });
      return file;
    })().catch((error) => {
      pending = null;
      throw error;
    });
    return pending;
  };

  return {
    getFile(id) {
      return id === ASSET_ID ? file : undefined;
    },
    async prepareFile(id) {
      if (id !== ASSET_ID) throw new Error('The image is not in the asset list.');
      return loadFile();
    },
    async load({ more = false } = {}) {
      if (more) return { assets: [], hasMore: false };
      const image = await loadFile();
      return {
        assets: [{ asset: { 'repo:id': ASSET_ID }, name: 'Sample JPEG (local mock)', thumbnail: image }],
        hasMore: false,
      };
    },
  };
}
