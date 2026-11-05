import { getFileItemHref } from '../shared/da-file-item/navigation.js';

export function getTileTarget({ entry, scope, href = window.location.href }) {
  try {
    const template = entry.href.replace(/%7B.*?%7D/gi, (token) => decodeURIComponent(token));
    const [org, site] = scope?.split('/') || [];
    const action = template.match(/^\/\{action:([a-z0-9-]+)\}\/?$/)?.[1];
    if (action) return { action, disabled: action !== 'create-page' || !org || !site };
    const requiresSite = /\{org\}|\{site\}/.test(template);
    if (requiresSite && (!org || !site)) return { disabled: true };
    const target = template.replace(/\{org\}/g, encodeURIComponent(org))
      .replace(/\{site\}/g, encodeURIComponent(site));
    if (/[{}]|%7B|%7D/i.test(target)) return { disabled: true };
    const url = new URL(target, entry.baseHref || href);
    if (!['http:', 'https:'].includes(url.protocol)) return { disabled: true };
    const current = new URL(href);
    if (url.origin === current.origin) {
      ['nx', 'nxver', 'quick-edit', 'ew', 'nx-chat-ao', 'theme', 'rum'].forEach((key) => {
        if (current.searchParams.has(key) && !url.searchParams.has(key)) {
          url.searchParams.set(key, current.searchParams.get(key));
        }
      });
      if (requiresSite && url.pathname === '/' && url.hash.startsWith('#/')) {
        url.searchParams.set('landing', 'home');
        url.searchParams.set('browse', '2');
      }
    }
    return { href: url.href, disabled: false };
  } catch {
    return { disabled: true };
  }
}

export function getBrowseHref({ path = '', href = window.location.href }) {
  const url = new URL(href);
  url.searchParams.set('landing', 'home');
  url.searchParams.set('browse', '2');
  url.hash = path ? `#${path}` : '';
  return url.href;
}

export function getFileHref({ item, href = window.location.href, editor = '/edit#' }) {
  if (!item.ext || item.ext === 'link') {
    const path = item.ext ? item.path.slice(0, item.path.lastIndexOf('/')) : item.path;
    return getBrowseHref({ path, href });
  }
  const url = new URL(getFileItemHref({ ...item, editor }), href);
  const current = new URL(href);
  if (url.origin !== current.origin) return url.href;
  ['nx', 'nxver', 'quick-edit', 'ew', 'nx-chat-ao', 'theme', 'rum'].forEach((key) => {
    if (current.searchParams.has(key)) url.searchParams.set(key, current.searchParams.get(key));
  });
  url.searchParams.set('landing', 'home');
  return url.href;
}
