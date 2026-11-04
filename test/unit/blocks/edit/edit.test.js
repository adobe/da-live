import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { showNotPermitted, removeNotPermitted } = await import('../../../../blocks/edit/edit.js');

describe('edit not permitted message', () => {
  let el;
  let daTitle;

  beforeEach(() => {
    el = document.createElement('div');
    el.append(document.createElement('da-content'));
    daTitle = {};
    document.body.append(el);
  });

  afterEach(() => el.remove());

  it('removes the editor, hides the title actions and shows the shared message', () => {
    showNotPermitted({ el, daTitle, message: 'Not permitted' });
    expect(el.querySelectorAll('da-content').length).to.equal(0);
    expect(daTitle.hideActions).to.be.true;
    const box = el.querySelector('.da-edit-not-permitted .empty-list');
    expect(box.querySelector('h3').textContent).to.equal('Not permitted');
    expect(box.querySelectorAll('.empty-list-action').length).to.equal(1);
  });

  it('removes the message and restores the title actions', () => {
    showNotPermitted({ el, daTitle, message: 'Not permitted' });
    removeNotPermitted({ el, daTitle });
    expect(el.querySelectorAll('.da-edit-not-permitted').length).to.equal(0);
    expect(daTitle.hideActions).to.be.false;
  });
});
