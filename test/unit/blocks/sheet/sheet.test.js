import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { showLoadStatus } = await import('../../../../blocks/sheet/sheet.js');

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

  it('hides the grid and side panel and shows the message on an error', () => {
    showLoadStatus({ errMsg: 'Not permitted', wrapper, daSheet, daSheetPanes, daTitle });
    expect(daSheet.hidden).to.be.true;
    expect(daSheetPanes.hidePanes).to.be.true;
    expect(daTitle.hideActions).to.be.true;
    const message = wrapper.querySelector('.da-sheet-not-permitted .empty-list');
    expect(message.querySelector('h3').textContent).to.equal('Not permitted');
    expect(message.querySelector('.empty-list-action')).to.exist;
  });

  it('restores the grid and side panel and removes the message once loaded', () => {
    showLoadStatus({ errMsg: 'Not permitted', wrapper, daSheet, daSheetPanes, daTitle });
    showLoadStatus({ errMsg: undefined, wrapper, daSheet, daSheetPanes, daTitle });
    expect(daSheet.hidden).to.be.false;
    expect(daSheetPanes.hidePanes).to.be.false;
    expect(daTitle.hideActions).to.be.false;
    expect(wrapper.querySelector('.da-sheet-not-permitted')).to.not.exist;
  });

  it('reuses the message container across repeated errors', () => {
    showLoadStatus({ errMsg: 'Sign in required', wrapper, daSheet, daSheetPanes, daTitle });
    showLoadStatus({ errMsg: 'Not permitted', wrapper, daSheet, daSheetPanes, daTitle });
    expect(wrapper.querySelectorAll('.da-sheet-not-permitted')).to.have.length(1);
    expect(wrapper.querySelector('h3').textContent).to.equal('Not permitted');
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

  it('renders the side panel tabs by default', () => {
    expect(panes.shadowRoot.querySelectorAll('.da-sheet-pane-tabs').length).to.equal(1);
  });

  it('does not render anything when hidePanes is set', async () => {
    panes.hidePanes = true;
    await panes.updateComplete;
    expect(panes.shadowRoot.querySelectorAll('.da-sheet-pane-tabs, .da-sheet-panes').length).to.equal(0);
  });

  it('closes an open pane when hidden and renders the tabs again when shown', async () => {
    await panes.handlePreviewToggle();
    await panes.updateComplete;
    expect(panes.shadowRoot.querySelectorAll('da-sheet-preview').length).to.equal(1);

    panes.hidePanes = true;
    await panes.updateComplete;
    panes.hidePanes = false;
    await panes.updateComplete;
    expect(panes.shadowRoot.querySelectorAll('da-sheet-preview').length).to.equal(0);
    expect(panes.shadowRoot.querySelectorAll('.da-sheet-pane-tabs.is-visible').length).to.equal(1);
  });
});
