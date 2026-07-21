import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { saveSheets, handleSave, staleCheck } = await import('../../../../blocks/sheet/utils/utils.js');

// The new api.js makes an hlx6 upgrade probe before each source op. The probe
// must respond without an x-api-upgrade-available header so the source URL
// stays on DA_ADMIN.
function wrap(handler) {
  return async (url, opts) => {
    if (typeof url === 'string' && url.startsWith('https://admin.hlx.page/ping')) {
      return new Response('', { status: 200, headers: new Headers() });
    }
    return handler(url, opts);
  };
}

describe('sheet/utils utils', () => {
  let savedFetch;
  let savedHash;

  beforeEach(() => {
    savedFetch = window.fetch;
    savedHash = window.location.hash;
    // Provide a da-sheet-panes element so saveSheets can call .data setter
    if (!document.querySelector('da-sheet-panes')) {
      const el = document.createElement('da-sheet-panes');
      document.body.appendChild(el);
    }
  });

  afterEach(() => {
    window.fetch = savedFetch;
    if (savedHash) window.location.hash = savedHash;
    const el = document.querySelector('da-sheet-panes');
    if (el) el.remove();
  });

  function buildSheet(name, data, widths = [10, 20]) {
    return {
      name,
      getData: () => data,
      getConfig: () => ({ columns: widths.map((w) => ({ width: `${w}` })) }),
    };
  }

  describe('saveSheets', () => {
    it('Returns true when the save succeeds and updates da-sheet-panes data', async () => {
      window.location.hash = '#/org/repo/test-sheet';
      window.fetch = wrap(() => Promise.resolve(new Response('', { status: 200 })));
      const sheets = [buildSheet('one', [['k'], ['v']])];
      const result = await saveSheets(sheets);
      expect(result).to.be.true;
      const panes = document.querySelector('da-sheet-panes');
      expect(panes.data).to.exist;
      expect(panes.data[':type']).to.equal('sheet');
    });

    it('Returns false when the save fails', async () => {
      window.location.hash = '#/org/repo/fail-sheet';
      window.fetch = wrap(() => Promise.resolve(new Response('boom', { status: 500 })));
      const sheets = [buildSheet('one', [['k'], ['v']])];
      const result = await saveSheets(sheets);
      expect(result).to.be.false;
    });
  });

  describe('etag drift detection', () => {
    const DETAILS = { org: 'org', site: 'repo', path: '/sheet', view: 'sheet' };
    const serverJson = { ':type': 'sheet', ':sheetname': 'data', data: [{ key: 'a' }] };

    afterEach(() => {
      staleCheck.stop();
    });

    it('bails saveSheets when server etag differs from the recorded baseline', async () => {
      let onStaleFired = false;
      staleCheck.start({ details: DETAILS, onStale: () => { onStaleFired = true; } });
      staleCheck.markSynced('"baseline"');

      window.location.hash = '#/org/repo/sheet';
      window.fetch = wrap(async (url, opts) => {
        if (opts?.method === 'POST' || opts?.method === 'PUT') {
          return new Response('', { status: 200, headers: { ETag: '"remote"' } });
        }
        return new Response(JSON.stringify(serverJson), {
          status: 200,
          headers: { ETag: '"remote"', 'Content-Type': 'application/json' },
        });
      });

      const sheets = [buildSheet('data', [['key'], ['a']])];
      const result = await saveSheets(sheets);
      expect(result).to.be.false;
      expect(onStaleFired).to.be.true;
    });

    it('proceeds when server etag matches the recorded baseline', async () => {
      staleCheck.start({ details: DETAILS, onStale: () => {} });
      staleCheck.markSynced('"baseline"');

      window.location.hash = '#/org/repo/sheet';
      window.fetch = wrap(async (url, opts) => {
        if (opts?.method === 'POST' || opts?.method === 'PUT') {
          return new Response('', { status: 200, headers: { ETag: '"next"' } });
        }
        return new Response(JSON.stringify(serverJson), {
          status: 200,
          headers: { ETag: '"baseline"', 'Content-Type': 'application/json' },
        });
      });

      const sheets = [buildSheet('data', [['key'], ['a']])];
      const result = await saveSheets(sheets);
      expect(result).to.be.true;
    });

    it('treats a weak server etag as equal to a strong baseline (no phantom drift)', async () => {
      // Cloudflare returns a weak etag (W/"h") on the gzipped GET while a create
      // returns a strong etag ("h") for the same content. These must compare equal.
      let onStaleFired = false;
      staleCheck.start({ details: DETAILS, onStale: () => { onStaleFired = true; } });
      staleCheck.markSynced('"baseline"');

      window.location.hash = '#/org/repo/sheet';
      window.fetch = wrap(async (url, opts) => {
        if (opts?.method === 'POST' || opts?.method === 'PUT') {
          return new Response('', { status: 200, headers: { ETag: '"next"' } });
        }
        return new Response(JSON.stringify(serverJson), {
          status: 200,
          headers: { ETag: 'W/"baseline"', 'Content-Type': 'application/json' },
        });
      });

      const sheets = [buildSheet('data', [['key'], ['a']])];
      const result = await saveSheets(sheets);
      expect(result).to.be.true;
      expect(onStaleFired).to.be.false;
    });
  });

  describe('handleSave', () => {
    it('Skips saving when view is "config"', () => {
      // No fetch call means handleSave didn't dispatch saveSheets
      let calls = 0;
      window.fetch = () => {
        calls += 1;
        return Promise.resolve(new Response('', { status: 200 }));
      };
      handleSave([buildSheet('a', [['x']])], 'config');
      // debounced save would be queued; verify no immediate fetch
      expect(calls).to.equal(0);
    });

    it('Schedules a save when view is not "config"', async () => {
      window.location.hash = '#/o/r/test';
      let captured;
      window.fetch = wrap((url) => {
        if (typeof url === 'string' && url.includes('/source/')) captured = url;
        return Promise.resolve(new Response('', { status: 200 }));
      });
      handleSave([buildSheet('a', [['x']])], 'edit');
      // wait beyond the 1000ms debounce
      await new Promise((r) => { setTimeout(r, 1200); });
      expect(captured).to.contain('/source/o/r/test');
    });
  });
});
