import { getNx2 } from '../../../scripts/utils.js';
import { extensionOf, isAssetHref } from './media.js';

const nx2 = getNx2();
const [
  {
    SUPPORTED_IMAGE_TYPES,
    getImageUploadLimit,
    getMediaUploadPath,
    imageTooLargeMessage,
    uploadMedia,
  },
  { SUPPORTED_FILES },
] = await Promise.all([
  import(`${nx2}/utils/media-upload.js`),
  import(`${nx2}/utils/utils.js`),
]);

// The SDK type names of asset fields.
export const ASSET_TYPES = Object.freeze({ image: 'image', file: 'file' });

const INVALID_FILE_NAME = /[/\\?#]|^\.{1,2}$/;

const UPLOAD_ERRORS = {
  document: 'The form document path is unavailable for upload.',
  fileName: 'The file name is invalid.',
  fileType: 'This file type cannot be uploaded here.',
  response: 'The upload did not return a usable file URL.',
};

const isValidFileName = (fileName) => !!fileName && !INVALID_FILE_NAME.test(fileName);

// The upload API derives the content type from the extension, so validation does too.
export async function uploadFile({ details, file, upload, checkHlx6 }) {
  const type = SUPPORTED_FILES[extensionOf(file?.name)];
  if (!SUPPORTED_IMAGE_TYPES.includes(type)) {
    return { error: UPLOAD_ERRORS.fileType };
  }

  const { owner, repo, parent, name } = details ?? {};
  if (!owner || !repo || !parent || !name) {
    return { error: UPLOAD_ERRORS.document };
  }
  if (!isValidFileName(file.name)) {
    return { error: UPLOAD_ERRORS.fileName };
  }

  const size = file.size ?? 0;
  const limitBytes = await getImageUploadLimit({ org: owner, site: repo, size, checkHlx6 });
  if (size > limitBytes) return { error: imageTooLargeMessage({ limitBytes }) };

  const path = getMediaUploadPath({ parent, name, fileName: file.name });
  const { href, error } = await uploadMedia({ path, body: file, upload });
  if (error) return { error };
  if (!isAssetHref(href)) return { error: UPLOAD_ERRORS.response };
  return { href, name: file.name };
}

export const CANCELLED = Object.freeze({ cancelled: true });

const SOURCE_IDS = {
  upload: 'upload',
  aemAssets: 'aem-assets',
};

function uploadSource({ details }) {
  return {
    id: SOURCE_IDS.upload,
    label: 'Upload',
    // Uploaded files reach the site only through the image media bus, so file fields
    // must reference published assets from AEM Assets instead.
    assetTypes: [ASSET_TYPES.image],
    fileTypes: SUPPORTED_IMAGE_TYPES,
    select: ({ file }) => uploadFile({ details, file }),
  };
}

function aemAssetsSource({ repoConfig }) {
  return {
    id: SOURCE_IDS.aemAssets,
    label: 'AEM Assets',
    select: async ({ assetType }) => {
      const { selectAemAsset } = await import('./aem-selector.js');
      return selectAemAsset({ repoConfig, imagesOnly: assetType === ASSET_TYPES.image });
    },
  };
}

// A source whose result arrives after the document changed must not write into the new one.
function ignoreStaleResults({ source, isCurrent }) {
  return {
    ...source,
    select: async (request) => {
      const result = await source.select(request);
      return isCurrent() ? result : CANCELLED;
    },
  };
}

export function createAssetSources({ details, repoConfig, isCurrent }) {
  return [
    uploadSource({ details }),
    ...(repoConfig ? [aemAssetsSource({ repoConfig })] : []),
  ].map((source) => ignoreStaleResults({ source, isCurrent }));
}
