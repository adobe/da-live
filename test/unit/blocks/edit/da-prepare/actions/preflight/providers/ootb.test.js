import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../../../scripts/utils.js';

let savedFetch;
let ootbProvider;

before(async () => {
  savedFetch = window.fetch;
  window.fetch = async () => new Response('{}', { status: 200 });
  setNx('/test/fixtures/nx', { hostname: 'example.com' });

  const mod = await import(
    '../../../../../../../../blocks/edit/da-prepare/actions/preflight/providers/ootb/ootb-checks.js'
  );
  ootbProvider = mod.default;
});

after(() => {
  window.fetch = savedFetch;
});

describe('ootbProvider', () => {
  it('rejects when loadDoc fails', async () => {
    const prevFetch = window.fetch;
    window.fetch = async (url) => {
      if (url.includes('/source/')) return new Response('', { status: 404 });
      return prevFetch(url);
    };

    const details = { fullpath: '/org/site/missing' };
    let error;
    try {
      await ootbProvider.getResults({ details, onUpdate: () => {} });
    } catch (e) {
      error = e;
    }
    expect(error).to.be.an('error');
    expect(error.message).to.include('404');

    window.fetch = prevFetch;
  });

  it('returns categories with the expected check titles', async () => {
    const details = { fullpath: '/org/site/page', org: 'org', site: 'site' };
    const result = await ootbProvider.getResults({ details, onUpdate: () => {} });
    expect(result.map((category) => category.title)).to.deep.equal([
      'References', 'Content', 'SEO',
    ]);
    expect(result.flatMap((category) => category.checks.map((check) => check.title)))
      .to.deep.equal([
        'Links', 'Fragments', 'H1 count', 'Lorem ipsum', 'Title', 'Description',
      ]);
  });
});
