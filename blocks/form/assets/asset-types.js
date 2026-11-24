/**
 * An asset type the SDK supports, described by what it can do, so consumers ask a type
 * for its capability instead of comparing type names. `name` is the SDK type name that
 * schemas reference, and `extensions` lists the file extensions the SDK delivers as the
 * type. `showsPreview` expands its fields to a preview, `uploadable` lets authors upload
 * files for it, and `aemSelectsImagesOnly` limits the AEM Assets selector to images. An
 * optional `noSourceMessage` explains why a field offers no source, when the generic hint
 * does not.
 */

/**
 * Images. The SDK writes these extensions as `<img>`, so a field previews exactly what is
 * delivered as an image. Uploads reach the site through the image media bus.
 */
const IMAGE_ASSET_TYPE = Object.freeze({
  name: 'image',
  extensions: Object.freeze(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg']),
  showsPreview: true,
  uploadable: true,
  aemSelectsImagesOnly: true,
});

/**
 * Files. The SDK writes every value as a link, and uploads only reach the site through the
 * image media bus, so file fields reference published assets from AEM Assets.
 */
const FILE_ASSET_TYPE = Object.freeze({
  name: 'file',
  extensions: Object.freeze([]),
  showsPreview: false,
  uploadable: false,
  aemSelectsImagesOnly: false,
  noSourceMessage: 'Files can only be selected from AEM Assets, which is not set up for this site.',
});

/**
 * The supported asset types. Supporting a new SDK asset type means adding its descriptor
 * here, without changing the fields, sources or previews that consume it.
 */
export const ASSET_TYPES = Object.freeze([IMAGE_ASSET_TYPE, FILE_ASSET_TYPE]);

/**
 * The type every value is delivered as when no supported type claims its extension,
 * because the SDK writes such values as links.
 */
export const LINKED_ASSET_TYPE = FILE_ASSET_TYPE;

/**
 * Finds the asset type of an SDK type name.
 * @param {string} [typeName] The SDK type name of a model node or field.
 * @returns {object|undefined} The asset type, or undefined when the type is no asset.
 */
export function findAssetType(typeName) {
  return ASSET_TYPES.find(({ name }) => name === typeName);
}

/**
 * Checks whether an SDK type is an asset type, so its nodes are edited as one field.
 * @param {string} [typeName] The SDK type name of a model node.
 * @returns {boolean} Whether nodes of the type are edited as one asset field.
 */
export function isAssetType(typeName) {
  return findAssetType(typeName) !== undefined;
}

/**
 * Finds the asset type the SDK delivers a file extension as.
 * @param {string} extension The lowercase file extension, without the dot.
 * @returns {object} The type that claims the extension, or the linked asset type.
 */
export function deliveredAssetType(extension) {
  return ASSET_TYPES.find(({ extensions }) => extensions.includes(extension))
    ?? LINKED_ASSET_TYPE;
}
