import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse } from '@web/test-runner-commands';
import makeKeyboardAccessible, { releaseKeyboard } from '../../../../blocks/sheet/utils/keyboard.js';
import { axAll, axFocused, axTree } from '../../helpers/ax-tree.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

await loadScript('/deps/jspreadsheet-ce/dist/index.js');
await loadScript('/deps/jsuites/dist/jsuites.js');

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/deps/jspreadsheet-ce/dist/jspreadsheet.css';
document.head.appendChild(link);

const tick = () => new Promise((r) => { setTimeout(r, 10); });

// Pages running in parallel start without window focus, so focus events would not fire.
// Sending a key gives this page focus.
before(async () => {
  await sendKeys({ press: 'Shift' });
});

describe('sheet keyboard access', () => {
  let before;
  let after;
  let container;
  let sheet;
  let gridEl;

  const isCurrent = () => window.jspreadsheet.current === sheet;
  const isReleased = () => window.jspreadsheet.current === null;
  const isFocused = (el) => document.activeElement === el;
  const cell = (x, y) => sheet.records[y][x];

  async function clickOn(el) {
    const { x, y, width, height } = el.getBoundingClientRect();
    await sendMouse({ type: 'click', position: [Math.round(x + width / 2), Math.round(y + height / 2)] });
    await tick();
  }

  beforeEach(() => {
    before = document.createElement('button');
    before.textContent = 'before';
    after = document.createElement('button');
    after.textContent = 'after';
    container = document.createElement('div');
    document.body.append(before, container, after);

    window.jspreadsheet.tabs(container, [{ sheetName: 'data', minDimensions: [3, 3] }]);
    [sheet] = container.jexcel;
    sheet.name = 'data';
    gridEl = sheet.el;
    makeKeyboardAccessible(sheet);
  });

  afterEach(() => {
    window.jspreadsheet.current = null;
    before.remove();
    container.remove();
    after.remove();
  });

  it('puts the first cell, not the container, in the tab order', () => {
    expect(cell(0, 0).getAttribute('tabindex')).to.equal('0');
    expect(gridEl.getAttribute('tabindex')).to.equal('-1');
    expect(sheet.el.querySelectorAll('[tabindex="0"]')).to.have.length(1);
  });

  it('Tab moves focus onto the first cell and selects it', async () => {
    window.jspreadsheet.current = null;
    before.focus();
    await sendKeys({ press: 'Tab' });
    await tick();
    expect(isFocused(cell(0, 0))).to.be.true;
    expect(isCurrent()).to.be.true;
    expect(sheet.selectedCell.map(Number)).to.deep.equal([0, 0, 0, 0]);
  });

  it('focusing the container hands focus to the active cell', async () => {
    gridEl.focus();
    await tick();
    expect(isFocused(cell(0, 0))).to.be.true;
    expect(isCurrent()).to.be.true;
  });

  it('arrow keys move focus with the selection', async () => {
    gridEl.focus();
    await sendKeys({ press: 'ArrowRight' });
    expect(isFocused(cell(1, 0))).to.be.true;
    await sendKeys({ press: 'ArrowDown' });
    expect(isFocused(cell(1, 1))).to.be.true;
    expect(cell(1, 1).getAttribute('tabindex')).to.equal('0');
    expect(cell(0, 0).hasAttribute('tabindex')).to.be.false;
  });

  it('returns to the last active cell when tabbing back in', async () => {
    gridEl.focus();
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'Tab' });
    await tick();
    expect(isFocused(after)).to.be.true;

    await sendKeys({ down: 'Shift' });
    await sendKeys({ press: 'Tab' });
    await sendKeys({ up: 'Shift' });
    await tick();
    expect(isFocused(cell(0, 1))).to.be.true;
    expect(sheet.selectedCell.map(Number)).to.deep.equal([0, 1, 0, 1]);
  });

  it('Tab and Shift+Tab move focus out of the grid', async () => {
    gridEl.focus();
    await sendKeys({ press: 'Tab' });
    await tick();
    expect(isFocused(after)).to.be.true;
    expect(isReleased()).to.be.true;

    gridEl.focus();
    await sendKeys({ down: 'Shift' });
    await sendKeys({ press: 'Tab' });
    await sendKeys({ up: 'Shift' });
    await tick();
    expect(isFocused(before)).to.be.true;
    expect(isReleased()).to.be.true;
  });

  it('Escape releases the keyboard from the grid', async () => {
    gridEl.focus();
    await sendKeys({ press: 'Escape' });
    expect(isReleased()).to.be.true;
    expect(sheet.selectedCell).to.be.null;
  });

  it('stays released after Escape until the grid is focused again', async () => {
    gridEl.focus();
    await sendKeys({ press: 'Escape' });
    await sendKeys({ press: 'ArrowDown' });
    expect(isReleased()).to.be.true;
    expect(sheet.selectedCell).to.be.null;

    before.focus();
    gridEl.focus();
    await tick();
    expect(isCurrent()).to.be.true;
  });

  it('keeps focus on the cell after a cell edit', async () => {
    gridEl.focus();
    await sendKeys({ type: 'x' });
    expect(sheet.edition).to.exist;
    await sendKeys({ press: 'Escape' });
    await tick();
    expect(sheet.edition === null, 'editor closed').to.be.true;
    expect(isFocused(cell(0, 0))).to.be.true;
    expect(isCurrent()).to.be.true;
  });

  it('moves focus to the next row after Enter saves an edit', async () => {
    gridEl.focus();
    await sendKeys({ type: 'x' });
    await sendKeys({ press: 'Enter' });
    await tick();
    expect(sheet.getValueFromCoords(0, 0)).to.equal('x');
    expect(isFocused(cell(0, 1))).to.be.true;
  });

  it('names the cell editor after its column and row', async () => {
    gridEl.focus();
    await sendKeys({ press: 'ArrowRight' });
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'F2' });
    const input = cell(1, 1).querySelector('input');
    expect(isFocused(input)).to.be.true;
    expect(input.getAttribute('aria-label')).to.equal('Column B, row 2');
  });

  it('keeps focus on the cell after copying', async () => {
    gridEl.focus();
    sheet.copy(true);
    expect(isFocused(cell(0, 0))).to.be.true;
  });

  it('keeps focus on a cell when a row header is clicked', async () => {
    gridEl.focus();
    await clickOn(sheet.rows[2].children[0]);
    expect(isFocused(cell(0, 2))).to.be.true;
    expect(isCurrent()).to.be.true;
  });

  it('moves focus to a clicked cell', async () => {
    before.focus();
    await clickOn(cell(2, 1));
    expect(isFocused(cell(2, 1))).to.be.true;
    expect(cell(2, 1).getAttribute('tabindex')).to.equal('0');
  });

  it('exposes the sheet as a named grid with row and column headers', async () => {
    const tree = await axTree('.jexcel');
    expect(tree.role).to.equal('grid');
    expect(tree.name).to.equal('data');
    const rows = axAll(tree, 'row');
    expect(rows).to.have.length(4);
    expect(axAll(rows[0], 'columnheader').map((h) => h.name)).to.deep.equal(['', 'A', 'B', 'C']);
    expect(axAll(rows[1], 'rowheader').map((h) => h.name.trim())).to.deep.equal(['1']);
    expect(axAll(rows[1], 'gridcell')).to.have.length(3);
  });

  it('exposes the focused cell to assistive technology', async () => {
    sheet.setValueFromCoords(1, 1, 'hello');
    gridEl.focus();
    await sendKeys({ press: 'ArrowRight' });
    await sendKeys({ press: 'ArrowDown' });
    const focused = axFocused(await axTree('.jexcel'));
    expect(focused).to.include({ role: 'gridcell', name: 'hello' });
  });

  it('gives inserted rows and columns their header roles', async () => {
    sheet.insertRow();
    sheet.insertColumn();
    await tick();
    expect(sheet.rows[3].children[0].getAttribute('role')).to.equal('rowheader');
    expect(sheet.headers[3].getAttribute('role')).to.equal('columnheader');
  });

  it('keeps a cell in the tab order when the active row is deleted', async () => {
    gridEl.focus();
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'ArrowDown' });
    sheet.resetSelection();
    sheet.deleteRow(2);
    await tick();
    const tabbable = sheet.el.querySelectorAll('[tabindex="0"]');
    expect(tabbable).to.have.length(1);
    expect(tabbable[0]).to.equal(cell(0, 0));
  });

  it('marks a sheet without writable columns as read-only', () => {
    const readOnly = document.createElement('div');
    document.body.append(readOnly);
    window.jspreadsheet.tabs(readOnly, [{
      sheetName: 'ro',
      data: [['a']],
      columns: [{ width: '300', readOnly: true }],
    }]);
    const [roSheet] = readOnly.jexcel;
    makeKeyboardAccessible(roSheet);
    expect(roSheet.table.getAttribute('aria-readonly')).to.equal('true');
    expect(sheet.table.hasAttribute('aria-readonly')).to.be.false;
    readOnly.remove();
  });
});

describe('sheet keyboard access with multiple sheets', () => {
  let container;
  let first;
  let last;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    window.jspreadsheet.tabs(container, [
      { sheetName: 'one', minDimensions: [3, 3] },
      { sheetName: 'two', minDimensions: [3, 3] },
    ]);
    [first, last] = container.jexcel;
    container.jexcel.forEach((s) => makeKeyboardAccessible(s));
    // Show the first sheet the way da-sheet-tabs does
    last.el.style.display = 'none';
    first.el.style.display = 'block';
  });

  afterEach(() => {
    container.jexcel.forEach((s) => { if (s.edition) s.closeEditor(s.edition[0], false); });
    window.jspreadsheet.current = null;
    container.remove();
  });

  it('building the sheets leaves the last (hidden) one taking keys', () => {
    expect(window.jspreadsheet.current).to.equal(last);
  });

  it('releaseKeyboard stops keys reaching a hidden sheet', async () => {
    releaseKeyboard();
    expect(window.jspreadsheet.current).to.be.null;

    document.body.focus();
    await sendKeys({ down: 'Control' });
    await sendKeys({ press: 'KeyA' });
    await sendKeys({ up: 'Control' });
    expect(last.selectedCell).to.not.be.ok;
    expect(first.selectedCell).to.not.be.ok;
  });

  it('releaseKeyboard keeps the given sheet', () => {
    window.jspreadsheet.current = first;
    releaseKeyboard(first);
    expect(window.jspreadsheet.current).to.equal(first);
  });

  it('focusing the visible grid sends keys to it', async () => {
    releaseKeyboard();
    first.el.focus();
    await tick();
    expect(window.jspreadsheet.current).to.equal(first);
    await sendKeys({ type: 'x' });
    expect(first.edition).to.exist;
    expect(last.edition).to.not.be.ok;
  });
});
