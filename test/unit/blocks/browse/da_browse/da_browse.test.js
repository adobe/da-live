/*
    eslint-disable no-underscore-dangle
*/
import { expect } from '@esm-bundle/chai';
import { html } from 'da-lit';

// This is needed to make a dynamic import work that is indirectly referenced
// from da-browse.js
const { setNx } = await import('../../../../../scripts/utils.js');
setNx('/bheuaark/', { hostname: 'localhost' });

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
