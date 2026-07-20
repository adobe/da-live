import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const {
  saveSheets,
  handleSave,
  staleCheck,
  findColumnsWithDataButNoHeader,
  flushPendingSave,
  colIndexToLetter,
} = await import('../../../../blocks/sheet/utils/utils.js');

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
        if (opts?.method === 'POST') return new Response('', { status: 200 });
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

  describe('findColumnsWithDataButNoHeader', () => {
    it('Flags columns with data but a missing header', () => {
      const sheet = buildSheet('data', [
        ['name', '', undefined, 'age'],
        ['Ada', 'lost1', '', 30],
        ['Grace', '', 'lost2', 31],
      ]);
      const result = findColumnsWithDataButNoHeader([sheet]);
      expect(result).to.deep.equal([{ name: 'data', cols: [2, 3] }]);
    });

    it('Does not flag whitespace-only headers (save keeps them as keys)', () => {
      const sheet = buildSheet('data', [
        ['name', '   '],
        ['Ada', 'kept'],
      ]);
      expect(findColumnsWithDataButNoHeader([sheet])).to.deep.equal([]);
    });

    it('Ignores unnamed columns that are entirely empty', () => {
      const sheet = buildSheet('data', [
        ['name', '', 'age'],
        ['Ada', '', 30],
        ['Grace', undefined, 31],
      ]);
      expect(findColumnsWithDataButNoHeader([sheet])).to.deep.equal([]);
    });

    it('Returns [] when every header is present', () => {
      const sheet = buildSheet('data', [
        ['name', 'age'],
        ['Ada', 30],
      ]);
      expect(findColumnsWithDataButNoHeader([sheet])).to.deep.equal([]);
    });

    it('Returns [] for an empty sheet', () => {
      const sheet = buildSheet('data', []);
      expect(findColumnsWithDataButNoHeader([sheet])).to.deep.equal([]);
    });

    it('Reports per-sheet across multiple sheets', () => {
      const a = buildSheet('a', [
        ['x', ''],
        ['1', 'lost'],
      ]);
      const b = buildSheet('b', [
        ['y'],
        ['2'],
      ]);
      const result = findColumnsWithDataButNoHeader([a, b]);
      expect(result).to.deep.equal([{ name: 'a', cols: [2] }]);
    });

    it('colIndexToLetter maps to spreadsheet letters', () => {
      expect(colIndexToLetter(1)).to.equal('A');
      expect(colIndexToLetter(2)).to.equal('B');
      expect(colIndexToLetter(26)).to.equal('Z');
      expect(colIndexToLetter(27)).to.equal('AA');
      expect(colIndexToLetter(52)).to.equal('AZ');
      expect(colIndexToLetter(53)).to.equal('BA');
      expect(colIndexToLetter(702)).to.equal('ZZ');
      expect(colIndexToLetter(703)).to.equal('AAA');
      expect(colIndexToLetter(0)).to.equal('');
    });

    it('Treats numeric zero as data (would be lost)', () => {
      const sheet = buildSheet('data', [
        ['name', ''],
        ['Ada', 0],
      ]);
      expect(findColumnsWithDataButNoHeader([sheet])).to.deep.equal([
        { name: 'data', cols: [2] },
      ]);
    });
  });

  describe('flushPendingSave', () => {
    it('Resolves immediately when nothing is pending', async () => {
      const start = performance.now();
      await flushPendingSave();
      expect(performance.now() - start).to.be.below(50);
    });

    it('Flushes a pending debounced save before the debounce would fire', async () => {
      window.location.hash = '#/o/r/flush-test';
      let putCount = 0;
      window.fetch = wrap((url, opts) => {
        if (typeof url === 'string' && url.includes('/source/') && opts?.method === 'POST') {
          putCount += 1;
        }
        return Promise.resolve(new Response('', { status: 200 }));
      });

      const start = performance.now();
      handleSave([buildSheet('a', [['x'], ['y']])], 'edit');
      await flushPendingSave();
      const elapsed = performance.now() - start;

      expect(putCount, 'flush must run the pending save').to.equal(1);
      expect(elapsed, 'flush must not wait out the 1000ms debounce').to.be.below(800);
    });

    it('Awaits an in-flight save without re-issuing it', async () => {
      window.location.hash = '#/o/r/inflight-test';
      let putCount = 0;
      const pending = [];
      window.fetch = wrap((url, opts) => {
        if (typeof url === 'string' && url.includes('/source/') && opts?.method === 'POST') {
          putCount += 1;
          return new Promise((resolve) => {
            pending.push(() => resolve(new Response('', { status: 200 })));
          });
        }
        return Promise.resolve(new Response('', { status: 200 }));
      });

      handleSave([buildSheet('a', [['x'], ['y']])], 'edit');
      // Wait for the debounce to fire and the save to be issued (but not resolved).
      const deadline = performance.now() + 2000;
      while (putCount === 0 && performance.now() < deadline) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => { setTimeout(r, 20); });
      }
      expect(putCount, 'save should have started after the debounce').to.equal(1);

      const flushPromise = flushPendingSave();
      let flushResolved = false;
      flushPromise.then(() => { flushResolved = true; });
      await new Promise((r) => { setTimeout(r, 100); });
      expect(flushResolved, 'flush must wait for the in-flight save to resolve').to.be.false;
      expect(putCount, 'flush must not issue a second save').to.equal(1);

      pending.forEach((r) => r());
      await flushPromise;
      expect(flushResolved).to.be.true;
    });
  });
});
