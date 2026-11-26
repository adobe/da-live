import { getSharedSchema } from '../../../../../deps/da-sc-sdk/dist/index.js';

// Schemas reference the SDK's shared schemas by their `$id`.
const sharedSchemaId = (name) => getSharedSchema({ name, version: '1.0.0' }).schema.$id;

export const IMAGE_URL = sharedSchemaId('image');
export const FILE_URL = sharedSchemaId('file');
