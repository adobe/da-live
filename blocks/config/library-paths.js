import { getRows, SHEETS } from './sheets.js';

// Where Set up looks for a library list, in order: the first file that exists is registered,
// otherwise the first path is created.
export const listPaths = (type) => [`/docs/library/${type}.json`, `/library/${type}.json`];

// The site's `library` row for a built-in type (e.g. Templates). Org rows are ignored on purpose:
// the classic editor only reads the site config, so library setup is per site.
export function libraryRegistration(siteConfig, title) {
  return getRows(siteConfig, SHEETS.library)
    .find((row) => row.title?.trim().toLowerCase() === title.toLowerCase()) ?? null;
}

// `{ref}--{site}--{org}.aem.live|page`
const AEM_HOST = /^(.+?)--(.+?)--(.+?)\.aem\.(live|page)$/i;

// The DA source path (/library/templates.json) behind a registered library path, when it's a
// file of this site: a site path, a content.da.live URL or an aem.live/page URL. Only the first
// of comma-separated sources is used. Null for anything else (another site, an external URL, or
// a file that isn't a sheet).
export function librarySourcePath(registered, org, site) {
  const first = (registered ?? '').split(',')[0].trim();
  const same = (o, s) => o?.toLowerCase() === org.toLowerCase()
    && s?.toLowerCase() === site.toLowerCase();
  let path = null;
  if (first.startsWith('/')) {
    path = first;
  } else {
    let url;
    try {
      url = new URL(first);
    } catch {
      return null;
    }
    if (url.hostname === 'content.da.live') {
      const [, o, s, ...rest] = url.pathname.split('/');
      if (same(o, s)) path = `/${rest.join('/')}`;
    } else {
      const host = url.hostname.match(AEM_HOST);
      if (host && same(host[3], host[2])) path = url.pathname;
    }
  }
  if (!path || path === '/') return null;
  // A sheet is addressed with or without `.json`; any other extension (.html, .bak) isn't one.
  const ext = path.split('/').pop().match(/\.[^.]+$/)?.[0].toLowerCase();
  if (!ext) return `${path}.json`;
  return ext === '.json' ? path : null;
}

// Sources served from aem.live/page (incl. site paths) only change for authors once published.
export function needsPublish(registered) {
  return !(registered ?? '').trim().startsWith('https://content.da.live/');
}
