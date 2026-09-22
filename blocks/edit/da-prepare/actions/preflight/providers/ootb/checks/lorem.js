import { createResult, SEVERITY } from '../../../views/result.js';

export default function loremCheck({ doc }) {
  const item = createResult();
  const hasLorem = doc.documentElement.innerHTML.toLowerCase().includes('lorem');

  if (hasLorem) {
    item.settle(SEVERITY.ERROR, 'This document appears to have lorem ipsum.');
  } else {
    item.settle(SEVERITY.INFO, 'This document appears to be free of lorem ipsum.');
  }

  return { title: 'Lorem ipsum', items: [item], done: true };
}
