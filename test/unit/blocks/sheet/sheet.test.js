import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { staleCheck } from '../../../../blocks/sheet/utils/utils.js';

const { setNx, getNx2Api } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: init, showLoadStatus } = await import('../../../../blocks/sheet/sheet.js');
const { source } = await getNx2Api();

describe('sheet entry point', () => {
  it('records the opened sheet in Recent with its .json path', async () => {
    const { href } = window.location;
    const el = document.createElement('div');
    const savedJspreadsheet = window.jspreadsheet;
    window.jspreadsheet = {
      tabs: (container, data) => {
        container.innerHTML = `<div></div><div>${data.map(() => '<div class="jexcel_container"></div>').join('')}</div>`;
        container.jexcel = data.map((d) => ({ name: d.sheetName, options: {} }));
      },
    };
    sinon.stub(source, 'get').resolves({ ok: false, status: 403, permissions: [] });
    // The end of the first load; replaces the stale-check poll this test doesn't need.
    const loaded = new Promise((resolve) => { sinon.stub(staleCheck, 'start').callsFake(resolve); });
    // Capture the real Recent write without sharing it with concurrently running test pages.
    const setItem = sinon.stub(Storage.prototype, 'setItem');
    const writes = [];
    setItem.callsFake(function record(key, value) {
      if (key === 'da-recent-files') writes.push(JSON.parse(value));
      else setItem.wrappedMethod.call(this, key, value);
    });
    const listeners = [sinon.spy(window, 'addEventListener'), sinon.spy(document, 'addEventListener')];
    try {
      window.history.replaceState(null, '', '/sheet#/org/site/data/products');
      await init(el);
      await loaded;
      expect(writes[0]['/org/site'][0]).to.equal('/org/site/data/products.json');
    } finally {
      listeners.forEach((spy) => spy.getCalls()
        .forEach(({ thisValue, args }) => thisValue.removeEventListener(...args)));
      sinon.restore();
      window.jspreadsheet = savedJspreadsheet;
      document.querySelectorAll('da-sheet-tabs').forEach((tabs) => tabs.remove());
      window.history.replaceState(null, '', href);
    }
  });
});

describe('showLoadStatus', () => {
  let wrapper;
  let daSheet;
  let daSheetPanes;
  let daTitle;

  beforeEach(() => {
    wrapper = document.createElement('div');
    daSheet = document.createElement('div');
    daSheetPanes = {};
    daTitle = {};
    wrapper.append(daSheet);
    document.body.append(wrapper);
  });

  afterEach(() => {
    wrapper.remove();
  });

  it('hides the grid, side panel and title actions and shows the message on an error', () => {
    showLoadStatus({ errMsg: 'Not permitted', wrapper, daSheet, daSheetPanes, daTitle });
    expect(daSheet.hidden).to.be.true;
    expect(daSheetPanes.hidePanes).to.be.true;
    expect(daTitle.hideActions).to.be.true;
    expect(wrapper.querySelector('.da-sheet-not-permitted h3').textContent).to.equal('Not permitted');
  });

  it('restores the grid and side panel and removes the message once loaded', () => {
    showLoadStatus({ errMsg: 'Not permitted', wrapper, daSheet, daSheetPanes, daTitle });
    showLoadStatus({ errMsg: undefined, wrapper, daSheet, daSheetPanes, daTitle });
    expect(daSheet.hidden).to.be.false;
    expect(daSheetPanes.hidePanes).to.be.false;
    expect(daTitle.hideActions).to.be.false;
    expect(wrapper.querySelector('.da-sheet-not-permitted')).to.not.exist;
  });
});

describe('da-sheet-panes', () => {
  let panes;

  beforeEach(async () => {
    panes = document.createElement('da-sheet-panes');
    panes.pathDetails = { view: 'sheet', fullpath: '/org/site/file' };
    document.body.append(panes);
    await panes.updateComplete;
  });

  afterEach(() => panes.remove());

  it('renders nothing when hidePanes is set and closes an open pane', async () => {
    await panes.handlePreviewToggle();
    await panes.updateComplete;
    panes.hidePanes = true;
    await panes.updateComplete;
    expect(panes.shadowRoot.querySelectorAll('.da-sheet-pane-tabs, .da-sheet-panes').length).to.equal(0);

    panes.hidePanes = false;
    await panes.updateComplete;
    expect(panes.shadowRoot.querySelectorAll('da-sheet-preview').length).to.equal(0);
    expect(panes.shadowRoot.querySelectorAll('.da-sheet-pane-tabs.is-visible').length).to.equal(1);
  });
});
