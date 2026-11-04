import { expect } from '@esm-bundle/chai';

// sheet.js resolves nx at import time.
const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { showLoadStatus } = await import('../../../../blocks/sheet/sheet.js');

describe('showLoadStatus', () => {
  let wrapper;
  let daSheet;
  let daSheetPanes;

  beforeEach(() => {
    wrapper = document.createElement('div');
    daSheet = document.createElement('div');
    daSheetPanes = document.createElement('div');
    wrapper.append(daSheet);
    document.body.append(wrapper, daSheetPanes);
  });

  afterEach(() => {
    wrapper.remove();
    daSheetPanes.remove();
  });

  it('hides the grid and side panel and shows the message on an error', () => {
    showLoadStatus({ errMsg: 'Not permitted', wrapper, daSheet, daSheetPanes });
    expect(daSheet.hidden).to.be.true;
    expect(daSheetPanes.hidden).to.be.true;
    const message = wrapper.querySelector('.da-sheet-not-permitted .empty-list');
    expect(message.querySelector('h3').textContent).to.equal('Not permitted');
    expect(message.querySelector('.empty-list-action')).to.exist;
  });

  it('restores the grid and side panel and removes the message once loaded', () => {
    showLoadStatus({ errMsg: 'Not permitted', wrapper, daSheet, daSheetPanes });
    showLoadStatus({ errMsg: undefined, wrapper, daSheet, daSheetPanes });
    expect(daSheet.hidden).to.be.false;
    expect(daSheetPanes.hidden).to.be.false;
    expect(wrapper.querySelector('.da-sheet-not-permitted')).to.not.exist;
  });

  it('reuses the message container across repeated errors', () => {
    showLoadStatus({ errMsg: 'Sign in required', wrapper, daSheet, daSheetPanes });
    showLoadStatus({ errMsg: 'Not permitted', wrapper, daSheet, daSheetPanes });
    expect(wrapper.querySelectorAll('.da-sheet-not-permitted')).to.have.length(1);
    expect(wrapper.querySelector('h3').textContent).to.equal('Not permitted');
  });
});
