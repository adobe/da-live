import { buildLinkCheck } from './links.js';

export default function fragmentsCheck({ context, doc, onUpdate }) {
  return buildLinkCheck({
    title: 'Fragments',
    selector: 'a[href*="/fragments/"]',
    context,
    doc,
    onUpdate,
  });
}
