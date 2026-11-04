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
    expect(box.querySelectorAll('.empty-list-hint').length).to.equal(1);
    expect(box.querySelectorAll('button.empty-list-action.nx-btn-primary').length).to.equal(1);
  });

  it('shows only the message for sign in required', () => {
    showNotPermitted({ el, daTitle, message: 'Sign in required' });
    const box = el.querySelector('.da-edit-not-permitted .empty-list');
    expect(box.querySelector('h3').textContent).to.equal('Sign in required');
    expect(box.querySelectorAll('.empty-list-action').length).to.equal(0);
  });

  it('reuses the message container across repeated errors', () => {
    showNotPermitted({ el, daTitle, message: 'Sign in required' });
    showNotPermitted({ el, daTitle, message: 'Not permitted' });
    expect(el.querySelectorAll('.da-edit-not-permitted').length).to.equal(1);
    expect(el.querySelector('h3').textContent).to.equal('Not permitted');
  });

  it('removes the message and restores the title actions', () => {
    showNotPermitted({ el, daTitle, message: 'Not permitted' });
    removeNotPermitted({ el, daTitle });
    expect(el.querySelectorAll('.da-edit-not-permitted').length).to.equal(0);
    expect(daTitle.hideActions).to.be.false;
  });
});
