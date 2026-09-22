import { createResult, SEVERITY } from '../../../views/result.js';

export default function h1Check({ doc }) {
  const item = createResult();
  const count = doc.querySelectorAll('h1').length;

  if (count === 1) {
    item.settle(SEVERITY.INFO, SEVERITY.INFO, 'Found exactly one H1 heading.');
  } else if (count > 1) {
    item.settle(SEVERITY.WARN, SEVERITY.WARN, 'Found more than one H1 heading.');
  } else {
    item.settle(SEVERITY.ERROR, SEVERITY.ERROR, 'No H1 Elements found.');
  }

  return { title: 'H1 count', items: [item], done: true };
}
