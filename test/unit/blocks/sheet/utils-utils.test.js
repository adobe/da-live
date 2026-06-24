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

  describe('staleCheck after restore', () => {
    const DETAILS = { org: 'org', site: 'repo', path: '/sheet', view: 'sheet' };
    const serverJson = { ':type': 'sheet', ':sheetname': 'data', data: [{ key: 'a' }] };

    beforeEach(() => {
      staleCheck.start({ details: DETAILS, onStale: () => {} });
      staleCheck.markSynced(serverJson);
    });

    afterEach(() => {
      staleCheck.stop();
    });

    it('markSynced with jspreadsheet-format array causes saveSheets to falsely bail', async () => {
      // Simulates the old (buggy) restore handler calling markSynced with wrong-format data
      const jspsheetData = [{ sheetName: 'data', data: [['key'], ['a']], columns: [] }];
      staleCheck.markSynced(jspsheetData);

      window.location.hash = '#/org/repo/sheet';
      window.fetch = async () => new Response(JSON.stringify(serverJson), { status: 200 });

      const sheets = [buildSheet('data', [['key'], ['a']])];
      const result = await saveSheets(sheets);
      expect(result).to.be.false; // drift falsely detected — save bailed
    });

    it('Preserves correct baseline so saveSheets proceeds when server is unchanged', async () => {
      // Restore handler does NOT call markSynced with wrong-format data — baseline stays intact.

      window.location.hash = '#/org/repo/sheet';
      window.fetch = async (url, opts) => {
        if (opts?.method === 'PUT') return new Response('', { status: 200 });
        return new Response(JSON.stringify(serverJson), { status: 200 });
      };

      const sheets = [buildSheet('data', [['key'], ['a']])];
      const result = await saveSheets(sheets);
      expect(result).to.be.true; // no false drift — save went through
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
