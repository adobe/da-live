/**
 * An asset type the SDK supports, described by what it can do, so consumers ask a type
 * for its capability instead of comparing type names. `name` is the name of the SDK
 * shared schema that schemas reference. `showsPreview` expands its fields to a preview,
 * `uploadable` lets authors upload files for it, and `aemSelectsImagesOnly` limits the
 * AEM Assets selector to images. An optional `noSourceMessage` explains why a field
 * offers no source, when the generic hint does not.
 */

/**
 * Images. Fields preview their value, and uploads reach the site through the image media
 * bus.
 */
const IMAGE_ASSET_TYPE = Object.freeze({
  name: 'image',
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
 * Finds the asset type of an SDK shared schema.
 * @param {string} [sharedSchemaName] The `sharedSchemaName` of a model node or field.
 * @returns {object|undefined} The asset type, or undefined when the schema is no asset.
 */
export function findAssetType(sharedSchemaName) {
  return ASSET_TYPES.find(({ name }) => name === sharedSchemaName);
}

/**
 * Checks whether an SDK shared schema is an asset type, so its nodes are edited as one
 * field.
 * @param {string} [sharedSchemaName] The `sharedSchemaName` of a model node.
 * @returns {boolean} Whether nodes of the schema are edited as one asset field.
 */
export function isAssetType(sharedSchemaName) {
  return findAssetType(sharedSchemaName) !== undefined;
}
