import { expect } from '@esm-bundle/chai';
import {
  fragmentCheck,
  loadResults,
  loadDoc,
} from '../../../../../../../blocks/edit/da-prepare/actions/preflight/utils/utils.js';
import { REASONS } from '../../../../../../../blocks/edit/da-prepare/actions/preflight/utils/constants.js';

function makeDoc(html) {
  return new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html');
}

describe('preflight/utils loadResults', () => {
  it('Reports h1.info when exactly one H1 is present', async () => {
    const doc = makeDoc('<h1>Hello</h1>');
    const cats = loadResults(doc, () => {});
    const h1Check = cats.find((c) => c.title === 'Content').checks.find((x) => x.title === 'H1 count');
    // results populate async
    await Promise.resolve();
    await Promise.resolve();
    expect(h1Check.results[0]).to.equal(REASONS['h1.info']);
  });

  it('Reports h1.warn for multiple H1s', async () => {
    const doc = makeDoc('<h1>One</h1><h1>Two</h1>');
    const cats = loadResults(doc, () => {});
    await Promise.resolve();
    await Promise.resolve();
    const h1Check = cats.find((c) => c.title === 'Content').checks.find((x) => x.title === 'H1 count');
    expect(h1Check.results[0]).to.equal(REASONS['h1.warn']);
  });

  it('Reports h1.error when no H1 is present', async () => {
    const doc = makeDoc('<p>No heading</p>');
    const cats = loadResults(doc, () => {});
    await Promise.resolve();
    await Promise.resolve();
    const h1Check = cats.find((c) => c.title === 'Content').checks.find((x) => x.title === 'H1 count');
    expect(h1Check.results[0]).to.equal(REASONS['h1.error']);
  });

  it('Reports lorem.error when lorem ipsum is present', async () => {
    const doc = makeDoc('<h1>Lorem ipsum dolor</h1>');
    const cats = loadResults(doc, () => {});
    await Promise.resolve();
    await Promise.resolve();
    const lorem = cats.find((c) => c.title === 'Content').checks.find((x) => x.title === 'Lorem ipsum');
    expect(lorem.results[0]).to.equal(REASONS['lorem.error']);
  });

  it('Reports lorem.info otherwise', async () => {
    const doc = makeDoc('<h1>Hello</h1><p>Plain content</p>');
    const cats = loadResults(doc, () => {});
    await Promise.resolve();
    await Promise.resolve();
    const lorem = cats.find((c) => c.title === 'Content').checks.find((x) => x.title === 'Lorem ipsum');
    expect(lorem.results[0]).to.equal(REASONS['lorem.info']);
  });

  it('Picks title from metadata when present', async () => {
    const doc = makeDoc('<div class="metadata"><div><div>title</div><div>Hi</div></div></div>');
    const cats = loadResults(doc, () => {});
    await Promise.resolve();
    await Promise.resolve();
    const title = cats.find((c) => c.title === 'SEO').checks.find((x) => x.title === 'Title');
    expect(title.results[0]).to.equal(REASONS['title.info.meta']);
  });

  it('Falls back to H1 when no metadata title is present', async () => {
    const doc = makeDoc('<h1>Hello</h1>');
    const cats = loadResults(doc, () => {});
    await Promise.resolve();
    await Promise.resolve();
    const title = cats.find((c) => c.title === 'SEO').checks.find((x) => x.title === 'Title');
    expect(title.results[0]).to.equal(REASONS['title.info.h1']);
  });

  it('Reports title.error when neither H1 nor metadata title is present', async () => {
    const doc = makeDoc('<p>nothing</p>');
    const cats = loadResults(doc, () => {});
    await Promise.resolve();
    await Promise.resolve();
    const title = cats.find((c) => c.title === 'SEO').checks.find((x) => x.title === 'Title');
    expect(title.results[0]).to.equal(REASONS['title.error']);
  });

  it('Picks description from metadata when present', async () => {
    const doc = makeDoc('<p>Hi</p><div class="metadata"><div><div>description</div><div>Desc</div></div></div>');
    const cats = loadResults(doc, () => {});
    await Promise.resolve();
    await Promise.resolve();
    const d = cats.find((c) => c.title === 'SEO').checks.find((x) => x.title === 'Description');
    expect(d.results[0]).to.equal(REASONS['description.info.meta']);
  });

  it('Falls back to first paragraph when description not in metadata', async () => {
    const doc = makeDoc('<p>Some paragraph</p>');
    const cats = loadResults(doc, () => {});
    await Promise.resolve();
    await Promise.resolve();
    const d = cats.find((c) => c.title === 'SEO').checks.find((x) => x.title === 'Description');
    expect(d.results[0]).to.equal(REASONS['description.info.para']);
  });

  it('Reports description.warn when neither metadata description nor para is present', async () => {
    const doc = makeDoc('<h1>Only heading</h1>');
    const cats = loadResults(doc, () => {});
    await Promise.resolve();
    await Promise.resolve();
    const d = cats.find((c) => c.title === 'SEO').checks.find((x) => x.title === 'Description');
    expect(d.results[0]).to.equal(REASONS['description.warn']);
  });
});

describe('preflight/utils linkCheck/fragmentCheck', () => {
  it('fragmentCheck filters to fragment hrefs only', async () => {
    const doc = makeDoc('<a href="/foo">A</a><a href="/fragments/bar">B</a>');
    const results = await fragmentCheck({ doc, details: {} });
    expect(results).to.have.length(1);
    expect(results[0].href).to.equal('/fragments/bar');
    expect(results[0].tagName.toLowerCase()).to.equal('pf-link');
  });

  it('Default linkCheck excludes fragments', async () => {
    const doc = makeDoc('<a href="/foo">A</a><a href="/fragments/bar">B</a>');
    const cats = loadResults(doc, () => {});
    await Promise.resolve();
    await Promise.resolve();
    const links = cats.find((c) => c.title === 'References').checks.find((x) => x.title === 'Links');
    expect(links.results).to.have.length(1);
    expect(links.results[0].href).to.equal('/foo');
  });
});

describe('preflight/utils loadDoc', () => {
  let savedFetch;
  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  it('Returns parsed doc on success', async () => {
    window.fetch = () => Promise.resolve(new Response('<html><body><h1>Hi</h1></body></html>', { status: 200 }));
    const result = await loadDoc({ fullpath: '/org/repo/page.html' });
    expect(result.doc.querySelector('h1').textContent).to.equal('Hi');
  });

  it('Returns an error string on failure', async () => {
    window.fetch = () => Promise.resolve(new Response('boom', { status: 500 }));
    const result = await loadDoc({ fullpath: '/org/repo/page.html' });
    expect(result.error).to.contain('500');
    expect(result.doc).to.equal(undefined);
  });
});
