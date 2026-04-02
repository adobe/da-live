/*
    eslint-disable no-underscore-dangle
*/
import { expect } from '@esm-bundle/chai';

// This is needed to make a dynamic import work that is indirectly referenced
// from da-browse.js
const { setNx } = await import('../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: DaBrowse } = await import('../../../../../blocks/browse/da-list/da-list.js');
const { default: DaBrowseComponent } = await import('../../../../../blocks/browse/da-browse/da-browse.js');

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

  it('loadMore keeps list reference when page adds no unique paths', async () => {
    const daBrowse = new DaBrowse();
    const initialItems = [{ path: '/already-there', name: 'already-there' }];

    const mockFetch = async () => ({
      ok: true,
      json: async () => ([{ path: '/already-there', name: 'already-there' }]),
      headers: {
        get: (name) => {
          if (name === 'da-continuation-token') return 'token-1';
          return null;
        },
      },
    });

    daBrowse.fullpath = '/myorg/mysite/myroot/destdir';
    daBrowse._listItems = initialItems;
    daBrowse._continuationToken = 'token-1';
    daBrowse.scheduleAutoCheck = () => {};

    const orgFetch = window.fetch;
    try {
      window.fetch = mockFetch;
      await daBrowse.loadMore();
      expect(daBrowse._listItems).to.equal(initialItems);
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('scheduleAutoCheck does not schedule without an active continuation token', () => {
    const daBrowse = new DaBrowse();
    daBrowse._continuationToken = null;
    daBrowse._allPagesLoaded = false;
    daBrowse._bulkLoading = false;

    daBrowse.scheduleAutoCheck();

    expect(daBrowse._autoCheckTimer).to.equal(null);
  });

  it('loadAllPages exits when pagination stalls with the same token', async () => {
    const daBrowse = new DaBrowse();
    let calls = 0;

    daBrowse._continuationToken = 'token-1';
    daBrowse._allPagesLoaded = false;
    daBrowse.loadMore = async () => {
      calls += 1;
      return { added: 0, token: 'token-1' };
    };

    await daBrowse.loadAllPages();

    expect(calls).to.equal(2);
  });

  it('hasPaginationStateChanges ignores unrelated property changes', () => {
    const daBrowse = new DaBrowse();
    daBrowse._listItems = [{ path: '/a', name: 'a' }];
    const changedProps = new Map([['_showFilter', false]]);

    expect(daBrowse.hasPaginationStateChanges(changedProps)).to.be.false;
  });

  it('hasPaginationStateChanges tracks list length changes', () => {
    const daBrowse = new DaBrowse();
    daBrowse._listItems = [{ path: '/a', name: 'a' }, { path: '/b', name: 'b' }];
    const changedProps = new Map([['_listItems', [{ path: '/a', name: 'a' }]]]);

    expect(daBrowse.hasPaginationStateChanges(changedProps)).to.be.true;
  });

  describe('handleItemAction move-to-trash error handling', () => {
    it('throws on non-OK non-204 response instead of calling resp.json()', async () => {
      const daBrowse = new DaBrowse();
      daBrowse._listItems = [{ path: '/myorg/mysite/file.html', name: 'file', ext: 'html' }];
      daBrowse._listItemPaths = new Set(['/myorg/mysite/file.html']);
      daBrowse._itemErrors = [];

      const item = {
        path: '/myorg/mysite/file.html',
        destination: '/myorg/mysite/.trash/file.html',
        ext: 'html',
        name: 'file',
        isChecked: true,
      };

      const mockFetch = async () => ({
        ok: false,
        status: 500,
        json: async () => { throw new Error('json should not be called'); },
        headers: { get: () => null },
      });

      const orgFetch = window.fetch;
      try {
        window.fetch = mockFetch;
        await daBrowse.handleItemAction({ item, type: 'move' });

        expect(daBrowse._itemErrors.length).to.equal(1);
        expect(daBrowse._itemErrors[0].message).to.equal("Couldn't move item");
      } finally {
        window.fetch = orgFetch;
      }
    });

    it('does not fall back to delete on non-403 errors for move-to-trash', async () => {
      const daBrowse = new DaBrowse();
      daBrowse._listItems = [{ path: '/myorg/mysite/file.html', name: 'file', ext: 'html' }];
      daBrowse._listItemPaths = new Set(['/myorg/mysite/file.html']);
      daBrowse._itemErrors = [];

      const item = {
        path: '/myorg/mysite/file.html',
        destination: '/myorg/mysite/.trash/file.html',
        ext: 'html',
        name: 'file',
        isChecked: true,
      };

      let deleteCalled = false;
      const origHandleItemAction = daBrowse.handleItemAction.bind(daBrowse);
      daBrowse.handleItemAction = async (opts) => {
        if (opts.type === 'delete') {
          deleteCalled = true;
        } else {
          await origHandleItemAction(opts);
        }
      };

      const mockFetch = async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
        headers: { get: () => null },
      });

      const orgFetch = window.fetch;
      try {
        window.fetch = mockFetch;
        await daBrowse.handleItemAction({ item, type: 'move' });

        expect(deleteCalled).to.be.false;
        expect(daBrowse._itemErrors.length).to.equal(1);
        expect(daBrowse._itemErrors[0].message).to.equal("Couldn't move item");
      } finally {
        window.fetch = orgFetch;
      }
    });

    it('falls back to delete only on 403 for move-to-trash', async () => {
      const daBrowse = new DaBrowse();
      daBrowse._listItems = [{ path: '/myorg/mysite/file.html', name: 'file', ext: 'html' }];
      daBrowse._listItemPaths = new Set(['/myorg/mysite/file.html']);
      daBrowse._itemErrors = [];

      const item = {
        path: '/myorg/mysite/file.html',
        destination: '/myorg/mysite/.trash/file.html',
        ext: 'html',
        name: 'file',
        isChecked: true,
      };

      let deleteCalledWith = null;
      const origHandleItemAction = daBrowse.handleItemAction.bind(daBrowse);
      daBrowse.handleItemAction = async (opts) => {
        if (opts.type === 'delete') {
          deleteCalledWith = opts;
        } else {
          await origHandleItemAction(opts);
        }
      };

      const mockFetch = async () => ({
        ok: false,
        status: 403,
        json: async () => ({}),
        headers: { get: () => null },
      });

      const orgFetch = window.fetch;
      try {
        window.fetch = mockFetch;
        await daBrowse.handleItemAction({ item, type: 'move' });

        expect(deleteCalledWith).to.not.be.null;
        expect(deleteCalledWith.item.path).to.equal('/myorg/mysite/file.html');
        expect(deleteCalledWith.type).to.equal('delete');
        expect(daBrowse._itemErrors.length).to.equal(0);
      } finally {
        window.fetch = orgFetch;
      }
    });
  });
});

describe('DaBrowse Component', () => {
  let daBrowseComp;

  beforeEach(() => {
    daBrowseComp = new DaBrowseComponent();
    daBrowseComp.details = { fullpath: '/myorg/mysite/folder', owner: 'myorg', depth: 3 };
  });

  describe('isRootFolder', () => {
    it('returns true for root path (org only)', () => {
      expect(daBrowseComp.isRootFolder('/myorg')).to.be.true;
    });

    it('returns false for org/site path (length = 3)', () => {
      // '/myorg/mysite' splits into ['', 'myorg', 'mysite'] which has length 3
      expect(daBrowseComp.isRootFolder('/myorg/mysite')).to.be.false;
    });

    it('returns false for paths deeper than org/site', () => {
      expect(daBrowseComp.isRootFolder('/myorg/mysite/folder')).to.be.false;
      expect(daBrowseComp.isRootFolder('/myorg/mysite/folder/subfolder')).to.be.false;
    });

    it('returns true for empty path', () => {
      expect(daBrowseComp.isRootFolder('')).to.be.true;
    });

    it('returns true for single slash', () => {
      expect(daBrowseComp.isRootFolder('/')).to.be.true;
    });
  });

  describe('browseListItems getter', () => {
    beforeEach(async () => {
      // Properly initialize the component by adding to DOM
      document.body.innerHTML = '<div id="container"></div>';
      const container = document.getElementById('container');
      container.appendChild(daBrowseComp);
      await daBrowseComp.updateComplete;
    });

    afterEach(() => {
      document.body.innerHTML = '';
    });

    it('returns empty array when browse list is not present', () => {
      expect(daBrowseComp.browseListItems).to.deep.equal([]);
    });

    it('returns empty array when browse list has no _listItems', () => {
      expect(daBrowseComp.browseListItems).to.deep.equal([]);
    });
  });
});
