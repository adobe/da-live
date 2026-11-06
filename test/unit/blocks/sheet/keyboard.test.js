import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import makeKeyboardAccessible, { releaseKeyboard } from '../../../../blocks/sheet/utils/keyboard.js';

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

  beforeEach(() => {
    before = document.createElement('button');
    before.textContent = 'before';
    after = document.createElement('button');
    after.textContent = 'after';
    container = document.createElement('div');
    document.body.append(before, container, after);

    window.jspreadsheet.tabs(container, [{ sheetName: 'data', minDimensions: [3, 3] }]);
    [sheet] = container.jexcel;
    gridEl = sheet.el;
    makeKeyboardAccessible(sheet);
  });

  afterEach(() => {
    window.jspreadsheet.current = null;
    before.remove();
    container.remove();
    after.remove();
  });

  it('puts the grid in the natural tab order', () => {
    expect(gridEl.getAttribute('tabindex')).to.equal('0');
  });

  it('selects the first cell when the grid receives focus', async () => {
    window.jspreadsheet.current = null;
    gridEl.focus();
    await tick();
    expect(isCurrent()).to.be.true;
    expect(sheet.selectedCell.map(Number)).to.deep.equal([0, 0, 0, 0]);
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

  it('keeps focus in the grid after a cell edit', async () => {
    gridEl.focus();
    await sendKeys({ type: 'x' });
    expect(sheet.edition).to.exist;
    await sendKeys({ press: 'Enter' });
    await tick();
    expect(sheet.edition === null, 'editor closed').to.be.true;
    expect(sheet.getValueFromCoords(0, 0)).to.equal('x');
    expect(isFocused(gridEl)).to.be.true;
    expect(isCurrent()).to.be.true;
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
