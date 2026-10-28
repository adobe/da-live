// Test fixture mirroring nx2/utils/utils.js constants.
export const HLX_ADMIN = 'https://admin.hlx.page';
export const AEM_API = 'https://api.aem.live';
export const DA_ADMIN = 'https://admin.da.live';
export const ALLOWED_TOKEN = [DA_ADMIN, HLX_ADMIN, AEM_API];

const styleCache = {};

export const loadStyle = (supplied) => {
  const path = supplied.replace('.js', '.css');
  styleCache[path] ??= (async () => {
    const resp = await fetch(path);
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(resp.ok ? await resp.text() : '');
    return sheet;
  })();
  return styleCache[path];
};

export const SUPPORTED_FILES = {
  html: 'text/html',
  jpeg: 'image/jpeg',
  json: 'application/json',
  jpg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  mp4: 'video/mp4',
  pdf: 'application/pdf',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
};

export const loadPageStyle = async () => {};

export const getLivePreviewUrl = ({ org, repo, ref = 'main' }) => `https://${ref}--${repo}--${org}.aem.live`;

export const ensurePreviewLogin = async () => true;
