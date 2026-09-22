import { createResult, SEVERITY } from '../../../views/result.js';
import { getMetadata } from '../utils.js';

export default function titleCheck({ doc }) {
  const meta = doc.querySelector('.metadata');
  const h1 = doc.querySelector('h1');
  const { title } = getMetadata(meta);
  const item = createResult();

  if (title) {
    item.settle(SEVERITY.INFO, 'Title found in metadata.');
  } else if (h1) {
    item.settle(SEVERITY.INFO, 'Document using H1 as title.');
  } else {
    item.settle(SEVERITY.ERROR, 'No title found in metadata or H1 fallback.');
  }

  return { title: 'Title', items: [item], done: true };
}
