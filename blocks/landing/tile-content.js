import { LANDING_CONTENT_PATH } from './constants.js';

export function parseTileEntries(block) {
  return [...(block?.children || [])].flatMap((row) => {
    const [icon, content, metadata] = row.children;
    const options = [...(metadata?.childNodes || [])].map((node) => node.textContent).join(' ');
    const link = content?.querySelector('h3 a');
    const iconName = icon?.textContent.trim().match(/^:(s2-icon-[a-z0-9-]+):$/)?.[1];
    if (!link?.textContent.trim() || !link.getAttribute('href') || !iconName) return [];
    return [{
      id: options.match(/\bid:\s*([a-z0-9-]+)/i)?.[1]
        || link.closest('h3').id || iconName,
      heading: link.textContent.trim(),
      description: [...content.querySelectorAll('li, p')]
        .map((item) => item.textContent.trim()).join(' '),
      iconHref: `/img/icons/${iconName}.svg`,
      href: link.getAttribute('href'),
      tone: options.match(/\btone:\s*([a-z0-9-]+)/i)?.[1].toLowerCase(),
    }];
  });
}

export const loadTileEntries = (() => {
  const requests = new Map();
  return async (path = LANDING_CONTENT_PATH) => {
    if (!requests.has(path)) {
      requests.set(path, (async () => {
        try {
          const response = await fetch(path);
          if (!response.ok) return { error: 'Could not load quick links.', status: response.status };
          const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
          const baseHref = new URL(path, window.location.href).href;
          const entries = parseTileEntries(doc.querySelector('main .landing'))
            .map((entry) => ({ ...entry, baseHref }));
          return entries.length ? { entries } : { error: 'No quick links are configured.' };
        } catch {
          return { error: 'Could not load quick links.' };
        }
      })());
    }
    const result = await requests.get(path);
    if (result.error) requests.delete(path);
    return result;
  };
})();
