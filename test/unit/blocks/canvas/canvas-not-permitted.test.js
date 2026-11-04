import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { showNotPermitted, removeNotPermitted } = await import('../../../../blocks/canvas/canvas.js');

describe('canvas not permitted message', () => {
  let mountRoot;

  beforeEach(() => {
    mountRoot = document.createElement('div');
    document.body.append(mountRoot);
  });

  afterEach(() => mountRoot.remove());

  it('renders the shared message with the Open Profile button for Not permitted', () => {
    showNotPermitted(mountRoot, 'Not permitted');
    const box = mountRoot.querySelector('.nx-not-permitted .empty-list');
    expect(box.querySelector('h3').textContent).to.equal('Not permitted');
    expect(box.querySelectorAll('.empty-list-hint').length).to.equal(1);
    expect(box.querySelectorAll('button.empty-list-action.nx-btn-primary').length).to.equal(1);
  });

  it('renders only the message for other errors', () => {
    showNotPermitted(mountRoot, 'Could not create the document.');
    const box = mountRoot.querySelector('.nx-not-permitted .empty-list');
    expect(box.querySelector('h3').textContent).to.equal('Could not create the document.');
    expect(box.querySelectorAll('.empty-list-action').length).to.equal(0);
  });

  it('reuses the container and removes it again', () => {
    showNotPermitted(mountRoot, 'Sign in required');
    showNotPermitted(mountRoot, 'Not permitted');
    expect(mountRoot.querySelectorAll('.nx-not-permitted').length).to.equal(1);
    expect(mountRoot.querySelector('h3').textContent).to.equal('Not permitted');
    removeNotPermitted(mountRoot);
    expect(mountRoot.querySelectorAll('.nx-not-permitted').length).to.equal(0);
  });
});
