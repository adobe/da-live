/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../blocks/sheet/da-version-review.js');

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('da-version-review', () => {
  let el;

  async function fixture() {
    const element = document.createElement('da-version-review');
    element.data = [
      { sheetName: 'data', data: [['a'], ['1']] },
      { sheetName: 'meta', data: [['b'], ['2']] },
    ];
    document.body.appendChild(element);
    await nextFrame();
    return element;
  }

  afterEach(() => {
    if (el && el.parentElement) el.remove();
    el = null;
  });

  it('Marks the first tab active on connect', async () => {
    el = await fixture();
    expect(el.data[0].active).to.be.true;
    expect(el.data[1].active).to.be.undefined;
  });

  it('handleTab toggles which tab is active', async () => {
    el = await fixture();
    el.handleTab(el.data[1]);
    expect(el.data[0].active).to.be.false;
    expect(el.data[1].active).to.be.true;
  });

  it('handleCancel dispatches close event', async () => {
    el = await fixture();
    let detail;
    el.addEventListener('close', (e) => { detail = e.detail; });
    el.handleCancel();
    expect(detail).to.deep.equal({ action: 'close' });
  });

  it('handleRestore dispatches restore event', async () => {
    el = await fixture();
    let detail;
    el.addEventListener('restore', (e) => { detail = e.detail; });
    el.handleRestore();
    expect(detail).to.deep.equal({ action: 'restore' });
  });

  it('renderTable produces a table with rows and cells', async () => {
    el = await fixture();
    await el.updateComplete;
    const tables = el.shadowRoot.querySelectorAll('table');
    expect(tables.length).to.equal(2);
    const firstTable = tables[0];
    expect(firstTable.querySelectorAll('tr').length).to.equal(2);
    expect(firstTable.querySelectorAll('td').length).to.equal(2);
  });
});
