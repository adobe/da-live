import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../../../scripts/utils.js';

let savedFetch;
let runOotbProvider;

before(async () => {
  savedFetch = window.fetch;
  window.fetch = async () => new Response('{}', { status: 200 });
  setNx('/test/fixtures/nx', { hostname: 'example.com' });

  const mod = await import(
    '../../../../../../../../blocks/edit/da-prepare/actions/preflight/providers/ootb.js'
  );
  runOotbProvider = mod.default;
});

after(() => {
  window.fetch = savedFetch;
});

describe('runOotbProvider', () => {
  it('returns null when loadDoc fails', async () => {
    const prevFetch = window.fetch;
    window.fetch = async (url) => {
      if (url.includes('/source/')) return new Response('', { status: 404 });
      return prevFetch(url);
    };

    const details = { fullpath: '/org/site/missing' };
    const result = await runOotbProvider(details, { requestUpdate: () => {} });
    expect(result).to.equal(null);

    window.fetch = prevFetch;
  });

  it('returns a flat list of checks tagged with their category', async () => {
    const details = { fullpath: '/org/site/page', org: 'org', site: 'site' };
    const result = await runOotbProvider(details, { requestUpdate: () => {} });
    expect(result.map((check) => check.category)).to.deep.equal([
      'References', 'References', 'Content', 'Content', 'SEO', 'SEO',
    ]);
    expect(result.map((check) => check.title)).to.deep.equal([
      'Links', 'Fragments', 'H1 count', 'Lorem ipsum', 'Title', 'Description',
    ]);
  });
});
