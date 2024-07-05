/*
    eslint-disable no-underscore-dangle
*/
import { expect } from '@esm-bundle/chai';

// This is needed to make a dynamic import work that is indirectly referenced
// from edit/prose/index.js
const { setNx } = await import('../../../../../scripts/utils.js');
setNx('/bheuaark/', { hostname: 'localhost' });

const { default: DaBrowse } = await import('../../../../../blocks/browse/da-browse/da-browse.js');

describe('Browse', () => {
  it('Pasted item uses the target URL', async () => {
    const daBrowse = new DaBrowse();

    const fetchedArgs = [];
    const mockFetch = async (url, opts) => {
      fetchedArgs.push({ url, opts });
      return { ok: true };
    };

    const item = {
      path: '/myorg/mysite/myroot/srcdir/d1.html',
      ext: 'html',
      isChecked: true,
      name: 'd1',
    };
    daBrowse._listItems = [];
    daBrowse._selectedItems = [item];
    daBrowse.details = { fullpath: '/myorg/mysite/myroot/destdir' };

    const orgFetch = window.fetch;
    try {
      window.fetch = mockFetch;
      await daBrowse.handlePaste();

      expect(daBrowse._listItems.length).to.equal(1);
      expect(daBrowse._listItems[0].path).to.equal('/myorg/mysite/myroot/destdir/d1.html');
      expect(daBrowse._listItems[0].ext).to.equal('html');
      expect(daBrowse._listItems[0].isChecked).to.be.false;
      expect(daBrowse._listItems[0].name).to.equal('d1');
      expect(daBrowse._canPaste).to.be.false;

      expect(fetchedArgs.length).to.equal(1);
      expect(fetchedArgs[0].url).to.equal('https://admin.da.live/copy/myorg/mysite/myroot/srcdir/d1.html');
      expect(fetchedArgs[0].opts.body.get('destination')).to.equal('/myorg/mysite/myroot/destdir/d1.html');
      expect(fetchedArgs[0].opts.method).to.equal('POST');
    } finally {
      window.fetch = orgFetch;
    }
  });
});
