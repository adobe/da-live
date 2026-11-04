import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { showNotPermitted } = await import('../../../../blocks/canvas/canvas.js');

describe('canvas not permitted message', () => {
  let mountRoot;

  beforeEach(() => {
    mountRoot = document.createElement('div');
    document.body.append(mountRoot);
  });

  afterEach(() => mountRoot.remove());

  it('renders the shared Not permitted message with Open Profile', () => {
    showNotPermitted(mountRoot, 'Not permitted');
    const box = mountRoot.querySelector('.nx-not-permitted .empty-list');
    expect(box.querySelector('h3').textContent).to.equal('Not permitted');
    expect(box.querySelectorAll('.empty-list-action').length).to.equal(1);
  });
});
