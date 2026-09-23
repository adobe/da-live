import { getNx2Api } from '../../../../../../../scripts/utils.js';
import { runCheck } from '../utils.js';
import h1Check from './checks/h1.js';
import loremCheck from './checks/lorem.js';
import titleCheck from './checks/title.js';
import descriptionCheck from './checks/description.js';
import linksCheck from './checks/links.js';
import fragmentsCheck from './checks/fragments.js';

// In canvas, prefer the live editor's own instrumented HTML (carries the doc's current
// unsaved state, plus data-prose-index/data-block-index/data-image-index for scroll-to-
// element) over a network fetch. Falls back to the network fetch if canvas never becomes
// ready in time, or hasn't rendered anything yet -- classic /edit always takes this path.
async function loadDoc({ fullpath, isCanvas, canvasReady, getCanvasHtml }) {
  if (isCanvas && await canvasReady) {
    const canvasHtml = getCanvasHtml();
    if (canvasHtml) return new DOMParser().parseFromString(canvasHtml, 'text/html');
  }

  const { source } = await getNx2Api();
  const resp = await source.get(fullpath, { cachebust: true });
  if (!resp.ok) throw new Error(`Could not fetch document. Status: ${resp.status}`);
  const html = await resp.text();
  return new DOMParser().parseFromString(html, 'text/html');
}

const CATEGORIES = [
  { title: 'References', checks: [linksCheck, fragmentsCheck] },
  { title: 'Content', checks: [h1Check, loremCheck] },
  { title: 'SEO', checks: [titleCheck, descriptionCheck] },
];

async function getResults({ context, onUpdate }) {
  const doc = await loadDoc(context);

  return Promise.all(CATEGORIES.map(async ({ title, checks }) => ({
    title,
    checks: await Promise.all(checks.map((check) => runCheck(check, { context, doc, onUpdate }))),
  })));
}

export default { id: 'ootb', getResults };
