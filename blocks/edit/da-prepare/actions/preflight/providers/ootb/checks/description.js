import { createResult, SEVERITY } from '../../../views/result.js';
import { getMetadata } from '../utils.js';

export default function descriptionCheck({ doc }) {
  const meta = doc.querySelector('.metadata');
  const para = doc.querySelector('p');
  const { description } = getMetadata(meta);
  const item = createResult();

  if (description) {
    item.settle(SEVERITY.INFO, 'Description found in metadata.');
  } else if (para) {
    item.settle(SEVERITY.INFO, 'Description found as first paragraph.');
  } else {
    item.settle(SEVERITY.WARN, 'Description not found in metadata or first paragraph.');
  }

  return { title: 'Description', items: [item], done: true };
}
