import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });
await import('../../../../blocks/sheet/da-sheet-tabs.js');
const { staleCheck } = await import('../../../../blocks/sheet/utils/utils.js');

describe('Sheet tab branch safety', () => {
  it('marks a new tab dirty and wires structural saves before navigation', () => {
    const saved = window.jspreadsheet;
    const parent = document.createElement('div');
    const tabs = document.createElement('da-sheet-tabs');
    const grid = document.createElement('div');
    grid.className = 'jexcel_tabs';
    grid.details = { view: 'sheet' };
    grid.jexcel = [{ name: 'data', options: {} }];
    parent.append(tabs, grid);
    const addTab = (container, data) => {
      container.jexcel.push({ name: data[0].sheetName, options: {} });
    };
    window.jspreadsheet = { tabs: addTab };
    tabs.focusEditInput = () => {};
    try {
      tabs.handleAdd();
      expect(staleCheck.isDirty).to.equal(true);
      expect(tabs.hasPendingEdit).to.equal(true);
      const { options } = grid.jexcel[1];
      ['onafterchanges', 'ondeleterow', 'ondeletecolumn', 'onmoverow', 'onresizecolumn']
        .forEach((name) => expect(options[name], name).to.be.a('function'));
    } finally {
      staleCheck.stop();
      window.jspreadsheet = saved;
    }
  });
});
