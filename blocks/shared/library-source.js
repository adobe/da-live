import { DA_ORIGIN, CON_ORIGIN } from './constants.js';
import { daFetch } from './utils.js';
import { getPreviewProxyDetails } from './preview-proxy.js';

function getLibrarySourceUrl(input, context = {}) {
  let url;
  try {
    url = new URL(input);
  } catch {
    if (!input.startsWith('/') || !context.org || !context.site) return null;
    url = new URL(`${CON_ORIGIN}/${context.org}/${context.site}${input}`);
  }
  // The shared proxy resolver does not support legacy hlx hosts.
  if (/\.hlx\.(?:page|live)$/.test(url.hostname)) {
    url.hostname = url.hostname.replace('.hlx.', '.aem.');
  }
  if (/(?:^|-)admin\.da\.live$/.test(url.hostname) && !url.pathname.startsWith('/source/')) return null;
  const details = getPreviewProxyDetails(url.href, context);
  if (!details.org || !details.site) return null;
  let path = details.pathname.replace(/\.plain\.html$/i, '.html');
  if (!/\.[^/]+$/.test(path)) path += '.html';
  const contentOrigin = ['content.da.live', 'stage-content.da.live'].includes(url.hostname)
    ? url.origin : CON_ORIGIN;
  return {
    url: `${DA_ORIGIN}/source/${details.org}/${details.site}${path}${url.search}`,
    contentUrl: `${contentOrigin}/${details.org}/${details.site}${path}${url.search}`,
  };
}

export async function fetchLibrarySource(input, { context, skipRewrite = false } = {}) {
  const source = skipRewrite ? null : getLibrarySourceUrl(input, context);
  if (source) {
    const resp = await daFetch(source.url, { noRedirect: true });
    if (resp.status !== 404 || source.url === input) {
      return { resp, usedFallback: false, contentUrl: source.contentUrl };
    }
  }
  return {
    resp: await daFetch(input, { noRedirect: true }),
    usedFallback: skipRewrite || Boolean(source),
    contentUrl: input,
  };
}
