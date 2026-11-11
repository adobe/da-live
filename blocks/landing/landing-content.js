import { LANDING_CONTENT_PATH } from './constants.js';

export function readLandingBlocks(area) {
  return [...(area?.querySelectorAll('.greeting, .recent-files, .landing') ?? [])]
    .filter((block) => !block.closest('.browse'))
    .map((block) => {
      const clone = block.cloneNode(true);
      clone.hidden = false;
      return clone;
    });
}

const requests = new Map();

export async function loadLandingContent(path = LANDING_CONTENT_PATH) {
  if (!requests.has(path)) {
    requests.set(path, (async () => {
      try {
        const response = await fetch(`${path}.plain.html`);
        if (!response.ok) return { error: 'Could not load Landing content.' };
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        const blocks = readLandingBlocks(doc);
        return blocks.length
          ? { blocks, baseHref: new URL(path, window.location.href).href }
          : { error: 'No Landing content is configured.' };
      } catch {
        return { error: 'Could not load Landing content.' };
      }
    })());
  }
  const result = await requests.get(path);
  if (result.error) requests.delete(path);
  return result;
}
