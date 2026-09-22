import { getNx2Api } from '../../../../../../../scripts/utils.js';
import { runCheck } from '../utils.js';
import h1Check from './checks/h1.js';
import loremCheck from './checks/lorem.js';
import titleCheck from './checks/title.js';
import descriptionCheck from './checks/description.js';
import linksCheck from './checks/links.js';
import fragmentsCheck from './checks/fragments.js';

async function loadDoc({ fullpath }) {
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

async function getResults({ details, onUpdate }) {
  const doc = await loadDoc(details);

  return Promise.all(CATEGORIES.map(async ({ title, checks }) => ({
    title,
    checks: await Promise.all(checks.map((check) => runCheck(check, { details, doc, onUpdate }))),
  })));
}

export default { id: 'ootb', getResults };
