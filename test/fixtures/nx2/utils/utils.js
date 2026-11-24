// Test fixture mirroring nx2/utils/utils.js constants.
export const HLX_ADMIN = 'https://admin.hlx.page';
export const AEM_API = 'https://api.aem.live';
// eslint-disable-next-line import/no-mutable-exports
export let DA_ADMIN = 'https://admin.da.live';
// nx2 picks its own DA environment, which can differ from the editor's
// (da.page, branch hosts). Tests switch it here.
export const setDaAdmin = (origin) => { DA_ADMIN = origin; };
export const DA_CONTENT = 'https://content.da.live';
export const ALLOWED_TOKEN = [DA_ADMIN, HLX_ADMIN, AEM_API];
