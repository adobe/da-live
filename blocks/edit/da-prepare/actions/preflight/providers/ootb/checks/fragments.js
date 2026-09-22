import { buildLinkCheck } from './links.js';

export default function fragmentsCheck({ details, doc, onUpdate }) {
  return buildLinkCheck({
    title: 'Fragments',
    selector: 'a[href*="/fragments/"]',
    details,
    doc,
    onUpdate,
  });
}
