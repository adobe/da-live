/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: DaList } = await import('../../../../../blocks/browse/da-list/da-list.js');

function makeList() {
  const el = new DaList();
  el.dispatchEvent = () => {};
  return el;
}

describe('DaList helpers', () => {
  describe('mergeUniqueItemsByPath', () => {
    it('Returns existing items when nothing is incoming', () => {
      const el = makeList();
      const result = el.mergeUniqueItemsByPath([{ path: '/a' }], []);
      expect(result).to.deep.equal([{ path: '/a' }]);
    });

    it('Filters duplicates that share a path', () => {
      const el = makeList();
      const result = el.mergeUniqueItemsByPath(
        [{ path: '/a' }],
        [{ path: '/a' }, { path: '/b' }],
      );
      expect(result.map((i) => i.path)).to.deep.equal(['/a', '/b']);
    });

    it('Skips items without a path', () => {
      const el = makeList();
      const result = el.mergeUniqueItemsByPath([], [null, { path: '' }, { path: '/x' }]);
      expect(result).to.deep.equal([{ path: '/x' }]);
    });

    it('Updates the provided pathIndex set', () => {
      const el = makeList();
      const seen = new Set();
      el.mergeUniqueItemsByPath([], [{ path: '/x' }], seen);
      expect(seen.has('/x')).to.be.true;
    });
  });

  describe('resetListItemPaths', () => {
    it('Rebuilds the path Set from the list', () => {
      const el = makeList();
      el.resetListItemPaths([{ path: '/a' }, { path: '/b' }, null]);
      expect([...el._listItemPaths]).to.deep.equal(['/a', '/b']);
    });

    it('Defaults to an empty list', () => {
      const el = makeList();
      el.resetListItemPaths();
      expect([...el._listItemPaths]).to.deep.equal([]);
    });
  });

  describe('setStatus', () => {
    it('Sets a status object with type/text/description', () => {
      const el = makeList();
      el.setStatus('Hi', 'desc', 'success');
      expect(el._status).to.deep.equal({ type: 'success', text: 'Hi', description: 'desc' });
    });

    it('Clears the status when text is omitted', () => {
      const el = makeList();
      el._status = { type: 'info', text: 'x', description: '' };
      el.setStatus();
      expect(el._status).to.equal(null);
    });
  });

  describe('handlePermissions', () => {
    it('Tracks permissions and dispatches onpermissions', () => {
      const el = makeList();
      let received;
      el.dispatchEvent = (e) => { received = e; };
      el.handlePermissions(['read', 'write']);
      expect(el._permissions).to.deep.equal(['read', 'write']);
      expect(received.type).to.equal('onpermissions');
      expect(received.detail).to.deep.equal(['read', 'write']);
    });

    it('Dispatches the same detail array passed in', () => {
      const el = makeList();
      const perms = ['read'];
      let received;
      el.dispatchEvent = (e) => { received = e.detail; };
      el.handlePermissions(perms);
      expect(received).to.equal(perms);
    });
  });

  describe('handleClear', () => {
    it('Resets selection and toggles state', () => {
      const el = makeList();
      el._selectedItems = [{}];
      el._listItems = [{ isChecked: true }, { isChecked: false }];
      el.handleClear();
      expect(el._selectedItems).to.deep.equal([]);
      expect(el._listItems[0].isChecked).to.be.false;
    });
  });

  describe('handleErrorClose / handleConfirmClose', () => {
    it('handleErrorClose clears _itemErrors', () => {
      const el = makeList();
      el._itemErrors = [{}, {}];
      el.handleErrorClose();
      expect(el._itemErrors).to.deep.equal([]);
    });

    it('handleConfirmClose clears _confirm/_confirmText/_unpublish', () => {
      const el = makeList();
      el._confirm = { open: true };
      el._confirmText = 'YES';
      el._unpublish = true;
      el.handleConfirmClose();
      expect(el._confirm).to.equal(null);
      expect(el._confirmText).to.equal(null);
      expect(el._unpublish).to.equal(null);
    });
  });

  describe('wait', () => {
    it('Returns a promise that resolves after the given milliseconds', async () => {
      const el = makeList();
      const start = Date.now();
      await el.wait(20);
      const elapsed = Date.now() - start;
      expect(elapsed).to.be.at.least(15);
    });
  });

  describe('getSortFn', () => {
    it('Builds an ascending sort comparator on a string property', () => {
      const el = makeList();
      const fn = el.getSortFn(1, -1, 'name');
      const items = [{ name: 'b' }, { name: 'a' }, { name: 'c' }];
      items.sort(fn);
      expect(items.map((i) => i.name)).to.deep.equal(['a', 'b', 'c']);
    });

    it('Builds a descending sort comparator', () => {
      const el = makeList();
      const fn = el.getSortFn(-1, 1, 'name');
      const items = [{ name: 'b' }, { name: 'a' }, { name: 'c' }];
      items.sort(fn);
      expect(items.map((i) => i.name)).to.deep.equal(['c', 'b', 'a']);
    });

    it('Defaults missing lastModified values to "" so they sort consistently', () => {
      const el = makeList();
      const fn = el.getSortFn(1, -1, 'lastModified');
      const items = [{}, { lastModified: 'a' }];
      items.sort(fn);
      // Both items now have a lastModified property; "" < "a" so empty comes first.
      expect(items[0].lastModified).to.equal('');
      expect(items[1].lastModified).to.equal('a');
    });
  });

  describe('handleSort', () => {
    it('type "new" sorts ascending (a → z)', () => {
      const el = makeList();
      el._listItems = [{ name: 'b' }, { name: 'a' }];
      el.handleSort('new', 'name');
      // type !== 'old' → first=1, last=-1 → ascending
      expect(el._listItems.map((i) => i.name)).to.deep.equal(['a', 'b']);
    });

    it('type "old" sorts descending (z → a)', () => {
      const el = makeList();
      el._listItems = [{ name: 'a' }, { name: 'b' }];
      el.handleSort('old', 'name');
      // type === 'old' → first=-1, last=1 → descending
      expect(el._listItems.map((i) => i.name)).to.deep.equal(['b', 'a']);
    });
  });

  describe('isSelectAll getter', () => {
    it('Is true when every list item is selected', () => {
      const el = makeList();
      el._listItems = [{ isChecked: true }, { isChecked: true }];
      expect(el.isSelectAll).to.be.true;
    });

    it('Is false when some items are unchecked', () => {
      const el = makeList();
      el._listItems = [{ isChecked: false }, { isChecked: true }];
      expect(el.isSelectAll).to.be.false;
    });

    it('Is false when there are no items', () => {
      const el = makeList();
      el._listItems = [];
      expect(el.isSelectAll).to.be.false;
    });
  });

  describe('_itemString getter', () => {
    it('Pluralizes for >1 selected item', () => {
      const el = makeList();
      el._selectedItems = [{}, {}];
      expect(el._itemString).to.equal('items');
    });

    it('Singular for 1 selected item', () => {
      const el = makeList();
      el._selectedItems = [{}];
      expect(el._itemString).to.equal('item');
    });
  });

  describe('hasPaginationStateChanges', () => {
    it('Returns true when _isLoadingMore changed', () => {
      const el = makeList();
      const props = new Map([['_isLoadingMore', false]]);
      expect(el.hasPaginationStateChanges(props)).to.be.true;
    });

    it('Returns false for unrelated property changes', () => {
      const el = makeList();
      const props = new Map([['_showFilter', false]]);
      expect(el.hasPaginationStateChanges(props)).to.be.false;
    });

    it('Returns true when _listItems changed length', () => {
      const el = makeList();
      el._listItems = [{}, {}, {}];
      const props = new Map([['_listItems', [{}, {}]]]);
      expect(el.hasPaginationStateChanges(props)).to.be.true;
    });
  });

  describe('handleNameFilter', () => {
    it('Sets _filter and clears sort state', () => {
      const el = makeList();
      el._sortName = 'old';
      el._sortDate = 'new';
      el.handleNameFilter({ target: { value: 'HELLO' } });
      expect(el._filter).to.equal('HELLO');
      expect(el._sortName).to.equal(undefined);
      expect(el._sortDate).to.equal(undefined);
    });
  });

  describe('handleFilterBlur', () => {
    it('Hides the filter view when blurred with empty input', () => {
      const el = makeList();
      el._showFilter = true;
      el.handleFilterBlur({ target: { value: '' } });
      expect(el._showFilter).to.be.false;
    });

    it('Leaves filter view open when input has content', () => {
      const el = makeList();
      el._showFilter = true;
      el.handleFilterBlur({ target: { value: 'foo' } });
      expect(el._showFilter).to.be.true;
    });
  });

  describe('handleNewItem', () => {
    it('Pushes a newItem entry into _listItems and clears it', () => {
      const el = makeList();
      el._listItems = [];
      el._listItemPaths = new Set();
      el.newItem = { name: 'new', path: '/n', ext: 'html' };
      el.handleNewItem();
      expect(el._listItems[0]).to.deep.include({ name: 'new', path: '/n' });
      expect(el.newItem).to.equal(null);
      expect([...el._listItemPaths]).to.deep.equal(['/n']);
    });

    it('Does not add to path set when item has no path', () => {
      const el = makeList();
      el._listItems = [];
      el._listItemPaths = new Set();
      el.newItem = { name: 'orphan' };
      el.handleNewItem();
      expect(el._listItemPaths.size).to.equal(0);
    });
  });

  describe('handleRenameCompleted', () => {
    it('Updates the matching item and refreshes the path set', () => {
      const el = makeList();
      el._listItems = [{ path: '/a' }, { path: '/b' }];
      el._listItemPaths = new Set(['/a', '/b']);
      el.handleRenameCompleted({ detail: { oldPath: '/a', path: '/c', name: 'c', date: 1 } });
      expect(el._listItems[0]).to.deep.include({ path: '/c', name: 'c', lastModified: 1 });
      expect(el._listItemPaths.has('/c')).to.be.true;
      expect(el._listItemPaths.has('/a')).to.be.false;
    });

    it('Returns early when the old path is not in the list', () => {
      const el = makeList();
      el._listItems = [{ path: '/a' }];
      el._listItemPaths = new Set(['/a']);
      el.handleRenameCompleted({ detail: { oldPath: '/missing', path: '/x' } });
      expect(el._listItems[0]).to.deep.equal({ path: '/a' });
    });
  });

  describe('setDropMessage', () => {
    it('Reports the count of in-progress imports', () => {
      const el = makeList();
      el._dropFiles = [{ imported: false }, { imported: false }, { imported: true }];
      el.setDropMessage();
      expect(el._dropMessage).to.equal('Importing - 2  items');
    });

    it('Reports the empty drop message when no files are pending', () => {
      const el = makeList();
      el._dropFiles = [{ imported: true }];
      el.setDropMessage();
      expect(el._dropMessage).to.equal('Drop content here');
    });
  });

  describe('dragover', () => {
    it('preventDefaults the event', () => {
      const el = makeList();
      let prevented = false;
      el.dragover({ preventDefault: () => { prevented = true; } });
      expect(prevented).to.be.true;
    });
  });

  describe('handleItemChecked', () => {
    it('Toggles a single item check state and tracks the last checked index', () => {
      const el = makeList();
      el._listItems = [{ isChecked: false }, { isChecked: false }];
      el.handleSelectionState = () => {};
      const item = el._listItems[0];
      el.handleItemChecked({ detail: { checked: true, shiftKey: false } }, item, 0);
      expect(item.isChecked).to.be.true;
      expect(el._lastCheckedIndex).to.equal(0);
    });

    it('Range-checks items when shift-clicking', () => {
      const el = makeList();
      el._listItems = [
        { isChecked: false }, { isChecked: false }, { isChecked: false }, { isChecked: false },
      ];
      el.handleSelectionState = () => {};
      el._lastCheckedIndex = 0;
      el.handleItemChecked({ detail: { checked: true, shiftKey: true } }, el._listItems[2], 2);
      expect(el._listItems.slice(0, 3).every((i) => i.isChecked)).to.be.true;
      expect(el._listItems[3].isChecked).to.be.false;
    });

    it('Resets last checked index when unchecking without shift', () => {
      const el = makeList();
      el._listItems = [{ isChecked: true }];
      el.handleSelectionState = () => {};
      el._lastCheckedIndex = 0;
      el.handleItemChecked({ detail: { checked: false, shiftKey: false } }, el._listItems[0], 0);
      expect(el._lastCheckedIndex).to.equal(null);
      expect(el._listItems[0].rename).to.be.false;
    });
  });

  describe('handleRename', () => {
    it('Marks the checked item for rename', () => {
      const el = makeList();
      el._listItems = [{ isChecked: false }, { isChecked: true }];
      el.handleRename();
      expect(el._listItems[1].rename).to.be.true;
    });
  });

  describe('getList', () => {
    let savedFetch;
    beforeEach(() => { savedFetch = window.fetch; });
    afterEach(() => { window.fetch = savedFetch; });

    it('Returns items array from the response', async () => {
      window.fetch = () => Promise.resolve(new Response(
        JSON.stringify([{ path: '/a' }, { path: '/b' }]),
        { status: 200 },
      ));
      const el = makeList();
      el.fullpath = '/org/repo';
      const items = await el.getList();
      expect(items).to.deep.equal([{ path: '/a' }, { path: '/b' }]);
      expect([...el._listItemPaths]).to.deep.equal(['/a', '/b']);
      expect(el._allPagesLoaded).to.be.true;
    });

    it('Tracks continuation token from response headers', async () => {
      window.fetch = () => Promise.resolve(new Response(
        JSON.stringify([{ path: '/a' }]),
        { status: 200, headers: { 'da-continuation-token': 'tok-1' } },
      ));
      const el = makeList();
      el.fullpath = '/org/repo';
      await el.getList();
      expect(el._continuationToken).to.equal('tok-1');
      expect(el._allPagesLoaded).to.be.false;
    });

    it('Returns [] and sets emptyMessage on fetch failure', async () => {
      window.fetch = () => Promise.reject(new Error('boom'));
      const el = makeList();
      el.fullpath = '/org/repo';
      const items = await el.getList();
      expect(items).to.deep.equal([]);
      expect(el._emptyMessage).to.equal('Not permitted');
    });

    it('Reads items from a structured json.items response', async () => {
      window.fetch = () => Promise.resolve(new Response(
        JSON.stringify({ items: [{ path: '/a' }], continuationToken: 'next' }),
        { status: 200 },
      ));
      const el = makeList();
      el.fullpath = '/org/repo';
      const items = await el.getList();
      expect(items).to.have.length(1);
      expect(el._continuationToken).to.equal('next');
    });
  });

  describe('loadMore', () => {
    let savedFetch;
    beforeEach(() => { savedFetch = window.fetch; });
    afterEach(() => { window.fetch = savedFetch; });

    it('Returns 0 added when already loading', async () => {
      const el = makeList();
      el._isLoadingMore = true;
      const result = await el.loadMore();
      expect(result.added).to.equal(0);
    });

    it('Returns 0 added when no continuation token', async () => {
      const el = makeList();
      el._continuationToken = null;
      const result = await el.loadMore();
      expect(result.added).to.equal(0);
    });

    it('Returns 0 added when all pages already loaded', async () => {
      const el = makeList();
      el._continuationToken = 'tok';
      el._allPagesLoaded = true;
      const result = await el.loadMore();
      expect(result.added).to.equal(0);
    });

    it('Reads next page and merges unique items', async () => {
      const el = makeList();
      el.fullpath = '/o/r';
      el._listItems = [{ path: '/a' }];
      el._continuationToken = 'tok';
      el._allPagesLoaded = false;
      el._listItemPaths = new Set(['/a']);
      window.fetch = () => Promise.resolve(new Response(
        JSON.stringify([{ path: '/b' }, { path: '/a' }]),
        { status: 200, headers: { 'da-continuation-token': 'tok-2' } },
      ));
      const result = await el.loadMore();
      expect(result.added).to.equal(1);
      expect(el._listItems.map((i) => i.path)).to.deep.equal(['/a', '/b']);
      expect(el._continuationToken).to.equal('tok-2');
    });

    it('Marks all pages loaded when no further token', async () => {
      const el = makeList();
      el.fullpath = '/o/r';
      el._continuationToken = 'tok';
      el._allPagesLoaded = false;
      el._listItems = [];
      el._listItemPaths = new Set();
      window.fetch = () => Promise.resolve(new Response(
        JSON.stringify({ items: [{ path: '/x' }] }),
        { status: 200 },
      ));
      await el.loadMore();
      expect(el._allPagesLoaded).to.be.true;
    });

    it('Quietly returns on fetch error', async () => {
      const el = makeList();
      el.fullpath = '/o/r';
      el._continuationToken = 'tok';
      window.fetch = () => Promise.reject(new Error('boom'));
      const result = await el.loadMore();
      expect(result.added).to.equal(0);
      expect(el._isLoadingMore).to.be.false;
    });
  });

  describe('handleDelete', () => {
    it('Sets _confirm to "delete"', () => {
      const el = makeList();
      el.handleDelete();
      expect(el._confirm).to.equal('delete');
    });
  });

  describe('handleShare', () => {
    it('Sets a copied status and clears it after 3s', async () => {
      const el = makeList();
      el.handleShare();
      expect(el._status.text).to.equal('Copied');
      // We don't wait the full 3s, but verify the function ran without error.
    });
  });

  describe('handleConfirmDelete', () => {
    let savedFetch;
    beforeEach(() => { savedFetch = window.fetch; });
    afterEach(() => { window.fetch = savedFetch; });

    it('Falls through with no items selected (queue resolves immediately)', async () => {
      const el = makeList();
      el._selectedItems = [];
      el._unpublish = false;
      el._itemErrors = [];
      // We need a queue from nx; the fixture mock returns a class.
      window.fetch = () => Promise.resolve(new Response('{}', { status: 200 }));
      // handleConfirmDelete uses queue.push but with empty list nothing happens.
      await el.handleConfirmDelete();
      expect(el._itemsRemaining).to.equal(0);
    });
  });

  describe('drop flow', () => {
    let panel;
    function attachShadow(el) {
      panel = document.createElement('div');
      panel.className = 'da-browse-panel';
      Object.defineProperty(el, 'shadowRoot', {
        configurable: true,
        value: { querySelector: (sel) => (sel.includes('da-browse-panel') ? panel : null) },
      });
    }

    it('drop bails when dataTransfer.items is missing', async () => {
      const el = makeList();
      attachShadow(el);
      panel.classList.add('is-dragged-over');
      await el.drop({ preventDefault: () => {}, dataTransfer: {} });
      expect(panel.classList.contains('is-dragged-over')).to.be.false;
    });

    it('drop bails when no entries can be extracted', async () => {
      const el = makeList();
      attachShadow(el);
      panel.classList.add('is-dragged-over');
      const items = [{ webkitGetAsEntry: () => null }];
      await el.drop({ preventDefault: () => {}, dataTransfer: { items } });
      expect(panel.classList.contains('is-dragged-over')).to.be.false;
    });

    it('drop with valid entries triggers processDropFiles', async () => {
      const el = makeList();
      attachShadow(el);
      el.fullpath = '/o/r';
      el._listItems = [];
      el._listItemPaths = new Set();
      const goodEntry = {
        isDirectory: false,
        fullPath: '/foo.html',
        file: (cb) => cb(new File(['x'], 'foo.html', { type: 'text/html' })),
      };
      const items = [{ webkitGetAsEntry: () => goodEntry }];
      const savedFetch = window.fetch;
      window.fetch = () => Promise.resolve(new Response('', { status: 200 }));
      try {
        await el.drop({ preventDefault: () => {}, dataTransfer: { items } });
      } finally {
        window.fetch = savedFetch;
      }
      expect(el._dropFiles).to.deep.equal([]);
    });

    it('drop with conflicts captures _dropConflicts and skips upload', async () => {
      const el = makeList();
      attachShadow(el);
      el.fullpath = '/o/r';
      el._listItems = [{ name: 'foo', ext: 'html' }];
      el._listItemPaths = new Set();
      const goodEntry = {
        isDirectory: false,
        fullPath: '/foo.html',
        file: (cb) => cb(new File(['x'], 'foo.html', { type: 'text/html' })),
      };
      const items = [{ webkitGetAsEntry: () => goodEntry }];
      let uploaded = false;
      const savedFetch = window.fetch;
      window.fetch = () => {
        uploaded = true;
        return Promise.resolve(new Response('', { status: 200 }));
      };
      try {
        await el.drop({ preventDefault: () => {}, dataTransfer: { items } });
      } finally {
        window.fetch = savedFetch;
      }
      expect(el._dropConflicts).to.deep.equal(['foo.html']);
      expect(uploaded).to.be.false;
    });

    it('handleDropConfirm clears conflicts and runs processDropFiles', async () => {
      const el = makeList();
      attachShadow(el);
      el.fullpath = '/o/r';
      el._listItems = [];
      el._listItemPaths = new Set();
      el._dropFiles = [{
        data: new File(['x'], 'foo.html', { type: 'text/html' }),
        name: 'foo.html',
        type: 'text/html',
        ext: 'html',
        path: '/foo.html',
      }];
      el._dropConflicts = ['foo.html'];
      const savedFetch = window.fetch;
      window.fetch = () => Promise.resolve(new Response('', { status: 200 }));
      try {
        await el.handleDropConfirm();
      } finally {
        window.fetch = savedFetch;
      }
      expect(el._dropConflicts).to.equal(null);
      expect(el._dropFiles).to.deep.equal([]);
    });

    it('handleDropCancel clears conflicts and dropFiles', () => {
      const el = makeList();
      attachShadow(el);
      el._dropFiles = [{}];
      el._dropConflicts = ['x'];
      el.handleDropCancel();
      expect(el._dropConflicts).to.equal(null);
      expect(el._dropFiles).to.deep.equal([]);
    });

    it('processDropFiles uploads each file, updating listItems', async () => {
      const el = makeList();
      attachShadow(el);
      el.fullpath = '/o/r';
      el._listItems = [];
      el._listItemPaths = new Set();
      el._dropFiles = [
        {
          data: new File(['x'], 'a.html', { type: 'text/html' }),
          name: 'a.html',
          type: 'text/html',
          ext: 'html',
          path: '/a.html',
        },
        {
          data: new File(['y'], 'b.html', { type: 'text/html' }),
          name: 'b.html',
          type: 'text/html',
          ext: 'html',
          path: '/b.html',
        },
      ];
      const savedFetch = window.fetch;
      window.fetch = () => Promise.resolve(new Response('', { status: 200 }));
      try {
        await el.processDropFiles();
      } finally {
        window.fetch = savedFetch;
      }
      expect(el._listItems.map((i) => i.name).sort()).to.deep.equal(['a', 'b']);
    });
  });

  describe('handleCheckAll', () => {
    it('Toggles every item to checked when isSelectAll is false', async () => {
      const el = makeList();
      el._listItems = [{ isChecked: false, path: '/a' }, { isChecked: false, path: '/b' }];
      el._continuationToken = null;
      el.handleSelectionState = () => {};
      await el.handleCheckAll();
      expect(el._listItems.every((i) => i.isChecked)).to.be.true;
    });

    it('Toggles every item to unchecked when isSelectAll is true', async () => {
      const el = makeList();
      el._listItems = [{ isChecked: true }, { isChecked: true }];
      el._continuationToken = null;
      el.handleSelectionState = () => {};
      await el.handleCheckAll();
      expect(el._listItems.every((i) => i.isChecked === false)).to.be.true;
    });
  });

  describe('toggleFilterView', () => {
    it('Toggles _showFilter and clears the filter input value', async () => {
      const el = makeList();
      const input = { value: 'old', focus: () => {} };
      Object.defineProperty(el, 'shadowRoot', {
        configurable: true,
        value: { querySelector: () => input },
      });
      el._continuationToken = null;
      el._allPagesLoaded = true;
      await el.toggleFilterView();
      expect(el._showFilter).to.be.true;
      expect(input.value).to.equal('');
      expect(el._filter).to.equal('');
    });
  });

  describe('handlePaste', () => {
    it('Builds destination paths and dispatches handleItemAction copies', async () => {
      const el = makeList();
      el.fullpath = '/org/repo/dest';
      el._selectedItems = [{ path: '/org/repo/src/d1.html', ext: 'html', name: 'd1', isChecked: true }];
      el._listItems = [];
      el._listItemPaths = new Set();

      const calls = [];
      el.handleItemAction = async (args) => { calls.push(args); };
      el.setStatus = () => {};
      el.handleClear = () => {};

      await el.handlePaste({});
      expect(calls.length).to.equal(1);
      expect(calls[0].type).to.equal('copy');
      expect(calls[0].item.destination).to.equal('/org/repo/dest/d1.html');
    });

    it('Appends -copy when destination already exists', async () => {
      const el = makeList();
      el.fullpath = '/org/repo/dest';
      el._selectedItems = [{ path: '/org/repo/src/d1.html', ext: 'html', name: 'd1', isChecked: true }];
      el._listItems = [{ path: '/org/repo/dest/d1.html', name: 'd1' }];
      el._listItemPaths = new Set();
      const calls = [];
      el.handleItemAction = async (args) => { calls.push(args); };
      el.setStatus = () => {};
      el.handleClear = () => {};
      await el.handlePaste({});
      expect(calls[0].item.destination).to.equal('/org/repo/dest/d1-copy.html');
    });

    it('Uses move type when detail.move is set', async () => {
      const el = makeList();
      el.fullpath = '/org/repo/dest';
      el._selectedItems = [{ path: '/org/repo/src/d1.html', ext: 'html', name: 'd1', isChecked: true }];
      el._listItems = [];
      const calls = [];
      el.handleItemAction = async (args) => { calls.push(args); };
      el.setStatus = () => {};
      el.handleClear = () => {};
      await el.handlePaste({ detail: { move: true } });
      expect(calls[0].type).to.equal('move');
    });
  });
});
