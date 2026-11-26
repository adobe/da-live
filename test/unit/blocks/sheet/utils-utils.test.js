import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const {
  saveSheets,
  forceSaveSheets,
  handleSave,
  staleCheck,
  findColumnsWithDataButNoHeader,
  colIndexToLetter,
} = await import('../../../../blocks/sheet/utils/utils.js');
const { switchContentBranch } = await import('../../../../blocks/shared/branch-selector/navigation.js');

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

    it('Fires sheet-dirty on the clean→dirty transition and sheet-clean on markSynced', () => {
      const events = [];
      const onDirty = () => events.push('dirty');
      const onClean = () => events.push('clean');
      document.addEventListener('sheet-dirty', onDirty);
      document.addEventListener('sheet-clean', onClean);
      try {
        staleCheck.markSynced('"initial"');
        staleCheck.markEdited();
        staleCheck.markEdited();
        staleCheck.markEdited();
        staleCheck.markSynced('"saved"');
        expect(events).to.deep.equal(['dirty', 'clean']);
      } finally {
        document.removeEventListener('sheet-dirty', onDirty);
        document.removeEventListener('sheet-clean', onClean);
      }
    });

    it('Stays dirty when an edit lands while a save is in flight', async () => {
      const events = [];
      const onDirty = () => events.push('dirty');
      const onClean = () => events.push('clean');
      document.addEventListener('sheet-dirty', onDirty);
      document.addEventListener('sheet-clean', onClean);
      try {
        staleCheck.markSynced('"initial"');
        // Save A: the user types again while A's POST is in flight, then A lands.
        // markSynced must NOT clear dirty — a follow-up save is still queued.
        staleCheck.markEdited();
        await staleCheck.runSave(async () => {
          staleCheck.markEdited();
          staleCheck.markSynced('"a"');
        });
        expect(events).to.deep.equal(['dirty']);
        // Save B covers the later edit and clears the flag.
        await staleCheck.runSave(async () => {
          staleCheck.markSynced('"b"');
        });
        expect(events).to.deep.equal(['dirty', 'clean']);
      } finally {
        document.removeEventListener('sheet-dirty', onDirty);
        document.removeEventListener('sheet-clean', onClean);
      }
    });

    it('Fires sheet-clean when stop() drops a dirty session', () => {
      const events = [];
      const onClean = () => events.push('clean');
      document.addEventListener('sheet-clean', onClean);
      try {
        staleCheck.start({ details: { org: 'o', site: 's', path: '/p', view: 'sheet' }, onStale: () => {} });
        staleCheck.markEdited();
        staleCheck.stop();
        expect(events).to.deep.equal(['clean']);
      } finally {
        document.removeEventListener('sheet-clean', onClean);
      }
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

    it('proceeds when the server etag only differs by the weak W/ prefix', async () => {
      // Cloudflare downgrades strong ETags to weak (W/"...") when it transforms
      // the response body (gzip/brotli on GETs), so a POST can record a strong
      // baseline that a later GET echoes back weak with the same hash. That must
      // not read as drift, otherwise every save after the first misfires.
      let onStaleFired = false;
      staleCheck.start({ details: DETAILS, onStale: () => { onStaleFired = true; } });
      staleCheck.markSynced('"abc123"');

      window.location.hash = '#/org/repo/sheet';
      window.fetch = wrap(async (url, opts) => {
        if (opts?.method === 'POST' || opts?.method === 'PUT') {
          return new Response('', { status: 200, headers: { ETag: '"def456"' } });
        }
        return new Response(JSON.stringify(serverJson), {
          status: 200,
          headers: { ETag: 'W/"abc123"', 'Content-Type': 'application/json' },
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

  describe('branch save barrier', () => {
    afterEach(() => { staleCheck.stop(); });

    it('commits an active cell and flushes its debounced save', async () => {
      window.history.replaceState(null, '', '/sheet#/demo/work~draft/test');
      const sheets = [buildSheet('data', [['key'], ['value']])];
      let written;
      staleCheck.setConditionalSession({
        save: async (body) => {
          written = JSON.parse(body);
          return new Response('', { status: 201, headers: { ETag: '"next"' } });
        },
      });
      sheets[0].edition = ['active-cell'];
      sheets[0].closeEditor = (cell, commit) => {
        expect(cell).to.equal('active-cell');
        expect(commit).to.equal(true);
        sheets[0].edition = null;
        handleSave(sheets, 'sheet');
      };
      expect(await forceSaveSheets({ jexcel: sheets })).to.deep.equal({ ok: true });
      expect(written.data).to.deep.equal([{ key: 'value' }]);
      expect(staleCheck.isDirty).to.equal(false);
    });

    it('refuses navigation and retains dirty state after a failed save', async () => {
      window.history.replaceState(null, '', '/sheet#/demo/work~draft/test');
      const sheets = [buildSheet('data', [['key'], ['value']])];
      staleCheck.setConditionalSession({ save: async () => { throw new Error('conflict'); } });
      handleSave(sheets, 'sheet');
      const result = await forceSaveSheets({ jexcel: sheets });
      expect(result.ok).to.equal(false);
      expect(result.error).to.contain('not confirmed');
      expect(staleCheck.isDirty).to.equal(true);
    });

    it('does not navigate while a Sheet tab rename is unfinished', async () => {
      const sheets = [buildSheet('data', [['key'], ['value']])];
      const parentElement = { querySelector: () => ({ hasPendingEdit: true }) };
      const element = { jexcel: sheets, parentElement };
      staleCheck.markEdited();
      const result = await forceSaveSheets(element);
      expect(result.ok).to.equal(false);
      expect(result.error).to.contain('tab rename');
      expect(staleCheck.isDirty).to.equal(true);
    });

    it('flushes edits made while an earlier save is in flight', async () => {
      window.history.replaceState(null, '', '/sheet#/demo/work~draft/test');
      let value = 'first';
      const sheets = [buildSheet('data', [['key'], ['first']])];
      sheets[0].getData = () => [['key'], [value]];
      let release;
      let started;
      const startedSave = new Promise((resolve) => { started = resolve; });
      const bodies = [];
      staleCheck.setConditionalSession({
        save: async (body) => {
          bodies.push(JSON.parse(body).data[0].key);
          if (bodies.length === 1) {
            started();
            await new Promise((resolve) => { release = resolve; });
          }
          return new Response('', { status: 201, headers: { ETag: '"next"' } });
        },
      });
      staleCheck.markEdited();
      const first = saveSheets(sheets);
      await startedSave;
      value = 'second';
      handleSave(sheets, 'sheet');
      const flushed = forceSaveSheets({ jexcel: sheets });
      release();
      expect(await first).to.equal(true);
      expect(await flushed).to.deep.equal({ ok: true });
      expect(bodies).to.deep.equal(['first', 'second']);
      expect(staleCheck.isDirty).to.equal(false);
    });

    it('does not send a delayed save after the location changes', async () => {
      window.history.replaceState(null, '', '/sheet#/demo/work~draft/test');
      const original = window.location.href;
      let called = false;
      staleCheck.setConditionalSession({ save: async () => { called = true; } });
      staleCheck.markEdited();
      window.history.replaceState(null, '', '/sheet#/demo/work~draft/other');
      expect(await saveSheets([buildSheet('data', [['key'], ['value']])], original)).to.equal(false);
      expect(called).to.equal(false);
      expect(staleCheck.isDirty).to.equal(true);
    });

    it('saves before switching branches and refuses a switch after a failed save', async () => {
      window.history.replaceState(null, '', '/sheet#/demo/work/test');
      const sheets = [buildSheet('data', [['key'], ['value']])];
      const editor = { localName: 'div', inert: false, jexcel: sheets };
      editor.forceSave = () => forceSaveSheets(editor);
      const root = { querySelector: (selector) => (selector === '.da-sheet' ? editor : null) };
      const urls = [];
      const options = { root, validate: async () => {}, navigate: (url) => urls.push(url) };
      staleCheck.setConditionalSession({ save: async () => { throw new Error('conflict'); } });
      handleSave(sheets, 'sheet');
      const failure = await switchContentBranch('draft', options).catch((error) => error);
      expect(failure.message).to.contain('not confirmed');
      expect(urls).to.deep.equal([]);
      staleCheck.setConditionalSession({ save: async () => new Response('', { status: 201, headers: { ETag: '"next"' } }) });
      await switchContentBranch('draft', options);
      expect(urls).to.deep.equal(['/sheet#/demo/work~draft/test']);
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
});
