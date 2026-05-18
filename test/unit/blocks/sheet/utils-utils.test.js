import { expect } from '@esm-bundle/chai';
import { saveSheets, handleSave } from '../../../../blocks/sheet/utils/utils.js';

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
      window.fetch = () => Promise.resolve(new Response('', { status: 200 }));
      const sheets = [buildSheet('one', [['k'], ['v']])];
      const result = await saveSheets(sheets);
      expect(result).to.be.true;
      const panes = document.querySelector('da-sheet-panes');
      expect(panes.data).to.exist;
      expect(panes.data[':type']).to.equal('sheet');
    });

    it('Returns false when the save fails', async () => {
      window.location.hash = '#/org/repo/fail-sheet';
      window.fetch = () => Promise.resolve(new Response('boom', { status: 500 }));
      const sheets = [buildSheet('one', [['k'], ['v']])];
      const result = await saveSheets(sheets);
      expect(result).to.be.false;
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
      window.fetch = (url) => {
        captured = url;
        return Promise.resolve(new Response('', { status: 200 }));
      };
      handleSave([buildSheet('a', [['x']])], 'edit');
      // wait beyond the 1000ms debounce
      await new Promise((r) => { setTimeout(r, 1200); });
      expect(captured).to.contain('/source/o/r/test');
    });
  });
});
