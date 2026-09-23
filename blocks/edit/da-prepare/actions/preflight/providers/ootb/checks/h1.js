import { createResult, SEVERITY } from '../../../views/result.js';
import { locateElement } from '../utils.js';

export default function h1Check({ doc }) {
  const item = createResult();
  const h1s = [...doc.querySelectorAll('h1')];
  const count = h1s.length;

  if (count === 1) {
    item.settle(SEVERITY.INFO, 'Found exactly one H1 heading.');
    item.location = locateElement(h1s[0]);
  } else if (count > 1) {
    item.settle(SEVERITY.WARN, 'Found more than one H1 heading.');
  } else {
    item.settle(SEVERITY.ERROR, 'No H1 Elements found.');
  }

  return { title: 'H1 count', items: [item], done: true };
}
