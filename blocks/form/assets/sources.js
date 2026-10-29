import { getNx2Api } from '../../../scripts/utils.js';
import { SUPPORTED_IMAGE_TYPES } from '../../shared/constants.js';
import { refuseOversizedImage } from '../../shared/image-upload.js';
import { ASSET_TYPES, findAssetType } from './asset-types.js';
import { isAssetHref } from './media.js';

/** The identifiers of the asset sources, which the source menu reports on selection. */
const SOURCE_IDS = Object.freeze({ upload: 'upload', aemAssets: 'aem-assets' });

/** The names of the asset sources as shown to authors. */
export const SOURCE_LABELS = Object.freeze({ upload: 'Upload', aemAssets: 'AEM Assets' });

/** The result of a selection that ended without a value or an error. */
export const CANCELLED = Object.freeze({ cancelled: true });

/** The names of the asset types authors can upload files for. */
const UPLOADABLE_ASSET_TYPE_NAMES = Object.freeze(ASSET_TYPES
  .filter(({ uploadable }) => uploadable)
  .map(({ name }) => name));

/** Matches file names that would escape or break the media path they are uploaded to. */
const INVALID_FILE_NAME = /[/\\?#]|^\.{1,2}$/;

/** The errors an upload reports to the author. */
const UPLOAD_ERRORS = {
  document: 'The form document path is unavailable for upload.',
  fileName: 'The file name is invalid.',
  fileType: 'This file type cannot be uploaded here.',
  response: 'The upload did not return a usable file URL.',
  status: (status) => `Upload failed with status ${status}.`,
};

/**
 * Checks whether a file name can be uploaded without changing the media path.
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

/**
 * Creates the source that uploads a picked image to the document's media folder.
 * @param {object} options The source settings.
 * @param {object} options.details The form document's path details.
 * @returns {object} The Upload source.
 */
function uploadSource({ details }) {
  return {
    id: SOURCE_IDS.upload,
    label: SOURCE_LABELS.upload,
    assetTypes: UPLOADABLE_ASSET_TYPE_NAMES,
    fileTypes: SUPPORTED_IMAGE_TYPES,
    select: ({ file }) => uploadFile({ details, file }),
  };
}

/**
 * Creates the source that selects an asset in the AEM Assets selector.
 * @param {object} options The source settings.
 * @param {object} options.repositoryConfig The site's AEM Assets repository configuration.
 * @returns {object} The AEM Assets source.
 */
function aemAssetsSource({ repositoryConfig }) {
  return {
    id: SOURCE_IDS.aemAssets,
    label: SOURCE_LABELS.aemAssets,
    select: async ({ assetType }) => {
      const { selectAemAsset } = await import('./aem-selector.js');
      const imagesOnly = findAssetType(assetType)?.aemSelectsImagesOnly ?? false;
      return selectAemAsset({ repositoryConfig, imagesOnly });
    },
  };
}

/**
 * Wraps a source so a result that arrives after the document changed is cancelled
 * instead of written into the new document.
 * @param {object} options The source and its guard.
 * @param {object} options.source The source to wrap.
 * @param {() => boolean} options.isCurrent Answers whether the document is still open.
 * @returns {object} The wrapped source.
 */
function ignoreStaleResults({ source, isCurrent }) {
  return {
    ...source,
    select: async (request) => {
      const result = await source.select(request);
      return isCurrent() ? result : CANCELLED;
    },
  };
}

/**
 * Creates the sources an asset field selects from. AEM Assets is offered only when the
 * site has a repository configuration.
 * @param {object} options The sources settings.
 * @param {object} options.details The form document's path details.
 * @param {object} [options.repositoryConfig] The site's AEM Assets repository
 *   configuration.
 * @param {() => boolean} options.isCurrent Answers whether the document is still open.
 * @returns {object[]} The sources, each with an `id`, a `label` and a `select` function.
 */
export function createAssetSources({ details, repositoryConfig, isCurrent }) {
  const sources = [uploadSource({ details })];
  if (repositoryConfig) {
    sources.push(aemAssetsSource({ repositoryConfig }));
  }
  return sources.map((source) => ignoreStaleResults({ source, isCurrent }));
}
