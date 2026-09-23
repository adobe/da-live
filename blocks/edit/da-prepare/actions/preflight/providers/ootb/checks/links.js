import { createResult, SEVERITY } from '../../../views/result.js';
import { locateElement } from '../utils.js';
import '../views/link.js';

// Browsers cap concurrent connections per host; checking hundreds of links at once would just
// queue at the network layer anyway, so throttle explicitly instead.
const LINK_CHECK_CONCURRENCY = 5;

async function runWithConcurrency(items, onUpdate) {
  const queue = [...items];
  const worker = async () => {
    let item = queue.shift();
    while (item) {
      await item.runCheck();
      if (onUpdate) onUpdate();
      item = queue.shift();
    }
  };

  const count = Math.min(LINK_CHECK_CONCURRENCY, items.length);
  await Promise.all(Array.from({ length: count }, worker));
}

export function buildLinkCheck({ title, selector, context, doc, onUpdate }) {
  const links = [...doc.querySelectorAll(selector)];

  if (links.length === 0) {
    const item = createResult();
    item.settle(SEVERITY.NA, 'No matching links found on this page.');
    return { title, items: [item], done: true };
  }

  const items = links.map((link) => {
    const item = document.createElement('pf-link');
    Object.assign(item, { context, text: link.textContent, href: link.getAttribute('href') });
    item.location = locateElement(link);
    return item;
  });

  // Fire-and-forget: runCheck() never throws (it settles ERROR on failure internally), so
  // this can't produce an unhandled rejection. Items settle progressively via onUpdate.
  runWithConcurrency(items, onUpdate);

  return { title, items, done: true };
}

export default function linksCheck({ context, doc, onUpdate }) {
  return buildLinkCheck({
    title: 'Links',
    selector: 'a:not([href*="/fragments/"])',
    context,
    doc,
    onUpdate,
  });
}
