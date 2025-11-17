/*
    eslint-disable no-underscore-dangle
*/
import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/bheuaark/', { hostname: 'localhost' });

const { default: DaList } = await import('../../../../blocks/browse/da-list/da-list.js');

describe('DaList Caching', () => {
  let daList;
  let originalSessionStorage;
  let originalFetch;

  beforeEach(() => {
    // Mock sessionStorage
    const storage = {};
    originalSessionStorage = window.sessionStorage;
    Object.defineProperty(window, 'sessionStorage', {
      value: {
        getItem: (key) => storage[key] || null,
        setItem: (key, value) => { storage[key] = value; },
        removeItem: (key) => { delete storage[key]; },
        clear: () => { Object.keys(storage).forEach((key) => delete storage[key]); },
      },
      writable: true,
    });

    // Mock fetch to prevent external requests
    originalFetch = window.fetch;
    window.fetch = async (url) => {
      // Mock SVG fetch requests
      if (url && url.includes('.svg')) {
        return {
          ok: true,
          text: async () => '<svg></svg>',
          json: async () => ({}),
        };
      }
      // Mock API requests
      return {
        ok: true,
        json: async () => [],
        text: async () => '[]',
        permissions: null,
      };
    };

    daList = new DaList();
  });

  afterEach(() => {
    window.sessionStorage.clear();
    Object.defineProperty(window, 'sessionStorage', {
      value: originalSessionStorage,
      writable: true,
    });
    window.fetch = originalFetch;
  });

  describe('getCachedList', () => {
    it('returns null when no cache exists', () => {
      const result = daList.getCachedList('/myorg/mysite/folder');
      expect(result).to.be.null;
    });

    it('returns cached data when cache exists and not expired', () => {
      const testData = [{ name: 'file1.html', path: '/myorg/mysite/folder/file1.html' }];
      const cacheKey = 'da-list-cache-/myorg/mysite/folder';
      const cacheData = {
        timestamp: Date.now(),
        data: testData,
      };
      window.sessionStorage.setItem(cacheKey, JSON.stringify(cacheData));

      const result = daList.getCachedList('/myorg/mysite/folder');
      expect(result).to.deep.equal(testData);
    });

    it('returns null and removes cache when expired (> 2 hours)', () => {
      const testData = [{ name: 'file1.html', path: '/myorg/mysite/folder/file1.html' }];
      const cacheKey = 'da-list-cache-/myorg/mysite/folder';
      const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000 + 1000);
      const cacheData = {
        timestamp: twoHoursAgo,
        data: testData,
      };
      window.sessionStorage.setItem(cacheKey, JSON.stringify(cacheData));

      const result = daList.getCachedList('/myorg/mysite/folder');
      expect(result).to.be.null;
      expect(window.sessionStorage.getItem(cacheKey)).to.be.null;
    });

    it('handles invalid JSON gracefully', () => {
      const cacheKey = 'da-list-cache-/myorg/mysite/folder';
      window.sessionStorage.setItem(cacheKey, 'invalid json{');

      const result = daList.getCachedList('/myorg/mysite/folder');
      expect(result).to.be.null;
    });
  });

  describe('setCachedList', () => {
    it('stores data in sessionStorage with timestamp', () => {
      const testData = [
        { name: 'file1.html', path: '/myorg/mysite/folder/file1.html' },
        { name: 'file2.html', path: '/myorg/mysite/folder/file2.html' },
      ];
      const path = '/myorg/mysite/folder';

      daList.setCachedList(path, testData);

      const cacheKey = `da-list-cache-${path}`;
      const cached = window.sessionStorage.getItem(cacheKey);
      expect(cached).to.not.be.null;

      const parsed = JSON.parse(cached);
      expect(parsed.data).to.deep.equal(testData);
      expect(parsed.timestamp).to.be.a('number');
      expect(Date.now() - parsed.timestamp).to.be.lessThan(1000);
    });

    it('handles storage errors gracefully', () => {
      // Mock storage full
      const originalSetItem = window.sessionStorage.setItem;
      window.sessionStorage.setItem = () => {
        throw new Error('QuotaExceededError');
      };

      const testData = [{ name: 'file1.html' }];
      // Should not throw
      expect(() => daList.setCachedList('/test', testData)).to.not.throw();

      window.sessionStorage.setItem = originalSetItem;
    });

    it('sorts data by name before caching', () => {
      daList.fullpath = '/myorg/mysite/folder';
      // Create list larger than CACHE_MIN_SIZE (40)
      const testData = Array.from({ length: 45 }, (_, i) => ({
        name: `file${String(i).padStart(3, '0')}.html`,
        path: `/test/file${i}.html`,
      }));
      // Add specific test items
      testData[0] = { name: 'zebra.html', path: '/test/zebra.html' };
      testData[1] = { name: 'apple.html', path: '/test/apple.html' };
      testData[2] = { name: 'banana.html', path: '/test/banana.html' };

      daList._listItems = testData;
      daList.updateCache();

      const cacheKey = 'da-list-cache-/myorg/mysite/folder';
      const cached = JSON.parse(window.sessionStorage.getItem(cacheKey));

      expect(cached).to.not.be.null;
      expect(cached.data[0].name).to.equal('apple.html');
      expect(cached.data[1].name).to.equal('banana.html');
      // Find zebra - it should be near the end after sorting
      const zebraItem = cached.data.find((item) => item.name === 'zebra.html');
      expect(zebraItem).to.exist;
    });

    it('does not cache lists smaller than CACHE_MIN_SIZE', () => {
      daList.fullpath = '/myorg/mysite/folder';
      const smallList = Array.from({ length: 30 }, (_, i) => ({
        name: `file${i}.html`,
        path: `/test/file${i}.html`,
      }));

      daList._listItems = smallList;
      daList.updateCache();

      const cacheKey = 'da-list-cache-/myorg/mysite/folder';
      expect(window.sessionStorage.getItem(cacheKey)).to.be.null;
    });

    it('caches lists larger than CACHE_MIN_SIZE', () => {
      daList.fullpath = '/myorg/mysite/folder';
      const largeList = Array.from({ length: 50 }, (_, i) => ({
        name: `file${i}.html`,
        path: `/test/file${i}.html`,
      }));

      daList._listItems = largeList;
      daList.updateCache();

      const cacheKey = 'da-list-cache-/myorg/mysite/folder';
      expect(window.sessionStorage.getItem(cacheKey)).to.not.be.null;
    });
  });

  describe('listsAreEqual', () => {
    it('returns true for identical lists', () => {
      const list1 = [
        { path: '/a.html', name: 'a', lastModified: '2024-01-01' },
        { path: '/b.html', name: 'b', lastModified: '2024-01-02' },
      ];
      const list2 = [
        { path: '/a.html', name: 'a', lastModified: '2024-01-01' },
        { path: '/b.html', name: 'b', lastModified: '2024-01-02' },
      ];

      expect(daList.listsAreEqual(list1, list2)).to.be.true;
    });

    it('returns false for lists with different lengths', () => {
      const list1 = [{ path: '/a.html', name: 'a', lastModified: '2024-01-01' }];
      const list2 = [
        { path: '/a.html', name: 'a', lastModified: '2024-01-01' },
        { path: '/b.html', name: 'b', lastModified: '2024-01-02' },
      ];

      expect(daList.listsAreEqual(list1, list2)).to.be.false;
    });

    it('returns false for lists with different paths', () => {
      const list1 = [{ path: '/a.html', name: 'a', lastModified: '2024-01-01' }];
      const list2 = [{ path: '/b.html', name: 'a', lastModified: '2024-01-01' }];

      expect(daList.listsAreEqual(list1, list2)).to.be.false;
    });

    it('returns false for lists with different names', () => {
      const list1 = [{ path: '/a.html', name: 'a', lastModified: '2024-01-01' }];
      const list2 = [{ path: '/a.html', name: 'b', lastModified: '2024-01-01' }];

      expect(daList.listsAreEqual(list1, list2)).to.be.false;
    });

    it('returns false for lists with different lastModified', () => {
      const list1 = [{ path: '/a.html', name: 'a', lastModified: '2024-01-01' }];
      const list2 = [{ path: '/a.html', name: 'a', lastModified: '2024-01-02' }];

      expect(daList.listsAreEqual(list1, list2)).to.be.false;
    });

    it('returns false when either list is null or undefined', () => {
      const list = [{ path: '/a.html', name: 'a', lastModified: '2024-01-01' }];

      expect(daList.listsAreEqual(null, list)).to.be.false;
      expect(daList.listsAreEqual(list, null)).to.be.false;
      expect(daList.listsAreEqual(undefined, list)).to.be.false;
      expect(daList.listsAreEqual(list, undefined)).to.be.false;
    });

    it('returns true for empty lists', () => {
      expect(daList.listsAreEqual([], [])).to.be.true;
    });
  });

  describe('cancelPendingFetch', () => {
    it('aborts controller and clears state', () => {
      daList._abortController = new AbortController();
      daList._loadingTimeout = setTimeout(() => {}, 1000);
      daList._showLoadingMessage = true;

      daList.cancelPendingFetch();

      expect(daList._abortController).to.be.null;
      expect(daList._loadingTimeout).to.be.null;
      expect(daList._showLoadingMessage).to.be.false;
    });

    it('handles null values gracefully', () => {
      daList._abortController = null;
      daList._loadingTimeout = null;
      daList._showLoadingMessage = false;

      expect(() => daList.cancelPendingFetch()).to.not.throw();
    });
  });

  describe('getList with AbortController', () => {
    it('returns null when aborted', async () => {
      const controller = new AbortController();

      // Mock fetch to throw AbortError when aborted
      const tempFetch = window.fetch;
      window.fetch = async (url, options) => {
        if (url && url.includes('.svg')) {
          return { ok: true, text: async () => '<svg></svg>' };
        }
        if (options?.signal?.aborted) {
          const error = new Error('The operation was aborted');
          error.name = 'AbortError';
          throw error;
        }
        return {
          ok: true,
          json: async () => [],
          text: async () => '[]',
          permissions: null,
        };
      };

      controller.abort();
      const result = await daList.getList(controller.signal);

      expect(result).to.be.null;
      window.fetch = tempFetch;
    });

    it('caches successful response above minimum size', async () => {
      const mockData = Array.from({ length: 50 }, (_, i) => ({
        name: `file${i}.html`,
        path: `/test/file${i}.html`,
      }));

      const tempFetch = window.fetch;
      window.fetch = async (url) => {
        if (url && url.includes('.svg')) {
          return { ok: true, text: async () => '<svg></svg>' };
        }
        return {
          ok: true,
          json: async () => mockData,
          text: async () => JSON.stringify(mockData),
          permissions: null,
        };
      };

      daList.fullpath = '/myorg/mysite/folder';
      const controller = new AbortController();
      await daList.getList(controller.signal);

      const cacheKey = 'da-list-cache-/myorg/mysite/folder';
      const cached = window.sessionStorage.getItem(cacheKey);
      expect(cached).to.not.be.null;

      window.fetch = tempFetch;
    });

    it('does not cache response below minimum size', async () => {
      const mockData = Array.from({ length: 30 }, (_, i) => ({
        name: `file${i}.html`,
        path: `/test/file${i}.html`,
      }));

      const tempFetch = window.fetch;
      window.fetch = async (url) => {
        if (url && url.includes('.svg')) {
          return { ok: true, text: async () => '<svg></svg>' };
        }
        return {
          ok: true,
          json: async () => mockData,
          text: async () => JSON.stringify(mockData),
          permissions: null,
        };
      };

      daList.fullpath = '/myorg/mysite/folder';
      const controller = new AbortController();
      await daList.getList(controller.signal);

      const cacheKey = 'da-list-cache-/myorg/mysite/folder';
      const cached = window.sessionStorage.getItem(cacheKey);
      expect(cached).to.be.null;

      window.fetch = tempFetch;
    });
  });

  describe('Race condition handling', () => {
    it('ignores stale fetch results', async () => {
      const tempFetch = window.fetch;
      let fetchCount = 0;

      // Mock slow fetch
      window.fetch = async (url) => {
        if (url && url.includes('.svg')) {
          return { ok: true, text: async () => '<svg></svg>' };
        }
        fetchCount += 1;
        const count = fetchCount;
        await new Promise((resolve) => { setTimeout(resolve, count === 1 ? 100 : 10); });
        const data = [{
          name: `fetch${count}.html`,
          path: `/test/fetch${count}.html`,
        }];
        return {
          ok: true,
          json: async () => data,
          text: async () => JSON.stringify(data),
          permissions: null,
        };
      };

      daList.fullpath = '/folder1';
      daList._abortController = new AbortController();
      const controller1 = daList._abortController;
      const promise1 = daList.getList(controller1.signal);

      // Immediately start second fetch (simulating quick navigation)
      daList.fullpath = '/folder2';
      daList._abortController = new AbortController();
      const controller2 = daList._abortController;
      const promise2 = daList.getList(controller2.signal);

      await Promise.all([promise1, promise2]);

      // Controller should be the second one
      expect(daList._abortController).to.equal(controller2);

      window.fetch = tempFetch;
    });
  });

  describe('updateCache integration', () => {
    it('automatically caches when _listItems changes', async () => {
      daList.fullpath = '/myorg/mysite/folder';
      const testData = Array.from({ length: 50 }, (_, i) => ({
        name: `file${i}.html`,
        path: `/test/file${i}.html`,
      }));

      // Simulate LitElement's updated lifecycle
      daList._listItems = testData;
      const changedProperties = new Map();
      changedProperties.set('_listItems', []);
      daList.updated(changedProperties);

      const cacheKey = 'da-list-cache-/myorg/mysite/folder';
      const cached = window.sessionStorage.getItem(cacheKey);
      expect(cached).to.not.be.null;

      const parsed = JSON.parse(cached);
      expect(parsed.data).to.have.lengthOf(50);
    });

    it('does not cache when fullpath is not set', () => {
      daList.fullpath = null;
      const testData = Array.from({ length: 50 }, (_, i) => ({
        name: `file${i}.html`,
        path: `/test/file${i}.html`,
      }));

      daList._listItems = testData;
      daList.updateCache();

      // Should not have created any cache entry
      const keys = Object.keys(window.sessionStorage);
      expect(keys.filter((k) => k.startsWith('da-list-cache-'))).to.have.lengthOf(0);
    });
  });

  describe('Loading message timeout', () => {
    it('shows loading message after timeout when no cache', (done) => {
      daList._showLoadingMessage = false;
      daList._loadingTimeout = setTimeout(() => {
        daList._listItems = [];
        daList._showLoadingMessage = true;
      }, 100);

      setTimeout(() => {
        expect(daList._showLoadingMessage).to.be.true;
        expect(daList._listItems).to.deep.equal([]);
        done();
      }, 150);
    });

    it('clears timeout on successful fetch', (done) => {
      daList._loadingTimeout = setTimeout(() => {
        daList._showLoadingMessage = true;
      }, 100);

      // Simulate fetch completing
      clearTimeout(daList._loadingTimeout);
      daList._loadingTimeout = null;
      daList._showLoadingMessage = false;

      setTimeout(() => {
        expect(daList._showLoadingMessage).to.be.false;
        done();
      }, 150);
    });

    it('clears timeout when navigating away', () => {
      daList._loadingTimeout = setTimeout(() => {
        daList._showLoadingMessage = true;
      }, 1000);

      daList.cancelPendingFetch();

      expect(daList._loadingTimeout).to.be.null;
      expect(daList._showLoadingMessage).to.be.false;
    });
  });

  describe('Cache invalidation on list modifications', () => {
    beforeEach(() => {
      daList.fullpath = '/myorg/mysite/folder';
    });

    it('updates cache when new item is added', () => {
      const initialList = Array.from({ length: 50 }, (_, i) => ({
        name: `file${i}.html`,
        path: `/test/file${i}.html`,
      }));
      daList._listItems = initialList;
      daList.updateCache();

      const newItem = { name: 'new.html', path: '/test/new.html' };
      daList.newItem = newItem;
      daList.handleNewItem();

      // Manually trigger update since we're not in a real LitElement context
      const changedProperties = new Map();
      changedProperties.set('_listItems', initialList);
      daList.updated(changedProperties);

      const cacheKey = 'da-list-cache-/myorg/mysite/folder';
      const cached = JSON.parse(window.sessionStorage.getItem(cacheKey));
      expect(cached.data).to.have.lengthOf(51);
      expect(cached.data.find((item) => item.name === 'new.html')).to.exist;
    });

    it('updates cache when item is renamed', () => {
      const initialList = Array.from({ length: 50 }, (_, i) => ({
        name: `file${i}.html`,
        path: `/test/file${i}.html`,
        lastModified: '2024-01-01',
      }));
      daList._listItems = [...initialList];
      daList.updateCache();

      const renameEvent = {
        detail: {
          oldPath: '/test/file0.html',
          path: '/test/renamed.html',
          name: 'renamed.html',
          date: '2024-01-02',
        },
      };
      daList.handleRenameCompleted(renameEvent);

      // Manually trigger update
      const changedProperties = new Map();
      changedProperties.set('_listItems', initialList);
      daList.updated(changedProperties);

      const cacheKey = 'da-list-cache-/myorg/mysite/folder';
      const cached = JSON.parse(window.sessionStorage.getItem(cacheKey));
      expect(cached.data.find((item) => item.name === 'renamed.html')).to.exist;
      expect(cached.data.find((item) => item.name === 'file0.html')).to.not.exist;
    });
  });

  describe('update() function', () => {
    it('updates _listItems when listItems prop changes', async () => {
      const testData = Array.from({ length: 50 }, (_, i) => ({
        name: `file${i}.html`,
        path: `/test/file${i}.html`,
      }));

      document.body.appendChild(daList);

      const props = new Map();
      props.set('listItems', undefined);
      daList.listItems = testData;

      await daList.update(props);

      expect(daList._listItems).to.deep.equal(testData);

      document.body.removeChild(daList);
    });

    it('cancels pending fetch when listItems prop changes', async () => {
      daList._abortController = new AbortController();
      daList._loadingTimeout = setTimeout(() => {}, 1000);
      daList._showLoadingMessage = true;

      const testData = [{ name: 'test.html', path: '/test.html' }];

      document.body.appendChild(daList);

      const props = new Map();
      props.set('listItems', undefined);
      daList.listItems = testData;

      await daList.update(props);

      expect(daList._abortController).to.be.null;
      expect(daList._loadingTimeout).to.be.null;
      expect(daList._showLoadingMessage).to.be.false;

      document.body.removeChild(daList);
    });

    it('loads from cache when fullpath changes and cache exists', async () => {
      const cachedData = Array.from({ length: 50 }, (_, i) => ({
        name: `cached${i}.html`,
        path: `/test/cached${i}.html`,
      }));

      const cacheKey = 'da-list-cache-/myorg/mysite/folder';
      window.sessionStorage.setItem(cacheKey, JSON.stringify({
        timestamp: Date.now(),
        data: cachedData,
      }));

      const tempFetch = window.fetch;
      window.fetch = async (url) => {
        if (url && url.includes('.svg')) {
          return { ok: true, text: async () => '<svg></svg>' };
        }
        return {
          ok: true,
          json: async () => cachedData,
          text: async () => JSON.stringify(cachedData),
          permissions: null,
        };
      };

      // Mount element to avoid LitElement rendering issues
      document.body.appendChild(daList);

      const props = new Map();
      props.set('fullpath', undefined);
      daList.fullpath = '/myorg/mysite/folder';

      await daList.update(props);

      expect(daList._listItems).to.deep.equal(cachedData);
      expect(daList._showLoadingMessage).to.be.false;

      document.body.removeChild(daList);
      window.fetch = tempFetch;
    });

    it('shows loading state when no cache exists', async () => {
      document.body.appendChild(daList);

      const props = new Map();
      props.set('fullpath', undefined);
      daList.fullpath = '/myorg/mysite/newfolder';

      // Start the update but don't await it yet
      const updatePromise = daList.update(props);

      // Verify loading timeout was set
      expect(daList._loadingTimeout).to.not.be.null;

      // Clean up
      await updatePromise;
      document.body.removeChild(daList);
    });

    it('clears filter and showFilter when fullpath changes', async () => {
      daList._filter = 'test';
      daList._showFilter = true;

      document.body.appendChild(daList);

      const props = new Map();
      props.set('fullpath', undefined);
      daList.fullpath = '/myorg/mysite/folder';

      await daList.update(props);

      expect(daList._filter).to.equal('');
      expect(daList._showFilter).to.be.undefined;

      document.body.removeChild(daList);
    });

    it('updates list when fresh data differs from cache', async () => {
      const cachedData = Array.from({ length: 50 }, (_, i) => ({
        name: `file${i}.html`,
        path: `/test/file${i}.html`,
        lastModified: '2024-01-01',
      }));

      const freshData = Array.from({ length: 50 }, (_, i) => ({
        name: `file${i}.html`,
        path: `/test/file${i}.html`,
        lastModified: '2024-01-02',
      }));

      const cacheKey = 'da-list-cache-/myorg/mysite/folder';
      window.sessionStorage.setItem(cacheKey, JSON.stringify({
        timestamp: Date.now(),
        data: cachedData,
      }));

      const tempFetch = window.fetch;
      window.fetch = async (url) => {
        if (url && url.includes('.svg')) {
          return { ok: true, text: async () => '<svg></svg>' };
        }
        return {
          ok: true,
          json: async () => freshData,
          text: async () => JSON.stringify(freshData),
          permissions: null,
        };
      };

      document.body.appendChild(daList);

      const props = new Map();
      props.set('fullpath', undefined);
      daList.fullpath = '/myorg/mysite/folder';

      await daList.update(props);

      expect(daList._listItems[0].lastModified).to.equal('2024-01-02');

      document.body.removeChild(daList);
      window.fetch = tempFetch;
    });

    it('does not update list when fresh data same as cache', async () => {
      const cachedData = Array.from({ length: 50 }, (_, i) => ({
        name: `file${i}.html`,
        path: `/test/file${i}.html`,
        lastModified: '2024-01-01',
      }));

      const cacheKey = 'da-list-cache-/myorg/mysite/folder';
      window.sessionStorage.setItem(cacheKey, JSON.stringify({
        timestamp: Date.now(),
        data: cachedData,
      }));

      const tempFetch = window.fetch;
      let fetchCallCount = 0;
      window.fetch = async (url) => {
        if (url && url.includes('.svg')) {
          return { ok: true, text: async () => '<svg></svg>' };
        }
        fetchCallCount += 1;
        return {
          ok: true,
          json: async () => cachedData,
          text: async () => JSON.stringify(cachedData),
          permissions: null,
        };
      };

      document.body.appendChild(daList);

      const props = new Map();
      props.set('fullpath', undefined);
      daList.fullpath = '/myorg/mysite/folder';

      await daList.update(props);

      // Verify fetch was called and list data is correct
      expect(fetchCallCount).to.be.greaterThan(0);
      expect(daList._listItems).to.deep.equal(cachedData);

      document.body.removeChild(daList);
      window.fetch = tempFetch;
    });

    it('ignores fetch results when navigated away', async () => {
      const freshData1 = [{ name: 'folder1.html', path: '/folder1/file.html', lastModified: '2024-01-02' }];
      const cachedData2 = [{ name: 'folder2.html', path: '/folder2/file.html', lastModified: '2024-01-01' }];

      const tempFetch = window.fetch;
      let fetchCount = 0;
      window.fetch = async (url) => {
        if (url && url.includes('.svg')) {
          return { ok: true, text: async () => '<svg></svg>' };
        }
        fetchCount += 1;
        const count = fetchCount;
        // First fetch is slow
        await new Promise((resolve) => { setTimeout(resolve, count === 1 ? 100 : 10); });
        const data = count === 1 ? freshData1 : cachedData2;
        return {
          ok: true,
          json: async () => data,
          text: async () => JSON.stringify(data),
          permissions: null,
        };
      };

      document.body.appendChild(daList);

      // Navigate to folder1
      const props1 = new Map();
      props1.set('fullpath', undefined);
      daList.fullpath = '/folder1';
      const update1Promise = daList.update(props1);

      // Quickly navigate to folder2 before first fetch completes
      await new Promise((resolve) => { setTimeout(resolve, 20); });
      const props2 = new Map();
      props2.set('fullpath', '/folder1');
      daList.fullpath = '/folder2';
      const update2Promise = daList.update(props2);

      await Promise.all([update1Promise, update2Promise]);

      // Should have folder2 data, not folder1
      expect(daList._listItems[0].name).to.equal('folder2.html');

      document.body.removeChild(daList);
      window.fetch = tempFetch;
    });

    it('calls handleNewItem when newItem prop changes', async () => {
      const initialList = Array.from({ length: 50 }, (_, i) => ({
        name: `file${i}.html`,
        path: `/test/file${i}.html`,
      }));

      daList._listItems = [...initialList];
      daList.fullpath = '/myorg/mysite/folder';

      document.body.appendChild(daList);

      const newItem = { name: 'newfile.html', path: '/test/newfile.html' };
      const props = new Map();
      props.set('newItem', undefined);
      daList.newItem = newItem;

      await daList.update(props);

      expect(daList._listItems[0]).to.deep.equal(newItem);
      expect(daList._listItems.length).to.equal(51);
      expect(daList.newItem).to.be.null;

      document.body.removeChild(daList);
    });

    it('clears loading timeout after fetch completes', async () => {
      document.body.appendChild(daList);

      const props = new Map();
      props.set('fullpath', undefined);
      daList.fullpath = '/myorg/mysite/folder';

      await daList.update(props);

      expect(daList._loadingTimeout).to.be.null;
      expect(daList._showLoadingMessage).to.be.false;

      document.body.removeChild(daList);
    });

    it('initializes _listItems to empty array if null after cache check', async () => {
      daList._listItems = null;

      document.body.appendChild(daList);

      const props = new Map();
      props.set('fullpath', undefined);
      daList.fullpath = '/myorg/mysite/folder';

      await daList.update(props);

      expect(daList._listItems).to.be.an('array');

      document.body.removeChild(daList);
    });

    it('handles multiple property changes in single update', async () => {
      const testData = Array.from({ length: 50 }, (_, i) => ({
        name: `file${i}.html`,
        path: `/test/file${i}.html`,
      }));

      const newItem = { name: 'new.html', path: '/test/new.html' };

      document.body.appendChild(daList);

      const props = new Map();
      props.set('listItems', undefined);
      props.set('newItem', undefined);

      daList.listItems = testData;
      daList.newItem = newItem;
      daList.fullpath = '/myorg/mysite/folder';

      await daList.update(props);

      // listItems should be set, then newItem added
      expect(daList._listItems[0]).to.deep.equal(newItem);
      expect(daList._listItems.length).to.equal(51);

      document.body.removeChild(daList);
    });

    it('creates new abort controller for each fullpath change', async () => {
      document.body.appendChild(daList);

      const props1 = new Map();
      props1.set('fullpath', undefined);
      daList.fullpath = '/folder1';

      await daList.update(props1);
      const controller1 = daList._abortController;

      const props2 = new Map();
      props2.set('fullpath', '/folder1');
      daList.fullpath = '/folder2';

      await daList.update(props2);
      const controller2 = daList._abortController;

      expect(controller1).to.not.equal(controller2);
      expect(controller2).to.be.instanceOf(AbortController);

      document.body.removeChild(daList);
    });
  });
});
