import { ASSET_TYPES } from '../../../../../blocks/form/assets/asset-types.js';

// The SDK resolves its asset types by these GitHub URLs.
const SDK_SCHEMAS = 'https://raw.githubusercontent.com/adobe/da-sc-sdk/main/schemas';

const SCHEMA_URLS = Object.fromEntries(ASSET_TYPES
  .map(({ name }) => [name, `${SDK_SCHEMAS}/${name}/v1.0.0.json`]));

export const IMAGE_URL = SCHEMA_URLS.image;
export const FILE_URL = SCHEMA_URLS.file;
