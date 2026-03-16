import { DA_ORIGIN } from '../../../../../shared/constants.js';
import { daFetch } from '../../../../../shared/utils.js';
import getPathDetails from '../../../../../shared/pathDetails.js';
import { CATEGORIES, REASONS } from './constants.js';

const getMetadata = (el) => {
  if (!el) return {};
  return [...el.childNodes].reduce((rdx, row) => {
    if (row.children) {
      const key = row.children[0].textContent.trim().toLowerCase();
      const content = row.children[1];
      const text = content.textContent.trim().toLowerCase();
      if (key && content) rdx[key] = { content, text };
    }
    return rdx;
  }, {});
};

const h1Check = async ({ doc }) => {
  const h1s = doc.querySelectorAll('h1');
  if (h1s.length === 1) return [REASONS['h1.info']];
  if (h1s.length > 1) return [REASONS['h1.warn']];
  return [REASONS['h1.error']];
};

const loremCheck = async ({ doc }) => {
  const hasLorem = doc.documentElement.innerHTML.toLowerCase().includes('lorem');
  if (hasLorem) return [REASONS['lorem.error']];
  return [REASONS['lorem.info']];
};

const titleCheck = async ({ doc }) => {
  const meta = doc.querySelector('.metadata');
  const h1 = doc.querySelector('h1');
  const { title } = getMetadata(meta);
  if (!(title || h1)) return [REASONS['title.error']];
  if (title) return [REASONS['title.info.meta']];
  return [REASONS['title.info.h1']];
};

const descCheck = async ({ doc }) => {
  const meta = doc.querySelector('.metadata');
  const para = doc.querySelector('p');
  const { description } = getMetadata(meta);
  if (!(description || para)) return [REASONS['description.warn']];
  if (description) return [REASONS['description.info.meta']];
  return [REASONS['description.info.para']];
};

export async function fragmentCheck({ details, doc }) {
  const links = [...doc.querySelectorAll('a')];
  return links.map((link) => {
    // Get the basics
    const text = link.textContent;
    const href = link.getAttribute('href');

    // Create the component
    const cmp = document.createElement('pf-link');
    Object.assign(cmp, { details, text, href });

    return cmp;
  });
}

const categoryChecks = {
  References: [
    { title: 'Fragments', fn: fragmentCheck },
  ],
  Content: [
    { title: 'H1 count', fn: h1Check },
    { title: 'Lorem ipsum', fn: loremCheck },
  ],
  SEO: [
    { title: 'Title', fn: titleCheck },
    { title: 'Description', fn: descCheck },
  ],
};

/**
 * Returns categories with checks that populate results asynchronously.
 * Each check starts with an empty results array that fills in as its fn resolves,
 * triggering requestUpdate on completion to re-render.
 *
 * @param {Document} doc - The parsed document to run checks against.
 * @param {Function} requestUpdate - Callback to trigger a re-render when results arrive.
 * @returns {Array<{title: string, checks: Array<{title: string, results: Array}>}>}
 */
export function loadResults(doc, requestUpdate) {
  const details = getPathDetails();

  return CATEGORIES.map((title) => {
    const checks = categoryChecks[title].map((check) => {
      const entry = { title: check.title, results: [] };
      check.fn({ details, doc }).then((results) => {
        if (results) entry.results = results;
        requestUpdate();
      });
      return entry;
    });
    return { title, checks };
  });
}

export async function loadDoc({ fullpath }) {
  const href = `${DA_ORIGIN}/source${fullpath}?no-cache=${Date.now()}`;
  const resp = await daFetch(href);
  if (!resp.ok) return { error: `Could not fetch document. Status: ${resp.status}` };
  const html = await resp.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return { doc };
}
