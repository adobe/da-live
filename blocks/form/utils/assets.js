import { getNx2Api } from '../../../scripts/utils.js';
import { SUPPORTED_IMAGE_TYPES } from '../../shared/constants.js';
import { refuseOversizedImage } from '../../shared/image-upload.js';
import { isAssetHref } from './media.js';

// The SDK type names of asset fields.
export const ASSET_TYPES = Object.freeze({ image: 'image', file: 'file' });

/** The result of a selection that ended without a value or an error. */
export const CANCELLED = Object.freeze({ cancelled: true });

const INVALID_FILE_NAME = /[/\\?#]|^\.{1,2}$/;

const UPLOAD_ERRORS = {
  document: 'The form document path is unavailable for upload.',
  fileName: 'The file name is invalid.',
  fileType: 'This file type cannot be uploaded here.',
  response: 'The upload did not return a usable file URL.',
  status: (status) => `Upload failed with status ${status}.`,
};

/**
 * @param {string} [fileName] The name of the picked file.
 * @returns {boolean} Whether the name is safe to use as the last segment of a media path.
 */
function isValidFileName(fileName) {
  return !!fileName && !INVALID_FILE_NAME.test(fileName);
}

/**
 * Builds the media path Canvas uploads to, a hidden folder named after the document.
 * @param {object} options The document and file names.
 * @param {string} options.parent The document's folder, `/org/site/dir`.
 * @param {string} options.name The document's name without its extension.
 * @param {string} options.fileName The name of the uploaded file.
 * @returns {string} The media path.
 */
function mediaPathOf({ parent, name, fileName }) {
  return `${parent}/.${name}/${fileName}`;
}

/**
 * Uploads a file through the nx2 source api.
 * @param {string} path The media path.
 * @param {{ body: File }} options The request options.
 * @returns {Promise<Response>} The upload response.
 */
async function uploadMedia(path, options) {
  const { source } = await getNx2Api();
  return source.uploadMedia(path, options);
}

/**
 * Reads the URL of the uploaded file from an upload response.
 * @param {Response} response The upload response.
 * @returns {Promise<string|undefined>} The content URL, or undefined for an unreadable body.
 */
async function readContentUrl(response) {
  const json = await response.json().catch(() => undefined);
  return json?.source?.contentUrl;
}

/**
 * Uploads an image the way Canvas does, including its size limit toast.
 * @param {object} options The upload request.
 * @param {{ parent: string, name: string }} options.details The form document's path details.
 * @param {File} options.file The picked file.
 * @param {Function} [options.upload] Posts the file body to a media path.
 * @param {Function} [options.refuseOversized] Shows the size limit toast and answers whether
 *   the file is too large.
 * @returns {Promise<object>} The uploaded `href` and `name`, an `error`, or `CANCELLED` once
 *   the size limit toast has been shown.
 */
export async function uploadFile({
  details,
  file,
  upload = uploadMedia,
  refuseOversized = refuseOversizedImage,
}) {
  if (!SUPPORTED_IMAGE_TYPES.includes(file?.type)) {
    return { error: UPLOAD_ERRORS.fileType };
  }

  const { parent, name } = details ?? {};
  if (!parent || !name) {
    return { error: UPLOAD_ERRORS.document };
  }
  if (!isValidFileName(file.name)) {
    return { error: UPLOAD_ERRORS.fileName };
  }
  if (await refuseOversized(file.size, parent)) {
    return CANCELLED;
  }

  const response = await upload(mediaPathOf({ parent, name, fileName: file.name }), { body: file });
  if (!response.ok) {
    return { error: UPLOAD_ERRORS.status(response.status) };
  }

  const href = await readContentUrl(response);
  if (!isAssetHref(href)) {
    return { error: UPLOAD_ERRORS.response };
  }
  return { href, name: file.name };
}

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
