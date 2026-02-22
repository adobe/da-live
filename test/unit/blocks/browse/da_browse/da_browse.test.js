/*
    eslint-disable no-underscore-dangle
*/
import { expect } from '@esm-bundle/chai';

// This is needed to make a dynamic import work that is indirectly referenced
// from da-browse.js
const { setNx } = await import('../../../../../scripts/utils.js');
setNx('/bheuaark/', { hostname: 'localhost' });

const { default: DaBrowse } = await import('../../../../../blocks/browse/da-list/da-list.js');

describe('Browse', () => {
  it('Pasted item uses the target URL', async () => {
    const daBrowse = new DaBrowse();

    const fetchedArgs = [];
    const mockFetch = async (url, opts) => {
      fetchedArgs.push({ url, opts });
      return {
        ok: true,
        json: async () => ({}),
        headers: {
          get: () => {

          },
        },
      };
    };

    const item = {
      path: '/myorg/mysite/myroot/srcdir/d1.html',
      ext: 'html',
      isChecked: true,
      name: 'd1',
    };
    daBrowse._listItems = [];
    daBrowse._selectedItems = [item];
    daBrowse.fullpath = '/myorg/mysite/myroot/destdir';

    const orgFetch = window.fetch;
    try {
      window.fetch = mockFetch;
      await daBrowse.handlePaste({});

      expect(daBrowse._listItems.length).to.equal(1);
      expect(daBrowse._listItems[0].path).to.equal('/myorg/mysite/myroot/destdir/d1.html');
      expect(daBrowse._listItems[0].ext).to.equal('html');
      expect(daBrowse._listItems[0].isChecked).to.be.false;
      expect(daBrowse._listItems[0].name).to.equal('d1');

      expect(fetchedArgs.length).to.equal(1);
      expect(fetchedArgs[0].url).to.equal('https://admin.da.live/copy/myorg/mysite/myroot/srcdir/d1.html');
      expect(fetchedArgs[0].opts.body.get('destination')).to.equal('/myorg/mysite/myroot/destdir/d1.html');
      expect(fetchedArgs[0].opts.method).to.equal('POST');
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('Load more uses da-continuation-token request header', async () => {
    const daBrowse = new DaBrowse();

    const fetchedArgs = [];
    const mockFetch = async (url, opts) => {
      fetchedArgs.push({ url, opts });
      return {
        ok: true,
        json: async () => ([]),
        headers: {
          get: (name) => {
            if (name === 'da-continuation-token') return 'token-next';
            return null;
          },
        },
      };
    };

    daBrowse.fullpath = '/myorg/mysite/myroot/destdir';
    daBrowse._listItems = [];
    daBrowse._continuationToken = 'token-1';
    daBrowse.scheduleAutoCheck = () => {};

    const orgFetch = window.fetch;
    try {
      window.fetch = mockFetch;
      await daBrowse.loadMore();

      expect(fetchedArgs.length).to.equal(1);
      expect(fetchedArgs[0].url).to.equal('https://admin.da.live/list/myorg/mysite/myroot/destdir');
      expect(fetchedArgs[0].opts.headers['da-continuation-token']).to.equal('token-1');
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('Does not mark pagination exhausted while token is still present', async () => {
    const daBrowse = new DaBrowse();
    const fetchedArgs = [];
    const mockFetch = async (url, opts) => {
      fetchedArgs.push({ url, opts });
      return {
        ok: true,
        json: async () => ([{ path: '/already-there', name: 'already-there' }]),
        headers: {
          get: (name) => {
            if (name === 'da-continuation-token') return 'token-1';
            return null;
          },
        },
      };
    };

    daBrowse.fullpath = '/myorg/mysite/myroot/destdir';
    daBrowse._listItems = [{ path: '/already-there', name: 'already-there' }];
    daBrowse._continuationToken = 'token-1';
    daBrowse.scheduleAutoCheck = () => {};

    const orgFetch = window.fetch;
    try {
      window.fetch = mockFetch;
      await daBrowse.loadMore();
      expect(daBrowse._allPagesLoaded).to.be.false;
      expect(daBrowse._continuationToken).to.equal('token-1');

      await daBrowse.loadMore();
      expect(fetchedArgs.length).to.equal(2);
      expect(daBrowse._allPagesLoaded).to.be.false;
      expect(daBrowse._continuationToken).to.equal('token-1');
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('Merges paged items with unique paths only', () => {
    const daBrowse = new DaBrowse();

    const merged = daBrowse.mergeUniqueItemsByPath(
      [{ path: '/a', name: 'a' }, { path: '/b', name: 'b' }],
      [{ path: '/b', name: 'b-dup' }, { path: '/c', name: 'c' }],
    );

    expect(merged.map((item) => item.path)).to.deep.equal(['/a', '/b', '/c']);
  });
});
