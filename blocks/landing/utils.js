export function getTileTarget({ entry, scope, href = window.location.href }) {
  try {
    const template = entry.href.replace(/%7B.*?%7D/gi, (token) => decodeURIComponent(token));
    const [org, site] = scope?.split('/') || [];
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
