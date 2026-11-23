import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

describe('DaActionBar read-only content', () => {
  let el;

  before(async () => {
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    await import('../../../../../blocks/browse/da-actionbar/da-actionbar.js');
  });

  beforeEach(async () => {
    el = document.createElement('da-actionbar');
    el.items = [{ path: '/demo/wknd/hero.png', ext: 'png', name: 'hero' }];
    el.permissions = ['read', 'write'];
    el.readOnly = true;
    el.currentPath = '/demo/wknd';
    document.body.append(el);
    await el.updateComplete;
  });

  afterEach(() => el.remove());

  it('ignores a writer ACL and shortcuts', () => {
    ['c', 'x', 'v'].forEach((key) => expect(el.handleShortcut(key)).to.equal(false));
    expect(el._canWrite).to.equal(false);
    expect(el._canAemAction).to.equal(false);
    expect(el._canShare).to.equal(false);
    expect(el._canDelete).to.equal(false);
  });

  it('hides mutating controls and does not emit events', () => {
    ['.rename-button', '.delete-button', '.preview-button', '.publish-button', '.share-button']
      .forEach((selector) => expect(el.shadowRoot.querySelector(selector).classList.contains('hide')).to.equal(true));
    const events = [];
    ['rename', 'onpaste', 'ondelete'].forEach((name) => el.addEventListener(name, () => events.push(name)));
    el.handleRename();
    el.handlePaste();
    el.handleDelete();
    expect(events).to.deep.equal([]);
  });
});
