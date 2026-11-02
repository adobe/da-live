import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import makeKeyboardAccessible from '../../../../blocks/sheet/utils/keyboard.js';

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

describe('sheet keyboard access', () => {
  let before;
  let after;
  let container;
  let sheet;
  let gridEl;

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
    expect(window.jspreadsheet.current).to.equal(sheet);
    expect(sheet.selectedCell.map(Number)).to.deep.equal([0, 0, 0, 0]);
  });

  it('Tab and Shift+Tab move focus out of the grid', async () => {
    gridEl.focus();
    await sendKeys({ press: 'Tab' });
    await tick();
    expect(document.activeElement).to.equal(after);
    expect(window.jspreadsheet.current).to.be.null;

    gridEl.focus();
    await sendKeys({ down: 'Shift' });
    await sendKeys({ press: 'Tab' });
    await sendKeys({ up: 'Shift' });
    await tick();
    expect(document.activeElement).to.equal(before);
    expect(window.jspreadsheet.current).to.be.null;
  });

  it('Escape releases the keyboard from the grid', async () => {
    gridEl.focus();
    await sendKeys({ press: 'Escape' });
    expect(window.jspreadsheet.current).to.be.null;
    expect(sheet.selectedCell).to.be.null;
  });

  it('keeps focus in the grid after a cell edit', async () => {
    gridEl.focus();
    await sendKeys({ type: 'x' });
    expect(sheet.edition).to.exist;
    await sendKeys({ press: 'Enter' });
    await tick();
    expect(sheet.edition).to.be.null;
    expect(sheet.getValueFromCoords(0, 0)).to.equal('x');
    expect(document.activeElement).to.equal(gridEl);
    expect(window.jspreadsheet.current).to.equal(sheet);
  });
});
