import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import DaTitle from '../../../../../blocks/edit/da-title/da-title.js';

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });
const DISABLE_MESSAGE = 'Saving is disabled until the config has been refreshed. If you have unsaved changes that you want to preserve, you can copy them and merge them after refreshing the config.';

function createDetails(view, fullpath = '/org/repo/path') {
  return {
    view,
    fullpath,
    sourceUrl: 'https://da.live/config/org/repo',
    parent: '/org/repo',
    parentName: 'repo',
    name: 'path',
  };
}

describe('da-title', () => {
  let element;

  before(() => {
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
  });

  afterEach(() => {
    element?.remove();
    element = null;
  });

  it('uses internal action mode for hidden, save-only, and full views', async () => {
    element = new DaTitle();
    document.body.append(element);

    element.details = createDetails('edit', '/org/repo/.da/config.json');
    await nextFrame();
    expect(element.actionView).to.equal('hidden');
    expect(element.shadowRoot.querySelector('.da-title-action-send')).to.not.exist;

    element.details = createDetails('sheet', '/org/repo/data');
    await nextFrame();
    expect(element.actionView).to.equal('full');
    expect(element.shadowRoot.querySelector('.da-title-action-send')).to.exist;

    element.details = createDetails('sheet', '/org/repo/.da/data');
    await nextFrame();
    expect(element.actionView).to.equal('saveOnly');
    expect(element.visibleActions).to.deep.equal(['save']);
    expect(element.shadowRoot.querySelector('.da-title-action-send')).to.not.exist;

    element.details = createDetails('config', '/org/repo/config');
    await nextFrame();
    expect(element.actionView).to.equal('saveOnly');
    expect(element.visibleActions).to.deep.equal(['save']);
    expect(element.shadowRoot.querySelector('.da-title-action-send')).to.not.exist;
  });

  it('renders disable message as an external override reason', async () => {
    element = new DaTitle();
    element.details = createDetails('config');
    element.hasChanges = true;
    element.disableMessage = DISABLE_MESSAGE;
    document.body.append(element);
    await nextFrame();

    const saveButton = element.shadowRoot.querySelector('.da-title-action');
    const disabledMessage = element.shadowRoot.querySelector('.da-title-save-disabled-msg');

    expect(saveButton).to.exist;
    expect(saveButton.disabled).to.equal(true);
    expect(disabledMessage).to.exist;
    expect(disabledMessage.textContent.trim()).to.equal(DISABLE_MESSAGE);
  });

  it('keeps save-only actions disabled until there are changes', async () => {
    element = new DaTitle();
    element.details = createDetails('config');
    document.body.append(element);
    await nextFrame();

    let saveButton = element.shadowRoot.querySelector('.da-title-action');
    expect(saveButton).to.exist;
    expect(saveButton.disabled).to.equal(true);
    expect(saveButton.classList.contains('blue')).to.equal(false);

    element.hasChanges = true;
    await nextFrame();

    saveButton = element.shadowRoot.querySelector('.da-title-action');
    expect(saveButton.disabled).to.equal(false);
    expect(saveButton.classList.contains('blue')).to.equal(true);
  });
});
