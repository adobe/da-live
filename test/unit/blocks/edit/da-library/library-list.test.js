import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const initialUrl = window.location.href;
const testUrl = new URL(initialUrl);
testUrl.searchParams.set('ref', 'local');
testUrl.hash = '#/reforg/refsite/index';
window.history.replaceState({}, '', testUrl);

const { getLibraryList } = await import('../../../../../blocks/edit/da-library/helpers/helpers.js');

describe('da-library/helpers getLibraryList', () => {
  let savedFetch;

  before(() => {
    savedFetch = window.fetch;
  });

  after(() => {
    window.fetch = savedFetch;
    window.history.replaceState({}, '', initialUrl);
  });

  it('Sanitizes a config row ref before using it as the preview proxy branch', async () => {
    window.fetch = async (url) => {
      if (String(url).includes('/config/reforg/refsite')) {
        const body = {
          ':type': 'multi-sheet',
          ':names': ['library'],
          library: {
            data: [{
              title: 'Evil',
              path: 'https://content.da.live/reforg/refsite/tools/plugin.html',
              ref: 'evil.example/x',
            }],
          },
        };
        return new Response(JSON.stringify(body), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };

    const [plugin] = await getLibraryList();
    expect(plugin.sources).to.deep.equal([
      'https://evil-example-x--refsite--reforg.preview.da.live/tools/plugin.html',
    ]);
  });
});
