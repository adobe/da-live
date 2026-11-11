import { ONBOARDING_CONTENT_PATH } from './constants.js';

const CONTENT_ERROR = 'Could not load onboarding content.';

const iconName = (col) => [...(col?.querySelector('span.icon')?.classList ?? [])]
  .find((name) => name.startsWith('icon-'))?.slice(5).toLowerCase().replaceAll('-', '');

export function parseCards(block) {
  return [...(block?.children ?? [])].map((row) => {
    const [iconCol, bodyCol] = row.children;
    const heading = bodyCol?.querySelector('h1, h2, h3, h4, h5, h6');
    const name = iconName(iconCol);
    return {
      heading: heading?.textContent.trim() ?? '',
      description: [...(bodyCol?.querySelectorAll('p') ?? [])]
        .map((p) => p.textContent.trim()).filter(Boolean).join(' '),
      icon: name ? `/img/icons/s2-icon-${name}-20-n.svg` : undefined,
      tint: iconCol?.querySelector('em')?.textContent.trim() || undefined,
      href: heading?.querySelector('a')?.getAttribute('href') || undefined,
    };
  });
}

export const loadCards = (() => {
  const requests = new Map();
  return async (path = ONBOARDING_CONTENT_PATH) => {
    if (!requests.has(path)) {
      requests.set(path, (async () => {
        try {
          const resp = await fetch(`${path}.plain.html`);
          if (!resp.ok) return { error: CONTENT_ERROR, status: resp.status };
          const doc = new DOMParser().parseFromString(await resp.text(), 'text/html');
          return { cards: parseCards(doc.querySelector('.nx-cards')) };
        } catch {
          return { error: CONTENT_ERROR };
        }
      })());
    }
    const result = await requests.get(path);
    if (result.error) requests.delete(path);
    return result;
  };
})();
